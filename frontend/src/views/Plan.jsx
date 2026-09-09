import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { DAYN, weekOrder, weekStartOf, uid, exCount, fmtNum, todayISO, isoOf, fmtDate } from '../lib/format.js'
import { EXDB, EXIDX } from '../lib/exercises.js'
import { bestWeightFor } from '../lib/history.js'
import { favIds } from '../lib/favourites.js'
import { bodyweightKgAt } from '../lib/nutrition.js'
import { eventKcal, eventTimeLabel, eventRepeats } from '../lib/events.js'
import { t, exerciseNameFor } from '../lib/i18n.js'
import { dayAssignSheet, dayAddRoutineSheet, starterPlanSheet, planToolsSheet, exerciseDetailSheet, addToRoutineSheet, weekPresetsSheet, eventSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button, Segmented } from '../components/ui.jsx'
import { Thumb } from '../components/Media.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { glyphOf, DEFAULT_GLYPH } from '../lib/glyphs.js'
import { DEMO } from '../lib/demo.js'
import { MOBILE } from '../lib/mobile.js'
import { coachAvailable } from '../lib/coach.js'

export default function Plan() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const config = useStore(s => s.config)
  const coachMode = useStore(s => s.coachLocal?.mode)
  const user = useStore(s => s.user)
  const [tab, setTab] = useState('week')   // 'week' | 'routines' | 'exercises'

  /* The Coach's only entry point in the app. Its screens have existed since the UI landed and
     nothing linked to them, so the feature was reachable only by typing the URL — enabled,
     configured, and invisible. The same predicate every other Coach surface uses gates it, so
     an instance without the feature sees exactly the Plan screen it saw before. */
  const showCoach = coachAvailable(config, user, { demo: DEMO, mobile: MOBILE, coachMode })

  const addRoutine = () => {
    const r = { id: uid(), name: t('New routine'), emoji: DEFAULT_GLYPH, ex: [] }
    update(s => { s.routines.push(r) })
    nav('/plan/r/' + r.id)
  }

  // Pull one routine off a weekday; drop the key when the day empties (never store []).
  const removeFromDay = (d, rid) => update(s => {
    const next = [].concat(s.week[d] || []).filter(id => id !== rid)
    if (next.length) s.week[d] = next; else delete s.week[d]
  })

  const favExercises = favIds(S).map(id => EXIDX[id]).filter(Boolean)
  const activePreset = (S.weekPresets || []).find(p => p.id === S.activeWeekId)

  // Events grouped by day for the next 15 days (Events tab).
  const upcoming = []
  const base = new Date(todayISO() + 'T12:00:00')
  for (let i = 0; i < 15; i++) {
    const d = new Date(base); d.setDate(base.getDate() + i)
    const iso = isoOf(d)
    const evs = (S.events || []).filter(e => e.d === iso)
    if (evs.length) upcoming.push({ iso, evs })
  }

  return <>
    <div className="hdr">
      <div><h1>{t('Plan')}</h1><div className="sub">{t('Your weekly routine')}</div></div>
      <button className="iconbtn" onClick={planToolsSheet} aria-label={t('Share your plan')} title={t('Share your plan')}><Icon name="upload" /></button>
    </div>
    {showCoach && <button className="coach-cta" onClick={() => nav('/coach')}>
      <span className="coach-cta-av"><Icon name="sparkles" /></span>
      <span className="coach-cta-t">
        <b>{t('Coach')}</b>
        <span>{t('Plan design and reviews, from your own training')}</span>
      </span>
      <Icon name="chevronRight" className="coach-cta-chev" />
    </button>}

    <Segmented className="seg-range" value={tab} onChange={setTab}
      options={[{ value: 'week', label: t('Week') }, { value: 'routines', label: t('Routines') }, { value: 'exercises', label: t('Exercises') }, { value: 'events', label: t('Events') }]} />

    {tab === 'week' && <>
      {!S.routines.length && <>
        <div className="empty"><div className="ico"><Icon name="clipboard" /></div>{t('No routines yet.')}<br />{t('Create one or load the starter plan.')}</div>
        <Button icon="sparkles" onClick={starterPlanSheet}>{t('Load starter plan')}</Button>
        <div style={{ height: 16 }} />
      </>}
      <div className="row between" style={{ marginBottom: 8 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Week schedule')}</h4>
        <Button size="sm" variant="tinted" icon="folder" onClick={weekPresetsSheet}>
          {t('Schedules')}{S.weekPresets?.length ? ' ' + S.weekPresets.length : ''}
        </Button>
      </div>
      {S.weekPresets?.length > 0 && (
        <div className="item" {...tappable(weekPresetsSheet)} style={{ marginBottom: 10 }}>
          <span className="lrow-i" style={{ background: 'var(--acc)', color: '#000' }}><Icon name="calendar" /></span>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="tt">{activePreset ? activePreset.name : t('Unsaved schedule')}</div>
            <div className="ss">{t('Active schedule — tap to switch')}</div>
          </div>
          <Icon name="chevronRight" className="chev" />
        </div>
      )}
      <div className="list" style={{ display: 'flex', flexDirection: 'column' }}>
        {weekOrder(weekStartOf(S)).map(d => {
          const dayRoutines = [].concat(S.week[d] || []).map(id => S.routines.find(x => x.id === id)).filter(Boolean)
          // An empty day stays one tappable row → pick its first routine (today's behaviour).
          if (!dayRoutines.length) return <div key={d} className="item" {...tappable(() => dayAssignSheet(d))}>
            <div className="grow"><div className="tt">{t(DAYN[d])}</div></div>
            <span className="tag">{t('Rest')}</span>
            <Icon name="chevronRight" className="chev" /></div>
          // A populated day: always-visible routine sub-rows + inline ✕, then ＋ Add routine.
          return <div key={d} className="item" style={{ display: 'block', padding: '10px 14px' }}>
            <div className="row between" style={{ marginBottom: 6 }}>
              <div className="tt">{t(DAYN[d])}</div>
              <div className="small dim">{t('{0} routines', dayRoutines.length)}</div>
            </div>
            {dayRoutines.map(r => <div key={r.id} className="row" style={{ gap: 8, padding: '4px 0 4px 8px' }}>
              <span className="lrow-i" style={{ width: 26, height: 26, fontSize: 14 }}><Icon name={glyphOf(r.emoji)} /></span>
              <div className="grow" style={{ minWidth: 0 }}><div className="tt" style={{ fontSize: 14 }}>{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
              <button className="iconbtn sm" aria-label={t('Remove')} onClick={() => removeFromDay(d, r.id)}><Icon name="xmark" /></button>
            </div>)}
            <button className="btn ghost sm" style={{ marginTop: 4, marginLeft: 8 }} onClick={() => dayAddRoutineSheet(d)}>
              <Icon name="plus" /> {t('Add routine')}
            </button>
          </div>
        })}
      </div>
    </>}

    {tab === 'routines' && <>
      <div className="row between" style={{ marginTop: 4, marginBottom: 10 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Routines')}</h4>
        <Button size="sm" variant="tinted" icon="plus" onClick={addRoutine}>{t('New')}</Button>
      </div>
      {S.routines.length ? <div className="list">{S.routines.map(r => <div key={r.id} className="item" {...tappable(() => nav('/plan/r/' + r.id))}>
        <span className="lrow-i"><Icon name={glyphOf(r.emoji)} /></span>
        <div className="grow"><div className="tt">{r.name}</div><div className="ss">{exCount(r.ex.length)}</div></div>
        <Icon name="chevronRight" className="chev" /></div>)}</div> : <>
        <div className="empty"><div className="ico"><Icon name="clipboard" /></div>{t('No routines yet.')}<br />{t('Create one or load the starter plan.')}</div>
        <Button icon="sparkles" onClick={starterPlanSheet}>{t('Load starter plan')}</Button>
      </>}
    </>}

    {tab === 'exercises' && <>
      <div className="list" style={{ marginTop: 4 }}>
        <div className="item" {...tappable(() => nav('/library'))}>
          <span className="lrow-i"><Icon name="list" /></span>
          <div className="grow"><div className="tt">{t('All exercises')}</div><div className="ss">{t('{0} exercises with animations', EXDB.length)}</div></div>
          <Icon name="chevronRight" className="chev" />
        </div>
      </div>

      <h4 className="sec" style={{ marginTop: 18 }}>{t('Favourites')}</h4>
      {favExercises.length ? <div className="list">
        {favExercises.map(e => {
          const best = bestWeightFor(S, e.id)
          return <div key={e.id} className="item" {...tappable(() => exerciseDetailSheet(e))}>
            <Thumb ex={e} />
            <div className="grow"><div className="tt capitalize"><Icon name="starFill" className="fav-star" />{exerciseNameFor(e)}</div>
              <div className="ss capitalize">{t(e.tg || e.bp)} · {t(e.eq)}</div></div>
            {best > 0 && <span className="tag acc">{fmtNum(best)}</span>}
            <Button size="sm" variant="tinted" icon="plus" onClick={ev => { ev.stopPropagation(); addToRoutineSheet(e) }}>{t('Plan')}</Button>
          </div>
        })}
      </div> : <div className="empty">
        <div className="ico"><Icon name="starFill" /></div>
        {t('No favourite exercises yet.')}<br />{t('Tap the star on an exercise to pin it here.')}
      </div>}
    </>}

    {tab === 'events' && <>
      <div className="row between" style={{ marginTop: 4, marginBottom: 10 }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Upcoming events')} <span className="dim" style={{ textTransform: 'none', letterSpacing: 0 }}>· {t('next 15 days')}</span></h4>
        <Button size="sm" variant="tinted" icon="plus" onClick={() => eventSheet()}>{t('New')}</Button>
      </div>
      {upcoming.length ? upcoming.map(({ iso, evs }) => (
        <div key={iso} style={{ marginBottom: 12 }}>
          <div className="small dim" style={{ marginBottom: 4, textTransform: 'capitalize' }}>{fmtDate(iso, true)}</div>
          <div className="list">{evs.map(e => {
            const kcal = eventKcal(e, bodyweightKgAt(S, iso))
            return <div key={e.id} className="item" {...tappable(() => eventSheet(iso, e))}>
              <span className="lrow-i" style={{ fontSize: 18 }}>{e.emoji || '📅'}</span>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="tt">{e.name}</div>
                <div className="ss">{[eventTimeLabel(e), kcal > 0 ? '≈ ' + fmtNum(kcal) + ' ' + t('kcal') : '', eventRepeats(S.events, e) ? t('repeats') : '', e.notify ? '🔔' : ''].filter(Boolean).join(' · ') || t('Event')}</div>
              </div>
              <Icon name="chevronRight" className="chev" />
            </div>
          })}</div>
        </div>
      )) : <div className="empty">
        <div className="ico"><Icon name="flag" /></div>
        {t('No events in the next 15 days.')}<br />{t('Add a race, a match, anything worth marking.')}
      </div>}
      <Button icon="plus" onClick={() => eventSheet()}>{t('New event')}</Button>
    </>}
  </>
}
