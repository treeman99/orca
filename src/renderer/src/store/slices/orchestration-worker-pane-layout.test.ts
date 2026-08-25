import { describe, it, expect } from 'vitest'
import type { TabGroupLayoutNode } from '../../../../shared/tab-types'
import {
  buildWorkerStackRatioUpdates,
  resolveOrchestrationWorkerPanePlacement
} from './orchestration-worker-pane-layout'

const leaf = (groupId: string): TabGroupLayoutNode => ({ type: 'leaf', groupId })

function column(coordinatorGroupId: string, workerGroupIds: readonly string[]): TabGroupLayoutNode {
  const stack = workerGroupIds.reduceRight<TabGroupLayoutNode | null>(
    (second, groupId) =>
      second
        ? { type: 'split', direction: 'vertical', first: leaf(groupId), second }
        : leaf(groupId),
    null
  )
  if (!stack) {
    return leaf(coordinatorGroupId)
  }
  return {
    type: 'split',
    direction: 'horizontal',
    first: leaf(coordinatorGroupId),
    second: stack
  }
}

/** Worker panes top-to-bottom; a bare id means one worker, a tuple pins the load. */
function panes(...entries: (string | [string, number])[]) {
  return entries.map((entry) =>
    typeof entry === 'string'
      ? { groupId: entry, workerTabCount: 1 }
      : { groupId: entry[0], workerTabCount: entry[1] }
  )
}

describe('resolveOrchestrationWorkerPanePlacement', () => {
  it('splits the first worker off the coordinator to the right', () => {
    expect(
      resolveOrchestrationWorkerPanePlacement({ coordinatorGroupId: 'g-coord', workerGroups: [] })
    ).toEqual({ kind: 'split', sourceGroupId: 'g-coord', direction: 'right' })
  })

  it('stacks later workers below the newest worker group', () => {
    expect(
      resolveOrchestrationWorkerPanePlacement({
        coordinatorGroupId: 'g-coord',
        workerGroups: panes('g-w1', 'g-w2', 'g-w3')
      })
    ).toEqual({ kind: 'split', sourceGroupId: 'g-w3', direction: 'down' })
  })

  it('stops splitting at the cap and starts refilling from the top pane', () => {
    expect(
      resolveOrchestrationWorkerPanePlacement({
        coordinatorGroupId: 'g-coord',
        workerGroups: panes('g-w1', 'g-w2', 'g-w3', 'g-w4')
      })
    ).toEqual({ kind: 'existing-group', groupId: 'g-w1' })
  })

  it('walks the column top-down instead of piling onto the last pane', () => {
    const fills = ['g-w1', 'g-w2', 'g-w3', 'g-w4'].map((_, index) =>
      resolveOrchestrationWorkerPanePlacement({
        coordinatorGroupId: 'g-coord',
        workerGroups: panes(
          ...(['g-w1', 'g-w2', 'g-w3', 'g-w4'] as const).map((groupId, pane): [string, number] => [
            groupId,
            pane < index ? 2 : 1
          ])
        )
      })
    )
    expect(fills).toEqual(
      ['g-w1', 'g-w2', 'g-w3', 'g-w4'].map((groupId) => ({ kind: 'existing-group', groupId }))
    )
  })

  it('refills the pane whose worker was closed rather than the topmost', () => {
    expect(
      resolveOrchestrationWorkerPanePlacement({
        coordinatorGroupId: 'g-coord',
        workerGroups: panes(['g-w1', 2], ['g-w2', 1], ['g-w3', 2], ['g-w4', 2])
      })
    ).toEqual({ kind: 'existing-group', groupId: 'g-w2' })
  })

  it('honours a caller-supplied cap', () => {
    expect(
      resolveOrchestrationWorkerPanePlacement({
        coordinatorGroupId: 'g-coord',
        workerGroups: panes('g-w1'),
        maxGroups: 1
      })
    ).toEqual({ kind: 'existing-group', groupId: 'g-w1' })
  })
})

describe('buildWorkerStackRatioUpdates', () => {
  it('leaves a single worker column alone', () => {
    expect(buildWorkerStackRatioUpdates(column('g-coord', ['g-w1']), ['g-w1'])).toEqual([])
  })

  it('keeps two workers at half the column each', () => {
    expect(
      buildWorkerStackRatioUpdates(column('g-coord', ['g-w1', 'g-w2']), ['g-w1', 'g-w2'])
    ).toEqual([{ nodePath: 'second', ratio: 0.5 }])
  })

  it('evens out a three-worker column instead of leaving 1/2, 1/4, 1/4', () => {
    expect(
      buildWorkerStackRatioUpdates(column('g-coord', ['g-w1', 'g-w2', 'g-w3']), [
        'g-w1',
        'g-w2',
        'g-w3'
      ])
    ).toEqual([
      { nodePath: 'second', ratio: 1 / 3 },
      { nodePath: 'second.second', ratio: 0.5 }
    ])
  })

  it('evens out a four-worker column at 1/4, 1/3, 1/2', () => {
    expect(
      buildWorkerStackRatioUpdates(column('g-coord', ['g-w1', 'g-w2', 'g-w3', 'g-w4']), [
        'g-w1',
        'g-w2',
        'g-w3',
        'g-w4'
      ])
    ).toEqual([
      { nodePath: 'second', ratio: 0.25 },
      { nodePath: 'second.second', ratio: 1 / 3 },
      { nodePath: 'second.second.second', ratio: 0.5 }
    ])
  })

  it('gives up when the user rearranged the spine', () => {
    const rearranged: TabGroupLayoutNode = {
      type: 'split',
      direction: 'horizontal',
      first: leaf('g-w1'),
      second: leaf('g-coord')
    }
    expect(buildWorkerStackRatioUpdates(rearranged, ['g-w1', 'g-w2'])).toEqual([])
  })
})
