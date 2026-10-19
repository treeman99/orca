// IPC for the corporate skill bundle lane. Four channels plus one push:
//
//   corporateSkillBundle:getStatus — the last known status (never triggers a lookup).
//   corporateSkillBundle:check     — check now; resolves with the fresh status.
//   corporateSkillBundle:update    — download the branch head and replace the whole bundle.
//   corporateSkillBundle:dismiss   — "don't tell me about this commit again".
//   corporateSkillBundle:status (event) — pushed whenever the status changes.
//
// The policy gate lives in the service, so the scheduler and these channels cannot
// disagree about whether the lane is on.

import { ipcMain } from 'electron'
import type {
  CorporateSkillBundleStatus,
  CorporateSkillBundleUpdateResult
} from '../../shared/corporate-skill-bundle'
import { getCorporateSkillBundleService } from '../corporate-skills/corporate-skill-bundle-service'

function readCommitArg(raw: unknown): string {
  const commitSha: unknown =
    typeof raw === 'object' && raw !== null ? Reflect.get(raw, 'commitSha') : undefined
  return typeof commitSha === 'string' ? commitSha : ''
}

export function registerCorporateSkillBundleHandlers(): void {
  const service = getCorporateSkillBundleService()

  ipcMain.handle('corporateSkillBundle:getStatus', (): CorporateSkillBundleStatus =>
    service.getStatus()
  )
  ipcMain.handle('corporateSkillBundle:check', (): Promise<CorporateSkillBundleStatus> =>
    service.check()
  )
  ipcMain.handle('corporateSkillBundle:update', (): Promise<CorporateSkillBundleUpdateResult> =>
    service.update()
  )
  ipcMain.handle(
    'corporateSkillBundle:dismiss',
    (_event, raw: unknown): CorporateSkillBundleStatus => service.dismiss(readCommitArg(raw))
  )

  service.start()
}
