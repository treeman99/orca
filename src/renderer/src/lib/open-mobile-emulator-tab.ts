import { toast } from 'sonner'
import type { EmulatorStreamInfo } from '@/components/emulator-pane/emulator-pane-types'
import { callRuntimeRpc } from '@/runtime/runtime-rpc-client'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { ensureSimulatorTab, getSimulatorTabForWorktree } from './ensure-simulator-tab'
import {
  beginManualSimulatorLaunch,
  dispatchManualSimulatorLaunchFailed,
  dispatchManualSimulatorLaunchStarted,
  finishManualSimulatorLaunch,
  isManualSimulatorLaunchPending,
  rememberPrelaunchedSimulatorSession
} from './simulator-launch-coordination'
import {
  cancelPendingSimulatorPaneShutdown,
  shutdownManagedSimulatorIfNoPane
} from './simulator-pane-shutdown-scheduler'
import { isMobileEmulatorAvailable } from './mobile-emulator-availability'
import { assertClientCreationActionAvailable } from './client-creation-action-policy'

type OpenMobileEmulatorTabOptions = {
  targetGroupId?: string
  placement?: 'activeGroup' | 'rightSplit'
}

type EmulatorAttachResult = {
  attached?: boolean
  info?: EmulatorStreamInfo
}

function dispatchPrelaunchedSession(worktreeId: string, info: EmulatorStreamInfo): void {
  if (typeof window === 'undefined') {
    return
  }
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent('orca:emulator-auto-attach', {
        detail: { worktreeId, info }
      })
    )
  }, 0)
}

function getLaunchErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }
  return translate(
    'auto.lib.open.mobile.emulator.tab.bf4f2a8a72',
    'Could not start the emulator. Check iOS or Android emulator setup and try another device.'
  )
}

export async function openMobileEmulatorTab(
  worktreeId: string,
  options: OpenMobileEmulatorTabOptions = {}
): Promise<string | null> {
  const store = useAppStore.getState()
  // 정책 차단은 upstream assert보다 앞 — 관리자 정책으로 꺼진 기능은 throw가 아니라 조용한 no-op이어야 한다.
  // isMobileEmulatorAvailable가 사용자 설정(mobileEmulatorEnabled)까지 포함하므로 upstream의 raw 검사를 대체한다.
  if (!isMobileEmulatorAvailable(store.settings)) {
    return null
  }
  assertClientCreationActionAvailable(store, worktreeId, 'mobile-emulator')
  const existingTab = getSimulatorTabForWorktree(worktreeId)
  if (existingTab) {
    return existingTab.id
  }
  const targetGroupId =
    options.targetGroupId ??
    store.activeGroupIdByWorktree[worktreeId] ??
    store.groupsByWorktree[worktreeId]?.[0]?.id
  if (!targetGroupId) {
    return null
  }

  cancelPendingSimulatorPaneShutdown(worktreeId)
  const alreadyLaunching = isManualSimulatorLaunchPending(worktreeId)
  if (alreadyLaunching) {
    return ensureSimulatorTab(worktreeId, {
      placement: options.placement ?? 'rightSplit',
      targetGroupId,
      surfacePane: true
    })
  }
  beginManualSimulatorLaunch(worktreeId)
  try {
    // Why: this scope owns the guard from before tab creation through attach;
    // every early return or error must release it so a retry can proceed.
    const tabId = ensureSimulatorTab(worktreeId, {
      placement: options.placement ?? 'rightSplit',
      targetGroupId,
      surfacePane: true
    })
    if (!tabId) {
      return null
    }
    dispatchManualSimulatorLaunchStarted(worktreeId)
    try {
      // Why: the pane is visible but inert while serve-sim settles; the actual
      // stream is handed to it only after attach returns ready info.
      const result = await callRuntimeRpc<EmulatorAttachResult>(
        { kind: 'local' },
        'emulator.attach',
        {
          worktree: worktreeId,
          focus: false
        }
      )
      if (!result.attached || !result.info) {
        throw new Error('Could not start the emulator.')
      }
      // Why: users can close the tab while serve-sim is still starting; after
      // attach registers the managed session, clean it up if no pane remains.
      if (await shutdownManagedSimulatorIfNoPane(worktreeId, tabId)) {
        return tabId
      }

      rememberPrelaunchedSimulatorSession(worktreeId, result.info)
      dispatchPrelaunchedSession(worktreeId, result.info)
      return tabId
    } catch (error) {
      const message = getLaunchErrorMessage(error)
      toast.error(message)
      dispatchManualSimulatorLaunchFailed(worktreeId, message)
      return tabId
    }
  } finally {
    finishManualSimulatorLaunch(worktreeId)
  }
}
