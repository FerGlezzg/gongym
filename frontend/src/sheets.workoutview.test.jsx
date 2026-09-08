// @vitest-environment happy-dom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { beginWorkout } from './sheets.jsx'

// beginWorkout snapshots S.workoutView onto s.active so the header ⋮ can re-lay-out the
// running session without touching the saved default.

const mounted = []

describe('workout view is snapshot onto the active session', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useUI.setState({ sheets: [], toasts: [] })
    useStore.setState(s => ({ S: { ...s.S, active: null, routines: [], workouts: [], workoutView: 'cards' } }))
    document.body.innerHTML = ''
  })
  afterEach(() => { act(() => { mounted.splice(0).forEach(root => root.unmount()) }) })

  it('beginWorkout copies the current default onto s.active', () => {
    useStore.setState(s => ({ S: { ...s.S, workoutView: 'compact' } }))
    act(() => beginWorkout(null, null))
    expect(useStore.getState().S.active.workoutView).toBe('compact')
  })

  it('beginWorkout falls back to cards when the default is unset', () => {
    useStore.setState(s => { const S = { ...s.S }; delete S.workoutView; return { S } })
    act(() => beginWorkout(null, null))
    expect(useStore.getState().S.active.workoutView).toBe('cards')
  })

  it('later changes to the default leave the running session alone', () => {
    act(() => beginWorkout(null, null))
    expect(useStore.getState().S.active.workoutView).toBe('cards')
    useStore.setState(s => ({ S: { ...s.S, workoutView: 'list' } }))
    expect(useStore.getState().S.active.workoutView).toBe('cards')
  })
})
