// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import LineChart from './LineChart.jsx'
import { fmtDate, isoOf } from '../lib/format.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let container
let root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const point = (year, month, day, y) => ({
  d: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  t: new Date(year, month - 1, day, 12).getTime(),
  y
})

const firstPoints = [
  { t: Date.UTC(2026, 0, 1), y: 80, d: '2026-01-01' },
  { t: Date.UTC(2026, 0, 15), y: 82, d: '2026-01-15' },
]
const nextPoints = [
  { t: Date.UTC(2026, 1, 1), y: 78, d: '2026-02-01' },
  { t: Date.UTC(2026, 1, 15), y: 79, d: '2026-02-15' },
]

function renderChart(points) {
  act(() => root.render(<LineChart points={points} axes={false} unit="kg" />))
}

function renderMulti(series) {
  act(() => root.render(<LineChart series={series} axes={false} unit="kcal" />))
}

function hoverAt(clientX) {
  act(() => {
    container.querySelector('.chart-i').dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX }))
  })
  return container.querySelector('.ctip').textContent
}

describe('LineChart hover date', () => {
  it('keeps same-year points in the compact format', () => {
    const first = point(2026, 1, 15, 70)
    renderChart([first, point(2026, 2, 15, 71)])

    expect(hoverAt(0)).toBe(`${fmtDate(first.d, true)} · 70 kg`)
  })

  it('includes the calendar year at a short cross-year boundary', () => {
    const first = point(2025, 11, 30, 70)
    const last = point(2026, 2, 1, 71)
    renderChart([first, last])

    expect(hoverAt(0)).toBe(`${fmtDate(first.d, true, true)} · 70 kg`)
    expect(hoverAt(340)).toBe(`${fmtDate(last.d, true, true)} · 71 kg`)
  })

  it('keeps a single point compact', () => {
    const only = point(2026, 7, 4, 70)
    renderChart([only])

    expect(hoverAt(170)).toBe(`${fmtDate(only.d, true)} · 70 kg`)
  })

  it('uses timestamp-only points when deciding whether to show the year', () => {
    const first = point(2025, 12, 31, 70)
    const last = point(2026, 1, 1, 71)
    const timestampOnly = [{ t: first.t, y: first.y }, { t: last.t, y: last.y }]
    renderChart(timestampOnly)

    const lastIso = isoOf(new Date(last.t))
    expect(hoverAt(340)).toBe(`${fmtDate(lastIso, true, true)} · 71 kg`)
  })
})

describe('LineChart multi-series', () => {
  const mk = (color, key, label, pts) => ({ key, label, color, points: pts })

  it('hovering shows one tooltip row per series sharing that date', () => {
    const intake = [{ t: Date.UTC(2026, 0, 10), y: 2000, d: '2026-01-10' }, { t: Date.UTC(2026, 0, 11), y: 2100, d: '2026-01-11' }]
    const burn = [{ t: Date.UTC(2026, 0, 10), y: 2500, d: '2026-01-10' }, { t: Date.UTC(2026, 0, 11), y: 2600, d: '2026-01-11' }]
    renderMulti([mk('var(--blue)', 'intake', 'Intake', intake), mk('var(--yellow)', 'burn', 'Burn', burn)])

    act(() => { container.querySelector('.chart-i').dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 0 })) })
    const rows = [...container.querySelectorAll('.ctip.mctip .mctip-r')].map(r => r.textContent)
    expect(rows).toEqual(['Intake 2,000 kcal', 'Burn 2,500 kcal'])
  })

  it('a date only one series has still gets a hover stop, with just that row', () => {
    const intakePts = [{ t: Date.UTC(2026, 0, 10), y: 2000, d: '2026-01-10' }]
    const balancePts = [{ t: Date.UTC(2026, 0, 11), y: -300, d: '2026-01-11' }]
    renderMulti([mk('var(--blue)', 'intake', 'Intake', intakePts), mk('var(--acc)', 'balance', 'Balance', balancePts)])

    act(() => { container.querySelector('.chart-i').dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 340 })) })
    const rows = [...container.querySelectorAll('.ctip.mctip .mctip-r')].map(r => r.textContent)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain('Balance')
    expect(rows[0]).toContain('300')
  })

  it('an empty series list falls back to the shared "no data" placeholder', () => {
    renderMulti([])
    expect(container.querySelector('.empty')).toBeTruthy()
  })
})

describe('LineChart hover state', () => {
  it('clears the tooltip and hover markers when points are replaced, then allows hovering again', () => {
    renderChart(firstPoints)
    hoverAt(170)

    expect(container.querySelector('.ctip')).toBeTruthy()
    expect(container.querySelector('.cvl')).toBeTruthy()
    expect(container.querySelector('.chl')).toBeTruthy()

    renderChart(nextPoints)

    expect(container.querySelector('.ctip')).toBeNull()
    expect(container.querySelector('.cvl')).toBeNull()
    expect(container.querySelector('.chl')).toBeNull()

    hoverAt(170)
    expect(container.querySelector('.ctip')).toBeTruthy()
    expect(container.querySelector('.cvl')).toBeTruthy()
  })
})
