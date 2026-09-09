import { describe, it, expect } from 'vitest'
import { DEFAULT_EVENT_TYPES, eventTypes, eventMinutes, eventKcal, eventTimeLabel, expandRecurrence, seriesFrequency, planEventEdit, eventRepeats, RECUR, eventNotifTimes } from './events.js'

describe('DEFAULT_EVENT_TYPES', () => {
  it('includes surf and a zero-MET fallback', () => {
    expect(DEFAULT_EVENT_TYPES.some(t => t.key === 'surf' && t.emoji === '🏄')).toBe(true)
    expect(DEFAULT_EVENT_TYPES.find(t => t.key === 'other').met).toBe(0)
  })
})

describe('eventTypes', () => {
  it('appends the user types with a key', () => {
    const list = eventTypes({ eventTypes: [{ id: 'x1', name: 'Ultimate', emoji: '🥏', kcalPerHour: 500 }] })
    expect(list.length).toBe(DEFAULT_EVENT_TYPES.length + 1)
    expect(list.at(-1)).toMatchObject({ key: 'x1', custom: true, kcalPerHour: 500 })
  })
  it('is just the built-ins with no S', () => {
    expect(eventTypes(null)).toHaveLength(DEFAULT_EVENT_TYPES.length)
  })
})

describe('eventMinutes', () => {
  it('is the span between start and end', () => {
    expect(eventMinutes({ start: '18:00', end: '19:30' })).toBe(90)
  })
  it('wraps past midnight', () => {
    expect(eventMinutes({ start: '23:00', end: '00:30' })).toBe(90)
  })
  it('is 0 without both times', () => {
    expect(eventMinutes({ start: '18:00' })).toBe(0)
    expect(eventMinutes({})).toBe(0)
    expect(eventMinutes(null)).toBe(0)
  })
})

describe('eventKcal', () => {
  it('is MET × kg × hours for a built-in type', () => {
    // surf 5 MET, 80 kg, 2 h → 800
    expect(eventKcal({ start: '10:00', end: '12:00', met: 5 }, 80)).toBe(800)
  })
  it('uses a flat kcal/hour when the event has one', () => {
    expect(eventKcal({ start: '10:00', end: '11:30', kcalPerHour: 400 }, 80)).toBe(600)
  })
  it('is 0 without a duration or an intensity', () => {
    expect(eventKcal({ met: 5 }, 80)).toBe(0)
    expect(eventKcal({ start: '10:00', end: '11:00' }, 80)).toBe(0)
    expect(eventKcal({ start: '10:00', end: '11:00', met: 5 }, 0)).toBe(0)
  })
})

describe('eventTimeLabel', () => {
  it('formats a range or nothing', () => {
    expect(eventTimeLabel({ start: '18:00', end: '19:30' })).toBe('18:00 – 19:30')
    expect(eventTimeLabel({ start: '18:00' })).toBe('')
  })
})

describe('expandRecurrence', () => {
  it('none is just the day itself', () => {
    expect(expandRecurrence('2026-09-15', 'none')).toEqual(['2026-09-15'])
  })
  it('weekly / biweekly step by 7 / 14 days', () => {
    expect(expandRecurrence('2026-09-15', 'weekly').slice(0, 3)).toEqual(['2026-09-15', '2026-09-22', '2026-09-29'])
    expect(expandRecurrence('2026-09-15', 'biweekly').slice(0, 3)).toEqual(['2026-09-15', '2026-09-29', '2026-10-13'])
    expect(expandRecurrence('2026-09-15', 'weekly')).toHaveLength(RECUR.weekly.count)
  })
  it('monthly / quarterly / yearly step by month', () => {
    expect(expandRecurrence('2026-01-10', 'monthly').slice(0, 3)).toEqual(['2026-01-10', '2026-02-10', '2026-03-10'])
    expect(expandRecurrence('2026-01-10', 'quarterly').slice(0, 3)).toEqual(['2026-01-10', '2026-04-10', '2026-07-10'])
    expect(expandRecurrence('2026-06-01', 'yearly').slice(0, 2)).toEqual(['2026-06-01', '2027-06-01'])
  })
  it('clamps a month-end day to the last day of a shorter month', () => {
    expect(expandRecurrence('2026-01-31', 'monthly').slice(0, 3)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })
})

describe('seriesFrequency', () => {
  const weekly = expandRecurrence('2026-09-15', 'weekly').map((d, i) => ({ id: 'w' + i, d, series: 'S' }))
  it('reads the cadence back from the sibling spacing', () => {
    expect(seriesFrequency(weekly, weekly[0])).toBe('weekly')
    const monthly = expandRecurrence('2026-01-10', 'monthly').map((d, i) => ({ id: 'm' + i, d, series: 'M' }))
    expect(seriesFrequency(monthly, monthly[1])).toBe('monthly')
  })
  it('is none for a standalone event or the last of a series', () => {
    expect(seriesFrequency(weekly, { id: 'x', d: '2026-09-15' })).toBe('none')
    expect(seriesFrequency(weekly, weekly[weekly.length - 1])).toBe('none')
  })
})

describe('planEventEdit', () => {
  const weekly = expandRecurrence('2026-09-15', 'weekly').map((d, i) => ({ id: 'w' + i, d, series: 'S' }))
  it('does nothing to the series when the frequency is unchanged', () => {
    const plan = planEventEdit(weekly, weekly[1], { date: '2026-09-22', freq: 'weekly', prevFreq: 'weekly', seriesId: 'S' })
    expect(plan.removeIds).toEqual([])
    expect(plan.forwardDates).toEqual([])
    expect(plan.series).toBe('S')
  })
  it('drops later siblings and regenerates them when the frequency changes', () => {
    const plan = planEventEdit(weekly, weekly[1], { date: '2026-09-22', freq: 'biweekly', prevFreq: 'weekly', seriesId: 'S' })
    expect(plan.removeIds).toEqual(weekly.slice(2).map(e => e.id))
    expect(plan.forwardDates.slice(0, 2)).toEqual(['2026-10-06', '2026-10-20'])
    expect(plan.series).toBe('S')
  })
  it('turning repeat off removes later siblings and detaches this occurrence', () => {
    const plan = planEventEdit(weekly, weekly[1], { date: '2026-09-22', freq: 'none', prevFreq: 'weekly', seriesId: 'S' })
    expect(plan.removeIds).toEqual(weekly.slice(2).map(e => e.id))
    expect(plan.forwardDates).toEqual([])
    expect(plan.series).toBeNull()     // detached — it no longer reads as "repeats"
  })
  it('adds a series to a standalone event that gains a repeat', () => {
    const solo = { id: 'a', d: '2026-09-15' }
    const plan = planEventEdit([solo], solo, { date: '2026-09-15', freq: 'weekly', prevFreq: 'none', seriesId: 'NEW' })
    expect(plan.removeIds).toEqual([])
    expect(plan.series).toBe('NEW')
    expect(plan.forwardDates).toHaveLength(RECUR.weekly.count - 1)
  })
})

describe('eventRepeats', () => {
  const weekly = expandRecurrence('2026-09-15', 'weekly').map((d, i) => ({ id: 'w' + i, d, series: 'S' }))
  it('is true only while a sibling shares the series', () => {
    expect(eventRepeats(weekly, weekly[0])).toBe(true)
    expect(eventRepeats([weekly[0]], weekly[0])).toBe(false)   // last one standing
    expect(eventRepeats(weekly, { id: 'x', d: '2026-09-15' })).toBe(false)
    expect(eventRepeats(weekly, { id: 'x', d: '2026-09-15', series: null })).toBe(false)
  })
})

describe('eventNotifTimes', () => {
  const local = (y, mo, d, h, m) => new Date(y, mo - 1, d, h, m).getTime()
  it('is empty without a notify config', () => {
    expect(eventNotifTimes({ d: '2026-09-15', start: '18:00' })).toEqual([])
  })
  it('fires `before` relative to the start time', () => {
    const [b] = eventNotifTimes({ d: '2026-09-15', start: '18:00', notify: { before: 60 } })
    expect(b.kind).toBe('before')
    expect(b.at.getTime()).toBe(local(2026, 9, 15, 17, 0))
  })
  it('rolls `before` back across midnight', () => {
    const [b] = eventNotifTimes({ d: '2026-09-15', start: '00:30', notify: { before: 120 } })
    expect(b.at.getTime()).toBe(local(2026, 9, 14, 22, 30))
  })
  it('drops `before` when there is no start time', () => {
    expect(eventNotifTimes({ d: '2026-09-15', notify: { before: 60 } })).toEqual([])
  })
  it('fires `allDay` at the daily time (default 08:00, or the given one)', () => {
    expect(eventNotifTimes({ d: '2026-09-15', notify: { allDay: true } })[0].at.getTime()).toBe(local(2026, 9, 15, 8, 0))
    expect(eventNotifTimes({ d: '2026-09-15', notify: { allDay: true } }, '07:15')[0].at.getTime()).toBe(local(2026, 9, 15, 7, 15))
  })
  it('can emit both', () => {
    expect(eventNotifTimes({ d: '2026-09-15', start: '18:00', notify: { before: 0, allDay: true } }).map(x => x.kind)).toEqual(['before', 'allDay'])
  })
})
