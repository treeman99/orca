import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { DiscoveredSkill } from '../../../../shared/skills'
import { SkillRow } from './SkillRow'
import { SkillDetailDialog } from './SkillDetailDialog'

const OPTION_SELECTOR = '[role="option"]'

function moveOptionFocus(listbox: HTMLElement | null, from: HTMLElement, step: number): void {
  const options = [...(listbox?.querySelectorAll<HTMLElement>(OPTION_SELECTOR) ?? [])]
  options[options.indexOf(from) + step]?.focus()
}

function focusEdgeOption(listbox: HTMLElement | null, edge: 'first' | 'last'): void {
  const options = [...(listbox?.querySelectorAll<HTMLElement>(OPTION_SELECTOR) ?? [])]
  ;(edge === 'first' ? options.at(0) : options.at(-1))?.focus()
}

export function SkillsList({
  skills,
  ownerHostId,
  agentByRootPath
}: {
  skills: readonly DiscoveredSkill[]
  /** Host the listed skill files live on. */
  ownerHostId: ExecutionHostId
  agentByRootPath: ReadonlyMap<string, string>
}): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const [detailSkill, setDetailSkill] = useState<DiscoveredSkill | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)

  const revealSkill = async (skill: DiscoveredSkill): Promise<void> => {
    const result = await window.api.shell.openInFileManager(skill.skillFilePath, ownerHostId)
    if (!result.ok) {
      toast.error(
        translate('auto.components.skills.SkillsPage.995fde8337', 'Could not reveal skill file')
      )
    }
  }
  const focusTargetId = skills.some((skill) => skill.id === focusedId) ? focusedId : skills[0]?.id

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const option = event.currentTarget
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveOptionFocus(listRef.current, option, 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveOptionFocus(listRef.current, option, -1)
    } else if (event.key === 'Home') {
      event.preventDefault()
      focusEdgeOption(listRef.current, 'first')
    } else if (event.key === 'End') {
      event.preventDefault()
      focusEdgeOption(listRef.current, 'last')
    }
  }

  return (
    <>
      <SkillDetailDialog
        skill={detailSkill}
        agentByRootPath={agentByRootPath}
        onOpenChange={(open) => {
          if (!open) {
            setDetailSkill(null)
          }
        }}
        onReveal={() => {
          if (detailSkill) {
            void revealSkill(detailSkill)
          }
        }}
      />
      <div
        ref={listRef}
        role="listbox"
        aria-label={translate('auto.components.skills.SkillsList.listLabel', 'Skills')}
        aria-orientation="vertical"
      >
        {skills.map((skill) => (
          <SkillRow
            key={skill.id}
            skill={skill}
            focusable={focusTargetId === skill.id}
            onFocus={() => setFocusedId(skill.id)}
            onOpenDetail={() => setDetailSkill(skill)}
            onReveal={() => void revealSkill(skill)}
            onKeyDown={onListKeyDown}
          />
        ))}
      </div>
    </>
  )
}
