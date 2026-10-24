// @vitest-environment happy-dom
// Fork-owned: this build removes SSH hosts (src/shared/ssh-remote-hosts-removal.ts), so the plain
// SSH terminal a blocked host would offer is withheld too. Main refuses the open as well.
import '@testing-library/jest-dom/vitest'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SshManagedServerStatus } from '../../../../shared/ssh-types'
import { OpenPlainSshTerminalButton } from './OpenPlainSshTerminalButton'

afterEach(cleanup)

describe('plain SSH terminal button in this build', () => {
  it('renders nothing even for a host whose move is blocked', () => {
    Object.defineProperty(window, 'api', { configurable: true, value: { plainSsh: {} } })
    const blocked: SshManagedServerStatus = {
      kind: 'relay',
      reason: 'refused',
      detail: 'This SSH host cannot move yet.'
    }

    const { container } = render(
      <OpenPlainSshTerminalButton targetId="box" targetLabel="box" status={blocked} />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
