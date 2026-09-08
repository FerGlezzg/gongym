// The built-in food catalogue (frontend/src/lib/foods-data.js, generated from USDA
// FoodData Central — see scripts/build-foods.mjs). It is only needed when the food search
// is open, so it ships as its own lazy chunk, loaded on demand like the locale packs.
//
// Values in the data are per 100 g / 100 ml. Names are English (USDA) with a Spanish name
// on the ~100 most-searched foods; foodName() picks by the active language.

import { getLang } from './i18n.js'

const pack = import.meta.glob('./foods-data.js')
let _foods = null
let _loading = null

/** The catalogue if it has already loaded, else null (render a spinner and call loadFoods). */
export function foodsReady() { return _foods }

/** Load the catalogue once; concurrent callers share the same promise. */
export async function loadFoods() {
  if (_foods) return _foods
  if (!_loading) _loading = pack['./foods-data.js']().then(m => { _foods = m.default || []; return _foods })
  return _loading
}

/** Display name for a food in `lang` (defaults to the active language). */
export function foodName(food, lang = getLang()) {
  if (!food) return ''
  return (lang === 'es' && food.es) || food.en || food.name || ''
}

// Category slug → English label (run through t() in the UI).
export const CATEGORY_LABEL = {
  protein: 'Protein', dairy: 'Dairy', grain: 'Grains', legume: 'Legumes',
  vegetable: 'Vegetables', fruit: 'Fruit', fat: 'Fats', nuts: 'Nuts',
  beverage: 'Beverages', prepared: 'Prepared', sweet: 'Sweets',
  condiment: 'Condiments', snack: 'Snacks',
}
export const FOOD_CATEGORIES = Object.keys(CATEGORY_LABEL)

const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/**
 * Filter and rank a food list by a free-text query. Every whitespace-separated term must
 * appear (accent-insensitive) in the name; a prefix hit on the display name ranks first,
 * then shorter names.
 */
// og- ids are the hand-curated everyday foods and dishes; float them above the USDA rows.
const curated = food => (food && typeof food.id === 'string' && food.id.startsWith('og-')) ? 0 : 1

export function searchFoods(list, q, { lang, limit = 80 } = {}) {
  const terms = norm(q).split(/\s+/).filter(Boolean)
  if (!terms.length) return [...(list || [])].sort((a, b) => curated(a) - curated(b)).slice(0, limit)
  const scored = []
  for (const food of list || []) {
    const name = norm(foodName(food, lang))
    const hay = name + ' ' + norm(food.en) + ' ' + norm(food.es)
    if (terms.every(t => hay.includes(t))) scored.push([food, name.startsWith(terms[0]) ? 0 : 1, curated(food), name.length])
  }
  scored.sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[3] - b[3])
  return scored.slice(0, limit).map(s => s[0])
}
