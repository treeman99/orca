// Why removal and not the `disableCloudRelay` policy switch that already covers this: the switch
// is an administrator's choice, and a fleet that wants mobile pairing has a real reason to turn it
// off — which silently restores vendor sign-in at `login.onorca.dev` and the relay director at
// `relay.onorca.dev` along with it. This build has no use for either, so they are removed rather
// than left one policy edit away from returning.
//
// Both hosts have exactly one producer, `getOrcaCloudAuthConfig`. Reporting the cloud as
// unconfigured there is what keeps them unreachable: the desktop relay service is only constructed
// when that call succeeds, so the relay never dials out and never mints a relay-backed pairing
// invite for a phone to follow.
//
// v1.4.201 added a third vendor host, the background push gateway at `push.onorca.dev`, and put it
// outside that config on purpose (it authenticates with the host keypair, not an account). Its one
// producer is `resolvePushGatewayOrigin`, which reports no origin here, and DesktopPushService.create
// — the only place a gateway client is built, for desktop and headless serve alike — refuses one.

// Annotated `boolean` rather than left as the literal `true` so the upstream bodies these guards
// protect stay reachable to the type checker — a rebase must not resolve against code TypeScript
// has already written off.
export const ORCA_CLOUD_REMOVED: boolean = true

export const ORCA_CLOUD_REMOVED_MESSAGE =
  'Orca Cloud sign-in is removed in this build. This device never contacts the vendor account or relay service.'
