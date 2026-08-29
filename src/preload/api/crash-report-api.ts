import type {
  CrashReportBreadcrumbData,
  ReactErrorBoundaryReportArgs,
  ReactErrorBoundaryReportResult
} from '../../shared/crash-reporting'
import type { RendererHeapStatistics } from '../../shared/renderer-heap-statistics'
import type { RendererProcessMemory } from '../../shared/renderer-process-memory'

export type CrashReportsApi = {
  recordRendererError: (
    args: ReactErrorBoundaryReportArgs
  ) => Promise<ReactErrorBoundaryReportResult>
  recordBreadcrumb: (args: { name: string; data?: CrashReportBreadcrumbData }) => void
  /** Exact V8/Blink heap sizes; null when the runtime withholds them. */
  readHeapStatistics: () => RendererHeapStatistics | null
  /** This renderer's OS-level footprint, which the heap counters never include. */
  readProcessMemory?: () => Promise<RendererProcessMemory | null>
}
