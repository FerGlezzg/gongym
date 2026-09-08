# Built-in food catalogue — source

`frontend/src/lib/foods-data.js` is generated from **USDA FoodData Central**,
*SR Legacy* release (2018-04). It is a work of the U.S. government and is in the
**public domain** — no licence obligation. openGym embeds a curated subset; it does
not relicense or vouch for the values.

- Dataset: <https://fdc.nal.usda.gov/download-datasets.html>
  (`FoodData_Central_sr_legacy_food_json_2018-04.zip`)
- All values are per **100 g / 100 ml**, taken straight from USDA:
  energy (nutrient 1008, kcal), protein (1003), carbohydrate by difference (1005),
  total fat (1004).

## Regenerating

```
node scripts/build-foods.mjs                 # downloads the archive (needs `unzip`)
node scripts/build-foods.mjs path/to/SR.json # use a local copy instead
```

The script keeps only common edible categories, drops brand-name products, collapses
near-duplicate descriptions to the least-qualified variant (raw and cooked kept
separate), and merges the Spanish names below.

## Files here

- `es-names.csv` — `fdcId,"Spanish name"` for the ~100 most-searched USDA foods. Everything
  else shows its English USDA name. Add rows to translate more.
- `exclude.txt` — extra case-insensitive drop patterns, one regex per line.
- `common-foods.csv` — hand-entered everyday foods and dishes (manzana, café solo,
  canelones…), Spanish-first, appended to the catalogue with `og-` ids and floated to the
  top of search. `es | en | category | basis | kcal | p | c | f`, where `basis` is `g`
  (per 100 g) or `serving` (one typical portion). Composite-dish figures are approximate.
