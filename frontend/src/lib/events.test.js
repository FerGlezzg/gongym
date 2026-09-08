import { describe, it, expect } from 'vitest'
import { DEFAULT_EVENT_TYPES, eventTypes, eventMinutes, eventKcal, eventTimeLabel } from './events.js'

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
