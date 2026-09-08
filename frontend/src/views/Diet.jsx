import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore.js'
import { fmtNum, fmtDate, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { dietOf, daySeries, MEAL_SLOTS } from '../lib/nutrition.js'
import { dietGoalSheet, addFoodSheet } from '../sheets.jsx'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'
import SwipeToDelete from '../components/SwipeToDelete.jsx'
import CalorieCard from '../components/CalorieCard.jsx'

const SLOT_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' }

// How much of the food this row logged — "200 g", "2 rebanada (56 g)" or "×2".
// Older rows only have `qty`.
function amountLabel(r) {
  if (r.unit === 'g' && r.amount > 0) return fmtNum(r.amount) + ' g'
  if (r.unit && r.unit !== 'serving') {
    return fmtNum(r.amount) + ' ' + r.unit + (r.grams ? ' (' + fmtNum(r.grams) + ' g)' : '')
  }
  const n = r.amount ?? r.qty
  return n && n !== 1 ? '×' + fmtNum(n) : ''
}

// Diet = log today's intake and see it against the goal and the estimated burn.
// Deep charts and history live in Stats → Diet.
export default function Diet() {
  const nav = useNavigate()
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  const d = dietOf(S)
  const iso = todayISO()
  const todayRows = (S.nutrition || []).filter(r => r.d === iso)
  const removeEntry = id => update(s => { s.nutrition = (s.nutrition || []).filter(r => r.id !== id) })

  const recent = daySeries(S, { from: null, to: iso }).filter(r => r.d < iso && r.intake > 0).slice(-5).reverse()
  const configured = d.kcalGoal || todayRows.length || (S.nutrition || []).length

  return <div className="narrow">
    <div className="hdr">
      <div><h1>{t('Diet')}</h1><div className="sub">{t("Today's intake")}</div></div>
      <button className="iconbtn" onClick={dietGoalSheet} aria-label={t('Calorie goal')} title={t('Calorie goal')}><Icon name="target" /></button>
    </div>

    {!configured ? <div className="card">
      <div className="row" style={{ gap: 10, marginBottom: 6 }}>
        <span className="lrow-i"><Icon name="apple" /></span>
        <div className="big" style={{ fontSize: 22 }}>{t('Track your nutrition')}</div>
      </div>
      <div className="muted small" style={{ marginBottom: 12 }}>
        {t('Set a daily calorie goal and log what you eat by meal. Add your height, age and activity to estimate the calories you burn.')}
      </div>
      <Button variant="primary" icon="target" onClick={dietGoalSheet}>{t('Set your goal')}</Button>
    </div> : <>
      <CalorieCard />

      <h4 className="sec">{t('Meals')}</h4>
      <div className="cols">{MEAL_SLOTS.map(slot => {
        const rows = todayRows.filter(r => r.slot === slot)
        const kcal = rows.reduce((s, r) => s + (r.kcal || 0), 0)
        return <div key={slot} className="card" style={{ padding: '12px 14px' }}>
          <div className="row between" style={{ marginBottom: rows.length ? 8 : 0 }}>
            <h3 style={{ margin: 0, fontSize: 15 }}>{t(SLOT_LABEL[slot])}</h3>
            <span className="dim small">{kcal ? fmtNum(Math.round(kcal)) + ' ' + t('kcal') : ''}</span>
          </div>
          {rows.map(r => <SwipeToDelete key={r.id} onDelete={() => removeEntry(r.id)} deleteLabel={t('Remove')}>
            <div className="row between" style={{ padding: '7px 0', borderBottom: 'var(--hair) solid var(--sep)' }}>
              <span className="small" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}{amountLabel(r) ? <span className="dim"> {amountLabel(r)}</span> : null}
              </span>
              <span className="small dim" style={{ flex: 'none', marginLeft: 8 }}>{fmtNum(Math.round(r.kcal || 0))}</span>
            </div>
          </SwipeToDelete>)}
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => addFoodSheet(slot)}>
            <Icon name="plus" /> {t('Add food')}
          </button>
        </div>
      })}</div>

      {recent.length > 0 && <>
        <h4 className="sec">{t('Recent days')}</h4>
        <div className="list" style={{ gap: 0 }}>
          {recent.map(r => <div key={r.d} className="row between" style={{ padding: '10px 2px', borderBottom: 'var(--hair) solid var(--sep)' }}>
            <span className="small muted">{fmtDate(r.d, true)}</span>
            <span className="row small" style={{ gap: 12 }}>
              <b>{fmtNum(r.intake)}{r.goal ? <span className="dim"> / {fmtNum(r.goal)}</span> : ''} {t('kcal')}</b>
              {r.balance != null && <span style={{ color: r.balance < 0 ? 'var(--acc)' : 'var(--yellow)' }}>{(r.balance > 0 ? '+' : '') + fmtNum(r.balance)}</span>}
            </span>
          </div>)}
        </div>
      </>}

      <div className="card tappable" style={{ cursor: 'pointer', marginTop: 12 }} {...tappable(() => nav('/stats'))}>
        <div className="row between">
          <div className="row" style={{ gap: 9 }}>
            <span className="lrow-i" style={{ background: 'var(--blue)' }}><Icon name="chart" /></span>
            <div><div className="lbl2">{t('Diet')}</div><div className="ttl">{t('Intake & expenditure history')}</div></div>
          </div>
          <Icon name="chevronRight" className="chev" />
        </div>
      </div>
    </>}
  </div>
}
