// Upstream's three cases all asserted that a share link is captured and replayed to the renderer.
// The removal makes `parseSkillShareId` return null, so what is worth asserting is the inverse:
// every argv shape that used to open the install dialog is now inert.
import { describe, expect, it, vi } from 'vitest'
import { SkillShareDeepLinkState } from './skill-share-deep-link-state'

describe('SkillShareDeepLinkState', () => {
  it('captures nothing from any share argv, so no intent survives to the renderer', () => {
    const state = new SkillShareDeepLinkState()
    const publish = vi.fn()

    // First-instance argv, second-instance argv, and the custom-protocol form in turn.
    expect(state.capture(['orca', 'https://app.orca.dev/skills/share/share_startup'])).toBe(false)
    expect(state.capture(['orca', 'https://share.onorca.dev/skills/share/share_first'])).toBe(false)
    expect(state.capture(['orca', 'orca://skills/share/share_second'], publish)).toBe(false)

    expect(publish).not.toHaveBeenCalled()
    expect(state.consume()).toBeNull()
  })
})
