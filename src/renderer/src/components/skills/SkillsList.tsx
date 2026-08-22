import { useRef, useState } from 'react'
import { translate } from '@/i18n/i18n'
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
  agentByRootPath
}: {
  skills: readonly DiscoveredSkill[]
  agentByRootPath: ReadonlyMap<string, string>
}): React.JSX.Element {
  const listRef = useRef<HTMLDivElement>(null)
  const [detailSkill, setDetailSkill] = useState<DiscoveredSkill | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
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
            onKeyDown={onListKeyDown}
          />
        ))}
      </div>
    </>
  )
}
