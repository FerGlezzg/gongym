// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { logPastWorkoutSheet } from './sheets.jsx'
import { todayISO } from './lib/format.js'

const mounted = []
function type(el, value) {
  Object.getOwnPropertyDescriptor(el.constructor.prototype, 'value').set.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
function mountTopSheet() {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}
const button = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.trim() === text)

const ROUTINE = { id: 'r1', name: 'Push', emoji: '💪', ex: [{ id: 'bench-press', sets: 3, reps: 8, weight: 60, mode: 'reps' }] }

describe('log a past workout', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useUI.setState({ sheets: [], toasts: [] })
    useStore.setState(s => ({ S: { ...s.S, active: null, routines: [ROUTINE], exWeights: {}, workouts: [
      { id: 'old', d: todayISO(), start: 1, end: 2, name: 'Old', entries: [], prs: [] },
    ] } }))
    document.body.innerHTML = ''
  })
  afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

  it('refuses while a workout is running', () => {
    const toast = vi.fn()
    useUI.setState({ toast })
    useStore.setState(s => ({ S: { ...s.S, active: { id: 'a', entries: [] } } }))
    logPastWorkoutSheet()
    expect(useUI.getState().sheets).toHaveLength(0)
    expect(toast).toHaveBeenCalledWith('Finish the current workout first.')
  })

  it('files the workout straight away — no navigation, no active session', () => {
    logPastWorkoutSheet()
    const host = mountTopSheet()
    expect(host.querySelector('h3').textContent).toBe('Log a past workout')
    act(() => { type(host.querySelector('input[type=date]'), '2020-01-02') })
    act(() => { button(host, 'Push').click() })
    act(() => { button(host, 'Save').click() })

    const S = useStore.getState().S
    expect(S.active).toBeNull()
    const logged = S.workouts.find(w => w.d === '2020-01-02')
    expect(logged).toBeTruthy()
    expect(logged.entries[0].id).toBe('bench-press')
    expect(logged.entries[0].sets.every(x => x.done)).toBe(true)
    expect(new Date(logged.start).getHours()).toBe(18)
    // inserted in date order, before today's existing workout
    expect(S.workouts.indexOf(logged)).toBeLessThan(S.workouts.findIndex(w => w.id === 'old'))
  })

  it('a past log claims no PRs and does not move confirmed weights', () => {
    logPastWorkoutSheet()
    const host = mountTopSheet()
    act(() => { type(host.querySelector('input[type=date]'), '2020-01-02') })
    act(() => { button(host, 'Push').click() })
    act(() => { button(host, 'Save').click() })
    const S = useStore.getState().S
    expect(S.workouts.find(w => w.d === '2020-01-02').prs).toEqual([])
    expect(S.exWeights['bench-press']).toBeUndefined()
  })

  it('offers replace / add when the day already has a workout, and replace removes the old one', () => {
    logPastWorkoutSheet()
    const host = mountTopSheet()
    act(() => { type(host.querySelector('input[type=date]'), todayISO()) })
    expect(host.textContent).toContain('There is already a workout on that day.')
    act(() => { button(host, 'Replace · Old').click() })
    act(() => { button(host, 'Push').click() })
    act(() => { button(host, 'Save').click() })
    const S = useStore.getState().S
    expect(S.workouts.some(w => w.id === 'old')).toBe(false)
    expect(S.workouts.filter(w => w.d === todayISO())).toHaveLength(1)
  })
})
