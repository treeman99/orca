// The corporate skill bundle, as settings sees it: which repository it reads, which revision
// is current there, how every installed copy compares, and the button that replaces them.

import type React from 'react'
import { Download, Loader2, RefreshCw } from 'lucide-react'
import type {
  CorporateSkillBundleSkill,
  CorporateSkillBundleStatus
} from '../../../../shared/corporate-skill-bundle'
import { translate } from '@/i18n/i18n'
import { Button } from '../ui/button'
import { Label } from '../ui/label'
import { SearchableSetting } from './SearchableSetting'
import { getCorporateSkillBundleSearchEntry } from './general-app-update-search'
import {
  runCorporateSkillBundleCheck,
  useCorporateSkillBundle
} from '../app-update/corporate-skill-bundle-store'
import { updateCorporateSkillBundleWithFeedback } from '../app-update/corporate-skill-bundle-feedback'
import {
  describeCorporateSkillBundleStatus,
  describeCorporateSkillPlacement
} from '../app-update/corporate-skill-bundle-copy'

export function CorporateSkillBundleSettingsSection(): React.JSX.Element | null {
  const { status, checking, updating } = useCorporateSkillBundle()
  // Only a well-formed status proves the lane exists (the browser client fakes every call).
  if (!status) {
    return null
  }
  const entry = getCorporateSkillBundleSearchEntry()
  const observed = 'commitSha' in status ? status : null
  const target = 'target' in status ? status.target : null
  const canUpdate = status.state === 'available' || status.state === 'not-installed'

  return (
    <SearchableSetting
      title={entry.title}
      description={entry.description}
      keywords={entry.keywords}
      className="space-y-3"
    >
      <div className="space-y-0.5">
        <Label>{entry.title}</Label>
        <p className="text-xs text-muted-foreground">{entry.description}</p>
      </div>
      {status.state === 'disabled' ? null : (
        <dl className="space-y-1 rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs">
          <DiagnosticsRow
            term={translate(
              'auto.components.settings.CorporateSkillBundleSettingsSection.repository',
              'Skill repository'
            )}
            value={target?.host ? `${target.host}/${target.repository}` : null}
          />
          <DiagnosticsRow
            term={translate(
              'auto.components.settings.CorporateSkillBundleSettingsSection.revision',
              'Latest revision'
            )}
            value={observed ? `${observed.branch} @ ${observed.commitSha.slice(0, 12)}` : null}
          />
          <DiagnosticsRow
            term={translate(
              'auto.components.settings.CorporateSkillBundleSettingsSection.lastChecked',
              'Last checked'
            )}
            value={'checkedAt' in status ? new Date(status.checkedAt).toLocaleString() : null}
          />
        </dl>
      )}
      <p className="text-xs text-muted-foreground" role="status">
        {describeCorporateSkillBundleStatus(status)}
      </p>
      {observed ? <SkillPlacementList skills={observed.skills} /> : null}
      {status.state === 'disabled' ? null : (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={checking || updating}
            onClick={() => void runCorporateSkillBundleCheck()}
          >
            {checking ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-3.5" aria-hidden="true" />
            )}
            {translate(
              'auto.components.settings.CorporateSkillBundleSettingsSection.checkNow',
              'Check skills'
            )}
          </Button>
          {canUpdate ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={updating || checking}
              onClick={() => void updateCorporateSkillBundleWithFeedback()}
            >
              {updating ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Download className="size-3.5" aria-hidden="true" />
              )}
              {updateLabel(status)}
            </Button>
          ) : null}
        </div>
      )}
    </SearchableSetting>
  )
}

function updateLabel(status: CorporateSkillBundleStatus): string {
  return status.state === 'not-installed'
    ? translate(
        'auto.components.settings.CorporateSkillBundleSettingsSection.install',
        'Install all skills'
      )
    : translate(
        'auto.components.settings.CorporateSkillBundleSettingsSection.update',
        'Update all skills'
      )
}

function SkillPlacementList({
  skills
}: {
  skills: readonly CorporateSkillBundleSkill[]
}): React.JSX.Element {
  return (
    <ul className="space-y-1 text-xs">
      {skills.map((skill) => (
        <li key={skill.name} className="flex items-baseline justify-between gap-3">
          <span className="shrink-0 font-mono">{skill.name}</span>
          <span className="min-w-0 truncate text-muted-foreground">
            {skill.placements
              .map((placement) =>
                translate(
                  'auto.components.settings.CorporateSkillBundleSettingsSection.placement',
                  '.{{value0}}: {{value1}}',
                  {
                    value0: placement.home,
                    value1: describeCorporateSkillPlacement(placement.state)
                  }
                )
              )
              .join(' · ')}
          </span>
        </li>
      ))}
    </ul>
  )
}

function DiagnosticsRow({
  term,
  value
}: {
  term: string
  value: string | null
}): React.JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 truncate font-mono">
        {value ??
          translate(
            'auto.components.settings.CorporateSkillBundleSettingsSection.unknownValue',
            'Not yet known'
          )}
      </dd>
    </div>
  )
}
