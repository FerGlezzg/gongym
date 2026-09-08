// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/api.js', () => ({ api: vi.fn(), setRemoteAuth: vi.fn() }))

import { DEF, useStore } from './useStore.js'

const clone = value => JSON.parse(JSON.stringify(value))
const S = () => useStore.getState().S
const update = fn => useStore.getState().update(fn, false)

beforeEach(() => {
  localStorage.clear()
  useStore.setState({ S: clone(DEF), user: null, ready: false })
})
afterEach(() => {
  localStorage.clear()
  useStore.setState({ S: clone(DEF), user: null, ready: false })
})

// S.events is plain profile data — a marker on the calendar, name + emoji + date. Rides the
// ordinary update()/persist() path like gymCards / weekPresets.
describe('S.events', () => {
  it('defaults to an empty array on a fresh profile', () => {
    expect(S().events).toEqual([])
  })

  it('adds an event and persists it', () => {
    update(s => { s.events.push({ id: 'e1', d: '2026-09-22', name: '10K race', emoji: '🏃' }) })
    expect(S().events).toHaveLength(1)
    const saved = JSON.parse(localStorage.getItem('gym_state_v1'))
    expect(saved.events[0]).toMatchObject({ d: '2026-09-22', name: '10K race', emoji: '🏃' })
  })

  it('edits and removes by id', () => {
    update(s => {
      s.events.push({ id: 'e1', d: '2026-09-22', name: '10K', emoji: '🏃' })
      s.events.push({ id: 'e2', d: '2026-09-25', name: 'Match', emoji: '⚽' })
    })
    update(s => { const e = s.events.find(x => x.id === 'e1'); e.name = 'Half marathon'; e.emoji = '🥇' })
    expect(S().events.find(e => e.id === 'e1')).toMatchObject({ name: 'Half marathon', emoji: '🥇' })

    update(s => { s.events = s.events.filter(e => e.id !== 'e1') })
    expect(S().events.map(e => e.id)).toEqual(['e2'])
  })
})
