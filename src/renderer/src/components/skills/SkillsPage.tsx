import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { discoverSkillsForRuntimeTarget } from '@/runtime/runtime-skills-client'
import { useActiveSkillDiscoveryRuntimeTarget } from '@/hooks/use-active-skill-discovery-runtime-target'
import { useMountedRef } from '@/hooks/useMountedRef'
import type { DiscoveredSkill, SkillDiscoveryResult } from '../../../../shared/skills'
import { SkillsList } from './SkillsList'
import { SkillInstallManagementDialog } from './SkillInstallManagementDialog'
import { SkillsPageHeader } from './SkillsPageHeader'
import { SkillsFilterToolbar } from './SkillsFilterToolbar'
import {
  SkillsEmptyState,
  SkillsListSkeleton,
  SkillsNoMatchesState,
  SkillsScanErrorBand
} from './skills-page-states'
import { SKILLS_PAGE_COLUMN } from './skills-page-column'
import { scannedSkillSourceCount, summarizeSkillSources } from './skill-source-inventory'
import { useSkillDiscoveryHostLabel } from './use-skill-discovery-host-label'
import { countSkillsBySource, filterSkills, type SkillsFilterState } from './skills-filter'
import { skillAgentByRootPath, skillAgentOptions } from './skill-agent-filter'
import { translate } from '@/i18n/i18n'
import { INSTALLED_AGENT_SKILLS_CHANGED_EVENT } from '@/hooks/installed-agent-skills-change-event'

// Local inventory only. The vendor lanes this page used to host — publish, install-from-link,
// "my share links" — are removed at the source (SKILL_SHARING_REMOVED); the page itself stays
// because it and SkillInstallManagementDialog are the only way to see and delete what a machine
// already has. Deleting them would be a regression, not extra safety.
const EMPTY_SKILLS: DiscoveredSkill[] = []
const NO_FILTERS: SkillsFilterState = {
  query: '',
  sourceKind: 'all',
  agent: 'all'
}

export default function SkillsPage(): React.JSX.Element {
  const closeSkillsPage = useAppStore((s) => s.closeSkillsPage)
  const runtimeTarget = useActiveSkillDiscoveryRuntimeTarget()
  const hostLabel = useSkillDiscoveryHostLabel(runtimeTarget)
  const [result, setResult] = useState<SkillDiscoveryResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanError, setScanError] = useState<string | null>(null)
  const [managementOpen, setManagementOpen] = useState(false)
  const [filters, setFilters] = useState<SkillsFilterState>(NO_FILTERS)
  const mountedRef = useMountedRef()
  const scanGenerationRef = useRef(0)

  const loadSkills = useCallback(async (): Promise<void> => {
    setLoading(true)
    // Why: a cold local scan walks every skill root, so switching runtimes can
    // land a stale result after a newer one. Only the newest scan may write.
    const scanGeneration = ++scanGenerationRef.current
    const isCurrentScan = (): boolean =>
      mountedRef.current && scanGeneration === scanGenerationRef.current
    if (!runtimeTarget) {
      // Why: keep scanning until the owning runtime is known, rather than
      // showing the client's skills to someone whose skills live remotely.
      return
    }
    try {
      const nextResult = await discoverSkillsForRuntimeTarget(runtimeTarget)
      if (isCurrentScan()) {
        setResult(nextResult)
        setScanError(null)
      }
    } catch (error) {
      console.error('Failed to discover skills:', error)
      if (isCurrentScan()) {
        // Why: a failed scan needs to stay on screen with a retry — a toast
        // disappears before the user can act on it.
        setScanError(
          translate('auto.components.skills.SkillsPage.ea72d6185b', 'Could not scan skills')
        )
      }
    } finally {
      if (isCurrentScan()) {
        setLoading(false)
      }
    }
  }, [mountedRef, runtimeTarget])

  useEffect(() => {
    void loadSkills()
  }, [loadSkills])

  useEffect(() => {
    const refresh = (): void => void loadSkills()
    window.addEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(INSTALLED_AGENT_SKILLS_CHANGED_EVENT, refresh)
  }, [loadSkills])

  useEffect(() => {
    const hasVisibleOverlay = (): boolean =>
      Array.from(
        document.querySelectorAll('[role="dialog"], [role="listbox"], [role="menu"]')
      ).some((element) => {
        if (!(element instanceof HTMLElement)) {
          return false
        }
        if (element.closest('[aria-hidden="true"]')) {
          return false
        }
        if (element.closest('[data-skills-page-list="true"]')) {
          return false
        }
        const style = window.getComputedStyle(element)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          element.getClientRects().length > 0
        )
      })

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return
      }
      // Why: menus and dialogs own Escape before page-level navigation.
      if (hasVisibleOverlay()) {
        return
      }
      const target = event.target
      if (
        target instanceof HTMLElement &&
        target.matches('input, textarea, select, [contenteditable="true"], [contenteditable=""]')
      ) {
        return
      }
      event.preventDefault()
      closeSkillsPage()
    }

    // Why: tooltips can consume Escape before bubble listeners see it. Capture
    // keeps page-level back navigation reliable when no overlay is active.
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [closeSkillsPage])

  const skills = result?.skills ?? EMPTY_SKILLS
  const agentByRootPath = useMemo(() => skillAgentByRootPath(result), [result])
  const agentOptions = useMemo(() => skillAgentOptions(result), [result])
  const visibleSkills = useMemo(
    () => filterSkills(skills, filters, agentByRootPath),
    [agentByRootPath, filters, skills]
  )
  const sourceCounts = useMemo(() => countSkillsBySource(skills), [skills])
  const sourceEntries = useMemo(() => summarizeSkillSources(result), [result])

  return (
    <main className="flex min-h-0 flex-1 flex-col bg-background">
      <SkillsPageHeader
        skillCount={skills.length}
        sourceEntries={sourceEntries}
        scannedSourceCount={scannedSkillSourceCount(sourceEntries)}
        hostLabel={hostLabel}
        onClose={closeSkillsPage}
        onManageInstalls={() => setManagementOpen(true)}
      />
      <SkillsFilterToolbar
        filters={filters}
        agentOptions={agentOptions}
        sourceCounts={sourceCounts}
        totalCount={skills.length}
        resultCount={visibleSkills.length}
        loading={loading}
        onFiltersChange={setFilters}
        onRefresh={() => void loadSkills()}
      />
      {scanError ? (
        <SkillsScanErrorBand
          message={scanError}
          disabled={loading}
          onRetry={() => void loadSkills()}
        />
      ) : null}

      <section className="scrollbar-sleek min-h-0 flex-1 overflow-y-auto">
        <div className={cn(SKILLS_PAGE_COLUMN, 'py-2')} data-skills-page-list="true">
          {loading && skills.length === 0 ? (
            <SkillsListSkeleton />
          ) : visibleSkills.length > 0 ? (
            <SkillsList skills={visibleSkills} agentByRootPath={agentByRootPath} />
          ) : skills.length > 0 ? (
            <SkillsNoMatchesState onClearFilters={() => setFilters(NO_FILTERS)} />
          ) : (
            <SkillsEmptyState onRefresh={() => void loadSkills()} />
          )}
        </div>
      </section>

      <SkillInstallManagementDialog open={managementOpen} onOpenChange={setManagementOpen} />
    </main>
  )
}
