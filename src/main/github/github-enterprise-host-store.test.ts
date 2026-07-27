import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const state = vi.hoisted(() => ({ userData: '' }))

vi.mock('electron', () => ({
  app: {
    getPath: (key: string) => {
      if (key === 'userData') {
        return state.userData
      }
      throw new Error(`unexpected getPath(${key})`)
    }
  }
}))

import {
  readStoredGithubEnterpriseHost,
  writeStoredGithubEnterpriseHost
} from './github-enterprise-host-store'

describe('github enterprise host store', () => {
  beforeEach(() => {
    state.userData = mkdtempSync(join(tmpdir(), 'ghes-host-'))
  })
  afterEach(() => {
    rmSync(state.userData, { recursive: true, force: true })
  })

  it('returns null when nothing is stored', () => {
    expect(readStoredGithubEnterpriseHost()).toBeNull()
  })

  it('persists and reads back a normalized host', () => {
    writeStoredGithubEnterpriseHost('https://GitHub.Corp.net:443/path')
    expect(readStoredGithubEnterpriseHost()).toBe('github.corp.net')
  })

  it('clears the host when given a blank or invalid value', () => {
    writeStoredGithubEnterpriseHost('github.corp.net')
    expect(readStoredGithubEnterpriseHost()).toBe('github.corp.net')
    writeStoredGithubEnterpriseHost('   ')
    expect(readStoredGithubEnterpriseHost()).toBeNull()
  })
})
