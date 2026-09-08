import { describe, it, expect, vi } from 'vitest'
import { lookupBarcode } from './off.js'

const ok = body => async () => ({ ok: true, json: async () => body })

describe('lookupBarcode', () => {
  it('maps a full product to per-100 g macros', async () => {
    const fetch = vi.fn(ok({
      status: 1,
      product: {
        code: '3017620422003', product_name: 'Nutella', brands: 'Ferrero, Nutella',
        nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
      },
    }))
    const r = await lookupBarcode('3017620422003', { fetch })
    expect(r).toEqual({
      code: '3017620422003', name: 'Nutella', brand: 'Ferrero',
      per100g: { kcal: 539, p: 6.3, c: 57.5, f: 30.9 },
    })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('derives kcal from kJ when kcal is absent', async () => {
    const r = await lookupBarcode('1234567', { fetch: ok({ status: 1, product: { code: '1234567', nutriments: { 'energy-kj_100g': 418.4 } } }) })
    expect(r.per100g.kcal).toBe(100)
  })

  it('returns null for an unknown product', async () => {
    expect(await lookupBarcode('0000000000000', { fetch: ok({ status: 0 }) })).toBe(null)
  })

  it('returns null when there is no energy value', async () => {
    expect(await lookupBarcode('1234567', { fetch: ok({ status: 1, product: { code: '1', nutriments: {} } }) })).toBe(null)
  })

  it('returns null on a network error but rethrows an abort', async () => {
    expect(await lookupBarcode('1234567', { fetch: async () => { throw new Error('offline') } })).toBe(null)
    await expect(lookupBarcode('1234567', {
      fetch: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }) },
    })).rejects.toThrow()
  })

  it('rejects a too-short code without calling fetch', async () => {
    const fetch = vi.fn()
    expect(await lookupBarcode('12', { fetch })).toBe(null)
    expect(fetch).not.toHaveBeenCalled()
  })
})
