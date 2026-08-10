// Why removal instead of a policy switch: publishing an artifact uploads the file's entire
// contents to `share.onorca.dev`, and the API client locks the destination to an `onorca.dev`
// host — it cannot be repointed at an internal one. So there is no configuration of this
// feature that keeps corporate source on corporate infrastructure, and a switch would only
// offer an administrator a choice the fork should not be offering.
//
// Upstream's own gate is `GlobalSettings.artifactSharingEnabled`, a *user* setting that exists
// to keep agents from minting public links. It is off by default but flippable in two clicks,
// so it is not a deployment control. Everything here overrides it in the deny direction only.

// Annotated `boolean`, not left as the literal `true`, so the guards below it stay reachable to
// the type checker and oxlint — the upstream bodies they protect must keep compiling, or the next
// rebase resolves against code TypeScript has already written off.
export const ARTIFACT_SHARING_REMOVED: boolean = true

export const ARTIFACT_SHARING_REMOVED_MESSAGE =
  'Artifact sharing is removed in this build. Files are never uploaded to an external share host.'
