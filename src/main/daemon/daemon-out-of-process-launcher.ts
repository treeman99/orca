import { randomUUID } from 'node:crypto'
import { getAppEnvironment } from '../../shared/app-environment'
import { childProcessHasExited } from '@orca/process-host/process-tree-termination'
import type { DaemonReplaceReason } from '../../shared/daemon-lifecycle-telemetry'
import { DaemonClient } from './client'
import {
  DaemonEndpointOwnershipError,
  holdDaemonAdoptionLease,
  reconcileDaemonPidOwnership
} from './daemon-endpoint-adoption'
import { LOCAL_PTY_STARTUP_FAIL_OPEN_TIMEOUT_MS } from '../startup/first-window-startup-services'
import {
  DAEMON_CHILD_STARTUP_TIMEOUT_MS,
  DaemonEndpointUnavailableError,
  launchDaemonChild,
  terminateLaunchedDaemonChild
} from './daemon-launched-child'
import { getDaemonEntryPath, probeDaemonSocket as probeSocket } from './daemon-launch-paths'
import { resolveDaemonLaunchHosts, type DaemonLaunchHost } from './daemon-launch-hosts'
import { classifyDaemonLaunchFailure, logDaemonLaunch } from './daemon-launch-log'
import { pruneDaemonHostStaging } from './daemon-host-relocation'
import { appImageDaemonIdentityPath, resolveAppImageDaemonLaunch } from './daemon-appimage-launch'
import { resolveAppImageGenerationDaemonLaunch } from './daemon-appimage-generation-launch'
import { waitForAppImageCopyPreExtraction } from '../cli/appimage-copy-pre-extraction'
import { launchMacDaemonFromStableBundle } from './macos-daemon-launchd'
import { DAEMON_RECOVERY_BUDGET_MS, daemonRecoveryProbeTimeoutMs } from './daemon-recovery-budget'
import { cleanupDaemonForProtocol } from './daemon-protocol-cleanup'
import {
  getDaemonPidPath,
  type DaemonLauncher,
  type DaemonProcessHandle,
  unlinkOwnedDaemonPidFile
} from './daemon-spawner'
import { PROTOCOL_VERSION } from './types'
import { prepareDaemonReplacement } from './daemon-replacement-preflight'
import { ensureDaemonSocketDir } from './daemon-socket-endpoint-path'
import { inspectDaemonHostImage } from './daemon-host-image'
import { noteSeveredDaemon } from './daemon-host-image-state'
import { readDaemonPidRecord } from './daemon-endpoint-incarnation'

// Why: the adapter decides a runtime resolver replacement, but the launcher completes it — and by
// then the daemon has usually self-retired (dropping its last authenticated client is enough), so
// there is nothing left to kill and the launcher's own confirmed-kill gate would report nothing.
// The adapter hands the reason across so the launch it triggers reports what actually drove it.
let attributedReplaceReason: DaemonReplaceReason | null = null

// The fork fallback's readiness wait plus the lease and adapter connects must still fit the gate.
const MAC_STABLE_LAUNCH_HANDOFF_MS =
  LOCAL_PTY_STARTUP_FAIL_OPEN_TIMEOUT_MS - DAEMON_CHILD_STARTUP_TIMEOUT_MS - 5_000

export function attributeNextDaemonReplacement(reason: DaemonReplaceReason): void {
  attributedReplaceReason = reason
}

// Why every adoption path calls this: a daemon whose AppImage files are gone answers RPCs for
// hours, so whichever branch decided to keep it, fresh terminals must not land on it.
function createPreservedDaemonHandle(
  runtimeDir: string,
  pidPath: string,
  mode?: 'degraded-new-pty-fallback'
): DaemonProcessHandle {
  const handle: DaemonProcessHandle = {
    adopted: true,
    shutdown: async () => {
      await cleanupDaemonForProtocol(runtimeDir, PROTOCOL_VERSION)
    }
  }
  const hostImage = inspectDaemonHostImage(readDaemonPidRecord(pidPath))
  if (hostImage.verdict === 'severed') {
    console.warn(
      `[daemon] DEGRADED MODE: keeping daemon PID ${hostImage.pid} whose AppImage files are gone. Existing sessions keep working; fresh terminals run on the local provider WITHOUT daemon persistence until you restart the terminal daemon.`
    )
    noteSeveredDaemon(hostImage)
    handle.mode = 'degraded-new-pty-fallback'
    handle.quarantine = 'host-image-severed'
    return handle
  }
  if (mode) {
    handle.mode = mode
  }
  return handle
}

export type DaemonLaunchPolicy = {
  macosLoginSessionWatch?: boolean
  startupTimeoutMs?: number
  spawnAdmission?: 'observe' | 'enforce'
  /** Replace a stale-version daemon once it drains on every platform, not only macOS. */
  recycleStaleDaemonOnEveryPlatform?: boolean
}

export function createOutOfProcessLauncher(
  runtimeDir: string,
  { macosLoginSessionWatch = false, startupTimeoutMs, spawnAdmission }: DaemonLaunchPolicy = {}
): DaemonLauncher {
  return async (socketPath, tokenPath, suppliedPidPath, suppliedLaunchNonce) => {
    const entryPath = getDaemonEntryPath()
    // Why here: everything up to the fork is one recovery, so the adoption connect and the
    // preflight's probes share a single absolute budget rather than each carrying its own.
    const launchStartedAtMs = Date.now()
    const recoveryDeadlineMs = launchStartedAtMs + DAEMON_RECOVERY_BUDGET_MS
    const pidPath = suppliedPidPath ?? getDaemonPidPath(runtimeDir)
    const launchNonce = suppliedLaunchNonce ?? randomUUID()
    // One-shot: whichever launch consumes it owns the attribution, so a later unrelated launch can't
    // reuse it. The write in the respawn closure reaches here without an intervening await, which is
    // what makes a bare module-scoped slot safe — keep it that way or a concurrent launch can steal it.
    const attributedReason = attributedReplaceReason
    attributedReplaceReason = null
    // Why first: adoption, the preflight probes and health checks all talk to this endpoint, and a
    // relocated one is only safe to talk to once its directories are proven private and ours.
    ensureDaemonSocketDir(socketPath)
    let adoptionClient: DaemonClient | null = new DaemonClient({
      socketPath,
      tokenPath
    })
    try {
      // Why: acquire the full pair before control-only probes so an expired inherited deadline can't fire in the probe-to-adoption gap.
      // Why bounded: unbudgeted this grants a fresh 5s to each of four connect/hello steps, so a
      // wedged endpoint burns more before recovery starts than recovery itself is allowed.
      await adoptionClient.ensureConnectedWithin(daemonRecoveryProbeTimeoutMs(recoveryDeadlineMs))
      await reconcileDaemonPidOwnership(adoptionClient, pidPath)
    } catch {
      adoptionClient.disconnect()
      adoptionClient = null
    }
    const releaseAdoptionClient = (): void => {
      adoptionClient?.disconnect()
      adoptionClient = null
    }
    const preserveDaemon = async (
      mode?: 'degraded-new-pty-fallback'
    ): Promise<DaemonProcessHandle> => {
      // The one line that separates "warm reattach worked" from "fresh terminals die on quit".
      logDaemonLaunch('adopted', { mode: mode ?? 'daemon-backed' })
      const connectedClient = adoptionClient ?? undefined
      adoptionClient = null
      return holdDaemonAdoptionLease(createPreservedDaemonHandle(runtimeDir, pidPath, mode), {
        socketPath,
        tokenPath,
        pidPath,
        connectedClient
      })
    }
    try {
      const environment = getAppEnvironment()
      const appImage = resolveAppImageDaemonLaunch({
        entryPath,
        appPath: environment.getAppPath(),
        appVersion: environment.getVersion()
      })
      const resolveGeneration = (): ReturnType<typeof resolveAppImageGenerationDaemonLaunch> =>
        resolveAppImageGenerationDaemonLaunch({ entryPath, appVersion: environment.getVersion() })
      let generation = resolveGeneration()
      const extractedGeneration = generation && 'launch' in generation ? generation.launch : null
      const preservedHandle = await prepareDaemonReplacement({
        runtimeDir,
        socketPath,
        tokenPath,
        // Why: must equal the identity the AppImage daemon records, or a survivor never matches.
        entryPath:
          extractedGeneration?.identityPath ??
          (appImage ? appImageDaemonIdentityPath(appImage) : entryPath),
        recoveryDeadlineMs,
        attributedReason,
        releaseAdoptionClient,
        preserveDaemon,
        launchNonce
      })
      if (preservedHandle) {
        return preservedHandle
      }

      // Why only once launching: the first start of a release unpacks its copy in the background,
      // and a short wait lets this new daemon run from it instead of a mount it would outlive.
      if (
        generation &&
        'fallback' in generation &&
        generation.fallback === 'no-extracted-copy' &&
        (await waitForAppImageCopyPreExtraction())
      ) {
        generation = resolveGeneration()
      }
      const launchGeneration = generation && 'launch' in generation ? generation.launch : null
      const userDataPath = environment.getPath('userData')
      const macHandle = await launchMacDaemonFromStableBundle(
        {
          entryPath,
          userDataPath,
          runtimeDir,
          socketPath,
          tokenPath,
          pidPath,
          launchNonce,
          macosLoginSessionWatch,
          ...(spawnAdmission ? { spawnAdmission } : {})
        },
        launchStartedAtMs + MAC_STABLE_LAUNCH_HANDOFF_MS
      )
      if (macHandle) {
        return macHandle
      }
      // Why: relocation fails open on the copy but used to fail closed on the launch — a host the
      // machine refuses to execute cost the whole daemon lane, and every terminal then ran on the
      // LocalPtyProvider, which killAllPty() kills on quit. See resolveDaemonLaunchHosts.
      const launchHosts = resolveDaemonLaunchHosts(entryPath)
      pruneDaemonHostStaging()
      if (generation && 'fallback' in generation) {
        console.warn(
          `[daemon] AppImage daemon host fallback reason=${generation.fallback}: starting it on Electron, ${appImage ? 'from its own mount' : 'from the current mount'}`
        )
      }
      const launchOnHost = (host: DaemonLaunchHost): ReturnType<typeof launchDaemonChild> =>
        launchDaemonChild({
          entryPath,
          forkEntryPath: host.entryPath,
          hostKind: host.kind,
          relocatedExecPath: host.execPath,
          appImage: host.kind === 'relocated' ? undefined : (appImage ?? undefined),
          extractedGeneration: launchGeneration ?? undefined,
          userDataPath,
          socketPath,
          tokenPath,
          pidPath,
          launchNonce,
          macosLoginSessionWatch,
          startupTimeoutMs,
          ...(spawnAdmission ? { spawnAdmission } : {})
        })
      let launched
      try {
        logDaemonLaunch('launch-attempt', { host: launchHosts.primary.kind })
        try {
          launched = await launchOnHost(launchHosts.primary)
        } catch (primaryError) {
          const { fallback } = launchHosts
          // Why not on an occupied/ownership error: the endpoint changed hands, so a second fork
          // would race the winner rather than route around a dead image.
          if (
            !fallback ||
            primaryError instanceof DaemonEndpointOwnershipError ||
            (primaryError instanceof DaemonEndpointUnavailableError &&
              primaryError.reason === 'occupied')
          ) {
            logDaemonLaunch('launch-failed', {
              host: launchHosts.primary.kind,
              ...(primaryError instanceof DaemonEndpointOwnershipError
                ? { stage: 'endpoint-ownership' }
                : classifyDaemonLaunchFailure(primaryError))
            })
            throw primaryError
          }
          console.warn(
            `[daemon] The ${launchHosts.primary.kind} daemon host did not start; retrying from the ${fallback.kind} host`
          )
          logDaemonLaunch('launch-host-fallback', {
            from: launchHosts.primary.kind,
            to: fallback.kind,
            ...classifyDaemonLaunchFailure(primaryError)
          })
          try {
            launched = await launchOnHost(fallback)
          } catch (fallbackError) {
            logDaemonLaunch('launch-failed', {
              host: fallback.kind,
              ...(fallbackError instanceof DaemonEndpointOwnershipError
                ? { stage: 'endpoint-ownership' }
                : classifyDaemonLaunchFailure(fallbackError))
            })
            throw fallbackError
          }
        }
      } catch (error) {
        if (!(error instanceof DaemonEndpointUnavailableError) || error.reason !== 'occupied') {
          throw error
        }
        // Why adopt rather than retry: another daemon proved it owns the endpoint and is
        // answering on it. Forking again would lose the same race, and reporting a startup
        // failure strands this app on local non-persistent PTYs beside a healthy daemon.
        console.warn(
          '[daemon] Endpoint was taken by another daemon during startup — adopting it instead'
        )
        // Why pidPath: adopting repairs a PID record that names the wrong incarnation.
        return await holdDaemonAdoptionLease(createPreservedDaemonHandle(runtimeDir, pidPath), {
          socketPath,
          tokenPath,
          pidPath
        })
      }

      try {
        return await holdDaemonAdoptionLease(
          { shutdown: () => terminateLaunchedDaemonChild(launched.child) },
          { socketPath, tokenPath, pidPath, expectedIdentity: launched.identity }
        )
      } catch (error) {
        if (error instanceof DaemonEndpointOwnershipError) {
          await terminateLaunchedDaemonChild(launched.child)
          unlinkOwnedDaemonPidFile(pidPath, launched.identity.pid, launched.identity.launchNonce)
          throw error
        }
        // Why: another client may have adopted this live process; keep its pid record until exit, but remove one published after an early exit.
        let pidRecordRemoved = false
        const removeExitedPidRecord = (): void => {
          if (pidRecordRemoved) {
            return
          }
          pidRecordRemoved = true
          unlinkOwnedDaemonPidFile(pidPath, launched.identity.pid, launched.identity.launchNonce)
        }
        launched.child.once('exit', removeExitedPidRecord)
        if (childProcessHasExited(launched.child)) {
          launched.child.off('exit', removeExitedPidRecord)
          removeExitedPidRecord()
        }
        throw error
      }
    } catch (error) {
      releaseAdoptionClient()
      // Why: the launcher may now fork onto an endpoint it could not classify, because the
      // publisher is the real guard — and that guard works by refusing to overwrite what it
      // cannot prove dead, so the child exits instead of splitting the brain. Correct, but
      // giving up here costs the user every persistent session for the whole run. Something
      // answering the endpoint now is a daemon worth adopting, not a reason to fall back to
      // local PTYs.
      // Why unbudgeted: the recovery deadline bounds the adopt-or-replace decision, and this runs
      // after it — past the kill, the fork and the lease. Clamping to the remainder yields a 1ms
      // probe that loses to its own timer against a live socket, turning the rescue into the total
      // daemon loss it exists to prevent.
      if (await probeSocket(socketPath)) {
        console.warn(
          '[daemon] DEGRADED MODE: adopting the daemon that owns the endpoint after a replacement could not publish onto it. Existing sessions keep working; fresh terminals run on the local provider WITHOUT daemon persistence until you restart the daemon (Manage Sessions → Restart).'
        )
        try {
          return await preserveDaemon('degraded-new-pty-fallback')
        } catch {
          // It stopped answering between the probe and the adoption; report the launch failure.
        }
      }
      // Terminals now run on the LocalPtyProvider, which killAllPty() kills on quit (#5232).
      logDaemonLaunch('lane-unavailable', classifyDaemonLaunchFailure(error))
      throw error
    }
  }
}
