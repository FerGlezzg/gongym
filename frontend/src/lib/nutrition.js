// Nutrition maths for the Diet panel — calorie intake, estimated expenditure and the
// history series behind the Stats → Diet charts. Pure and framework-free, unit-tested in
// nutrition.test.js: every number the Diet screens show is derived here, none of it is
// verifiable by clicking through.

import { LB_TO_KG } from './recovery.js'
import { eventKcal } from './events.js'

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

// A saved diet plan is { id, name, kcalGoal, macroGoal } — the same two goal fields S.diet
// itself carries, just named and kept alongside others. S.dietWeekPlan maps a week-of-month
// (1-5, see weekOfMonth) to one of these, so a cut/bulk/refeed rotation can repeat every
// month without re-entering it. A week with nothing assigned falls back to dietOf(S)'s own
// goal — the plan feature is additive, never required.

/** Which "week" of the month `iso` falls in: 1-5, ceil(day-of-month / 7). */
export function weekOfMonth(iso) {
  const day = Number(String(iso).slice(8, 10)) || 1
  return Math.min(5, Math.max(1, Math.ceil(day / 7)))
}

/**
 * The kcal/macro goal that actually applies on `iso`: the diet plan assigned to its
 * week-of-month, if any, else the profile's own default goal.
 * @returns {{ kcalGoal: number|null, macroGoal: {p,c,f}|null }}
 */
export function goalFor(S, iso) {
  const planId = (S?.dietWeekPlan || {})[weekOfMonth(iso)]
  const plan = planId && (S?.dietPlans || []).find(p => p && p.id === planId)
  if (plan) return { kcalGoal: plan.kcalGoal ?? null, macroGoal: plan.macroGoal ?? null }
  const d = dietOf(S)
  return { kcalGoal: d.kcalGoal, macroGoal: d.macroGoal }
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
 * on, an estimate for every session and timed event logged that day. A distance-tagged event
 * (a run, say) already prices its own kcal here — the Home step counter derived from that
 * same distance (lib/events.js eventSteps) is a readout, not a second source to add in.
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
    for (const ev of S?.events || []) {
      if (ev && ev.d === iso) workout += eventKcal(ev, kg)
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
  const days = new Set()
  const inRange = day => day && (!from || day >= from) && day <= to
  for (const row of S?.nutrition || []) if (inRange(row?.d)) days.add(row.d)
  for (const w of S?.workouts || []) if (inRange(w?.d)) days.add(w.d)
  // A day that only has a timed event still has an expenditure worth showing — without this
  // it never entered the set and its burn/balance just never appeared in the history, no
  // matter how sure the estimate was.
  for (const e of S?.events || []) if (inRange(e?.d)) days.add(e.d)
  return [...days].sort().map(iso => {
    const tot = dayTotals(S.nutrition, iso)
    const exp = estimatedExpenditure(S, iso, { now }).total
    return {
      d: iso,
      intake: Math.round(tot.kcal),
      expenditure: exp,
      balance: exp == null ? null : Math.round(tot.kcal - exp),
      goal: goalFor(S, iso).kcalGoal,
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
  // Consecutive most-recent days at or under whatever goal applied that day — its own week's
  // plan if one was assigned (row.goal, from daySeries), the profile default otherwise.
  let streak = 0
  for (let i = rows.length - 1; i >= 0; i--) {
    if (!rows[i].goal) break
    if (rows[i].intake <= rows[i].goal) streak++
    else break
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
 * Short label for how much of a food a logged row represents: "200 g", "2 rebanada (56 g)"
 * or "×2". Rows written before the amount/unit fields only carry `qty`. `fmt` formats the
 * numbers (pass fmtNum from the UI; the default is plain).
 */
export function entryAmountLabel(row, fmt = n => String(Math.round(n * 10) / 10)) {
  if (!row) return ''
  if (row.unit === 'g' && row.amount > 0) return fmt(row.amount) + ' g'
  if (row.unit && row.unit !== 'serving' && row.amount != null) {
    return fmt(row.amount) + ' ' + row.unit + (row.grams ? ' (' + fmt(row.grams) + ' g)' : '')
  }
  const n = row.amount ?? row.qty
  return n && n !== 1 ? '×' + fmt(n) : ''
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
