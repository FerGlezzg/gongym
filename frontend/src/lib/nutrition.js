// Nutrition maths for the Diet panel — calorie intake, estimated expenditure and the
// history series behind the Stats → Diet charts. Pure and framework-free, unit-tested in
// nutrition.test.js: every number the Diet screens show is derived here, none of it is
// verifiable by clicking through.

import { LB_TO_KG } from './recovery.js'

// Defaults for S.diet. Consumers overlay the saved value on top (see dietOf) rather than
// the store deep-merging, matching how wcOf handles S.wc.
export const DIET_DEFAULT = Object.freeze({
  kcalGoal: null,          // daily calorie target, or null
  macroGoal: null,         // { p, c, f } grams, or null
  heightCm: null,          // for the BMR estimate
  birthYear: null,
  sex: null,               // 'male' | 'female' | null  (falls back to S.body)
  activity: 1.375,         // 1.2 sedentary · 1.375 light · 1.55 moderate · 1.725 active · 1.9 very active
  workoutKcal: true,       // fold a per-session estimate into the day's expenditure
})

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Sedentary' },
  { value: 1.375, label: 'Light' },
  { value: 1.55, label: 'Moderate' },
  { value: 1.725, label: 'Active' },
  { value: 1.9, label: 'Very active' },
]

// Resistance training MET — ACSM puts vigorous weight training near 6 and general
// conditioning near 3.5; 5 is a deliberately middling estimate for a mixed session.
export const TRAINING_MET = 5

const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack']
export { MEAL_SLOTS }

const num = v => (Number.isFinite(+v) ? +v : 0)

/** S.diet with every missing key filled from DIET_DEFAULT. */
export function dietOf(S) {
  return { ...DIET_DEFAULT, ...((S && S.diet) || {}) }
}

/** Sum every logged item for one ISO day. */
export function dayTotals(nutrition, iso) {
  const out = { kcal: 0, p: 0, c: 0, f: 0 }
  for (const row of nutrition || []) {
    if (!row || row.d !== iso) continue
    out.kcal += num(row.kcal)
    out.p += num(row.p)
    out.c += num(row.c)
    out.f += num(row.f)
  }
  return out
}

/** Whole years between a birth year and now. null when the year is missing/implausible. */
export function ageFrom(birthYear, now = Date.now()) {
  const y = Math.trunc(num(birthYear))
  if (!y) return null
  const age = new Date(now).getFullYear() - y
  return age > 0 && age < 130 ? age : null
}

/**
 * Mifflin-St Jeor basal metabolic rate in kcal/day.
 * @returns {number|null} null when any input is missing.
 */
export function bmrMifflin({ sex, heightCm, weightKg, age }) {
  const cm = num(heightCm), kg = num(weightKg), a = num(age)
  if (!(cm > 0) || !(kg > 0) || !(a > 0)) return null
  const base = 10 * kg + 6.25 * cm - 5 * a
  return Math.round(base + (sex === 'female' ? -161 : 5))
}

/** BMR scaled by the activity factor. */
export function tdee(bmr, activity) {
  if (bmr == null) return null
  const f = num(activity) || DIET_DEFAULT.activity
  return Math.round(bmr * f)
}

/**
 * Rough kcal burned by one logged session: MET × bodyweight (kg) × hours.
 * Returns 0 without a start/end pair or a bodyweight.
 */
export function workoutKcal(workout, bodyweightKg, { met = TRAINING_MET } = {}) {
  const kg = num(bodyweightKg)
  const ms = num(workout?.end) - num(workout?.start)
  if (!(kg > 0) || !(ms > 0)) return 0
  return Math.round(met * kg * (ms / 3600000))
}

/** Latest bodyweight logged on or before `iso`, converted to kg. null when there is none. */
export function bodyweightKgAt(S, iso) {
  const entries = (S?.bodyweight || [])
    .filter(b => b && b.w > 0 && (!iso || String(b.d) <= iso))
    .sort((a, b) => String(a.d).localeCompare(String(b.d)))
  const last = entries.at(-1)
  if (!last) return null
  return S.unit === 'lb' ? last.w * LB_TO_KG : last.w
}

/**
 * Estimated total calories burned on `iso`: profile TDEE plus, when S.diet.workoutKcal is
 * on, an estimate for every session logged that day.
 * @returns {{ total:number|null, tdee:number|null, workout:number }}
 */
export function estimatedExpenditure(S, iso, { now = Date.now() } = {}) {
  const d = dietOf(S)
  const kg = bodyweightKgAt(S, iso)
  const base = tdee(
    bmrMifflin({
      sex: d.sex || S?.body || 'male',
      heightCm: d.heightCm,
      weightKg: kg,
      age: ageFrom(d.birthYear, now),
    }),
    d.activity,
  )
  let workout = 0
  if (d.workoutKcal) {
    for (const w of S?.workouts || []) {
      if (w && w.d === iso) workout += workoutKcal(w, w.bw || kg)
    }
  }
  const total = base == null ? (workout || null) : base + workout
  return { total, tdee: base, workout }
}

// Local-time YYYY-MM-DD, matching lib/format.js isoOf/todayISO — never UTC, so a day
// boundary in the evening does not shift the window.
const isoLocal = dt =>
  dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0')

const isoDaysAgo = (iso, days) => {
  const dt = new Date(iso + 'T00:00:00')
  dt.setDate(dt.getDate() - days)
  return isoLocal(dt)
}

/**
 * One row per day that has intake and/or a workout, oldest first.
 * @returns {Array<{ d, intake, expenditure, balance, goal, macros }>}
 */
export function daySeries(S, { from, to = isoLocal(new Date()), now = Date.now() } = {}) {
  const d = dietOf(S)
  const days = new Set()
  for (const row of S?.nutrition || []) if (row?.d && (!from || row.d >= from) && row.d <= to) days.add(row.d)
  for (const w of S?.workouts || []) if (w?.d && (!from || w.d >= from) && w.d <= to) days.add(w.d)
  return [...days].sort().map(iso => {
    const tot = dayTotals(S.nutrition, iso)
    const exp = estimatedExpenditure(S, iso, { now }).total
    return {
      d: iso,
      intake: Math.round(tot.kcal),
      expenditure: exp,
      balance: exp == null ? null : Math.round(tot.kcal - exp),
      goal: d.kcalGoal,
      macros: { p: Math.round(tot.p), c: Math.round(tot.c), f: Math.round(tot.f) },
    }
  })
}

/**
 * Averages over the last `days` days (default 7), counting only days with intake logged.
 * @returns {{ intake:number|null, expenditure:number|null, balance:number|null,
 *             macros:{p,c,f}, onGoalStreak:number, logged:number }}
 */
export function weekAverages(S, days = 7, { now = Date.now() } = {}) {
  const to = isoLocal(new Date(now))
  const from = isoDaysAgo(to, days - 1)
  const rows = daySeries(S, { from, to, now }).filter(r => r.intake > 0)
  const mean = pick => (rows.length ? Math.round(rows.reduce((s, r) => s + (pick(r) || 0), 0) / rows.length) : null)
  const d = dietOf(S)
  // Consecutive most-recent days at or under the calorie goal.
  let streak = 0
  if (d.kcalGoal) {
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].intake <= d.kcalGoal) streak++
      else break
    }
  }
  return {
    intake: mean(r => r.intake),
    expenditure: rows.some(r => r.expenditure != null) ? mean(r => r.expenditure) : null,
    balance: rows.some(r => r.balance != null) ? mean(r => r.balance) : null,
    macros: { p: mean(r => r.macros.p), c: mean(r => r.macros.c), f: mean(r => r.macros.f) },
    onGoalStreak: streak,
    logged: rows.length,
  }
}

/**
 * Scale a food's reference values into a loggable payload.
 * @param {object} food  kcal/p/c/f on the food's reference amount.
 * @param {number} amount  servings when basis is 'serving', grams when basis is 'g'.
 * @param {'serving'|'g'} [basis]  'g' means the food's values are per 100 g; 'serving'
 *   (default, and the shape user-created foods have) means `amount` is a plain multiplier.
 */
export function scaleFood(food, amount = 1, basis = food?.basis || 'serving') {
  const factor = basis === 'g' ? (num(amount) / 100) : (num(amount) || 1)
  return {
    kcal: Math.round(num(food?.kcal) * factor),
    p: Math.round(num(food?.p) * factor * 10) / 10,
    c: Math.round(num(food?.c) * factor * 10) / 10,
    f: Math.round(num(food?.f) * factor * 10) / 10,
  }
}
