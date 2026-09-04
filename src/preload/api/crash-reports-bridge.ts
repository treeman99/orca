import { ipcRenderer } from 'electron'
import type {
  CrashReportBreadcrumbData,
  ReactErrorBoundaryReportArgs,
  ReactErrorBoundaryReportResult
} from '../../shared/crash-reporting'
import type { RendererHeapStatistics } from '../../shared/renderer-heap-statistics'
import type { RendererProcessMemory } from '../../shared/renderer-process-memory'
import { readRendererHeapStatistics } from '../renderer-heap-statistics-reader'
import { readRendererProcessMemory } from '../renderer-process-memory-reader'
import type { PreloadApi } from '../api-types'

// This build removed crash-report submission, so main registers only the two handlers below
// (`src/main/ipc/crash-reporting.ts`). Fetch/dismiss/submit/copy would invoke channels that
// no longer exist.
export const crashReportsApi = {
  recordRendererError: (
    args: ReactErrorBoundaryReportArgs
  ): Promise<ReactErrorBoundaryReportResult> =>
    ipcRenderer.invoke('crashReports:recordRendererError', args),
  recordBreadcrumb: (args: { name: string; data?: CrashReportBreadcrumbData }): void =>
    ipcRenderer.send('crashReports:recordBreadcrumb', args),
  readHeapStatistics: (): RendererHeapStatistics | null => readRendererHeapStatistics(),
  readProcessMemory: (): Promise<RendererProcessMemory | null> => readRendererProcessMemory()
} satisfies PreloadApi['crashReports']
