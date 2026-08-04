import { shell, type WebContents } from 'electron'
import { is } from '@electron-toolkit/utils'
import { normalizeExternalBrowserUrl } from '../../shared/browser-url'
import { isEnterpriseBlockedVendorLink } from '../enterprise/enterprise-vendor-link-guard'

// The other half of the `disableVendorLinks` chokepoint: a plain `<a href>` in the
// renderer (the terminal error toast's "file an issue") never reaches shell:openUrl.
function openExternalUnlessBlockedByPolicy(externalUrl: string): void {
  if (isEnterpriseBlockedVendorLink(externalUrl)) {
    console.warn(`Enterprise policy "disableVendorLinks" blocked navigating to ${externalUrl}.`)
    return
  }
  void shell.openExternal(externalUrl)
}

/** Keep remote documents from inheriting an Orca window's privileged preload. */
export function installPrivilegedWindowNavigationPolicy(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    const externalUrl = normalizeExternalBrowserUrl(url)
    if (externalUrl) {
      openExternalUnlessBlockedByPolicy(externalUrl)
    }
    return { action: 'deny' }
  })

  contents.on('will-navigate', (event, url) => {
    const externalUrl = normalizeExternalBrowserUrl(url)
    if (externalUrl) {
      if (is.dev && process.env.ELECTRON_RENDERER_URL) {
        try {
          const target = new URL(externalUrl)
          const allowed = new URL(process.env.ELECTRON_RENDERER_URL)
          if (target.origin === allowed.origin) {
            return
          }
        } catch {
          // Fall through and block malformed navigation targets.
        }
      }
      openExternalUnlessBlockedByPolicy(externalUrl)
    }
    event.preventDefault()
  })
}
