// @vitest-environment happy-dom
// Weekly diet plans: save a named calorie/macro target, assign it to a week of the month
// (1-5), and lib/nutrition.js goalFor() resolves it for any date in that week. This exercises
// the sheet wiring end to end; goalFor's own resolution rules are covered in nutrition.test.js.
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { bindUI } from './components/ui.jsx'
import { dietPlansSheet } from './sheets.jsx'
import { goalFor } from './lib/nutrition.js'

// SelectRow (used for the Week 1-5 pickers) opens its option sheet through this shared
// binding rather than importing the store at module scope — normally wired once in App.jsx.
bindUI(useUI)

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
const buttonLike = (host, text) => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))

describe('diet plans: save and assign to a week of the month', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useUI.setState({ sheets: [], toasts: [] })
    useStore.setState(s => ({ S: { ...s.S, dietPlans: [], dietWeekPlan: {}, diet: { kcalGoal: 2200 } } }))
    document.body.innerHTML = ''
  })
  afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

  it('creates a plan and assigns it to a week; goalFor picks it up for that week only', () => {
    dietPlansSheet()
    const plansHost = mountTopSheet()

    act(() => { button(plansHost, 'New plan').click() })
    const formHost = mountTopSheet()
    act(() => { type(formHost.querySelector('.field'), 'Bulk') })
    act(() => { type(formHost.querySelector('.stp .num'), '3000') })
    act(() => { button(formHost, 'Save').click() })

    const plan = useStore.getState().S.dietPlans.find(p => p.name === 'Bulk')
    expect(plan).toBeTruthy()
    expect(plan.kcalGoal).toBe(3000)

    // Assign it to Week 1
    act(() => { buttonLike(plansHost, 'Week 1').click() })
    const pickerHost = mountTopSheet()
    act(() => { button(pickerHost, 'Bulk').click() })

    expect(useStore.getState().S.dietWeekPlan[1]).toBe(plan.id)
    expect(goalFor(useStore.getState().S, '2026-01-03').kcalGoal).toBe(3000)   // week 1
    expect(goalFor(useStore.getState().S, '2026-01-10').kcalGoal).toBe(2200)  // week 2, unassigned → default
  })

  it('deleting a plan clears it from any week it was assigned to', () => {
    useStore.setState(s => ({ S: { ...s.S, dietPlans: [{ id: 'p1', name: 'Cut', kcalGoal: 1800 }], dietWeekPlan: { 2: 'p1' } } }))
    dietPlansSheet()
    const host = mountTopSheet()
    act(() => { host.querySelector('button[aria-label="Delete"]').click() })
    const confirm = mountTopSheet()
    act(() => { button(confirm, 'Delete').click() })

    expect(useStore.getState().S.dietPlans).toEqual([])
    expect(useStore.getState().S.dietWeekPlan[2]).toBeUndefined()
  })
})
