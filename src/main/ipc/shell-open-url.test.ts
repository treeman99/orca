// Behavioural cover for both main-process lanes a renderer link can take out of the
// app: the `shell:openUrl` IPC and the window-navigation policy that catches a raw
// `<a href>`. A resolver test proves the policy object is right; these prove that
// `shell.openExternal` is the thing that stops being called.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { makeEnterprisePolicy, makeLockdownPolicy } from '../enterprise/enterprise-policy-fixture'

const getEnterprisePolicyMock = vi.hoisted(() => vi.fn())
vi.mock('../enterprise/enterprise-policy-file', () => ({
  getEnterprisePolicy: getEnterprisePolicyMock
}))

const electron = vi.hoisted(() => ({ openExternal: vi.fn() }))
vi.mock('electron', () => ({ shell: { openExternal: electron.openExternal } }))

vi.mock('@electron-toolkit/utils', () => ({ is: { dev: false } }))

import { openExternalUrlUnderPolicy } from './shell-open-url'
import { installPrivilegedWindowNavigationPolicy } from '../window/privileged-window-navigation'

const VENDOR_URL = 'https://x.com/orca_build'
const WORK_URL = 'https://github.samsungds.net/acme/service/pull/12'

describe('shell:openUrl under the vendor-link policy', () => {
  beforeEach(() => {
    electron.openExternal.mockReset().mockResolvedValue(undefined)
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
  })

  it('opens the vendor link when no policy is in effect', () => {
    void openExternalUrlUnderPolicy(VENDOR_URL)
    expect(electron.openExternal).toHaveBeenCalledWith(VENDOR_URL)
  })

  it('refuses the vendor link under lockdown', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    void openExternalUrlUnderPolicy(VENDOR_URL)
    expect(electron.openExternal).not.toHaveBeenCalled()
  })

  it('keeps opening ordinary work links under lockdown', () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeLockdownPolicy({ githubEnterpriseHost: 'github.samsungds.net' })
    )
    void openExternalUrlUnderPolicy(WORK_URL)
    expect(electron.openExternal).toHaveBeenCalledWith(WORK_URL)
  })
})

type NavigationHandlers = {
  windowOpen: (details: { url: string }) => unknown
  willNavigate: (event: { preventDefault: () => void }, url: string) => void
}

function installFakeWebContents(): NavigationHandlers {
  const handlers = {} as NavigationHandlers
  installPrivilegedWindowNavigationPolicy({
    setWindowOpenHandler: (fn: NavigationHandlers['windowOpen']) => {
      handlers.windowOpen = fn
    },
    on: (event: string, fn: NavigationHandlers['willNavigate']) => {
      if (event === 'will-navigate') {
        handlers.willNavigate = fn
      }
    }
  } as never)
  return handlers
}

// The terminal error toast ships a plain <a href>, which never reaches shell:openUrl.
describe('renderer <a href> navigation under the vendor-link policy', () => {
  beforeEach(() => {
    electron.openExternal.mockReset().mockResolvedValue(undefined)
    getEnterprisePolicyMock.mockReset().mockReturnValue(makeEnterprisePolicy())
  })

  it('hands the vendor link to the OS browser without a policy', () => {
    const handlers = installFakeWebContents()
    handlers.willNavigate({ preventDefault: () => {} }, 'https://github.com/stablyai/orca/issues')
    expect(electron.openExternal).toHaveBeenCalled()
  })

  it('refuses it under lockdown, on both will-navigate and window.open', () => {
    getEnterprisePolicyMock.mockReturnValue(makeLockdownPolicy())
    const handlers = installFakeWebContents()
    handlers.willNavigate({ preventDefault: () => {} }, 'https://github.com/stablyai/orca/issues')
    handlers.windowOpen({ url: 'https://discord.gg/fzjDKHxv8Q' })
    expect(electron.openExternal).not.toHaveBeenCalled()
  })

  it('still opens a work link under lockdown', () => {
    getEnterprisePolicyMock.mockReturnValue(
      makeLockdownPolicy({ githubEnterpriseHost: 'github.samsungds.net' })
    )
    const handlers = installFakeWebContents()
    handlers.willNavigate({ preventDefault: () => {} }, WORK_URL)
    expect(electron.openExternal).toHaveBeenCalledWith(WORK_URL)
  })
})
