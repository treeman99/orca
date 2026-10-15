// Why removal instead of a policy switch: upstream v1.4.226 deleted the SSH relay, so an SSH host
// now runs only through a managed Orca server (orcad) that Orca installs and keeps running on the
// remote machine. This build ships no orcad template, the first deploy downloads Node from
// nodejs.org, and the remote server reads none of this desktop's enterprise policy — so there is
// no configuration in which an SSH host works here and stays under the policy (README §6).
//
// Connecting, adding, editing and importing hosts are refused in main, and the renderer withholds
// every add entry point. Listing and removal stay: a host saved by an earlier build keeps its
// projects reachable for removal, and connecting it reports this message instead of failing silently.

// Annotated `boolean`, not left as the literal `true`, so the guarded upstream bodies stay
// reachable to the type checker and keep compiling across rebases.
export const SSH_REMOTE_HOSTS_REMOVED: boolean = true

export const SSH_REMOTE_HOSTS_REMOVED_MESSAGE =
  'SSH hosts are not supported in this build of Orca. Open the project on this machine instead.'

/** Throws in a build without SSH hosts; the one guard every SSH entry point calls. */
export function assertSshRemoteHostsSupported(): void {
  if (SSH_REMOTE_HOSTS_REMOVED) {
    throw new Error(SSH_REMOTE_HOSTS_REMOVED_MESSAGE)
  }
}
