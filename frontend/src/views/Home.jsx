import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { effectiveRoutines, effectiveRoutineIds, nextTrainingDay, streakWeeks, lastBW } from '../lib/history.js'
import { fmtNum, fmtDate, todayISO, DAYN, MONTHS_LONG } from '../lib/format.js'
import { t, dateLocale } from '../lib/i18n.js'
import { bwSheet, goalSheet, calendarSheet, startFlow, starterPlanSheet, bwDeltaColor, dayHubSheet, weekPresetsSheet, monthPickerSheet } from '../sheets.jsx'
import { dietOf } from '../lib/nutrition.js'
import { eventIconOf } from '../lib/events.js'
import LineChart from '../components/LineChart.jsx'
import Heatmap from '../components/Heatmap.jsx'
import CalorieCard from '../components/CalorieCard.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { glyphOf } from '../lib/glyphs.js'

// Marker for a day on the month calendar: an override wins the colour, else a plain
// scheduled-routine dot, else nothing.
const dayDot = (S, iso) => S.dayPlan[iso] !== undefined ? 'ovr'
  : effectiveRoutineIds(S, iso).length ? 'plan' : null
const eventOn = (S, iso) => (S.events || []).find(e => e.d === iso) || null

// Home = what to do now + a quick glance. Deep charts & history live in Stats.
export default function Home() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const user = useStore(s => s.user)

  const today = new Date()
  // The heatmap can page back/forward through months without leaving Home. `monthOff` is
  // signed months from the current one; 0 keeps it pinned to today.
  const [monthOff, setMonthOff] = useState(0)
  const viewMonth = new Date(today.getFullYear(), today.getMonth() + monthOff, 1)
  const vMo = viewMonth.getMonth(), vYr = viewMonth.getFullYear()
  const setViewMonth = (yr, mo) => setMonthOff((yr - today.getFullYear()) * 12 + (mo - today.getMonth()))

  // A weekday can hold several routines. `todayRoutines` is the whole day; `routine` is the
  // first, kept for the one-routine glyph. The derived session name joins them (§9).
  const todayRoutines = effectiveRoutines(S, todayISO())
  const routine = todayRoutines[0] || null
  const todayName = todayRoutines.map(r => r.name).join(' + ')
  const todayOvr = S.dayPlan[todayISO()] !== undefined
  const todayEvents = (S.events || []).filter(e => e.d === todayISO())
  // On a rest day, saying when you train next beats leaving the row as a full stop.
  const next = !S.active && !todayRoutines.length ? nextTrainingDay(S, todayISO()) : null
  const bw = lastBW(S)
  const prevBW = S.bodyweight.length > 1 ? S.bodyweight[S.bodyweight.length - 2] : null
  const delta = bw && prevBW ? bw.w - prevBW.w : null
  const doneToday = S.workouts.filter(w => w.d === todayISO()).at(-1) || null

  const bwPoints = S.bodyweight.slice(-30).map(b => ({ t: b.t || new Date(b.d).getTime(), y: b.w, d: b.d }))
  const activePreset = (S.weekPresets || []).find(p => p.id === S.activeWeekId)

  const onToday = () => {
    if (S.active) nav('/workout')
    else if (todayRoutines.length) startFlow(effectiveRoutineIds(S, todayISO()))
    else dayHubSheet(todayISO())
  }

  return <div className="narrow">
    <div className="hdr">
      <div style={{ minWidth: 0 }}>
        <h1>{user ? t('Hi {0}', user.name) : 'openGym'}</h1>
        <div className="sub">{today.toLocaleDateString(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' })}</div>
        <div className="sub" style={{ marginTop: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 500 }} {...tappable(() => calendarSheet())}>
          <Icon name="flame" style={{ color: 'var(--orange)', fontSize: 14 }} />
          {t('{0} week streak', streakWeeks(S))}
        </div>
      </div>
      <div className="row" style={{ gap: 8, flex: 'none' }}>
        {/* The gym check-in cards (QR membership codes) used to be a full row below; this
            is the way in now, folded away with the same "Gym check-in" switch in Settings. */}
        {S.checkIn !== false && (
          <button className="iconbtn" onClick={() => nav('/checkin')} aria-label={t('Check in')} title={t('Check in')}><Icon name="qr" /></button>
        )}
        <button className="iconbtn" onClick={() => nav('/settings')} aria-label={t('Settings')}><Icon name="gear" /></button>
      </div>
    </div>

    <div className="card">
      {/* The Today row leads: the one action Home is for. Below it, the current month as a
          calendar — trained days shaded, scheduled days dotted, events marked; tap any day. */}
      {S.weekPresets?.length > 0 && (
        <div className="row between" style={{ marginBottom: 10, cursor: 'pointer' }} {...tappable(weekPresetsSheet)}>
          <span className="row small" style={{ gap: 6, minWidth: 0, color: 'var(--label-2)' }}>
            <Icon name="calendar" style={{ fontSize: 14, color: 'var(--acc)', flex: 'none' }} />
            <b style={{ color: 'var(--label)' }}>{t('Week schedule')}</b>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {activePreset ? activePreset.name : t('Unsaved schedule')}</span>
          </span>
          <Icon name="chevronRight" className="chev" style={{ flex: 'none' }} />
        </div>
      )}
      <div className="today-row" style={{ marginTop: 0 }} {...tappable(onToday)}>
        <div className="row" style={{ gap: 9, minWidth: 0 }}>
          <span className="lrow-i" style={{ background: S.active ? 'var(--orange)' : doneToday ? 'var(--surface-3)' : routine ? 'var(--acc)' : 'var(--surface-3)' }}>
            <Icon name={S.active ? 'timer' : doneToday ? 'checkCircle' : routine ? glyphOf(routine.emoji) : 'moon'}
              style={doneToday && !S.active ? { color: 'var(--green)' } : undefined} />
          </span>
          <div style={{ minWidth: 0 }}>
            <div className="lbl2">{t('Today')}</div>
            <div className="ttl">{S.active ? t('{0} — in progress', S.active.name)
              : doneToday ? (doneToday.name ? t('{0} — done', doneToday.name) : t('Workout done'))
              : routine ? todayName
              : todayEvents.length ? todayEvents[0].name
              : t('Rest day')}{todayOvr && routine && !doneToday ? ' · ' + t('rescheduled') : ''}</div>
            {next && !doneToday && <div className="ss">{t('Next session: {0}, {1}', t(DAYN[next.weekday]), next.routine.name)}</div>}
            {(routine || doneToday) && todayEvents.length > 0 && <div className="ss"><Icon name={eventIconOf(todayEvents[0].emoji)} style={{ fontSize: 12, marginRight: 4 }} />{todayEvents[0].name}</div>}
          </div>
        </div>
        {S.active ? <span className="tag" style={{ color: 'var(--orange)', background: 'color-mix(in srgb,var(--orange) 16%,transparent)' }}>{t('Resume')}</span>
          : doneToday ? <span className="tag" style={{ color: 'var(--green)', background: 'color-mix(in srgb,var(--green) 16%,transparent)' }}>{t('Done')}</span>
          : routine ? <span className="tag acc">{t('Start')}</span>
          : <Icon name="plus" className="chev" />}
      </div>
      <div className="row between" style={{ marginTop: 14, marginBottom: 2 }}>
        <div className="row" style={{ gap: 1, alignItems: 'center', minWidth: 0 }}>
          <button className="iconbtn" style={{ width: 28, height: 28, fontSize: 13 }} onClick={() => setMonthOff(o => o - 1)} aria-label={t('Previous month')}><Icon name="chevronLeft" /></button>
          <h2 style={{ margin: 0, textTransform: 'capitalize', cursor: 'pointer', padding: '0 4px' }}
            {...tappable(() => monthPickerSheet(vYr, vMo, setViewMonth))}>
            {t(MONTHS_LONG[vMo])}{vYr !== today.getFullYear() ? ' ' + vYr : ''}
          </h2>
          <button className="iconbtn" style={{ width: 28, height: 28, fontSize: 13 }} onClick={() => setMonthOff(o => o + 1)} aria-label={t('Next month')}><Icon name="chevronRight" /></button>
        </div>
        {monthOff !== 0 && <button className="chip nocap" style={{ padding: '3px 10px', fontSize: 12 }} onClick={() => setMonthOff(0)}>{t('Today')}</button>}
      </div>
      <Heatmap S={S} view="month" month={viewMonth} onNav={d => setMonthOff(o => o + d)} dots={iso => dayDot(S, iso)} events={iso => eventOn(S, iso)} onDay={dayHubSheet} />
    </div>

    {!S.routines.length && !S.active && (
      <div className="card">
        <div className="row" style={{ gap: 10, marginBottom: 6 }}>
          <span className="lrow-i"><Icon name="sparkles" /></span>
          <div className="big" style={{ fontSize: 22 }}>{t('Welcome!')}</div>
        </div>
        <div className="muted small" style={{ marginBottom: 12 }}>{t('Set up your weekly routine to get going — or load a ready-made starter plan.')}</div>
        <Button variant="primary" icon="sparkles" onClick={starterPlanSheet}>{t('Load starter plan')}</Button>
        <div style={{ height: 8 }} /><Button onClick={() => nav('/plan')}>{t('Build my own plan')}</Button>
      </div>
    )}

    <div className="card">
      <div className="row between" style={{ marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>{t('Body weight')}</h2>
        <div className="row" style={{ gap: 8 }}>
          <Button size="sm" icon="target" style={S.targetW ? { color: 'var(--yellow)' } : undefined} onClick={goalSheet}>{S.targetW ? fmtNum(S.targetW) : t('Goal')}</Button>
          <Button size="sm" icon="plus" onClick={() => bwSheet()}>{t('Log')}</Button>
        </div>
      </div>
      {bw ? <>
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <div className="big">{fmtNum(bw.w)} <span className="muted" style={{ fontSize: '1rem' }}>{S.unit}</span></div>
          {/* only when it actually moved — an unchanged weight used to read as "− 0" */}
          {!!delta && (
            <span className="small row" style={{ gap: 2, fontWeight: 500, color: bwDeltaColor(delta, bw.w) }}>
              <Icon name={delta > 0 ? 'arrowUp' : 'arrowDown'} style={{ fontSize: 12 }} />
              {fmtNum(Math.abs(delta))}
            </span>
          )}
          <span className="dim small" style={{ marginLeft: 'auto' }}>{fmtDate(bw.d, true)}</span>
        </div>
        {S.targetW && (
          <div className="small row" style={{ color: 'var(--yellow)', marginTop: 4, gap: 5 }}>
            <Icon name="target" style={{ fontSize: 13 }} />
            <span>{t('Goal')} {fmtNum(S.targetW)} {S.unit} · {Math.abs(S.targetW - bw.w) < 0.05 ? t('reached!') : t(S.targetW > bw.w ? '{0} to gain' : '{0} to lose', fmtNum(Math.abs(S.targetW - bw.w)) + ' ' + S.unit)}</span>
          </div>
        )}
        <div className="chart" style={{ marginTop: 8 }}><LineChart points={bwPoints} h={130} unit={S.unit} goal={S.targetW} /></div>
      </> : <div className="muted small">{t("No entries yet — log your weight to start the curve. It's also asked before every workout.")}</div>}
    </div>

    {/* Calories today vs goal — the same summary card as the Diet screen; taps through to it. */}
    {(dietOf(S).kcalGoal || (S.nutrition || []).length > 0) && <CalorieCard onClick={() => nav('/diet')} />}
  </div>
}
