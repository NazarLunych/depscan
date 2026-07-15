import { describe, expect, it } from 'vitest'

import { getClientId, isRateLimited } from '@/lib/rateLimiter'

describe('isRateLimited', () => {
  it('allows requests under the limit', () => {
    const clientId = `client-${crypto.randomUUID()}`

    for (let i = 0; i < 10; i++) {
      expect(isRateLimited(clientId)).toBe(false)
    }
  })

  it('blocks requests once the limit is exceeded', () => {
    const clientId = `client-${crypto.randomUUID()}`

    for (let i = 0; i < 10; i++) {
      isRateLimited(clientId)
    }

    expect(isRateLimited(clientId)).toBe(true)
  })

  it('tracks separate clients independently', () => {
    const clientA = `client-${crypto.randomUUID()}`
    const clientB = `client-${crypto.randomUUID()}`

    for (let i = 0; i < 10; i++) {
      isRateLimited(clientA)
    }

    expect(isRateLimited(clientA)).toBe(true)
    expect(isRateLimited(clientB)).toBe(false)
  })

  it('allows requests again once the window has passed', () => {
    const clientId = `client-${crypto.randomUUID()}`
    const start = Date.now()

    for (let i = 0; i < 10; i++) {
      isRateLimited(clientId, start)
    }

    expect(isRateLimited(clientId, start)).toBe(true)
    expect(isRateLimited(clientId, start + 60 * 60 * 1000 + 1)).toBe(false)
  })
})

describe('getClientId', () => {
  it('reads the first address from x-forwarded-for', () => {
    const request = new Request('http://localhost/api/analyze', {
      headers: { 'x-forwarded-for': '203.0.113.1, 70.41.3.18' },
    })

    expect(getClientId(request)).toBe('203.0.113.1')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const request = new Request('http://localhost/api/analyze', {
      headers: { 'x-real-ip': '203.0.113.2' },
    })

    expect(getClientId(request)).toBe('203.0.113.2')
  })

  it('falls back to "unknown" when no client headers are present', () => {
    const request = new Request('http://localhost/api/analyze')

    expect(getClientId(request)).toBe('unknown')
  })
})
