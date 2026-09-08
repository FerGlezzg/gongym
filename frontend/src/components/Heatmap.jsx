import { useEffect, useRef } from 'react'
import { fmtVol, isoOf, todayISO, MONTHS, DAYS, weekOrder, weekStartOf, weekDayOffset } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { tappable } from '../lib/use-sheet-keyboard.js'

const HeatLegend = () => (
  <div className="hm-legend">{t('Less time')} <div className="hm-c l0" /><div className="hm-c l1" /><div className="hm-c l2" /><div className="hm-c l3" /><div className="hm-c l4" /> {t('More time')}</div>
)

// Activity heatmap, shaded by time trained per day. `view="month"` renders the current
// month as a calendar grid (Home); the default is the GitHub-style trailing 12 months (Stats).
// In month view: `dots(iso)` -> 'plan' | 'ovr' | null marks a scheduled routine, `events(iso)`
// -> emoji marks a custom event, and `onDay` fires for every day (not just trained ones).
export default function Heatmap({ S, onDay, view, dots, events }) {
  const wrapRef = useRef(null)
  useEffect(() => { if (wrapRef.current) wrapRef.current.scrollLeft = wrapRef.current.scrollWidth }, [])

  const agg = {}
  S.workouts.forEach(w => {
    const a = agg[w.d] = agg[w.d] || { n: 0, vol: 0, min: 0 }
    a.n++; a.vol += w.vol || 0
    a.min += Math.max(0, Math.round(((w.end || w.start) - w.start) / 60000))
  })
  const mins = Object.values(agg).map(a => a.min).filter(v => v > 0).sort((a, b) => a - b)
  const q = p => (mins.length ? mins[Math.min(mins.length - 1, Math.floor(p * mins.length))] : 0)
  const t1 = q(0.25), t2 = q(0.5), t3 = q(0.75)
  const level = a => !a ? 0 : !a.min ? 1 : a.min >= t3 ? 4 : a.min >= t2 ? 3 : a.min >= t1 ? 2 : 1

  if (view === 'month') {
    const now = new Date(); now.setHours(12, 0, 0, 0)
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
      const dot = !a && dots ? dots(key) : null      // trained days are shaded, no dot
      const ev = events ? events(key) : null
      const emoji = typeof ev === 'string' ? ev : ev?.emoji || null
      const cls = 'hm-md l' + level(a) + (key === todayISO() ? ' today' : '') + (key > todayISO() ? ' future' : '') + (a ? ' trained' : '')
      cells.push(<div key={d} className={cls}
        title={key
          + (a ? ` · ${t(a.n === 1 ? '{0} workout' : '{0} workouts', a.n)} · ${a.min} min · ${fmtVol(a.vol, S.unit)}` : '')
          + (ev?.name ? ` · ${ev.name}` : '')}
        {...tappable(onDay ? () => onDay(key) : undefined)}>
        <span>{d}</span>
        {(dot || emoji) && <span className="hm-mk">{dot && <i className={'d ' + dot} />}{emoji && <span className="e">{emoji}</span>}</span>}
      </div>)
    }
    return <>
      <div className="hm-month">
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
        title={key + (a ? ` · ${t(a.n === 1 ? '{0} workout' : '{0} workouts', a.n)} · ${a.min} min · ${fmtVol(a.vol, S.unit)}` : '')}
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
