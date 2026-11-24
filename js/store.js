import { SESSIONS, FIELDS } from './schema.js';

const KEY = 'kartify.v1';

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function emptySession() {
  return { values: {}, notes: '', wets: false };
}

export function newMeeting(partial = {}) {
  const sessions = {};
  for (const s of SESSIONS) sessions[s.id] = emptySession();
  return {
    id: uid(),
    track: '',
    date: today(),
    kartClass: '',
    sessions,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...partial,
  };
}

// Field value accessors. Values are stored as strings: values[fieldId] = { f, r } or { v } for single fields.
export function getVal(session, field, side) {
  const v = session.values[field.id];
  if (!v) return '';
  return (field.single ? v.v : v[side]) ?? '';
}

export function setVal(session, field, side, value) {
  const cur = session.values[field.id] || {};
  if (field.single) cur.v = value; else cur[side] = value;
  session.values[field.id] = cur;
}

export function sessionHasData(session) {
  if (!session) return false;
  if (session.notes && session.notes.trim()) return true;
  return FIELDS.some((f) =>
    f.single ? !!getVal(session, f) : !!(getVal(session, f, 'f') || getVal(session, f, 'r')));
}

function normalise(data) {
  if (!data || !Array.isArray(data.meetings)) return { version: 1, meetings: [] };
  for (const m of data.meetings) {
    m.sessions ||= {};
    for (const s of SESSIONS) {
      m.sessions[s.id] ||= emptySession();
      m.sessions[s.id].values ||= {};
    }
  }
  return { version: 1, meetings: data.meetings };
}

export function load() {
  try {
    return normalise(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return normalise(null);
  }
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

// Merge imported meetings by id; imported copy wins if newer.
export function importJSON(state, text) {
  const incoming = normalise(JSON.parse(text));
  let added = 0, updated = 0;
  for (const m of incoming.meetings) {
    const i = state.meetings.findIndex((x) => x.id === m.id);
    if (i === -1) { state.meetings.push(m); added++; }
    else if ((m.updatedAt || 0) > (state.meetings[i].updatedAt || 0)) { state.meetings[i] = m; updated++; }
  }
  return { added, updated };
}

// Compare two sessions' setups. Returns [{ field, side, from, to }] for every value that differs.
// Lap times are excluded – they are results, not setup.
export function diffSessions(prev, cur) {
  const out = [];
  for (const f of FIELDS) {
    if (f.id === 'time' || f.id === 'refTime') continue;
    for (const side of f.single ? ['v'] : ['f', 'r']) {
      const a = getVal(prev, f, side), b = getVal(cur, f, side);
      if (a !== b && (a || b)) out.push({ field: f, side, from: a, to: b });
    }
  }
  return out;
}
