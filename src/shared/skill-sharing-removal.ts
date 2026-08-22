// Why removal instead of a policy switch, and why here rather than in EnterprisePolicy:
//
// 1. A policy switch physically cannot reach the lane that matters. `getEnterprisePolicy()`
//    imports `electron`, so it cannot enter the relay bundle, and no policy file is deployed to a
//    remote SSH host — the relay would resolve `lockdown: false` and keep downloading. A
//    compile-time constant in `src/shared` ships into the relay bundle with the code it guards.
// 2. There is no configuration that keeps corporate code on corporate infrastructure.
//    `skillCloudRequest` reuses `resolveArtifactCloudApiUrl()`, which locks the destination to an
//    `onorca.dev` host, and packages are fetched from `storage.googleapis.com`. Neither can be
//    repointed at an internal host, so a switch would only offer an administrator a choice this
//    fork should not be offering.
// 3. Upstream's own gate is `GlobalSettings.agentSkillSharingEnabled`, a *user* setting that keeps
//    agents from minting public links. It is off by default but flippable in two clicks — and the
//    install lanes do not consult it at all: `resolveShare` and `createDownloadGrant` run through
//    `withoutAuth`, so anyone holding a link can pull third-party code onto the machine with no
//    sign-in. That anonymous path is what this constant exists to close.
//
// Scope: the vendor lanes only. Local skill discovery, the freshness update run, and the
// managed-install inventory (list/preview/remove) touch no network and stay — taking them away
// would remove the only way to audit and delete what a machine already has.

// Annotated `boolean`, not left as the literal `true`, so the guards below it stay reachable to
// the type checker and oxlint — the upstream bodies they protect must keep compiling, or the next
// rebase resolves against code TypeScript has already written off.
export const SKILL_SHARING_REMOVED: boolean = true

export const SKILL_SHARING_REMOVED_MESSAGE =
  'Agent skill sharing is removed in this build. Skills are never published to, or installed from, an external share host.'

/**
 * The refusal the skill-cloud chokepoint returns, or `null` in a build that still shares.
 * Bundled so that chokepoint needs one import — it lives in files upstream keeps growing, and
 * every line the fork spends there is one line closer to a max-lines bypass.
 */
export function removedSkillSharingOperation(): {
  status: 'unconfigured'
  message: string
} | null {
  return SKILL_SHARING_REMOVED
    ? { status: 'unconfigured', message: SKILL_SHARING_REMOVED_MESSAGE }
    : null
}
