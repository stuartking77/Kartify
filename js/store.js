import { LEGACY_SESSIONS, FIELDS, TIMES, casterDegrees, signed } from './schema.js';

const KEY = 'kartify.v1';

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function newSession(name = '') {
  return { id: uid(), name, values: {}, notes: '' };
}

// Next session's default name: previous name with its trailing number bumped,
// or " 2" added if it has none. "Test 1" -> "Test 2", "Heat" -> "Heat 2".
export function nextSessionName(prev) {
  const t = (prev || '').trim();
  if (!t) return '';
  const m = t.match(/^(.*?)(\d+)$/);
  return m ? m[1] + (Number(m[2]) + 1) : t + ' 2';
}

// Default name for an unnamed session: only from the session directly before it,
// and only if that one was typed in (it does not cascade further along).
export function defaultSessionName(m, s) {
  const prev = m.sessions[m.sessions.indexOf(s) - 1];
  return prev && prev.name.trim() ? nextSessionName(prev.name) : '';
}

// Name shown on tabs, grid and change record.
export function sessionLabel(m, s) {
  return s.name.trim() || defaultSessionName(m, s) || `Session ${m.sessions.indexOf(s) + 1}`;
}

export const NEW_EVENT_SESSIONS = 7; // same as the spreadsheet's columns

export function newMeeting(partial = {}) {
  return {
    id: uid(), track: '', date: today(), kartClass: '', sessions: Array.from({ length: NEW_EVENT_SESSIONS }, () => newSession()),
    createdAt: Date.now(), updatedAt: Date.now(), ...partial,
  };
}

// Values are stored as strings: values[fieldId] = { f, r }, lap times as { v },
// caster as { top, bottom }.
export function getVal(session, field, side = 'v') {
  const v = session.values[field.id];
  if (!v) return '';
  return v[side] ?? '';
}

export function setVal(session, field, side, value) {
  const cur = session.values[field.id] || {};
  cur[side] = value;
  session.values[field.id] = cur;
}

export function getCaster(session) {
  const v = session.values.caster || {};
  return { top: v.top || '', bottom: v.bottom ?? '' };
}

// Human-readable value for lists, grid and change record.
export function display(session, field, side = 'v', long = false) {
  if (field.kind === 'caster') {
    const { top, bottom } = getCaster(session);
    if (!top && bottom === '') return '';
    const deg = casterDegrees(top, bottom);
    const pos = `${top || '?'} ${bottom === '' ? '?' : signed(bottom)}`;
    if (deg == null) return pos;
    return long ? `${deg.toFixed(1)}° (${pos})` : `${deg.toFixed(1)}°`;
  }
  return getVal(session, field, side);
}

export function sessionHasData(session) {
  if (!session) return false;
  if (session.notes && session.notes.trim()) return true;
  if (TIMES.some((t) => getVal(session, t))) return true;
  return FIELDS.some((f) => f.sides.some((side) => display(session, f, side)));
}

// Compare two sessions' setups. Returns [{ field, side, from, to }].
export function diffSessions(prev, cur) {
  const out = [];
  for (const f of FIELDS) {
    for (const side of f.sides) {
      const a = display(prev, f, side, true), b = display(cur, f, side, true);
      if (a !== b) out.push({ field: f, side, from: a, to: b });
    }
  }
  return out;
}

// Setup values only (no lap times), deep-copied.
export function setupValues(session) {
  const values = JSON.parse(JSON.stringify(session.values));
  for (const t of TIMES) delete values[t.id];
  return values;
}

// Replace a session's setup, keeping its own lap times.
export function applySetup(session, values) {
  const next = JSON.parse(JSON.stringify(values));
  for (const t of TIMES) { if (session.values[t.id]) next[t.id] = session.values[t.id]; else delete next[t.id]; }
  session.values = next;
}

function normalise(data) {
  const setups = Array.isArray(data?.setups) ? data.setups : [];
  if (!data || !Array.isArray(data.meetings)) return { version: 2, meetings: [], setups };
  for (const m of data.meetings) {
    if (!Array.isArray(m.sessions)) {
      // v1: fixed sessions keyed t1..f. Keep the ones that were used.
      const old = m.sessions || {};
      m.sessions = LEGACY_SESSIONS.map(([k, name]) => ({ ...newSession(name), values: old[k]?.values || {}, notes: old[k]?.notes || '' }));
    }
    for (const s of m.sessions) { s.id ||= uid(); s.values ||= {}; s.name ??= ''; s.notes ??= ''; }
    if (!m.sessions.length) m.sessions.push(newSession());
  }
  return { version: 2, meetings: data.meetings, setups };
}

export function load() {
  try { return normalise(JSON.parse(localStorage.getItem(KEY))); }
  catch { return normalise(null); }
}

let saveTimer = null;
export function save(state, immediate = false) {
  clearTimeout(saveTimer);
  const write = () => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { alert('Could not save: ' + e.message); }
  };
  if (immediate) write(); else saveTimer = setTimeout(write, 250);
}

export function exportJSON(state) {
  return JSON.stringify({ app: 'kartify', exportedAt: new Date().toISOString(), ...state }, null, 2);
}

// Merge imported events by id; imported copy wins if newer.
export function importJSON(state, text) {
  const incoming = normalise(JSON.parse(text));
  let added = 0, updated = 0;
  for (const m of incoming.meetings) {
    const i = state.meetings.findIndex((x) => x.id === m.id);
    if (i === -1) { state.meetings.push(m); added++; }
    else if ((m.updatedAt || 0) > (state.meetings[i].updatedAt || 0)) { state.meetings[i] = m; updated++; }
  }
  for (const s of incoming.setups) {
    if (!state.setups.some((x) => x.id === s.id)) { state.setups.push(s); added++; }
  }
  return { added, updated };
}
