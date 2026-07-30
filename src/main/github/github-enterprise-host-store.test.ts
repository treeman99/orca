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

  // This file outranks the administrator's githubEnterpriseHost and has no TTL, so a single
  // github.com sign-in used to pin the app to the vendor host until userData was wiped —
  // which is why "delete and reinstall" was the only fix people found.
  it('refuses to store the vendor host, so it cannot mask the corporate one', () => {
    writeStoredGithubEnterpriseHost('github.com')
    expect(readStoredGithubEnterpriseHost()).toBeNull()
    writeStoredGithubEnterpriseHost('https://API.GitHub.com/')
    expect(readStoredGithubEnterpriseHost()).toBeNull()
  })

  it('clears an already-stored corporate host when the vendor host is saved over it', () => {
    writeStoredGithubEnterpriseHost('github.samsungds.net')
    writeStoredGithubEnterpriseHost('github.com')
    expect(readStoredGithubEnterpriseHost()).toBeNull()
  })
})
