import { useLayoutEffect, useRef, useState } from 'react'
import { fmtNum, fmtDate, MONTHS, isoOf } from '../lib/format.js'
import { t } from '../lib/i18n.js'

const W = 340   // viewBox width; the svg stretches to its container, height comes from `h`

// points: [{ t: ms, y: num, d?: iso, m?: 0..1, note?: str }] sorted by t.
//   m    marks the point — a second reading carried by the same dot (bigger and more solid =
//        more of it). Used for effort on the weight curve, where the two belong on one line:
//        the same weight with less left in the tank is not the same session.
//   note extra text for that point's tooltip.
// opts: { h, unit, color, axes, goal, invert }
//   invert flips the y axis, for a scale that counts down as it gets harder (RIR). Without it
//   a curve of reps-in-reserve reads upside down, with the hardest sets at the floor.
//
// series: [{ key, label, color, points }] — an alternative to `points`/`color` for overlaying
// several lines that share one y-axis (e.g. intake / burn / balance, all in kcal). The caller
// owns which series are visible: pass only the ones currently toggled on, so the axis rescales
// to whatever is actually shown rather than always spanning every series that exists. `unit`
// and `goal` still apply to the whole chart. Single-series charts are unaffected — this is a
// second, self-contained render path, not a rework of the one every other chart already uses.
export default function LineChart({ points, series, h = 150, unit = '', color = 'var(--acc)', axes = true, goal = null, invert = false }) {
  const svgRef = useRef(null)
  const wrapRef = useRef(null)
  const tipRef = useRef(null)
  const [hover, setHover] = useState(null)   // single: { x, y, iso, v } · multi: { x, iso, rows: [{key,label,color,y,v}] }

  const multi = Array.isArray(series)
  const activeSeries = multi ? series.filter(s => s && s.points && s.points.length) : null

  // A new dataset has different coordinates and meaning, so never carry the previous
  // point selection into it. Layout timing removes the marker before the new chart paints.
  useLayoutEffect(() => {
    setHover(null)
  }, [points, multi ? activeSeries.map(s => s.key + ':' + s.points.length).join(',') : null])

  // The tooltip is placed after layout, from its measured size, because the chart
  // lives in an overflow-clipped box: a fixed half-width offset (what this used to
  // do) hangs the label off the edge on the first and last point, and the clip then
  // eats it. Reading offsetWidth here also covers translated labels, which are not
  // all the same length. Writing straight to the node's style keeps this off the
  // render path — hover fires on every mouse move.
  useLayoutEffect(() => {
    const tip = tipRef.current, wrap = wrapRef.current
    if (!hover || !tip || !wrap) return
    const cw = wrap.clientWidth, ch = wrap.clientHeight
    const tw = tip.offsetWidth, th = tip.offsetHeight
    const M = 4                                   // breathing room against the clip
    const cx = hover.x / W * cw, cy = (hover.y ?? h / 2) / h * ch
    tip.style.left = Math.max(M, Math.min(cw - tw - M, cx - tw / 2)) + 'px'
    // Parked at the top, but dropped below the point when the point sits high
    // enough that the label would cover the very value it is reporting.
    tip.style.top = (cy < th + 14 ? Math.min(ch - th - M, cy + 14) : M) + 'px'
  })

  if (multi ? !activeSeries.length : !points || points.length === 0) {
    return <div className="empty small">{t('No data yet')}</div>
  }
  const H = h
  const P = { l: axes ? 34 : 8, r: 12, t: 10, b: axes ? 22 : 8 }

  // Normalise to one shape either way: a list of { key, color, pts } to size the shared axes
  // off and to draw. A lone point is doubled so a single-reading series still draws a dot on
  // a real (flat) line instead of collapsing the whole domain onto one x position.
  const seriesList = multi
    ? activeSeries.map(s => ({ key: s.key, color: s.color || color, pts: s.points.length === 1 ? [s.points[0], s.points[0]] : s.points }))
    : [{ key: '_', color, pts: points.length === 1 ? [points[0], points[0]] : points }]
  const single = !multi && points.length === 1

  const allPts = seriesList.flatMap(s => s.pts)
  let ymin = Math.min(...allPts.map(p => p.y)), ymax = Math.max(...allPts.map(p => p.y))
  if (goal != null && isFinite(goal)) { ymin = Math.min(ymin, goal); ymax = Math.max(ymax, goal) }
  if (ymin === ymax) { ymin -= 1; ymax += 1 }
  const pad = (ymax - ymin) * 0.12; ymin -= pad; ymax += pad
  const allTs = allPts.map(p => p.t)
  const t0 = Math.min(...allTs), t1 = Math.max(...allTs) || Math.min(...allTs) + 1
  const X = tv => (t1 === t0 ? (P.l + W - P.r) / 2 : P.l + (tv - t0) / (t1 - t0) * (W - P.l - P.r))
  const Y = y => {
    const f = (y - ymin) / (ymax - ymin)
    return P.t + (invert ? f : 1 - f) * (H - P.t - P.b)
  }

  const gridlines = []
  if (axes) {
    const range = ymax - ymin, raw = range / 3
    const pow = Math.pow(10, Math.floor(Math.log10(raw)))
    let step = 10 * pow
    for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) { step = m * pow; break }
    for (let v = Math.ceil(ymin / step) * step; v <= ymax + 1e-9; v += step) {
      const y = Y(v)
      gridlines.push(<g key={'y' + v}>
        <line x1={P.l} y1={y} x2={W - P.r} y2={y} stroke="var(--sep-op)" strokeWidth="1" strokeDasharray="2 4" />
        <text x={P.l - 5} y={y + 3.5} textAnchor="end" fontSize="9.5" fill="var(--label-2)">{fmtNum(v)}</text>
      </g>)
    }
    const d0 = new Date(t0), d1 = new Date(t1)
    const ticks = []
    let m = new Date(d0.getFullYear(), d0.getMonth() + 1, 1)
    while (m <= d1) { ticks.push({ t: +m, txt: t(MONTHS[m.getMonth()]) }); m = new Date(m.getFullYear(), m.getMonth() + 1, 1) }
    if (ticks.length === 0 && !single) {
      for (let i = 0; i <= 2; i++) {
        const tv = t0 + (t1 - t0) * i / 2, dd = new Date(tv)
        ticks.push({ t: tv, txt: dd.getDate() + ' ' + t(MONTHS[dd.getMonth()]), anchor: i === 0 ? 'start' : i === 2 ? 'end' : 'middle' })
      }
    }
    const every = Math.max(1, Math.ceil(ticks.length / 7))
    ticks.forEach((tk, i) => {
      if (i % every) return
      const x = X(tk.t)
      gridlines.push(<g key={'x' + i}>
        <line x1={x} y1={P.t} x2={x} y2={H - P.b} stroke="var(--sep-op)" strokeWidth="1" strokeDasharray="2 4" />
        <text x={x} y={H - 7} textAnchor={tk.anchor || 'middle'} fontSize="9.5" fill="var(--label-2)">{tk.txt}</text>
      </g>)
    })
  }

  const gidBase = 'g' + Math.round(t0 % 1e7) + '_' + H
  // A fill under the line reads well for one series; overlaid on top of others it is just
  // mud, so it only shows while exactly one series is on screen (true for every single-series
  // chart, and for a multi-series one the moment every toggle but one is switched off).
  const showFill = seriesList.length === 1

  if (!multi) {
    // ---- single-series path: unchanged from before multi-series support existed ----
    const pts = seriesList[0].pts
    const poly = pts.map(p => X(p.t).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ')
    const last = pts[pts.length - 1]
    const hoverSource = single ? [points[0]] : points
    const hoverDates = hoverSource.map(p => p.d || isoOf(new Date(p.t)))
    const showYear = new Set(hoverDates.map(iso => new Date(iso + 'T12:00:00').getFullYear())).size > 1
    const hoverPts = hoverSource.map((p, i) => ({ x: X(p.t), y: Y(p.y), iso: hoverDates[i], v: p.y, note: p.note }))
    const marked = points.some(p => p.m != null)

    const onMove = e => {
      const c = e.touches ? e.touches[0] : e
      if (!c || c.clientX === undefined) return
      const r = svgRef.current.getBoundingClientRect()
      const w = r.width || W
      const vx = (c.clientX - r.left) / w * W
      let best = hoverPts[0]
      hoverPts.forEach(p => { if (Math.abs(p.x - vx) < Math.abs(best.x - vx)) best = p })
      setHover(best)
    }

    return (
      <div className="chart-i" ref={wrapRef}
        onMouseMove={onMove} onMouseDown={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={onMove} onTouchMove={onMove}>
        <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ aspectRatio: `${W}/${H}` }}>
          <defs><linearGradient id={gidBase} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".28" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient></defs>
          {gridlines}
          {goal != null && isFinite(goal) && <>
            <line x1={P.l} y1={Y(goal)} x2={W - P.r} y2={Y(goal)} stroke="var(--yellow)" strokeWidth="1.6" strokeDasharray="7 4" />
            <text x={W - P.r - 2} y={Y(goal) - 5} textAnchor="end" fontSize="9.5" fontWeight="700" fill="var(--yellow)">{fmtNum(goal)}</text>
          </>}
          <polygon points={`${P.l},${H - P.b} ${poly} ${X(last.t).toFixed(1)},${H - P.b}`} fill={`url(#${gidBase})`} />
          <polyline points={poly} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {marked && pts.map((p, i) => (p.m == null ? null :
            <circle key={'m' + i} cx={X(p.t)} cy={Y(p.y)} r={2.4 + p.m * 3} fill={color} opacity={0.3 + p.m * 0.7} />))}
          <circle cx={X(last.t)} cy={Y(last.y)} r="4" fill={color} />
          {hover && <g>
            <line className="cvl" x1={hover.x} y1={P.t} x2={hover.x} y2={H - P.b} stroke="var(--label-3)" strokeWidth="1" strokeDasharray="3 3" />
            <line className="chl" x1={P.l} y1={hover.y} x2={W - P.r} y2={hover.y} stroke="var(--label-3)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={hover.x} cy={hover.y} r="5" fill={color} stroke="var(--bg)" strokeWidth="2" />
          </g>}
        </svg>
        {hover && <div className="ctip" ref={tipRef}>
          {fmtDate(hover.iso, true, showYear)} · {fmtNum(hover.v)}{unit ? ' ' + unit : ''}{hover.note ? ' · ' + hover.note : ''}
        </div>}
      </div>
    )
  }

  // ---- multi-series path ----
  const dateOf = p => p.d || isoOf(new Date(p.t))
  // The union of every visible series' dates, so a date only one of them has (e.g. balance
  // needs two days of intake before it exists) still gets a hover stop.
  const allDates = [...new Set(seriesList.flatMap(s => s.pts.map(dateOf)))].sort()
  const showYear = new Set(allDates.map(iso => new Date(iso + 'T12:00:00').getFullYear())).size > 1
  const xOfDate = new Map(allDates.map(iso => [iso, X(new Date(iso + 'T12:00:00').getTime())]))

  const onMove = e => {
    const c = e.touches ? e.touches[0] : e
    if (!c || c.clientX === undefined) return
    const r = svgRef.current.getBoundingClientRect()
    const w = r.width || W
    const vx = (c.clientX - r.left) / w * W
    let bestIso = allDates[0], bestDx = Infinity
    for (const iso of allDates) { const dx = Math.abs(xOfDate.get(iso) - vx); if (dx < bestDx) { bestDx = dx; bestIso = iso } }
    const rows = seriesList.map(s => {
      const p = s.pts.find(p => dateOf(p) === bestIso)
      return p ? { key: s.key, color: s.color, v: p.y } : null
    }).filter(Boolean)
    if (!rows.length) { setHover(null); return }
    setHover({ x: xOfDate.get(bestIso), iso: bestIso, rows })
  }

  return (
    <div className="chart-i" ref={wrapRef}
      onMouseMove={onMove} onMouseDown={onMove}
      onMouseLeave={() => setHover(null)}
      onTouchStart={onMove} onTouchMove={onMove}>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ aspectRatio: `${W}/${H}` }}>
        <defs>{seriesList.map(s => (
          <linearGradient key={s.key} id={gidBase + '_' + s.key} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={s.color} stopOpacity=".28" />
            <stop offset="1" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}</defs>
        {gridlines}
        {goal != null && isFinite(goal) && <>
          <line x1={P.l} y1={Y(goal)} x2={W - P.r} y2={Y(goal)} stroke="var(--yellow)" strokeWidth="1.6" strokeDasharray="7 4" />
          <text x={W - P.r - 2} y={Y(goal) - 5} textAnchor="end" fontSize="9.5" fontWeight="700" fill="var(--yellow)">{fmtNum(goal)}</text>
        </>}
        {seriesList.map(s => {
          const poly = s.pts.map(p => X(p.t).toFixed(1) + ',' + Y(p.y).toFixed(1)).join(' ')
          const last = s.pts[s.pts.length - 1]
          return <g key={s.key}>
            {showFill && <polygon points={`${P.l},${H - P.b} ${poly} ${X(last.t).toFixed(1)},${H - P.b}`} fill={`url(#${gidBase}_${s.key})`} />}
            <polyline points={poly} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={X(last.t)} cy={Y(last.y)} r="4" fill={s.color} />
          </g>
        })}
        {hover && <g>
          <line x1={X(new Date(hover.iso + 'T12:00:00').getTime())} y1={P.t} x2={X(new Date(hover.iso + 'T12:00:00').getTime())} y2={H - P.b}
            stroke="var(--label-3)" strokeWidth="1" strokeDasharray="3 3" />
          {hover.rows.map(row => (
            <circle key={row.key} cx={X(new Date(hover.iso + 'T12:00:00').getTime())} cy={Y(row.v)} r="5" fill={row.color} stroke="var(--bg)" strokeWidth="2" />
          ))}
        </g>}
      </svg>
      {hover && <div className="ctip mctip" ref={tipRef}>
        <div className="mctip-d">{fmtDate(hover.iso, true, showYear)}</div>
        {hover.rows.map(row => {
          const s = series.find(x => x.key === row.key)
          return <div key={row.key} className="mctip-r"><i style={{ background: row.color }} />{s?.label} {fmtNum(row.v)}{unit ? ' ' + unit : ''}</div>
        })}
      </div>}
    </div>
  )
}
