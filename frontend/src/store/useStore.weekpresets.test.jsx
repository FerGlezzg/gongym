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

// S.week stays the single live schedule every training helper reads. S.weekPresets is a
// library of named snapshots and S.activeWeekId is the one S.week currently mirrors — while
// it is set, every edit to S.week is written straight back to that preset, so switching
// schedules never loses in-progress edits.
describe('week schedules (S.weekPresets / activeWeekId)', () => {
  it('defaults to no presets and no active id', () => {
    expect(S().weekPresets).toEqual([])
    expect(S().activeWeekId).toBe(null)
  })

  it('mirrors week edits into the active preset', () => {
    update(s => {
      s.week = { 1: ['r1'], 3: ['r2'] }
      s.weekPresets.push({ id: 'p1', name: 'Volume', week: clone(s.week) })
      s.activeWeekId = 'p1'
    })
    update(s => { s.week[5] = ['r3'] })          // add a Friday session

    expect(S().weekPresets[0].week).toEqual({ 1: ['r1'], 3: ['r2'], 5: ['r3'] })
    // and it survives persist
    const saved = JSON.parse(localStorage.getItem('gym_state_v1'))
    expect(saved.weekPresets[0].week[5]).toEqual(['r3'])
  })

  it('does not touch presets when nothing is active', () => {
    update(s => { s.weekPresets.push({ id: 'p1', name: 'Volume', week: { 1: ['r1'] } }) })
    update(s => { s.week = { 2: ['r9'] } })
    expect(S().weekPresets[0].week).toEqual({ 1: ['r1'] })
  })

  it('clears a dangling activeWeekId when its preset is deleted', () => {
    update(s => {
      s.weekPresets.push({ id: 'p1', name: 'Volume', week: { 1: ['r1'] } })
      s.activeWeekId = 'p1'
    })
    update(s => { s.weekPresets = s.weekPresets.filter(p => p.id !== 'p1') })
    expect(S().activeWeekId).toBe(null)
  })

  it('switching schedules swaps S.week and leaves the other preset alone', () => {
    update(s => {
      s.weekPresets.push({ id: 'a', name: 'A', week: { 1: ['ra'] } })
      s.weekPresets.push({ id: 'b', name: 'B', week: { 2: ['rb'] } })
      s.week = clone(s.weekPresets[0].week)
      s.activeWeekId = 'a'
    })
    // switch to B
    update(s => { s.week = clone(s.weekPresets[1].week); s.activeWeekId = 'b' })
    expect(S().week).toEqual({ 2: ['rb'] })
    expect(S().weekPresets.find(p => p.id === 'a').week).toEqual({ 1: ['ra'] })
  })
})
