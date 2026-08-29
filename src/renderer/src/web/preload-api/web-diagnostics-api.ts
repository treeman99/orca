import type { PreloadApi } from '../../../../preload/api-types'

export function createWebDiagnosticsApi(): Partial<PreloadApi> {
  return {
    crashReports: {
      recordRendererError: () => Promise.resolve({ ok: true, report: null, deduped: true }),
      recordBreadcrumb: () => {},
      // Why: no Electron process on web; the caller falls back to performance.memory.
      readHeapStatistics: () => null
    },
    diagnostics: {
      getStatus: () =>
        Promise.resolve({
          localFileEnabled: false,
          bundleEnabled: false,
          traceFilePath: '',
          traceFamilySize: 0
        }),
      collectBundle: () => Promise.reject(new Error('Review files are unavailable on web.')),
      openBundlePreview: () => Promise.reject(new Error('Review files are unavailable on web.')),
      discardBundlePreview: () => Promise.resolve(),
      uploadBundle: () => Promise.reject(new Error('Sending diagnostics is unavailable on web.')),
      deleteBundle: () => Promise.reject(new Error('Sent diagnostics are unavailable on web.'))
    }
  }
}
