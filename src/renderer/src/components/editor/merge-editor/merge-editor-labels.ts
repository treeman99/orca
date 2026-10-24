import { translate } from '@/i18n/i18n'
import type { MergeInputAction, MergeResultLabel } from './merge-editor-range-actions'
import type { MergeSessionUnavailableReason, MergeSide } from './merge-editor-session'

export function mergeSideTitle(side: MergeSide): string {
  return side === 'theirs'
    ? translate('auto.components.editor.mergeEditor.incoming', 'Incoming')
    : translate('auto.components.editor.mergeEditor.current', 'Current')
}

export function inputActionLabel(action: MergeInputAction, title: string): string {
  switch (action.kind) {
    case 'accept':
      return translate('auto.components.editor.mergeEditor.acceptInput', 'Accept {{title}}', {
        title
      })
    case 'combine':
      return action.orderRelevant
        ? translate(
            'auto.components.editor.mergeEditor.acceptCombinationFirst',
            'Accept Combination ({{title}} First)',
            { title }
          )
        : translate('auto.components.editor.mergeEditor.acceptCombination', 'Accept Combination')
    case 'ignore':
      return translate('auto.components.editor.mergeEditor.ignore', 'Ignore')
  }
}

export function resultLabelText(label: MergeResultLabel, titles: readonly [string, string]) {
  switch (label.kind) {
    case 'manual':
      return translate('auto.components.editor.mergeEditor.manualResolution', 'Manual Resolution')
    case 'none':
      return translate(
        'auto.components.editor.mergeEditor.noChangesAccepted',
        'No Changes Accepted'
      )
    case 'inputs':
      return label.inputs.map((input) => titles[input - 1]).join(' + ')
  }
}

export function resetToBaseLabel(): string {
  return translate('auto.components.editor.mergeEditor.resetToBase', 'Reset to Base')
}

export function unhandledCountLabel(count: number): string {
  if (count === 0) {
    return translate('auto.components.editor.mergeEditor.allHandled', 'All Conflicts Handled')
  }
  return count === 1
    ? translate('auto.components.editor.mergeEditor.oneConflictRemaining', '1 Conflict Remaining')
    : translate(
        'auto.components.editor.mergeEditor.conflictsRemaining',
        '{{value0}} Conflicts Remaining',
        { value0: count }
      )
}

export function unavailableMessage(reason: MergeSessionUnavailableReason): string {
  switch (reason) {
    case 'binary':
      return translate(
        'auto.components.editor.mergeEditor.unavailableBinary',
        'The merge editor does not open binary files. Showing the text editor.'
      )
    case 'too-large':
      return translate(
        'auto.components.editor.mergeEditor.unavailableTooLarge',
        'This conflict is too large for the merge editor. Showing the text editor.'
      )
    case 'missing-side':
      return translate(
        'auto.components.editor.mergeEditor.unavailableMissingSide',
        'One side of this conflict has no file version. Showing the text editor.'
      )
    case 'no-markers':
      return translate(
        'auto.components.editor.mergeEditor.unavailableNoMarkers',
        'No conflict versions or markers to merge. Showing the text editor.'
      )
  }
}
