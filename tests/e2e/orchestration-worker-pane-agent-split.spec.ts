// Why this spec exists: the auto-split worker column is claimed in the renderer from an anchor main
// mints, and nothing on that path reads the agent — yet the corporate build reported "opencode
// workers land as a tab, claude workers get a column". Every unit test brackets the seam with a
// fake payload, so only a real dispatch through a real Electron can say whether the agent's
// launch shape changes what reaches the renderer. Two fake agents, one identical dispatch each —
// the two the corporate build's own allowlist admits, so the spec runs under that policy too.

import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test as base, expect } from './helpers/orca-app'
import {
  ensureTerminalVisible,
  getActiveTabId,
  waitForActiveWorktree,
  waitForSessionReady
} from './helpers/store'
import { waitForActivePaneHookDescriptor, waitForActivePanePtyId } from './helpers/terminal'
import {
  buildFakeAgentCommandOverride,
  FAKE_AGENT_WINDOWS_SHELL
} from './helpers/fake-agent-command-override'
import { FAKE_AGENT_PASTE_END_SCANNER_SOURCE } from './helpers/fake-agent-paste-end-scanner'
import { RuntimeClient } from '../../src/cli/runtime-client'
import type { RuntimeTerminalListResult } from '../../src/shared/runtime-types'

const fakeCliDir = mkdtempSync(path.join(os.tmpdir(), 'orca-e2e-worker-pane-agent-'))
const diagnosticDir = path.join(fakeCliDir, 'diag')
const inputLedgerPath = path.join(fakeCliDir, 'input.jsonl')

// Why the delayed title: opencode enables bracketed paste first and only paints its composer
// (and the `OC |` title Orca keys readiness on) a beat later, which is the window the fork's
// composer wait exists for. The fake reproduces that order so the dispatch takes the same path.
// It reads plain text, as the real one does under ConPTY — a `\r` alone is the submit.
const fakeOpencodeSource = `
const { appendFileSync } = require('node:fs')
function ledger(event) {
  try { appendFileSync(process.env.ORCA_E2E_INPUT_LEDGER, JSON.stringify({ agent: 'opencode', ...event }) + '\\n') } catch {}
}
process.stdout.write('\\u001b[?2004h')
setTimeout(() => {
  process.stdout.write('\\u001b]0;OC | e2e\\u0007opencode e2e\\n')
  process.stdout.write('\\u001b[?25h')
}, 300)
process.stdin.on('data', (chunk) => {
  const input = chunk.toString()
  ledger({ input })
  if (input.includes('\\r')) process.stdout.write('ACK\\n')
})
process.stdin.resume()
setInterval(() => {}, 60_000)
`

// Why a bracketed-paste reader: claude takes the dispatch as a paste frame plus Enter, so the
// fake acknowledges only a submit that follows a complete frame — the same contract the other
// orchestration specs hold their fake agents to.
const fakeClaudeSource = `
const { appendFileSync } = require('node:fs')
function ledger(event) {
  try { appendFileSync(process.env.ORCA_E2E_INPUT_LEDGER, JSON.stringify({ agent: 'claude', ...event }) + '\\n') } catch {}
}
${FAKE_AGENT_PASTE_END_SCANNER_SOURCE}
process.stdout.write('\\u001b[?2004h\\u001b]0;Claude Code\\u0007Claude Code e2e\\n> ')
process.stdin.on('data', (chunk) => {
  const input = chunk.toString()
  ledger({ input })
  const scan = scanFakeAgentPasteEnd(fakeAgentPasteEndTail, input)
  fakeAgentPasteEndTail = scan.tail
  fakeAgentMaybeAck(scan, input, (mode) => {
    process.stdout.write('ACK ' + mode + '\\n')
  })
})
process.stdin.resume()
setInterval(() => {}, 60_000)
`

type FakeAgent = 'claude' | 'opencode'

function installFakeAgent(name: FakeAgent, source: string): string {
  if (process.platform === 'win32') {
    writeFileSync(path.join(fakeCliDir, `fake-${name}.js`), source)
    const cmd = path.join(fakeCliDir, `${name}.cmd`)
    writeFileSync(cmd, `@echo off\r\nnode "%~dp0\\fake-${name}.js" %*\r\n`)
    return cmd
  }
  const executable = path.join(fakeCliDir, name)
  writeFileSync(executable, `#!/usr/bin/env node\n${source}`)
  chmodSync(executable, 0o755)
  return executable
}

const fakeAgentCommands: Record<FakeAgent, string> = {
  claude: buildFakeAgentCommandOverride(installFakeAgent('claude', fakeClaudeSource)),
  opencode: buildFakeAgentCommandOverride(installFakeAgent('opencode', fakeOpencodeSource))
}

const test = base.extend({
  launchEnv: [
    {
      PATH: `${fakeCliDir}${path.delimiter}${process.env.PATH ?? ''}`,
      ORCA_E2E_INPUT_LEDGER: inputLedgerPath
    },
    { option: true }
  ]
})

test.afterAll(() => {
  rmSync(fakeCliDir, { recursive: true, force: true })
})

function readDiagnosticLines(): string[] {
  const file = path.join(diagnosticDir, 'orca-diagnostic.log')
  if (!existsSync(file)) {
    return []
  }
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.includes('worker-pane'))
}

type WorkerEffect = {
  kind: string
  role?: string
  id?: string
  paneAnchorTabId?: string
  paneAnchorSkipped?: string
}

for (const agent of ['claude', 'opencode'] as const satisfies readonly FakeAgent[]) {
  test(`${agent} worker opens in its own column beside the coordinator`, async ({
    orcaPage,
    electronApp
  }) => {
    test.setTimeout(150_000)
    rmSync(inputLedgerPath, { force: true })
    rmSync(diagnosticDir, { recursive: true, force: true })
    await waitForSessionReady(orcaPage)
    await orcaPage.evaluate(
      async ({ agentCmdOverrides, terminalWindowsShell, diagnosticLogDirectory }) => {
        await window.__store?.getState().updateSettings({
          autoSplitOrchestrationWorkerPanes: true,
          agentCmdOverrides,
          terminalWindowsShell,
          diagnosticLogEnabled: true,
          diagnosticLogDirectory
        })
      },
      {
        agentCmdOverrides: fakeAgentCommands,
        terminalWindowsShell: FAKE_AGENT_WINDOWS_SHELL,
        diagnosticLogDirectory: diagnosticDir
      }
    )
    const worktreeId = await waitForActiveWorktree(orcaPage)
    await ensureTerminalVisible(orcaPage)
    const coordinatorTabId = await getActiveTabId(orcaPage)
    expect(coordinatorTabId).toBeTruthy()
    await waitForActivePanePtyId(orcaPage)
    const coordinatorPane = await waitForActivePaneHookDescriptor(orcaPage)
    const userDataDir = await electronApp.evaluate(({ app }) => app.getPath('userData'))
    const client = new RuntimeClient(userDataDir, 30_000, null, null)
    const coordinator = await client.call<{ terminal: { handle: string } }>(
      'terminal.resolvePane',
      { paneKey: coordinatorPane.paneKey }
    )
    const run = await client.call<{ run: { id: string } }>('orchestration.runCreate', {
      objective: `Worker column for ${agent}`,
      from: coordinator.result.terminal.handle
    })
    const task = await client.call<{ task: { id: string } }>('orchestration.taskCreate', {
      spec: 'Respond ACK and remain idle',
      run: run.result.run.id,
      callerTerminalHandle: coordinator.result.terminal.handle
    })
    const coordinatorTerminal = await client.call<{ terminal: { worktreeId: string } }>(
      'terminal.show',
      { terminal: coordinator.result.terminal.handle }
    )
    await expect
      .poll(async () => {
        const listed = await client.call<{ worktrees: { id: string }[] }>('worktree.list', {})
        return listed.result.worktrees.some(
          (worktree) => worktree.id === coordinatorTerminal.result.terminal.worktreeId
        )
      })
      .toBe(true)

    const started = await client.call<{
      effects: WorkerEffect[]
      state: string
      lastError?: string
    }>('orchestration.workerStart', {
      task: task.result.task.id,
      from: coordinator.result.terminal.handle,
      agent,
      timeoutMs: 20_000
    })
    const agentEffect = started.result.effects.find(
      (effect) => effect.kind === 'terminal' && effect.role === 'agent'
    )
    expect(
      agentEffect?.id,
      `worker-start ${started.result.state}: ${started.result.lastError ?? ''}`
    ).toBeTruthy()

    const terminals = await client.call<RuntimeTerminalListResult>('terminal.list')
    const workerTerminal = terminals.result.terminals.find(
      (terminal) => terminal.handle === agentEffect!.id
    )
    expect(workerTerminal?.tabId).toBeTruthy()
    const workerTabId = workerTerminal!.tabId!

    const workerTab = orcaPage.locator(`[data-testid="sortable-tab"][data-tab-id="${workerTabId}"]`)
    await expect(workerTab).toBeVisible()

    const stripHolding = (tabId: string) =>
      orcaPage.locator(`[data-tab-group-strip-id][data-worktree-id="${worktreeId}"]`, {
        has: orcaPage.locator(`[data-testid="sortable-tab"][data-tab-id="${tabId}"]`)
      })
    const coordinatorStripId = await stripHolding(coordinatorTabId!).getAttribute(
      'data-tab-group-strip-id'
    )
    const workerStripId = await stripHolding(workerTabId).getAttribute('data-tab-group-strip-id')
    const diagnostics = readDiagnosticLines()

    // Main must have named the coordinator as the anchor for a same-worktree dispatch, and the
    // troubleshooting log must show both halves of the handoff — the asymmetry (main line
    // without a renderer line) is the discriminator a field report is read with.
    expect(agentEffect, JSON.stringify(started.result.effects)).toEqual(
      expect.objectContaining({ paneAnchorTabId: coordinatorTabId })
    )
    expect(diagnostics.join('\n')).toMatch(/worker-pane-main .*skip=none/)
    expect(diagnostics.join('\n')).toMatch(/worker-pane-renderer .*skip=none/)
    // And the renderer must have drawn the column: two tab strips, worker not in the coordinator's.
    await expect(
      orcaPage.locator(`[data-tab-group-strip-id][data-worktree-id="${worktreeId}"]`)
    ).toHaveCount(2)
    expect(workerStripId).toBeTruthy()
    expect(workerStripId).not.toBe(coordinatorStripId)
    // The coordinator keeps focus — a dispatched worker is background work.
    await expect(
      orcaPage.locator(`[data-testid="sortable-tab"][data-tab-id="${coordinatorTabId}"]`)
    ).toHaveAttribute('data-active', 'true')
  })
}
