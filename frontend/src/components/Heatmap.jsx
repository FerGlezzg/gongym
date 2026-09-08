import { useEffect, useRef } from 'react'
import { fmtVol, isoOf, todayISO, MONTHS, DAYS, weekOrder, weekStartOf, weekDayOffset } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { eventMinutes } from '../lib/events.js'

const HeatLegend = () => (
  <div className="hm-legend">{t('Less time')} <div className="hm-c l0" /><div className="hm-c l1" /><div className="hm-c l2" /><div className="hm-c l3" /><div className="hm-c l4" /> {t('More time')}</div>
)

// Activity heatmap, shaded by time trained per day. `view="month"` renders the current
// month as a calendar grid (Home); the default is the GitHub-style trailing 12 months (Stats).
// In month view: `dots(iso)` -> 'plan' | 'ovr' | null marks a scheduled routine, `events(iso)`
// -> emoji marks a custom event, and `onDay` fires for every day (not just trained ones).
// `month` is the Date whose month to render (defaults to now); `onNav(±1)` fires on a
// horizontal swipe across the grid so the parent can page months.
export default function Heatmap({ S, onDay, view, dots, events, month, onNav }) {
  const wrapRef = useRef(null)
  useEffect(() => { if (wrapRef.current) wrapRef.current.scrollLeft = wrapRef.current.scrollWidth }, [])

  // Horizontal-swipe paging for month view. A drag under the threshold falls through to the
  // day's own tap handler, so this never steals a plain tap.
  const swipe = useRef(null)
  const swiped = useRef(false)
  const swDown = e => {
    if (e.pointerType && e.pointerType !== 'touch' && e.pointerType !== 'pen') return
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId }
  }
  const swUp = e => {
    const s = swipe.current; swipe.current = null
    if (!s || s.id !== e.pointerId || !onNav) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.4) return
    swiped.current = true                          // swallow the click this gesture also fires
    onNav(dx < 0 ? 1 : -1)
  }
  const swClick = e => { if (swiped.current) { swiped.current = false; e.stopPropagation() } }

  const agg = {}
  S.workouts.forEach(w => {
    const a = agg[w.d] = agg[w.d] || { n: 0, vol: 0, min: 0 }
    a.n++; a.vol += w.vol || 0
    a.min += Math.max(0, Math.round(((w.end || w.start) - w.start) / 60000))
  })
  // Timed events count as activity too — they shade the cell like a workout does.
  ;(S.events || []).forEach(e => {
    const min = eventMinutes(e)
    if (!min) return
    const a = agg[e.d] = agg[e.d] || { n: 0, vol: 0, min: 0 }
    a.min += min
  })
  const mins = Object.values(agg).map(a => a.min).filter(v => v > 0).sort((a, b) => a - b)
  const q = p => (mins.length ? mins[Math.min(mins.length - 1, Math.floor(p * mins.length))] : 0)
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75)
  const level = a => !a ? 0 : !a.min ? 1 : a.min >= t3 ? 4 : a.min >= t2 ? 3 : a.min >= t1 ? 2 : 1

  if (view === 'month') {
    const now = month instanceof Date ? new Date(month) : new Date()
    now.setHours(12, 0, 0, 0)
    const y = now.getFullYear(), mo = now.getMonth()
    const ws = weekStartOf(S)
    const offset = weekDayOffset(new Date(y, mo, 1).getDay(), ws)
    const daysIn = new Date(y, mo + 1, 0).getDate()
    const pad = n => String(n).padStart(2, '0')
    const cells = []
    for (let i = 0; i < offset; i++) cells.push(<div key={'e' + i} />)
    for (let d = 1; d <= daysIn; d++) {
      const key = `${y}-${pad(mo + 1)}-${pad(d)}`
      const a = agg[key]
      const trained = !!(a && a.n > 0)
      const dot = !a && dots ? dots(key) : null      // shaded days carry no dot
      const ev = events ? events(key) : null
      const emoji = typeof ev === 'string' ? ev : ev?.emoji || null
      const cls = 'hm-md l' + level(a) + (key === todayISO() ? ' today' : '') + (key > todayISO() ? ' future' : '') + (trained ? ' trained' : '')
      cells.push(<div key={d} className={cls}
        title={key
          + (trained ? ` · ${t(a.n === 1 ? '{0} workout' : '{0} workouts', a.n)} · ${fmtVol(a.vol, S.unit)}` : '')
          + (a && a.min ? ` · ${a.min} min` : '')
          + (ev?.name ? ` · ${ev.name}` : '')}
        {...tappable(onDay ? () => onDay(key) : undefined)}>
        <span>{d}</span>
        {(dot || emoji) && <span className="hm-mk">{dot && <i className={'d ' + dot} />}{emoji && <span className="e">{emoji}</span>}</span>}
      </div>)
    }
    return <>
      <div className="hm-month" onPointerDown={swDown} onPointerUp={swUp}
        onPointerCancel={() => { swipe.current = null }} onClickCapture={swClick}>
        {weekOrder(ws).map(wd => <div key={wd} className="hm-h">{t(DAYS[wd])}</div>)}
        {cells}
      </div>
      <HeatLegend />
    </>
  }

  const today = new Date(); today.setHours(12, 0, 0, 0)
  const end = new Date(today); end.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  const start = new Date(end); start.setDate(end.getDate() - 52 * 7)

  const months = [], cols = []
  let lastMonth = -1
  for (let wk = 0; wk <= 52; wk++) {
    const colStart = new Date(start); colStart.setDate(start.getDate() + wk * 7)
    const mo = colStart.getMonth()
    const showM = mo !== lastMonth && colStart.getDate() <= 7 && wk < 51
    months.push(<span key={wk}>{showM ? t(MONTHS[mo]) : ''}</span>)
    if (colStart.getDate() <= 7) lastMonth = mo
    const cells = []
    for (let d = 0; d < 7; d++) {
      const day = new Date(colStart); day.setDate(colStart.getDate() + d)
      const key = isoOf(day)
      const a = agg[key]
      const cls = 'hm-c l' + level(a) + (key === todayISO() ? ' today' : '') + (day > today ? ' future' : '')
      cells.push(<div key={d} className={cls}
        title={key + (a && a.n ? ` · ${t(a.n === 1 ? '{0} workout' : '{0} workouts', a.n)} · ${fmtVol(a.vol, S.unit)}` : '') + (a && a.min ? ` · ${a.min} min` : '')}
        {...tappable(a ? () => onDay(key) : undefined)} />)
    }
    cols.push(<div key={wk} className="hm-col">{cells}</div>)
  }

  return <>
    <div className="hm-wrap" ref={wrapRef}>
      <div className="hm-months" style={{ marginLeft: 30 }}>{months}</div>
      <div className="hm-body">
        <div className="hm-days"><span>{t('Mon')}</span><span /><span>{t('Wed')}</span><span /><span>{t('Fri')}</span><span /><span /></div>
        <div className="hm-grid">{cols}</div>
      </div>
    </div>
    <HeatLegend />
  </>
}
