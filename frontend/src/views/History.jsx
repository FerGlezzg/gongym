import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { t } from '../lib/i18n.js'
import { fmtDate } from '../lib/format.js'
import { WorkoutRow, workoutDetailSheet, logPastWorkoutSheet, eventSheet } from '../sheets.jsx'
import { Button } from '../components/ui.jsx'
import Icon from '../components/Icon.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'

function EventRow({ e }) {
  return <div className="item" {...tappable(() => eventSheet(e.d, e))}>
    <span className="lrow-i" style={{ fontSize: 18 }}>{e.emoji || '📅'}</span>
    <div className="grow"><div className="tt">{e.name}</div><div className="ss">{fmtDate(e.d, true)} · {t('Event')}</div></div>
    <Icon name="chevronRight" className="chev" />
  </div>
}

export default function History() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  // One list, newest first: workouts keyed by start-time, events by date.
  const rows = [
    ...S.workouts.map(w => ({ k: w.start || new Date(w.d).getTime(), node: <WorkoutRow key={'w' + w.id} w={w} onClick={() => workoutDetailSheet(w)} /> })),
    ...(S.events || []).map(e => ({ k: new Date(e.d + 'T23:59').getTime(), node: <EventRow key={'e' + e.id} e={e} /> })),
  ].sort((a, b) => b.k - a.k)

  return <>
    <div className="hdr"><button className="iconbtn" onClick={() => nav('/stats')} aria-label={t('Stats')}><Icon name="chevronLeft" /></button>
      <div style={{ flex: 1, marginLeft: 12 }}><h1>{t('History')}</h1><div className="sub">{t('{0} workouts', S.workouts.length)}</div></div></div>
    <Button icon="plus" onClick={() => logPastWorkoutSheet()} style={{ marginBottom: 12 }}>{t('Log a past workout')}</Button>
    {rows.length ? <div className="list">{rows.map(r => r.node)}</div>
      : <div className="empty"><div className="ico"><Icon name="history" /></div>{t('No workouts yet.')}</div>}
  </>
}
