import { ipcMain } from 'electron'
import type { CrashReportStore } from '../crash-reporting/crash-report-store'
import { rendererCrashBreadcrumbOrigin } from '../../shared/crash-breadcrumb-origin'
import {
  recentRendererErrorReportKeys,
  recordRendererErrorReport
} from './crash-reporting-renderer-error-report'
import { recordRendererBreadcrumbFromRenderer } from './crash-reporting-renderer-breadcrumbs'

// Fork: upstream also registers getLatestPending / getLatestReport / dismiss /
// copyLatestDiagnostics / submit here. Those exist only to feed the "send this crash to
// the vendor" dialog, whose transport (`ipc/feedback.ts`) this build removed in 4eba10d245.
// Renderer-side capture stays: it is local state a support engineer reads off the machine.
// Upstream re-extracts the submission lane into new files every few releases — see
// docs/reference/external-integrations-audit.md §3 before adopting one.

export function _resetRendererErrorReportDedupeForTests(): void {
  recentRendererErrorReportKeys.clear()
}

export function _getCrashReportingStateSizesForTests(): {
  recentRendererErrorReportKeys: number
} {
  return {
    recentRendererErrorReportKeys: recentRendererErrorReportKeys.size
  }
}

export function registerCrashReportingHandlers(store: CrashReportStore): void {
  ipcMain.removeAllListeners('crashReports:recordBreadcrumb')
  ipcMain.on(
    'crashReports:recordBreadcrumb',
    (event, args?: { name?: unknown; data?: unknown }) => {
      const senderId = event?.sender?.id
      recordRendererBreadcrumbFromRenderer(
        args,
        typeof senderId === 'number' ? rendererCrashBreadcrumbOrigin(senderId) : undefined
      )
    }
  )

  ipcMain.removeHandler('crashReports:recordRendererError')
  ipcMain.handle('crashReports:recordRendererError', async (event, args: unknown) => {
    try {
      return await recordRendererErrorReport(store, args, event?.sender?.id)
    } catch (error) {
      console.error('[crash-reporting] Failed to record renderer error report:', error)
      return { ok: false, error: 'Failed to record renderer error report.' }
    }
  })
}
