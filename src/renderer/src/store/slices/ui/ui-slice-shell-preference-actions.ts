import type { UISlice, UISliceGet, UISliceSet } from './ui-slice-contract'
import {
  DEFAULT_BROWSER_PAGE_ZOOM_LEVEL,
  normalizeBrowserPageZoomLevel
} from '../../../../../shared/browser-page-zoom'
import { normalizeKagiSessionLink } from '../../../../../shared/browser-url'

/**
 * Upstream ships these beside the in-app updater actions (`ui-slice-update-actions.ts`).
 * This build has no updater, so that module is dropped and its non-updater members —
 * full-screen state, the browser defaults, and the one-shot OSC 52 notice — live here.
 */
export function createUiShellPreferenceActions(
  set: UISliceSet,
  _get: UISliceGet
): Partial<UISlice> {
  return {
    osc52ClipboardDefaultOnNoticePending: false,
    clearOsc52ClipboardDefaultOnNotice: () => {
      // Why clear locally first: a failed persist must not re-toast this session. It will
      // re-arm on the next launch, which is the safe direction for a one-shot notice.
      set({ osc52ClipboardDefaultOnNoticePending: false })
      void window.api.ui.set({ osc52ClipboardDefaultOnNoticePending: false }).catch(console.error)
    },
    isFullScreen: false,
    setIsFullScreen: (v) => set({ isFullScreen: v }),
    browserDefaultUrl: null,
    setBrowserDefaultUrl: (url) => {
      void window.api.ui.set({ browserDefaultUrl: url }).catch(console.error)
      set({ browserDefaultUrl: url })
    },
    browserDefaultSearchEngine: null,
    setBrowserDefaultSearchEngine: (engine) => {
      void window.api.ui.set({ browserDefaultSearchEngine: engine }).catch(console.error)
      set({ browserDefaultSearchEngine: engine })
    },
    browserDefaultZoomLevel: DEFAULT_BROWSER_PAGE_ZOOM_LEVEL,
    setBrowserDefaultZoomLevel: (level) => {
      const normalized = normalizeBrowserPageZoomLevel(level)
      void window.api.ui.set({ browserDefaultZoomLevel: normalized }).catch(console.error)
      set({ browserDefaultZoomLevel: normalized })
    },
    browserKagiSessionLink: null,
    setBrowserKagiSessionLink: (link) => {
      const normalized = link ? normalizeKagiSessionLink(link) : null
      void window.api.ui.set({ browserKagiSessionLink: normalized }).catch(console.error)
      set({ browserKagiSessionLink: normalized })
    }
  }
}
