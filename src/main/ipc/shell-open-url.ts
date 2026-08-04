// The single lane every renderer `window.api.shell.openUrl` call takes to the OS
// browser, and therefore where `disableVendorLinks` is enforced. Split out of
// shell.ts so the refusal sits in a file named after the thing it guards.

import { shell } from 'electron'
import { isEnterpriseBlockedVendorLink } from '../enterprise/enterprise-vendor-link-guard'

/**
 * Hand `rawUrl` to the OS browser, or do nothing when it is unusable or the
 * corporate policy forbids the destination.
 *
 * Why enforce here when the renderer already hides those rows: the `orca serve` /
 * `pnpm dev:web` clients receive no policy view at all, so their display gates are
 * inert and this is the only refusal they get.
 */
export function openExternalUrlUnderPolicy(rawUrl: string): Promise<void> | void {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return
  }

  if (isEnterpriseBlockedVendorLink(parsed.toString())) {
    console.warn(`Enterprise policy "disableVendorLinks" blocked opening ${parsed.hostname}.`)
    return
  }

  return shell.openExternal(parsed.toString())
}
