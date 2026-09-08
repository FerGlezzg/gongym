import { describe, it, expect } from 'vitest'
import { foodName, searchFoods, FOOD_CATEGORIES, CATEGORY_LABEL } from './foods.js'
import FOODS from './foods-data.js'

const sample = [
  { id: 'usda-1', en: 'Rice, white, cooked', es: 'Arroz blanco, cocido', cat: 'grain', kcal: 130, p: 2.7, c: 28, f: 0.3 },
  { id: 'usda-2', en: 'Chicken breast, raw', es: 'Pechuga de pollo, cruda', cat: 'protein', kcal: 120, p: 22, c: 0, f: 3 },
  { id: 'usda-3', en: 'Almonds', cat: 'nuts', kcal: 579, p: 21, c: 22, f: 50 },
]

describe('foodName', () => {
  it('prefers the Spanish name in es', () => {
    expect(foodName(sample[0], 'es')).toBe('Arroz blanco, cocido')
  })
  it('falls back to English when there is no es name', () => {
    expect(foodName(sample[2], 'es')).toBe('Almonds')
    expect(foodName(sample[0], 'en')).toBe('Rice, white, cooked')
  })
  it('is empty for nothing', () => {
    expect(foodName(null, 'en')).toBe('')
  })
})

describe('searchFoods', () => {
  it('matches every term, accent-insensitive', () => {
    expect(searchFoods(sample, 'pollo', { lang: 'es' }).map(f => f.id)).toEqual(['usda-2'])
    expect(searchFoods(sample, 'pechuga pollo', { lang: 'es' }).map(f => f.id)).toEqual(['usda-2'])
  })
  it('searches both languages regardless of active lang', () => {
    expect(searchFoods(sample, 'chicken', { lang: 'es' }).map(f => f.id)).toEqual(['usda-2'])
  })
  it('ranks a display-name prefix first', () => {
    const list = [
      { id: 'a', en: 'Brown rice' },
      { id: 'b', en: 'Rice, white' },
    ]
    expect(searchFoods(list, 'rice').map(f => f.id)).toEqual(['b', 'a'])
  })
  it('returns the head of the list for an empty query', () => {
    expect(searchFoods(sample, '  ').length).toBe(3)
  })
})

describe('foods-data.js', () => {
  it('is a non-trivial array', () => {
    expect(Array.isArray(FOODS)).toBe(true)
    expect(FOODS.length).toBeGreaterThan(1000)
  })
  it('every row is well formed', () => {
    const ids = new Set()
    for (const f of FOODS) {
      expect(typeof f.en).toBe('string')
      expect(f.en.length).toBeGreaterThan(0)
      expect(FOOD_CATEGORIES).toContain(f.cat)
      for (const k of ['kcal', 'p', 'c', 'f']) {
        expect(Number.isFinite(f[k]), `${k} of ${f.en}`).toBe(true)
        expect(f[k]).toBeGreaterThanOrEqual(0)
      }
      expect(ids.has(f.id)).toBe(false)
      ids.add(f.id)
      if (f.portions != null) {
        expect(Array.isArray(f.portions)).toBe(true)
        for (const p of f.portions) {
          expect(typeof p.label).toBe('string')
          expect(p.label.length).toBeGreaterThan(0)
          expect(Number.isFinite(p.g) && p.g > 0).toBe(true)
        }
      }
    }
  })
  it('gives common per-100 g foods household portions', () => {
    const withPortions = FOODS.filter(f => f.portions && f.portions.length)
    expect(withPortions.length).toBeGreaterThan(500)
    // taza / rebanada / filete are the workhorses
    expect(FOODS.some(f => (f.portions || []).some(p => p.label === 'taza'))).toBe(true)
  })
  it('has Spanish names on a core set', () => {
    expect(FOODS.filter(f => f.es).length).toBeGreaterThan(50)
  })
  it('includes the curated everyday foods, all with a Spanish name', () => {
    const og = FOODS.filter(f => f.id.startsWith('og-'))
    expect(og.length).toBeGreaterThan(80)
    for (const f of og) {
      expect(f.es, f.id).toBeTruthy()
      if (f.basis != null) expect(f.basis).toBe('serving')
    }
    expect(og.some(f => f.es === 'Café solo')).toBe(true)
    expect(og.some(f => f.es === 'Canelones')).toBe(true)
  })
  it('floats curated foods above USDA rows in search', () => {
    const list = [
      { id: 'usda-1', en: 'Apples, raw, with skin', cat: 'fruit', kcal: 52 },
      { id: 'og-apple', en: 'Apple', es: 'Manzana', cat: 'fruit', kcal: 95, basis: 'serving' },
    ]
    expect(searchFoods(list, 'manzana', { lang: 'es' })[0].id).toBe('og-apple')
  })
  it('CATEGORY_LABEL covers every category present', () => {
    for (const f of FOODS) expect(CATEGORY_LABEL[f.cat]).toBeTruthy()
  })
})
