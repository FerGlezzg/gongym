#!/usr/bin/env node
// Regenerates the built-in food catalogue in frontend/src/lib/foods-data.js from
// USDA FoodData Central (SR Legacy). That dataset is a work of the U.S. government
// and is in the public domain — see scripts/food-sources/README.md.
//
//   node scripts/build-foods.mjs [path-to-SR-Legacy.json]
//
// Without an argument the SR Legacy JSON archive is downloaded and unzipped (needs the
// `unzip` CLI). Values are per 100 g / 100 ml, straight from USDA.
//
// Curation is intentionally conservative and reproducible:
//   · only common edible categories (see CAT), niche ones dropped
//   · brand-name products filtered out — this is a generic-food list
//   · near-duplicates collapsed to the shortest description
//   · Spanish names merged in from scripts/food-sources/es-names.csv (fdc_id,es)
//   · extra drop patterns from scripts/food-sources/exclude.txt

import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ZIP_URL = 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_json_2018-04.zip'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'scripts', 'food-sources')
const outFile = join(root, 'frontend', 'src', 'lib', 'foods-data.js')

// USDA foodCategory.description → our slug. Anything not listed here is dropped.
const CAT = {
  'Beef Products': 'protein',
  'Poultry Products': 'protein',
  'Pork Products': 'protein',
  'Lamb, Veal, and Game Products': 'protein',
  'Finfish and Shellfish Products': 'protein',
  'Sausages and Luncheon Meats': 'protein',
  'Dairy and Egg Products': 'dairy',
  'Vegetables and Vegetable Products': 'vegetable',
  'Fruits and Fruit Juices': 'fruit',
  'Legumes and Legume Products': 'legume',
  'Nut and Seed Products': 'nuts',
  'Cereal Grains and Pasta': 'grain',
  'Breakfast Cereals': 'grain',
  'Baked Products': 'grain',
  'Fats and Oils': 'fat',
  'Beverages': 'beverage',
  'Sweets': 'sweet',
  'Snacks': 'snack',
  'Soups, Sauces, and Gravies': 'condiment',
  'Spices and Herbs': 'condiment',
  'Meals, Entrees, and Side Dishes': 'prepared',
  'Fast Foods': 'prepared',
}
export const CATEGORIES = [...new Set(Object.values(CAT))]

// Brand and trade names — SR Legacy carries a handful of branded items mixed in with the
// generic foods. A food logger wants "Bread, whole-wheat", not "George Weston Bakeries…".
const BRAND = new RegExp('\\b(' + [
  'inc', 'llc', 'company', 'foods?', 'bakeries', 'brand', 'kraft', 'pillsbury', 'general mills',
  'kellogg', 'post', 'quaker', 'nestle', 'nestl', 'campbell', 'goya', 'heinz', 'hormel', 'tyson',
  'oscar mayer', 'betty crocker', 'hungry jack', 'marie callender', 'stouffer', 'lean cuisine',
  'healthy choice', 'banquet', 'swanson', 'del monte', 'libby', 'mcdonald', 'burger king', 'kfc',
  'taco bell', 'wendy', 'denny', 'domino', 'pizza hut', 'subway', 'starbucks', 'george weston',
  'entenmann', 'little debbie', 'hostess', 'sara lee', 'dole', 'ocean spray', 'tropicana',
  'minute maid', 'gatorade', 'powerade', 'red bull', 'gamesa', 'la moderna', 'bimbo',
  'malt-o-meal', 'nature valley', 'clif', 'cytosport', 'vitasoy', 'nasoya', 'archway', 'keebler',
  'nabisco', 'frito', 'lay', 'act ii', 'orville', 'jimmy dean', 'eggo', "kellogg's",
].join('|') + ')\\b', 'i')

const readLines = f => existsSync(f)
  ? readFileSync(f, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  : []

// --- load the SR Legacy JSON -------------------------------------------------
let jsonPath = process.argv[2]
let cleanup = null
if (!jsonPath) {
  console.log('Downloading USDA SR Legacy dataset…')
  const res = await fetch(ZIP_URL)
  if (!res.ok) throw new Error('Download failed: HTTP ' + res.status)
  const dir = mkdtempSync(join(tmpdir(), 'usda-'))
  cleanup = dir
  const zip = join(dir, 'sr.zip')
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()))
  const name = execFileSync('unzip', ['-Z1', zip]).toString().trim().split('\n')[0]
  execFileSync('unzip', ['-o', zip, '-d', dir])
  jsonPath = join(dir, name)
}
const foods = JSON.parse(readFileSync(jsonPath, 'utf8')).SRLegacyFoods
if (cleanup) rmSync(cleanup, { recursive: true, force: true })

// --- curate ----------------------------------------------------------------
const exclude = readLines(join(srcDir, 'exclude.txt')).map(p => new RegExp(p, 'i'))
const esNames = new Map()
for (const line of readLines(join(srcDir, 'es-names.csv'))) {
  const i = line.indexOf(',')
  if (i > 0) esNames.set(line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^"|"$/g, ''))
}

const amount = (f, id) => {
  const n = (f.foodNutrients || []).find(x => x.nutrient && x.nutrient.id === id)
  return n && Number.isFinite(n.amount) ? n.amount : null
}

// Household measures — USDA `foodPortions`, so a per-100 g food can also be logged as
// "2 rebanadas" or "1 taza". Imperial-only and junk modifiers are dropped; the rest are
// translated to a short Spanish label.
const PORTION_ES = {
  cup: 'taza', slice: 'rebanada', tbsp: 'cucharada', tablespoon: 'cucharada',
  tsp: 'cucharadita', teaspoon: 'cucharadita', piece: 'pieza', pieces: 'pieza',
  item: 'unidad', unit: 'unidad', medium: 'unidad mediana', large: 'unidad grande',
  small: 'unidad pequeña', fillet: 'filete', steak: 'filete', chop: 'chuleta',
  roast: 'ración', scoop: 'bola', cookie: 'galleta', bar: 'barrita', can: 'lata',
  jar: 'bote', bottle: 'botella', package: 'envase', packet: 'sobre', container: 'envase',
  sandwich: 'bocadillo', pizza: 'porción', patty: 'hamburguesa', link: 'salchicha',
  wedge: 'cuña', clove: 'diente', leaf: 'hoja', tortilla: 'tortilla', muffin: 'magdalena',
  serving: 'ración', fruit: 'pieza', roll: 'panecillo', slices: 'rebanada', slice: 'rebanada',
  cracker: 'galleta salada', head: 'unidad', pepper: 'unidad', spear: 'tallo', stalk: 'tallo',
  ear: 'mazorca', floret: 'ramillete', bun: 'pan', biscuit: 'bollo', waffle: 'gofre',
  pancake: 'tortita', drumstick: 'muslo', breast: 'pechuga', thigh: 'muslo', wing: 'ala',
  cube: 'taco', ball: 'bola', bowl: 'bol', glass: 'vaso', bottle: 'botella', pouch: 'sobre',
}
function portionLabel(modifier) {
  const raw = String(modifier || '').toLowerCase().trim()
  if (!raw || /yield|nlea|gerber|heinz|refuse|guideline|ready-to|approx|prepared from/i.test(raw)) return null
  let m = raw.replace(/\s*\(.*$/, '').trim()                                   // "(8 fl oz)" → ""
    .replace(/,\s*(chopped|sliced|slices?|diced|shredded|cubes?|cubed|mashed|halves|halved|pieces?).*$/i, '')
    .replace(/^(cup|slice)\s+\w+$/i, '$1')
  if (/\b(oz|lb|fl|quart|pint|gallon|ml|liter|litre|inch|cubic|kg|mg|drink box|guideline)\b/.test(m)) return null
  // A known translation, or a single clean word we can show as-is.
  return PORTION_ES[m] || (/^[a-z]{3,12}$/.test(m) ? m : null)
}
// Some categories are never logged by the piece — skip the noise there.
const NO_PORTIONS = new Set(['fat', 'condiment'])
function portionsOf(f, cat) {
  if (NO_PORTIONS.has(cat)) return []
  const seen = new Set()
  return (f.foodPortions || [])
    .slice()
    .sort((a, b) => (a.sequenceNumber || 99) - (b.sequenceNumber || 99))
    .map(p => ({ label: portionLabel(p.modifier), g: Math.round(p.gramWeight) }))
    .filter(p => p.label && p.g >= 1 && p.g <= 1500 && !seen.has(p.label) && seen.add(p.label))
    .slice(0, 2)
}

let rows = []
for (const f of foods) {
  const cat = CAT[f.foodCategory && f.foodCategory.description]
  if (!cat) continue
  const kcal = amount(f, 1008)          // Energy, kcal
  if (kcal == null) continue
  const desc = String(f.description || '').replace(/\s+/g, ' ').trim()
  if (!desc) continue
  if ((desc.match(/,/g) || []).length > 6 || desc.length > 78) continue   // unusably verbose
  if (BRAND.test(desc)) continue
  if (/\bUPC\b|\bGTIN\b/i.test(desc)) continue
  if (exclude.some(re => re.test(desc))) continue
  rows.push({
    id: 'usda-' + f.fdcId,
    fdcId: String(f.fdcId),
    en: desc,
    cat,
    kcal: Math.round(kcal),
    p: Math.round((amount(f, 1003) || 0) * 10) / 10,   // Protein
    c: Math.round((amount(f, 1005) || 0) * 10) / 10,   // Carbohydrate, by difference
    f: Math.round((amount(f, 1004) || 0) * 10) / 10,   // Total lipid (fat)
    portions: portionsOf(f, cat),
  })
}

// Collapse near-duplicates: same first three words AND same cooking state → keep the most
// generic entry (fewest comma-separated qualifiers, then shortest text). Raw and cooked stay
// separate on purpose: for rice, pasta, beans etc. the difference is the whole point.
const stateOf = d => /\braw\b|\bdried\b|\bdry\b/i.test(d) ? 'raw'
  : /\bcooked\b|\bboiled\b|\broasted\b|\bsteamed\b|\bbaked\b|\bbraised\b|\bgrilled\b/i.test(d) ? 'cooked' : ''
const groupKey = d =>
  d.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 3).join(' ') + '|' + stateOf(d)
const commas = d => (d.match(/,/g) || []).length
const best = new Map()
for (const r of rows) {
  const k = groupKey(r.en)
  const cur = best.get(k)
  if (!cur || commas(r.en) < commas(cur.en) || (commas(r.en) === commas(cur.en) && r.en.length < cur.en.length)) {
    best.set(k, r)
  }
}

const out = [...best.values()]
  .map(r => {
    const es = esNames.get(r.fdcId)
    const o = { id: r.id, en: r.en, cat: r.cat, kcal: r.kcal, p: r.p, c: r.c, f: r.f }
    if (es) o.es = es
    if (r.portions && r.portions.length) o.portions = r.portions
    return o
  })
  .sort((a, b) => a.cat.localeCompare(b.cat) || a.en.localeCompare(b.en))

// --- curated everyday foods & dishes (scripts/food-sources/common-foods.csv) ---
// es | en | category | basis | kcal | p | c | f. `basis` is 'g' (per 100 g) or 'serving'
// (one typical portion). id prefix 'og-' marks them as openGym-curated, and lib/foods.js
// floats them above the USDA rows in search.
const slug = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const seenOg = new Set(out.map(o => o.id))
for (const line of readLines(join(srcDir, 'common-foods.csv'))) {
  const [es, en, cat, basis, kcal, p, c, f] = line.split('|').map(s => s.trim())
  if (!es || !en) continue
  const id = 'og-' + slug(en)
  if (seenOg.has(id)) continue
  seenOg.add(id)
  out.push({
    id, en, es, cat,
    kcal: Math.round(+kcal), p: Math.round((+p || 0) * 10) / 10, c: Math.round((+c || 0) * 10) / 10, f: Math.round((+f || 0) * 10) / 10,
    ...(basis === 'serving' ? { basis: 'serving' } : {}),
  })
}
out.sort((a, b) => a.cat.localeCompare(b.cat) || (a.es || a.en).localeCompare(b.es || b.en))

// --- validate ------------------------------------------------------------
const ids = new Set()
for (const o of out) {
  if (ids.has(o.id)) throw new Error('duplicate id ' + o.id)
  ids.add(o.id)
  for (const k of ['kcal', 'p', 'c', 'f']) {
    if (!Number.isFinite(o[k]) || o[k] < 0) throw new Error(`bad ${k} for ${o.en}`)
  }
  if (!CATEGORIES.includes(o.cat)) throw new Error('unknown cat ' + o.cat)
}
if (out.length < 1000) throw new Error('only ' + out.length + ' foods — expected 1000+')

writeFileSync(outFile,
  '// generated by scripts/build-foods.mjs — do not edit\n' +
  '// USDA FoodData Central (SR Legacy), public domain. Values per 100 g / 100 ml.\n' +
  'export default ' + JSON.stringify(out) + '\n')

const byCat = {}
for (const o of out) byCat[o.cat] = (byCat[o.cat] || 0) + 1
console.log(`${outFile}: ${out.length} foods (${esNames.size} with ES names)`)
console.log(Object.entries(byCat).map(([k, v]) => `  ${k}: ${v}`).join('\n'))
