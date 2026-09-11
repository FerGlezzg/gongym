// @vitest-environment happy-dom
// Distance (optional) sharpens the calorie estimate for a pace-sensitive type (currently just
// running — lib/events.js effectiveMet) and is otherwise just a number kept on the event.
// "Now" stamps the actual wall-clock time into Start/End, for logging as it happens rather
// than typing a remembered time afterwards — which is also why a lone Start (no End yet) has
// to be a valid, savable state: you stamp Start on the way out, End on the way back.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('event distance and "Now" time stamps', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useUI.setState({ sheets: [], toasts: [] })
    useStore.setState(s => ({ S: { ...s.S, active: null, events: [], bodyweight: [{ d: todayISO(), w: 70 }] } }))
    document.body.innerHTML = ''
  })
  afterEach(() => {
    act(() => { mounted.splice(0).forEach(root => root.unmount()) })
    vi.useRealTimers()
  })

  it('"Now" stamps the current time into Start, and again into End', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 11, 7, 32))
    eventSheet(todayISO())
    const host = mountTopSheet()
    act(() => { button(host, 'Running').click() })

    const nowButtons = () => [...host.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Now')
    act(() => { nowButtons()[0].click() })   // Start's
    expect(host.querySelectorAll('input[type=time]')[0].value).toBe('07:32')

    vi.setSystemTime(new Date(2026, 8, 11, 8, 15))
    act(() => { nowButtons()[1].click() })   // End's
    expect(host.querySelectorAll('input[type=time]')[1].value).toBe('08:15')
  })

  it('a lone Start with no End yet saves fine — no "both or neither" error', () => {
    eventSheet(todayISO())
    const host = mountTopSheet()
    act(() => { const input = host.querySelector('input.input'); type(input, 'Morning run') })
    act(() => { button(host, 'Running').click() })
    act(() => { type(host.querySelectorAll('input[type=time]')[0], '07:30') })
    act(() => { button(host, 'Add').click() })

    const ev = useStore.getState().S.events.find(e => e.name === 'Morning run')
    expect(ev).toBeTruthy()
    expect(ev.start).toBe('07:30')
    expect(ev.end).toBe(null)
    expect(ev.typeKey).toBe('run')
  })

  it('distance sharpens the estimate for running but not for a non-paced type', () => {
    eventSheet(todayISO())
    const host = mountTopSheet()
    act(() => { button(host, 'Running').click() })
    act(() => { type(host.querySelectorAll('input[type=time]')[0], '10:00') })
    act(() => { type(host.querySelectorAll('input[type=time]')[1], '10:25') })
    const distanceInput = host.querySelector('.num.input')
    act(() => { type(distanceInput, '5') })

    // 5 km / 25 min → 5 min/km pace note, and a kcal figure that is not the flat-MET one
    expect(host.textContent).toContain('5 min/km')
    const flatKcalText = `${Math.round(9.8 * 70 * (25 / 60))}`
    expect(host.textContent).not.toContain(`≈ ${flatKcalText} kcal`)

    act(() => { button(host, 'Football').click() })
    act(() => { type(host.querySelectorAll('input[type=time]')[0], '10:00') })
    act(() => { type(host.querySelectorAll('input[type=time]')[1], '10:25') })
    expect(host.textContent).not.toContain('min/km')
  })
})
