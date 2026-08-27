import { getPtyIpc } from '../../pty-host-bindings'
import { runPtyIpcSpawn } from './spawn-run'
import type { PtySpawnIpcArgs, PtySpawnIpcDeps } from './spawn-types'
import { assertAgentAllowedByEnterprisePolicy } from '../../../enterprise/agent-allowlist-guard'

export function installPtySpawnIpcHandler(deps: PtySpawnIpcDeps): void {
  const ipcMain = getPtyIpc()
  const { getLocalPtyStartupPromise } = deps

  ipcMain.handle('pty:spawn', async (_event, args: PtySpawnIpcArgs) => {
    // Why here and not in each picker: every renderer agent launch — tab bar, composer,
    // quick-launch, source control, a keyboard chord bound before the policy arrived —
    // lands on this one channel carrying the agent id it means to start.
    if (args.launchAgent) {
      assertAgentAllowedByEnterprisePolicy(args.launchAgent)
    }
    const startupPromise = getLocalPtyStartupPromise(args.connectionId)
    if (startupPromise) {
      await startupPromise
    }
    return runPtyIpcSpawn(deps, args)
  })
}
