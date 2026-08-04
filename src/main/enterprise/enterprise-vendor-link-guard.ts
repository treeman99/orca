// The `disableVendorLinks` chokepoint. Every renderer-initiated external open lands
// in one of two main-process spots — the `shell:openUrl` IPC and the window
// navigation policy that catches raw `<a href>` / `window.open` — so the refusal
// belongs here rather than in each component that happens to ship a link.
//
// Why a main-process guard when the JSX already hides the rows: the `orca serve`
// browser client has no `enterprisePolicy` bridge, so every renderer display gate is
// inert there (audit §0.2 #18). The hidden row is the UX; this is the enforcement.
//
// Deliberately NOT a web filter. It matches the specific vendor destinations Orca
// itself ships, not whole social networks: an x.com link a colleague pasted into a
// PR body is user content and keeps working, and so does everything on the GHES
// host. Overreaching here would make the audit document a lie.

import { normalizeHost } from '../../shared/enterprise-policy'

import { getEnterprisePolicy } from './enterprise-policy-file'

type VendorLinkRule = {
  /** Host, or a parent domain matched on a dot boundary. */
  host: string
  /** Path prefixes that make the match; omit to match every path on the host. */
  paths?: readonly string[]
}

// Sourced from the link constants this app ships: SidebarSettingsHelpMenu,
// SidebarFeedbackDialog, ShareUsageButton, ProjectViewWrapper, TerminalErrorToast,
// StarNagCard/StarNagToastHost/Landing, feature-wall-tiles, lib/telemetry.
const VENDOR_LINK_RULES: readonly VendorLinkRule[] = [
  // Vendor community/social.
  { host: 'discord.gg' },
  { host: 'discord.com', paths: ['/invite/'] },
  // Not all of x.com: only the vendor's account and the share-intent composer.
  { host: 'x.com', paths: ['/orca_build', '/intent/'] },
  { host: 'twitter.com', paths: ['/orca_build', '/intent/'] },
  // The vendor's own org on github.com SaaS — never the GHES host, which is a
  // different hostname entirely and is what this fleet's own repos live on.
  { host: 'github.com', paths: ['/stablyai/'] },
  // Vendor docs, changelog, marketing, plugin kill-list.
  { host: 'onorca.dev' }
]

function matchesRule(url: URL, rule: VendorLinkRule): boolean {
  const host = url.hostname.toLowerCase()
  if (host !== rule.host && !host.endsWith(`.${rule.host}`)) {
    return false
  }
  if (!rule.paths) {
    return true
  }
  // Trailing slash so "/stablyai/" also matches the bare "github.com/stablyai".
  const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`
  return rule.paths.some((prefix) => path.startsWith(prefix))
}

/** Whether `rawUrl` is one of the vendor destinations this build advertises. */
export function isVendorLink(rawUrl: string): boolean {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return false
  }
  return VENDOR_LINK_RULES.some((rule) => matchesRule(url, rule))
}

/**
 * Whether policy forbids opening `rawUrl` in the OS browser.
 *
 * The configured GHES host wins over every rule: a fleet that named its private
 * host must never have its own links refused by a switch about the vendor's.
 */
export function isEnterpriseBlockedVendorLink(rawUrl: string): boolean {
  if (!getEnterprisePolicy().disableVendorLinks) {
    return false
  }
  const ghesHost = getEnterprisePolicy().githubEnterpriseHost
  if (ghesHost && normalizeHost(rawUrl) === ghesHost) {
    return false
  }
  return isVendorLink(rawUrl)
}
