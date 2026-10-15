// Fork-owned: upstream's SSH suites exercise host code this build keeps dormant behind
// ssh-remote-hosts-removal.ts, so they mock the removal off and that code stays tested.
// The removal itself is proven by src/main/ipc/ssh-remote-hosts-removal.test.ts.
export const SSH_REMOTE_HOSTS_REMOVED = false

export const SSH_REMOTE_HOSTS_REMOVED_MESSAGE =
  'SSH hosts are not supported in this build of Orca. Open the project on this machine instead.'

export function assertSshRemoteHostsSupported(): void {}
