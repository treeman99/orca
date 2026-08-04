// The related-features list exists only to open onorca.dev, so the policy has to
// decide between deleting the list and de-linking it. It de-links: the tiles are
// bundled local demos and the list still says what else the workflow covers.

import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EnterprisePolicyView } from '../../../../shared/enterprise-policy-view'
import { FEATURE_WALL_WORKFLOWS } from '../../../../shared/feature-wall-workflows'

const policyState = vi.hoisted(() => ({ disableVendorLinks: false }))

vi.mock('@/enterprise/enterprise-policy-access', () => ({
  useEnterprisePolicyView: () => policyState as unknown as EnterprisePolicyView
}))

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }))

import { RelatedFeatures } from './FeatureWallPreview'

const workflow = FEATURE_WALL_WORKFLOWS.find((entry) => entry.relatedTileIds.length > 0)

function render(): string {
  if (!workflow) {
    throw new Error('no feature-wall workflow with related tiles')
  }
  return renderToStaticMarkup(<RelatedFeatures workflow={workflow} source="help_menu" />)
}

describe('RelatedFeatures under disableVendorLinks', () => {
  beforeEach(() => {
    policyState.disableVendorLinks = false
  })

  it('links each related tile to the vendor docs by default', () => {
    expect(render()).toContain('<button')
  })

  it('keeps the list but stops it being clickable under the policy', () => {
    policyState.disableVendorLinks = true
    const markup = render()
    expect(markup).not.toContain('<button')
    expect(markup).toContain('Also in this workflow')
    // The tile names are local product copy, not a destination — they stay.
    expect(markup.length).toBeGreaterThan(0)
  })
})
