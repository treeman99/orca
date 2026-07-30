import { describe, expect, it } from 'vitest'
import {
  filterAvailableTaskProviders,
  normalizeTaskProviderSettings,
  normalizeVisibleTaskProviders,
  restoreAvailableDefaultTaskProvider,
  resolveVisibleTaskProvider
} from './task-providers'

describe('task providers', () => {
  // This fork offers GitHub only (see TASK_PROVIDERS). The union still names the other three
  // because persisted profiles and telemetry rows written before that narrowed still carry
  // them — so the contract that matters is that they normalize AWAY rather than resurface.
  it('drops providers this fork does not offer, including legacy saved ones', () => {
    expect(normalizeVisibleTaskProviders(['gitlab', 'unknown', 'linear', 'jira'])).toEqual([
      'github'
    ])
  })

  it('keeps the supported provider when it is already saved', () => {
    expect(normalizeVisibleTaskProviders(['github'])).toEqual(['github'])
  })

  it('falls back to the offered providers when none are visible', () => {
    expect(normalizeVisibleTaskProviders([])).toEqual(['github'])
  })

  // A profile from before this fork narrowed: the saved list and default both name providers
  // that are gone. Neither may survive normalization.
  it('repairs a legacy profile back to the offered provider', () => {
    expect(
      normalizeTaskProviderSettings({
        visibleTaskProviders: ['linear'],
        defaultTaskSource: 'github'
      })
    ).toEqual({
      defaultTaskSource: 'github',
      visibleTaskProviders: ['github']
    })
  })

  it('normalizes an invalid saved default to the first visible provider', () => {
    expect(
      normalizeTaskProviderSettings({
        visibleTaskProviders: ['gitlab'],
        defaultTaskSource: 'bitbucket'
      })
    ).toEqual({
      defaultTaskSource: 'github',
      visibleTaskProviders: ['github']
    })
  })

  it('resolves hidden preferred providers to the first visible provider', () => {
    expect(resolveVisibleTaskProvider('github', ['linear'])).toBe('linear')
  })

  it('filters runtime-unavailable providers without changing preference normalization', () => {
    expect(
      filterAvailableTaskProviders(['github', 'gitlab', 'linear'], {
        gitlabInstalled: false,
        linearConnected: true
      })
    ).toEqual(['github', 'linear'])
  })

  it('restores the saved default without readmitting a provider this fork removed', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        ['linear'],
        {
          gitlabInstalled: false,
          linearConnected: true
        },
        'github'
      )
    ).toEqual(['github'])
  })

  it('preserves intentionally narrowed providers when the saved default matches them', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        ['linear'],
        {
          gitlabInstalled: false,
          linearConnected: true
        },
        'linear'
      )
    ).toEqual(['linear'])
  })

  it('does not restore an unavailable saved default', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        ['linear'],
        {
          gitlabInstalled: false,
          linearConnected: true
        },
        'gitlab'
      )
    ).toEqual(['linear'])
  })

  it('ignores invalid saved defaults while restoring visible providers', () => {
    expect(
      restoreAvailableDefaultTaskProvider(
        ['gitlab'],
        {
          gitlabInstalled: false,
          linearConnected: true
        },
        'bitbucket'
      )
    ).toEqual(['github'])
  })

  it('falls back to GitHub when every preferred provider is unavailable', () => {
    expect(
      filterAvailableTaskProviders(['gitlab', 'linear'], {
        gitlabInstalled: false,
        linearConnected: false
      })
    ).toEqual(['github'])
  })
})
