import { useStore } from '../store/useStore.js'
import { fmtNum, todayISO } from '../lib/format.js'
import { t } from '../lib/i18n.js'
import { dietOf, dayTotals, estimatedExpenditure } from '../lib/nutrition.js'
import { dietGoalSheet } from '../sheets.jsx'
import { Button } from './ui.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'

// Today's calories against the goal and the estimated burn — the shared summary card,
// shown on both the Diet screen and the Home glance (where `onClick` taps through to /diet).
export default function CalorieCard({ onClick }) {
  const S = useStore(s => s.S)
  const d = dietOf(S)
  const iso = todayISO()
  const tot = dayTotals(S.nutrition, iso)
  const exp = estimatedExpenditure(S, iso)
  const balance = exp.total == null ? null : Math.round(tot.kcal - exp.total)
  const macros = d.macroGoal
  const wrap = onClick ? { className: 'card tappable', style: { cursor: 'pointer' }, ...tappable(onClick) } : { className: 'card' }

  return <div {...wrap}>
    <div className="row between" style={{ marginBottom: 6, alignItems: 'baseline' }}>
      <h2 style={{ margin: 0 }}>{t('Calories')}</h2>
      <Button size="sm" icon="target" style={d.kcalGoal ? { color: 'var(--yellow)' } : undefined}
        onClick={e => { e.stopPropagation(); dietGoalSheet() }}>
        {d.kcalGoal ? fmtNum(d.kcalGoal) : t('Goal')}
      </Button>
    </div>
    <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
      <div className="big">{fmtNum(Math.round(tot.kcal))}{d.kcalGoal ? <span className="muted" style={{ fontSize: '1rem' }}> / {fmtNum(d.kcalGoal)}</span> : null}
        <span className="muted" style={{ fontSize: '1rem' }}> {t('kcal')}</span></div>
      {d.kcalGoal ? <span className="dim small" style={{ marginLeft: 'auto' }}>
        {tot.kcal > d.kcalGoal ? t('{0} over', fmtNum(Math.round(tot.kcal - d.kcalGoal))) : t('{0} left', fmtNum(Math.round(d.kcalGoal - tot.kcal)))}
      </span> : null}
    </div>
    {d.kcalGoal ? <div style={{ marginTop: 8 }}>
      <span style={{ display: 'block', width: '100%', height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', borderRadius: 3, width: Math.min(100, Math.round(tot.kcal / d.kcalGoal * 100)) + '%', background: tot.kcal > d.kcalGoal ? 'var(--red)' : 'var(--acc)' }} />
      </span>
    </div> : null}

    {macros ? <div style={{ marginTop: 12 }}>
      {[['p', 'Protein'], ['c', 'Carbs'], ['f', 'Fat']].map(([k, label]) => (
        <div key={k} className="mrow">
          <span className="nm">{t(label)}</span>
          <span className="bar"><i style={{ width: (macros[k] > 0 ? Math.min(100, Math.round(tot[k] / macros[k] * 100)) : 0) + '%' }} /></span>
          <span className="v">{fmtNum(Math.round(tot[k]))}{macros[k] ? ' / ' + fmtNum(macros[k]) : ''} g</span>
        </div>
      ))}
    </div> : null}

    <div className="row between small" style={{ marginTop: 14, paddingTop: 10, borderTop: 'var(--hair) solid var(--sep)' }}>
      <span className="muted">{t('Estimated expenditure')}</span>
      <span>{exp.total == null
        ? <button className="chip nocap" style={{ padding: '3px 10px', fontSize: 12 }} onClick={e => { e.stopPropagation(); dietGoalSheet() }}>{t('Set your profile to estimate')}</button>
        : <b>{fmtNum(exp.total)} {t('kcal')}</b>}</span>
    </div>
    {exp.total != null && <div className="small dim" style={{ marginTop: 3 }}>
      {exp.tdee != null ? t('Base {0}', fmtNum(exp.tdee)) : t('Base —')}{exp.workout > 0 ? ' · ' + t('workout {0}', fmtNum(exp.workout)) : ''}
    </div>}
    {balance != null && <div className="row between small" style={{ marginTop: 6 }}>
      <span className="muted">{t('Balance')}</span>
      <b style={{ color: balance < 0 ? 'var(--acc)' : balance > 0 ? 'var(--yellow)' : 'var(--label-2)' }}>
        {(balance > 0 ? '+' : '') + fmtNum(balance)} {t('kcal')} · {balance <= 0 ? t('Deficit') : t('Surplus')}
      </b>
    </div>}
  </div>
}
