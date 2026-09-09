// Custom calendar events — a race, a match, a surf session. Pure helpers, unit-tested in
// events.test.js. An event is { id, d:'YYYY-MM-DD', name, emoji, start?:'HH:MM', end?:'HH:MM',
// met?, kcalPerHour? }. With a start+end it also counts as activity: it shades the heatmap and,
// when it carries a MET (built-in type) or a kcal/hour (a type the user made), feeds the
// estimated daily expenditure.

// Built-in activity types. MET values from the Compendium of Physical Activities (general
// recreational intensity); kcal ≈ MET × bodyweight(kg) × hours.
// `emoji` holds an openGym icon key, not a literal emoji — the same move routines made
// (see lib/glyphs.js): the chrome is stroke icons that take a theme colour, never emoji.
// eventIconOf() still reads the old literal-emoji values so synced state needs no migration.
export const DEFAULT_EVENT_TYPES = [
  { key: 'run', name: 'Running', emoji: 'figureRun', met: 9.8 },
  { key: 'cycling', name: 'Cycling', emoji: 'bike', met: 8 },
  { key: 'football', name: 'Football', emoji: 'flag', met: 7 },
  { key: 'basketball', name: 'Basketball', emoji: 'flag', met: 6.5 },
  { key: 'racket', name: 'Tennis / padel', emoji: 'flag', met: 7 },
  { key: 'swimming', name: 'Swimming', emoji: 'swim', met: 7 },
  { key: 'surf', name: 'Surf', emoji: 'surf', met: 5 },
  { key: 'hiking', name: 'Hiking', emoji: 'figureRun', met: 6 },
  { key: 'climbing', name: 'Climbing', emoji: 'pullup', met: 8 },
  { key: 'skiing', name: 'Skiing / snowboard', emoji: 'figureRun', met: 7 },
  { key: 'dancing', name: 'Dancing', emoji: 'stretch', met: 5 },
  { key: 'walk', name: 'Walk', emoji: 'figureRun', met: 3.5 },
  { key: 'other', name: 'Other', emoji: 'calendar', met: 0 },
]

// The icons the new-activity-type form and the per-event override offer.
export const EVENT_ICONS = [
  'figureRun', 'bike', 'swim', 'surf', 'boxing', 'pullup', 'stretch', 'dumbbell', 'kettlebell',
  'heart', 'flame', 'bolt', 'target', 'flag', 'trophy', 'medal', 'star', 'rocket',
  'sparkles', 'globe', 'apple', 'clock', 'calendar',
]
export const DEFAULT_EVENT_ICON = 'calendar'

// Legacy literal-emoji → icon key, so events and custom types saved before the icon switch
// (and any state synced from an older build) still show a sensible glyph.
const EVENT_LEGACY = {
  '🏃': 'figureRun', '🏃‍♀️': 'figureRun', '🚶': 'figureRun', '🥾': 'figureRun', '🏔️': 'figureRun', '⛰️': 'figureRun',
  '🚴': 'bike', '🏊': 'swim', '🏄': 'surf', '🏄‍♂️': 'surf', '🏄‍♀️': 'surf', '🚣': 'swim', '⛷️': 'figureRun', '🏂': 'figureRun', '⛸️': 'figureRun', '🛹': 'figureRun',
  '⚽': 'flag', '🏀': 'flag', '🎾': 'flag', '🏐': 'flag', '🏈': 'flag', '🏓': 'flag', '⛳': 'flag', '🎳': 'flag',
  '🥊': 'boxing', '🧗': 'pullup', '🤸': 'stretch', '🧘': 'stretch', '🧘‍♀️': 'stretch', '💃': 'stretch',
  '🏋️': 'dumbbell', '🏆': 'trophy', '🥇': 'medal', '⭐': 'star', '🎯': 'target', '🔥': 'flame', '⚡': 'bolt',
  '❤️': 'heart', '❤️‍🔥': 'heart', '🚀': 'rocket', '🌍': 'globe', '🍎': 'apple', '📅': 'calendar', '🗓️': 'calendar',
}

/** An event's / activity type's `emoji` value resolved to an openGym icon name. */
export function eventIconOf(v) {
  if (!v) return DEFAULT_EVENT_ICON
  if (EVENT_LEGACY[v]) return EVENT_LEGACY[v]
  const base = [...String(v)].filter(c => c !== '️' && c !== '‍')[0]
  if (EVENT_LEGACY[base]) return EVENT_LEGACY[base]
  return /^[a-zA-Z]+$/.test(v) ? v : DEFAULT_EVENT_ICON
}

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

/**
 * The frequency key an occurrence repeats at, read back from its series: the gap between
 * this event's date and its next sibling's. 'none' when it has no series or no later sibling.
 */
export function seriesFrequency(events, event) {
  if (!event || !event.series) return 'none'
  const next = (events || [])
    .filter(e => e.series === event.series && e.d > event.d)
    .map(e => e.d)
    .sort()[0]
  if (!next) return 'none'
  return Object.keys(RECUR).find(f => f !== 'none' && expandRecurrence(event.d, f)[1] === next) || 'none'
}

/** Whether this event is currently one of several sharing a series — i.e. it actually repeats. */
export function eventRepeats(events, event) {
  return !!(event && event.series && (events || []).some(e => e.series === event.series && e.id !== event.id))
}

/**
 * Plan an edit to `event` whose recurrence may have changed from `prevFreq` to `freq`.
 * Only a changed frequency touches the series; then it rewrites this occurrence forward.
 * Turning the repeat off detaches this occurrence from the series (later ones are dropped),
 * so it stops reading as "repeats". Pure — returns the ids to drop and the dates to
 * (re)create, for the caller to apply.
 * @returns {{ series: string|null, removeIds: string[], forwardDates: string[] }}
 */
export function planEventEdit(events, event, { date, freq, prevFreq, seriesId }) {
  const recurChanged = freq !== prevFreq
  const forwardDates = recurChanged && freq !== 'none' ? expandRecurrence(date, freq).slice(1) : []
  const series = forwardDates.length ? seriesId : (freq === 'none' ? null : (event.series || null))
  const removeIds = recurChanged && event.series
    ? (events || []).filter(x => x.series === event.series && x.id !== event.id && x.d > date).map(x => x.id)
    : []
  return { series, removeIds, forwardDates }
}
