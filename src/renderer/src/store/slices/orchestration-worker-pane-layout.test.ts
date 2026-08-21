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

describe('resolveOrchestrationWorkerPanePlacement', () => {
  it('splits the first worker off the coordinator to the right', () => {
    expect(
      resolveOrchestrationWorkerPanePlacement({ coordinatorGroupId: 'g-coord', workerGroupIds: [] })
    ).toEqual({ kind: 'split', sourceGroupId: 'g-coord', direction: 'right' })
  })

  it('stacks later workers below the newest worker group', () => {
    expect(
      resolveOrchestrationWorkerPanePlacement({
        coordinatorGroupId: 'g-coord',
        workerGroupIds: ['g-w1', 'g-w2']
      })
    ).toEqual({ kind: 'split', sourceGroupId: 'g-w2', direction: 'down' })
  })

  it('stops splitting at the cap and reuses the last worker group as tabs', () => {
    expect(
      resolveOrchestrationWorkerPanePlacement({
        coordinatorGroupId: 'g-coord',
        workerGroupIds: ['g-w1', 'g-w2', 'g-w3']
      })
    ).toEqual({ kind: 'existing-group', groupId: 'g-w3' })
  })

  it('honours a caller-supplied cap', () => {
    expect(
      resolveOrchestrationWorkerPanePlacement({
        coordinatorGroupId: 'g-coord',
        workerGroupIds: ['g-w1'],
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
