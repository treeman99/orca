import { shell, type WebContents } from 'electron'
import { normalizeExternalBrowserUrl } from '../../shared/browser-url'
import { isEnterpriseBlockedVendorLink } from '../enterprise/enterprise-vendor-link-guard'
import { isRendererDocumentNavigation } from './renderer-document-navigation'

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
    // Why: location.reload() is a renderer-initiated navigation, so blocking it here
    // silently kills the lazy-chunk recovery reload with no unload-prevented signal.
    // Supersedes the fork's old dev-origin allowance — same-origin only, dev and prod alike.
    if (isRendererDocumentNavigation(contents.getURL(), url)) {
      return
    }
    const externalUrl = normalizeExternalBrowserUrl(url)
    if (externalUrl) {
      openExternalUnlessBlockedByPolicy(externalUrl)
    }
    event.preventDefault()
  })
}
