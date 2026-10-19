import { describe, expect, it } from 'vitest'
import { getRuntimeServerStatusIndicator } from './runtime-server-row-presentation'

describe('runtime server status indicator', () => {
  it('names a revoked host as revoked, not disconnected', () => {
    expect(getRuntimeServerStatusIndicator('disconnected', true)).toEqual({
      label: 'Access revoked',
      labelClassName: 'text-destructive',
      dotClassName: 'bg-destructive'
    })
  })

  it('keeps the connection label otherwise', () => {
    expect(getRuntimeServerStatusIndicator('disconnected', false).label).toBe('Disconnected')
    expect(getRuntimeServerStatusIndicator('connected', false).label).toBe('Connected')
  })
})
