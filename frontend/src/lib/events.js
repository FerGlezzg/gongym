// Custom calendar events — a race, a match, a surf session. Pure helpers, unit-tested in
// events.test.js. An event is { id, d:'YYYY-MM-DD', name, emoji, start?:'HH:MM', end?:'HH:MM',
// met?, kcalPerHour? }. With a start+end it also counts as activity: it shades the heatmap and,
// when it carries a MET (built-in type) or a kcal/hour (a type the user made), feeds the
// estimated daily expenditure.

// Built-in activity types. MET values from the Compendium of Physical Activities (general
// recreational intensity); kcal ≈ MET × bodyweight(kg) × hours.
export const DEFAULT_EVENT_TYPES = [
  { key: 'run', name: 'Running', emoji: '🏃', met: 9.8 },
  { key: 'cycling', name: 'Cycling', emoji: '🚴', met: 8 },
  { key: 'football', name: 'Football', emoji: '⚽', met: 7 },
  { key: 'basketball', name: 'Basketball', emoji: '🏀', met: 6.5 },
  { key: 'racket', name: 'Tennis / padel', emoji: '🎾', met: 7 },
  { key: 'swimming', name: 'Swimming', emoji: '🏊', met: 7 },
  { key: 'surf', name: 'Surf', emoji: '🏄', met: 5 },
  { key: 'hiking', name: 'Hiking', emoji: '🥾', met: 6 },
  { key: 'climbing', name: 'Climbing', emoji: '🧗', met: 8 },
  { key: 'skiing', name: 'Skiing / snowboard', emoji: '⛷️', met: 7 },
  { key: 'dancing', name: 'Dancing', emoji: '💃', met: 5 },
  { key: 'walk', name: 'Walk', emoji: '🚶', met: 3.5 },
  { key: 'other', name: 'Other', emoji: '📅', met: 0 },
]

/** Built-in types plus the user's own (S.eventTypes), each with a stable `key`. */
export function eventTypes(S) {
  const custom = ((S && S.eventTypes) || []).map(t => ({ ...t, key: t.id, custom: true }))
  return [...DEFAULT_EVENT_TYPES, ...custom]
}

const parse = hhmm => {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

/** Duration in minutes from start/end (wrapping past midnight); 0 when either is missing. */
export function eventMinutes(ev) {
  const a = parse(ev && ev.start), b = parse(ev && ev.end)
  if (a == null || b == null) return 0
  let mins = b - a
  if (mins < 0) mins += 1440
  return mins
}

/**
 * Estimated kcal burned by a timed event. Uses the event's MET × bodyweight, or its flat
 * kcal/hour when it has one (types the user created). 0 without a duration or an intensity.
 */
export function eventKcal(ev, bodyweightKg) {
  const hours = eventMinutes(ev) / 60
  if (hours <= 0) return 0
  const met = Number(ev && ev.met)
  const per = Number(ev && ev.kcalPerHour)
  const kg = Number(bodyweightKg)
  if (met > 0 && kg > 0) return Math.round(met * kg * hours)
  if (per > 0) return Math.round(per * hours)
  return 0
}

/** "18:00 – 19:30" or "" when the event has no time. */
export function eventTimeLabel(ev) {
  return ev && ev.start && ev.end ? `${ev.start} – ${ev.end}` : ''
}

export const timeLike = v => /^\d{1,2}:\d{2}$/.test(v || '')

// --- notifications -------------------------------------------------------------
// An event can nudge you: `notify: { before: minutes|null, allDay: boolean }`. `before`
// fires that long before the start time; `allDay` fires the morning of the event day.
export const NOTIFY_BEFORE = [
  { value: 0, label: 'At start' },
  { value: 15, label: '15 min before' },
  { value: 30, label: '30 min before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
]

/**
 * The local wall-clock times an event's notifications should fire at.
 * @returns {Array<{ kind: 'before'|'allDay', at: Date }>}
 */
export function eventNotifTimes(ev, dailyTime = '08:00') {
  const nf = ev && ev.notify
  if (!nf || !ev.d) return []
  const [y, mo, d] = String(ev.d).split('-').map(Number)
  const out = []
  if (nf.before != null && timeLike(ev.start)) {
    const [h, m] = ev.start.split(':').map(Number)
    out.push({ kind: 'before', at: new Date(y, mo - 1, d, h, m - nf.before) })   // negative minute rolls back
  }
  if (nf.allDay) {
    const [h, m] = (timeLike(dailyTime) ? dailyTime : '08:00').split(':').map(Number)
    out.push({ kind: 'allDay', at: new Date(y, mo - 1, d, h, m) })
  }
  return out
}

// Repeating an event just generates that many independent rows ahead of time — no
// recurrence engine, every occurrence is a normal event that can be edited or deleted on
// its own (or as a series, via the shared `series` id). `count` is how far ahead to fill.
export const RECUR = {
  none: { label: 'No repeat', count: 1 },
  weekly: { label: 'Weekly', count: 26, days: 7 },
  biweekly: { label: 'Every 2 weeks', count: 13, days: 14 },
  monthly: { label: 'Monthly', count: 12, months: 1 },
  quarterly: { label: 'Every 3 months', count: 8, months: 3 },
  yearly: { label: 'Yearly', count: 6, months: 12 },
}

const pad = n => String(n).padStart(2, '0')
const localIso = dt => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`

/**
 * The list of ISO dates an event on `iso` covers at frequency `freq` (the first is `iso`
 * itself). Month steps clamp overflow — the 31st in a short month lands on its last day.
 */
export function expandRecurrence(iso, freq) {
  const cfg = RECUR[freq] || RECUR.none
  const [y, m, d] = String(iso).split('-').map(Number)
  const out = []
  for (let i = 0; i < cfg.count; i++) {
    let dt
    if (cfg.days) dt = new Date(y, m - 1, d + cfg.days * i)
    else if (cfg.months) {
      dt = new Date(y, m - 1 + cfg.months * i, d)
      if (dt.getDate() !== d) dt = new Date(y, m - 1 + cfg.months * i + 1, 0)   // clamp to month end
    } else dt = new Date(y, m - 1, d)
    out.push(localIso(dt))
  }
  return out
}
