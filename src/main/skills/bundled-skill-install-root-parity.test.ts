import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AGENT_SKILL_INSTALL_ROOTS,
  agentSkillInstallRootPath
} from '../../shared/agent-skill-install-roots'
import { SKILLS_CLI_AGENT_KEY_BY_TUI_AGENT } from '../../shared/skills-cli-agent-keys'
import { buildSkillDiscoverySources } from './skill-discovery-sources'

const HOME = join('/', 'home', 'tester')

/**
 * The offline installer names its targets itself rather than importing discovery,
 * which is main-only and also enumerates repo and plugin-cache roots an install must
 * never write. This is the guard against the two lists drifting: a home root added to
 * discovery but not here is a directory Orca scans and reports "not installed" for
 * forever, and one added here but not to discovery is an install that vanishes.
 */
describe('offline skill install roots', () => {
  const homeRoots = buildSkillDiscoverySources({ homeDir: HOME, includeCwd: false }).filter(
    (root) => root.sourceKind === 'home'
  )

  it('covers exactly the global home roots skill discovery scans', () => {
    expect(AGENT_SKILL_INSTALL_ROOTS.map((root) => root.rootId).sort()).toEqual(
      homeRoots.map((root) => root.id).sort()
    )
  })

  it('resolves each root to the same path discovery scans', () => {
    const discoveredPathById = new Map(homeRoots.map((root) => [root.id, root.path]))
    for (const root of AGENT_SKILL_INSTALL_ROOTS) {
      expect(agentSkillInstallRootPath(HOME, root)).toBe(discoveredPathById.get(root.rootId))
    }
  })

  it('uses the skills CLI namespace for every keyed root', () => {
    const knownKeys = new Set(
      Object.values(SKILLS_CLI_AGENT_KEY_BY_TUI_AGENT).filter(
        (key): key is string => typeof key === 'string'
      )
    )
    knownKeys.add('universal')
    for (const root of AGENT_SKILL_INSTALL_ROOTS) {
      if (root.agentKey) {
        expect(knownKeys).toContain(root.agentKey)
      }
    }
  })
})
