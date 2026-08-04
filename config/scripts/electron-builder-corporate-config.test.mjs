import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const electronBuilderConfig = require('../electron-builder.config.cjs')

// Kept in sync with electron-builder-config.test.mjs: both re-require the config.
const MUTABLE_BUILD_ENV = [
  'ORCA_MAC_HOURLY',
  'ORCA_MAC_ADHOC',
  'ORCA_MAC_RELEASE',
  'ORCA_HOURLY_BUILD_VERSION',
  'ORCA_ADHOC_BUILD_VERSION',
  'ORCA_LOCAL_BUILD_VERSION',
  'ORCA_DISABLE_PUBLISH_TARGET',
  'ORCA_WIN_PUBLISHER_NAME'
]

/** Re-requires the config under a temporary env, then restores env and module cache. */
function withEnv(env, assert) {
  const configPath = require.resolve('../electron-builder.config.cjs')
  const original = Object.fromEntries(MUTABLE_BUILD_ENV.map((key) => [key, process.env[key]]))
  try {
    for (const key of MUTABLE_BUILD_ENV) {
      delete process.env[key]
    }
    Object.assign(process.env, env)
    delete require.cache[configPath]
    assert(require('../electron-builder.config.cjs'))
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    delete require.cache[configPath]
    require('../electron-builder.config.cjs')
  }
}

describe('electron-builder config: corporate rebuild opt-outs', () => {
  // Why: a hardcoded upstream publisherName lets electron-updater's Authenticode
  // check accept the vendor-signed public installer over a differently signed build.
  it('lets a rebuild pin its own Windows updater publisherName', () => {
    expect(electronBuilderConfig.win.signtoolOptions.publisherName).toBe('SignPath Foundation')
    withEnv({ ORCA_WIN_PUBLISHER_NAME: 'Contoso Corp CA' }, (config) => {
      expect(config.win.signtoolOptions.publisherName).toBe('Contoso Corp CA')
    })
  })

  it('lets a rebuild emit no updater publish metadata without changing the upstream default', () => {
    expect(electronBuilderConfig.publish).toEqual({
      provider: 'github',
      owner: 'stablyai',
      repo: 'orca',
      releaseType: 'release'
    })
    withEnv({ ORCA_DISABLE_PUBLISH_TARGET: '1' }, (config) => {
      expect(config.publish).toBeNull()
    })
    // Why: the official release workflow leaves the opt-out unset; any other value is not an opt-out.
    withEnv({ ORCA_DISABLE_PUBLISH_TARGET: '0' }, (config) => {
      expect(config.publish).toMatchObject({ provider: 'github', owner: 'stablyai' })
    })
  })
})
