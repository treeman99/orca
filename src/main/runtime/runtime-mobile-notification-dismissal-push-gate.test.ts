import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { RuntimeMobileNotificationController } from './runtime-mobile-notification-controller'

const paths: string[] = []
afterEach(() => {
  paths.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true }))
  vi.restoreAllMocks()
})

function fixture() {
  const userDataPath = mkdtempSync(join(tmpdir(), 'orca-dismissal-gate-'))
  paths.push(userDataPath)
  const controller = new RuntimeMobileNotificationController()
  controller.configureDismissalStore(userDataPath)
  return {
    controller,
    dismissalsPath: join(userDataPath, 'mobile-notification-dismissals.json')
  }
}

const registrar = {
  test: vi.fn(async () => ({ accepted: true }) as const),
  register: vi.fn(async () => ({ registered: true }) as never),
  unregister: vi.fn(async () => ({ unregistered: true }))
}

// Fork: the vendor push gateway is removed, so no registrar is ever set. The dismissal write
// spawned icacls synchronously on Windows for every completion and ack (Windows input freeze).
it('does not persist dismissals while no push registrar exists', () => {
  const h = fixture()
  h.controller.dismiss('pane-1')
  h.controller.dismiss('pane-2')
  expect(existsSync(h.dismissalsPath)).toBe(false)
  expect(
    h.controller.reconcileDismissedPushes([
      { notificationId: 'pane-1', notificationEpoch: h.controller.getEpoch(), notificationSeq: 1 }
    ])
  ).toEqual([])
})

it('persists dismissals once a push registrar is present', () => {
  const h = fixture()
  h.controller.setPushRegistrar(registrar)
  h.controller.dismiss('pane-1')
  expect(existsSync(h.dismissalsPath)).toBe(true)
  const delivered = {
    notificationId: 'pane-1',
    notificationEpoch: h.controller.getEpoch(),
    notificationSeq: 1
  }
  expect(h.controller.reconcileDismissedPushes([delivered])).toEqual([delivered])
})
