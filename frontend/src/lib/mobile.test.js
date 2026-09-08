import { describe, expect, it } from 'vitest'
import { isoOf } from './format.js'
import { buildReminderNotifications, buildEventNotifications, EVENT_ID_BASE, EVENT_NOTIF_MAX } from './mobile.js'

const push = { id: 'push', name: 'Push' }
const pull = { id: 'pull', name: 'Pull' }
const legs = { id: 'legs', name: 'Legs' }
const state = (patch = {}) => ({
  routines: [push, pull, legs], week: {}, dayPlan: {}, workouts: [],
  reminder: { on: true, time: '08:00' }, ...patch,
})
const iso = d => isoOf(d)

describe('buildReminderNotifications', () => {
  it('expands the weekly baseline into future dated notifications', () => {
    const now = new Date(2026, 5, 1, 7, 0) // Monday
    const notifications = buildReminderNotifications(state({ week: { 1: 'push', 3: 'pull' } }), now)

    expect(notifications.slice(0, 2).map(n => iso(n.schedule.at))).toEqual([
      iso(now), iso(new Date(2026, 5, 3)),
    ])
    expect(notifications[0].body).toContain('Push')
    expect(notifications[0].schedule.allowWhileIdle).toBe(true)
  })

  it('uses rest today and a routine override tomorrow when rescheduling', () => {
    const now = new Date(2026, 5, 1, 7, 0) // Monday
    const today = iso(now), tomorrow = iso(new Date(2026, 5, 2))
    const notifications = buildReminderNotifications(state({
      week: { 1: 'push' }, dayPlan: { [today]: 'rest', [tomorrow]: 'pull' },
    }), now)

    expect(notifications.slice(0, 1).map(n => [iso(n.schedule.at), n.body])).toEqual([
      [tomorrow, expect.stringContaining('Pull')],
    ])
  })

  it('schedules a valid override on a weekly rest day', () => {
    const now = new Date(2026, 5, 1, 7, 0) // Monday
    const wednesday = new Date(2026, 5, 3)
    const notifications = buildReminderNotifications(state({ dayPlan: { [iso(wednesday)]: 'legs' } }), now)

    expect(notifications.some(n => iso(n.schedule.at) === iso(wednesday) && n.body.includes('Legs'))).toBe(true)
  })

  it('suppresses dates that already have a completed workout', () => {
    const now = new Date(2026, 5, 1, 7, 0) // Monday
    const notifications = buildReminderNotifications(state({
      week: { 1: 'push' }, workouts: [{ d: iso(now) }],
    }), now)

    expect(notifications.some(n => iso(n.schedule.at) === iso(now))).toBe(false)
  })

  it("skips today's reminder after the configured local time has passed", () => {
    const now = new Date(2026, 5, 1, 9, 0) // Monday
    const notifications = buildReminderNotifications(state({ week: { 1: 'push' } }), now)

    expect(notifications.some(n => iso(n.schedule.at) === iso(now))).toBe(false)
    expect(notifications.some(n => iso(n.schedule.at) === iso(new Date(2026, 5, 8)))).toBe(true)
  })

  it('names both routines of a combined day, and reads a legacy scalar day the same', () => {
    const now = new Date(2026, 5, 1, 7, 0) // Monday
    const combined = buildReminderNotifications(state({ week: { 1: ['push', 'pull'] } }), now)[0]
    expect(combined.body).toContain('Push + Pull')

    const legacy = buildReminderNotifications(state({ week: { 1: 'push' } }), now)[0]
    expect(legacy.body).toContain('Push')
  })

  it('falls back to a count for three or more routines on one day', () => {
    const now = new Date(2026, 5, 1, 7, 0)
    const n = buildReminderNotifications(state({ week: { 1: ['push', 'pull', 'legs'] } }), now)[0]
    expect(n.body).toContain('3 routines')
  })
})

describe('buildEventNotifications', () => {
  const now = new Date(2026, 5, 1, 9, 0)                     // 1 Jun 2026, 09:00 local
  const ev = (patch) => ({ id: 'e', d: '2026-06-05', name: 'Match', emoji: '⚽', ...patch })

  it('schedules a `before` and an `allDay` notification', () => {
    const ns = buildEventNotifications({ events: [ev({ start: '18:00', notify: { before: 60, allDay: true } })], reminder: { time: '08:00' } }, now)
    expect(ns).toHaveLength(2)
    const before = ns.find(n => n.body === 'Starts at 18:00')
    const allDay = ns.find(n => n.body === 'All day')
    expect(before.schedule.at.getTime()).toBe(new Date(2026, 5, 5, 17, 0).getTime())
    expect(allDay.schedule.at.getTime()).toBe(new Date(2026, 5, 5, 8, 0).getTime())
    expect(allDay.ongoing).toBe(true)          // pinned on Android
    expect(before.ongoing).toBeUndefined()
    expect(ns.every(n => n.id >= EVENT_ID_BASE)).toBe(true)
  })

  it('skips past fire times and events beyond the window', () => {
    expect(buildEventNotifications({ events: [ev({ d: '2026-05-30', notify: { allDay: true } })] }, now)).toEqual([])   // past
    expect(buildEventNotifications({ events: [ev({ d: '2026-12-01', notify: { allDay: true } })] }, now)).toEqual([])   // >35 days
  })

  it('caps the total', () => {
    const many = Array.from({ length: 40 }, (_, i) => ev({ id: 'e' + i, d: '2026-06-0' + ((i % 5) + 1) || '2026-06-05', notify: { allDay: true } }))
    expect(buildEventNotifications({ events: many }, now).length).toBeLessThanOrEqual(EVENT_NOTIF_MAX)
  })

  it('is empty with no events', () => {
    expect(buildEventNotifications({ events: [] }, now)).toEqual([])
    expect(buildEventNotifications({}, now)).toEqual([])
  })
})