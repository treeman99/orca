// Registering a vendor AI account is what `disableVendorProviderAccounts` forbids.
//
// Only registration. Listing, selecting, and removing already-stored accounts stay open:
// taking away the one way to clear a credential the policy has just rejected would leave
// a machine stuck with it. The corporate gateway sign-in and the self-hosted endpoints are separate
// surfaces and are never gated here — they are the fleet's supported path.
//
// Gated in main rather than only in Settings because the renderer is outside the trust
// boundary: devtools and the bundled web client can invoke these channels directly.

import { getEnterprisePolicy } from './enterprise-policy-file'

export const VENDOR_ACCOUNTS_DISABLED_BY_POLICY = 'vendor_provider_accounts_disabled_by_policy'

export function isVendorAccountRegistrationDisabled(): boolean {
  return getEnterprisePolicy().disableVendorProviderAccounts
}

/** Throws when the policy forbids adding or re-authenticating a vendor AI account. */
export function assertVendorAccountRegistrationAllowed(): void {
  if (isVendorAccountRegistrationDisabled()) {
    throw new Error(VENDOR_ACCOUNTS_DISABLED_BY_POLICY)
  }
}
