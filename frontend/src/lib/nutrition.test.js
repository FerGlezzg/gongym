import { describe, it, expect } from 'vitest'
import {
  dietOf, dayTotals, ageFrom, bmrMifflin, tdee, workoutKcal, stepsKcal, bodyweightKgAt,
  estimatedExpenditure, daySeries, weekAverages, scaleFood, entryAmountLabel, DIET_DEFAULT,
} from './nutrition.js'

const HOUR = 3600000

describe('dietOf', () => {
  it('fills missing keys from the default', () => {
    expect(dietOf({})).toEqual(DIET_DEFAULT)
    expect(dietOf({ diet: { kcalGoal: 2000 } }).kcalGoal).toBe(2000)
    expect(dietOf({ diet: { kcalGoal: 2000 } }).activity).toBe(DIET_DEFAULT.activity)
  })
})

describe('dayTotals', () => {
  const log = [
    { d: '2026-01-01', kcal: 500, p: 30, c: 50, f: 15 },
    { d: '2026-01-01', kcal: 300, p: 10, c: 40, f: 8 },
    { d: '2026-01-02', kcal: 700, p: 40, c: 60, f: 20 },
  ]
  it('sums every row for the day', () => {
    expect(dayTotals(log, '2026-01-01')).toEqual({ kcal: 800, p: 40, c: 90, f: 23 })
  })
  it('is all zeros for a day with nothing / missing data', () => {
    expect(dayTotals(log, '2026-01-09')).toEqual({ kcal: 0, p: 0, c: 0, f: 0 })
    expect(dayTotals(null, '2026-01-01')).toEqual({ kcal: 0, p: 0, c: 0, f: 0 })
  })
})

describe('ageFrom', () => {
  const now = new Date('2026-06-01').getTime()
  it('is the whole-year difference', () => {
    expect(ageFrom(1996, now)).toBe(30)
  })
  it('rejects a missing or absurd year', () => {
    expect(ageFrom(null, now)).toBe(null)
    expect(ageFrom(0, now)).toBe(null)
    expect(ageFrom(1850, now)).toBe(null)
  })
})

describe('bmrMifflin', () => {
  it('matches the formula by hand for a man', () => {
    // 10·80 + 6.25·180 − 5·30 + 5 = 800 + 1125 − 150 + 5 = 1780
    expect(bmrMifflin({ sex: 'male', heightCm: 180, weightKg: 80, age: 30 })).toBe(1780)
  })
  it('applies the −161 offset for a woman', () => {
    // 10·60 + 6.25·165 − 5·28 − 161 = 600 + 1031.25 − 140 − 161 = 1330.25 → 1330
    expect(bmrMifflin({ sex: 'female', heightCm: 165, weightKg: 60, age: 28 })).toBe(1330)
  })
  it('is null when any input is missing', () => {
    expect(bmrMifflin({ sex: 'male', heightCm: 180, weightKg: 80 })).toBe(null)
    expect(bmrMifflin({ sex: 'male', heightCm: 0, weightKg: 80, age: 30 })).toBe(null)
  })
})

describe('tdee', () => {
  it('scales by the activity factor', () => {
    expect(tdee(1780, 1.375)).toBe(2448)
    expect(tdee(1780, 1.2)).toBe(2136)
  })
  it('falls back to the default factor for a bad one', () => {
    expect(tdee(1000, 0)).toBe(Math.round(1000 * DIET_DEFAULT.activity))
  })
  it('passes null through', () => {
    expect(tdee(null, 1.5)).toBe(null)
  })
})

describe('workoutKcal', () => {
  it('is MET · kg · hours', () => {
    // 5 · 80 · 1.5 = 600
    expect(workoutKcal({ start: 0, end: 1.5 * HOUR }, 80)).toBe(600)
  })
  it('honours a custom MET', () => {
    expect(workoutKcal({ start: 0, end: HOUR }, 80, { met: 6 })).toBe(480)
  })
  it('is 0 without a duration or a bodyweight', () => {
    expect(workoutKcal({ start: 0 }, 80)).toBe(0)
    expect(workoutKcal({ start: 0, end: HOUR }, 0)).toBe(0)
    expect(workoutKcal({ start: HOUR, end: 0 }, 80)).toBe(0)
  })
})

describe('stepsKcal', () => {
  it('is steps · 0.0005 · kg', () => {
    // 10000 · 0.0005 · 70 = 350
    expect(stepsKcal(10000, 70)).toBe(350)
  })
  it('is 0 without a step count or a bodyweight', () => {
    expect(stepsKcal(0, 70)).toBe(0)
    expect(stepsKcal(10000, 0)).toBe(0)
    expect(stepsKcal(null, 70)).toBe(0)
  })
})

describe('bodyweightKgAt', () => {
  const S = {
    unit: 'kg',
    bodyweight: [
      { d: '2026-01-01', w: 80 },
      { d: '2026-01-10', w: 79 },
      { d: '2026-01-20', w: 78 },
    ],
  }
  it('takes the latest weigh-in on or before the date', () => {
    expect(bodyweightKgAt(S, '2026-01-15')).toBe(79)
    expect(bodyweightKgAt(S, '2026-01-20')).toBe(78)
  })
  it('converts from lb', () => {
    expect(bodyweightKgAt({ ...S, unit: 'lb' }, '2026-01-01')).toBeCloseTo(80 * 0.45359237, 5)
  })
  it('is null with no history', () => {
    expect(bodyweightKgAt({ unit: 'kg', bodyweight: [] }, '2026-01-01')).toBe(null)
  })
})

describe('estimatedExpenditure', () => {
  const now = new Date('2026-02-01').getTime()
  const base = {
    unit: 'kg', body: 'male',
    bodyweight: [{ d: '2026-01-01', w: 80 }],
    diet: { heightCm: 180, birthYear: 1996, sex: 'male', activity: 1.375, workoutKcal: true },
    workouts: [{ d: '2026-01-15', start: 0, end: HOUR, bw: 80 }],
    nutrition: [],
  }
  it('is TDEE plus the day\'s workout estimate', () => {
    // age 30 → bmr 1780 → tdee 2448 ; workout 5·80·1 = 400
    const r = estimatedExpenditure(base, '2026-01-15', { now })
    expect(r.tdee).toBe(2448)
    expect(r.workout).toBe(400)
    expect(r.total).toBe(2848)
  })
  it('drops the workout term when workoutKcal is off', () => {
    const r = estimatedExpenditure({ ...base, diet: { ...base.diet, workoutKcal: false } }, '2026-01-15', { now })
    expect(r.total).toBe(2448)
  })
  it('still returns the workout estimate when the profile is incomplete', () => {
    const r = estimatedExpenditure({ ...base, diet: { workoutKcal: true } }, '2026-01-15', { now })
    expect(r.tdee).toBe(null)
    expect(r.total).toBe(400)
  })
  it('is null when there is nothing to go on', () => {
    expect(estimatedExpenditure({ diet: {}, workouts: [], nutrition: [] }, '2026-01-15', { now }).total).toBe(null)
  })
  it('folds a timed event into the day (under the same workoutKcal toggle)', () => {
    const withEvent = { ...base, events: [{ d: '2026-01-20', start: '10:00', end: '12:00', met: 5 }] }
    // 5 MET · 80 kg · 2 h = 800, on top of the TDEE 2448
    expect(estimatedExpenditure(withEvent, '2026-01-20', { now }).total).toBe(2448 + 800)
    expect(estimatedExpenditure({ ...withEvent, diet: { ...base.diet, workoutKcal: false } }, '2026-01-20', { now }).total).toBe(2448)
  })
  it('folds a day\'s step count into the day (under the same toggle)', () => {
    const withSteps = { ...base, steps: [{ d: '2026-01-20', n: 10000 }] }
    // 10000 · 0.0005 · 80 kg = 400, on top of the TDEE 2448
    expect(estimatedExpenditure(withSteps, '2026-01-20', { now }).total).toBe(2448 + 400)
    expect(estimatedExpenditure({ ...withSteps, diet: { ...base.diet, workoutKcal: false } }, '2026-01-20', { now }).total).toBe(2448)
  })
})

describe('daySeries', () => {
  const now = new Date('2026-02-01').getTime()
  const S = {
    unit: 'kg', body: 'male',
    bodyweight: [{ d: '2026-01-01', w: 80 }],
    diet: { heightCm: 180, birthYear: 1996, activity: 1.375, workoutKcal: true, kcalGoal: 2000 },
    workouts: [{ d: '2026-01-15', start: 0, end: HOUR, bw: 80 }],
    nutrition: [
      { d: '2026-01-10', kcal: 1800, p: 120, c: 180, f: 60 },
      { d: '2026-01-10', kcal: 200, p: 10, c: 20, f: 5 },
      { d: '2026-01-12', kcal: 2200, p: 150, c: 200, f: 70 },
    ],
  }
  it('has a row per day with intake or a workout, oldest first', () => {
    const rows = daySeries(S, { now })
    expect(rows.map(r => r.d)).toEqual(['2026-01-10', '2026-01-12', '2026-01-15'])
    expect(rows[0].intake).toBe(2000)
    expect(rows[0].balance).toBe(rows[0].intake - rows[0].expenditure)
    expect(rows[0].goal).toBe(2000)
    expect(rows[2].intake).toBe(0)   // workout-only day
  })
  it('honours the from/to window', () => {
    const rows = daySeries(S, { from: '2026-01-11', to: '2026-01-13', now })
    expect(rows.map(r => r.d)).toEqual(['2026-01-12'])
  })
  it('also rows a day whose only entry is a timed event or a step count', () => {
    const withBoth = { ...S,
      events: [{ d: '2026-01-05', start: '10:00', end: '11:00', met: 5 }],
      steps: [{ d: '2026-01-18', n: 8000 }],
    }
    const rows = daySeries(withBoth, { now })
    expect(rows.map(r => r.d)).toEqual(['2026-01-05', '2026-01-10', '2026-01-12', '2026-01-15', '2026-01-18'])
    expect(rows[0].intake).toBe(0)
    expect(rows[0].expenditure).toBeGreaterThan(0)
  })
})

describe('weekAverages', () => {
  const now = new Date('2026-01-16T12:00:00').getTime()
  const S = {
    unit: 'kg', body: 'male',
    bodyweight: [{ d: '2026-01-01', w: 80 }],
    diet: { heightCm: 180, birthYear: 1996, activity: 1.375, workoutKcal: false, kcalGoal: 2000 },
    workouts: [],
    nutrition: [
      { d: '2026-01-14', kcal: 1900 },
      { d: '2026-01-15', kcal: 1800 },
      { d: '2026-01-16', kcal: 2100 },
    ],
  }
  it('averages only days with intake', () => {
    const a = weekAverages(S, 7, { now })
    expect(a.logged).toBe(3)
    expect(a.intake).toBe(Math.round((1900 + 1800 + 2100) / 3))
  })
  it('counts the on-goal streak back from today', () => {
    // today 2100 > 2000 → streak breaks immediately
    expect(weekAverages(S, 7, { now }).onGoalStreak).toBe(0)
    const under = { ...S, nutrition: [{ d: '2026-01-15', kcal: 1800 }, { d: '2026-01-16', kcal: 1950 }] }
    expect(weekAverages(under, 7, { now }).onGoalStreak).toBe(2)
  })
  it('is null averages with no data', () => {
    expect(weekAverages({ diet: {}, nutrition: [], workouts: [] }, 7, { now }).intake).toBe(null)
  })
})

describe('entryAmountLabel', () => {
  it('shows grams, portions and multipliers', () => {
    expect(entryAmountLabel({ unit: 'g', amount: 200 })).toBe('200 g')
    expect(entryAmountLabel({ unit: 'rebanada', amount: 2, grams: 56 })).toBe('2 rebanada (56 g)')
    expect(entryAmountLabel({ unit: 'serving', amount: 2 })).toBe('×2')
  })
  it('hides a single serving and reads legacy qty rows', () => {
    expect(entryAmountLabel({ unit: 'serving', amount: 1 })).toBe('')
    expect(entryAmountLabel({ qty: 3 })).toBe('×3')
    expect(entryAmountLabel(null)).toBe('')
  })
})

describe('scaleFood', () => {
  it('multiplies per-serving values', () => {
    expect(scaleFood({ kcal: 100, p: 5, c: 10, f: 2 }, 2)).toEqual({ kcal: 200, p: 10, c: 20, f: 4 })
  })
  it('defaults to one serving', () => {
    expect(scaleFood({ kcal: 100, p: 5, c: 10, f: 2 })).toEqual({ kcal: 100, p: 5, c: 10, f: 2 })
  })
  it('treats amount as grams when basis is g (values per 100 g)', () => {
    expect(scaleFood({ kcal: 130, p: 2.7, c: 28, f: 0.3 }, 200, 'g')).toEqual({ kcal: 260, p: 5.4, c: 56, f: 0.6 })
    expect(scaleFood({ kcal: 130, p: 2.7, c: 28, f: 0.3 }, 50, 'g').kcal).toBe(65)
  })
  it('takes basis from the food when not passed', () => {
    expect(scaleFood({ basis: 'g', kcal: 200, p: 10, c: 20, f: 4 }, 150).kcal).toBe(300)
  })
})
