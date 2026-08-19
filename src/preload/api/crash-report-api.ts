import type {
  CrashReportBreadcrumbData,
  ReactErrorBoundaryReportArgs,
  ReactErrorBoundaryReportResult
} from '../../shared/crash-reporting'
import type { RendererHeapStatistics } from '../../shared/renderer-heap-statistics'

export type CrashReportsApi = {
  recordRendererError: (
    args: ReactErrorBoundaryReportArgs
  ) => Promise<ReactErrorBoundaryReportResult>
  recordBreadcrumb: (args: { name: string; data?: CrashReportBreadcrumbData }) => void
  /** Exact V8/Blink heap sizes; null when the runtime withholds them. */
  readHeapStatistics: () => RendererHeapStatistics | null
}
