// @vitest-environment happy-dom
// A MET-based activity type (the built-ins: running, cycling…) can only turn into a kcal
// number with a bodyweight on file — a flat kcal/hour type (one the user made) does not need
// one. Sitting at a silent 0 read as "events don't count towards calories"; the sheet now
// names the actual missing ingredient instead, with a one-tap fix.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { eventSheet } from './sheets.jsx'
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

describe('event calorie estimate for a MET-based activity', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useUI.setState({ sheets: [], toasts: [] })
    useStore.setState(s => ({ S: { ...s.S, active: null, events: [], bodyweight: [] } }))
    document.body.innerHTML = ''
  })
  afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

  it('explains the missing bodyweight instead of silently estimating 0 kcal, and recovers once logged', () => {
    eventSheet(todayISO())
    const host = mountTopSheet()
    act(() => { button(host, 'Running').click() })
    const times = host.querySelectorAll('input[type=time]')
    act(() => { type(times[0], '18:00') })
    act(() => { type(times[1], '19:00') })

    expect(host.textContent).toContain('Log your body weight to estimate calories burned for this activity.')
    expect(host.textContent).not.toContain('added to the day’s expenditure')

    act(() => { useStore.setState(s => ({ S: { ...s.S, bodyweight: [{ d: todayISO(), w: 80 }] } })) })

    expect(host.textContent).not.toContain('Log your body weight to estimate calories burned for this activity.')
    expect(host.textContent).toContain('added to the day’s expenditure')
  })

  it('a flat kcal/hour custom type needs no bodyweight at all', () => {
    useStore.setState(s => ({ S: { ...s.S, eventTypes: [{ id: 'x1', name: 'Ultimate', emoji: 'flag', kcalPerHour: 500 }] } }))
    eventSheet(todayISO())
    const host = mountTopSheet()
    act(() => { button(host, 'Ultimate').click() })
    const times = host.querySelectorAll('input[type=time]')
    act(() => { type(times[0], '18:00') })
    act(() => { type(times[1], '19:00') })

    expect(host.textContent).not.toContain('Log your body weight to estimate calories burned for this activity.')
    expect(host.textContent).toContain('added to the day’s expenditure')
  })
})
