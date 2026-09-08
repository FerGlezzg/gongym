// Open Food Facts barcode lookup — the only part of the food feature that goes to the
// network. Used when the user scans a packaged product the built-in catalogue does not
// have. OFF's database is under ODbL; openGym does not redistribute it, only queries it
// live and attributes it in the result UI (see NOTICE.md).
//
// Pure but for the injected `fetch`, so the unit test can drive every branch.

import { nativeFetch } from './capacitor-fetch.js'

const API = 'https://world.openfoodfacts.org/api/v2/product/'
const FIELDS = 'code,product_name,brands,nutriments'

const num = v => {
  const n = typeof v === 'string' ? parseFloat(v) : v
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null
}

/**
 * Look a barcode up in Open Food Facts.
 * @param {string} code  EAN/UPC digits.
 * @param {{ fetch?: Function, signal?: AbortSignal }} [opts]
 * @returns {Promise<null | {
 *   code: string, name: string, brand: string,
 *   per100g: { kcal: number|null, p: number|null, c: number|null, f: number|null }
 * }>}  null when the product is unknown or carries no usable energy value.
 */
export async function lookupBarcode(code, { fetch = nativeFetch, signal } = {}) {
  const digits = String(code || '').replace(/\D/g, '')
  if (digits.length < 6) return null
  let body
  try {
    const res = await fetch(`${API}${digits}.json?fields=${FIELDS}`, {
      headers: { Accept: 'application/json' }, signal,
    })
    if (!res.ok) return null
    body = await res.json()
  } catch (e) {
    if (e && e.name === 'AbortError') throw e
    return null
  }
  if (!body || body.status === 0 || !body.product) return null
  const p = body.product
  const n = p.nutriments || {}
  const kcal = num(n['energy-kcal_100g']) ?? (num(n['energy-kj_100g']) != null ? Math.round(num(n['energy-kj_100g']) / 4.184) : null)
  if (kcal == null) return null
  return {
    code: p.code || digits,
    name: (p.product_name || '').trim() || digits,
    brand: (p.brands || '').split(',')[0].trim(),
    per100g: {
      kcal,
      p: num(n.proteins_100g),
      c: num(n.carbohydrates_100g),
      f: num(n.fat_100g),
    },
  }
}
