// Tyre pressures, from the "Pressure Set" tab of the spreadsheet (up to CORR COLD).
// Each session can have several tyres (tabs); each tyre has Front and Rear values.

// psiPerDeg: pressure change per °C of rim temperature. refTemp: temperature REF is quoted at.
// refRise: the generic hot/cold rise (absolute pressure) that Rise coeff is compared against.
import { effectiveValues } from './store.js';

export const PRESSURE_DEFAULTS = { psiPerDeg: 0.1, refTemp: 5, refRise: 1.1 };
const ATM = 14.5; // psi, to work in absolute pressure

export const P_INPUTS = [
  { id: 'rimT',   label: 'Rim T',        unit: '°C' },
  { id: 'cold',   label: 'Cold set',     unit: 'psi' },
  { id: 'hot',    label: 'Hot pressure', unit: 'psi' },
  { id: 'target', label: 'New target',   unit: 'psi' },
];

// Four corners; `axle` links each to the Front/Rear target in the Setup.
export const CORNERS = [
  { id: 'lf', label: 'L', axle: 'f' }, { id: 'rf', label: 'R', axle: 'f' },
  { id: 'lr', label: 'L', axle: 'r' }, { id: 'rr', label: 'R', axle: 'r' },
];
const axleOf = (corner) => CORNERS.find((c) => c.id === corner).axle;

export function settingsOf(m) {
  return { ...PRESSURE_DEFAULTS, ...(m.pressure || {}) };
}

export function newTyre(name = '') {
  return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, lf: {}, rf: {}, lr: {}, rr: {} };
}

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const key = (t, i) => (t.name || '').trim().toLowerCase() || `#${i}`;

export function tyreHasData(t) {
  return CORNERS.some((c) => P_INPUTS.some((p) => (t[c.id]?.[p.id] ?? '') !== ''));
}

// Same tyre (by name, or by position if unnamed) in an earlier session.
function sameTyre(session, t, idx) {
  const list = session.tyres || [];
  return list.find((x, i) => key(x, i) === key(t, idx));
}

// The session's target hot pressure from the Setup (front or rear, as carried through sessions).
export function setupTarget(m, s, corner) {
  return effectiveValues(m, m.sessions.indexOf(s)).hotPressure?.[axleOf(corner)] ?? '';
}

// Target hot pressure when not typed for this tyre: the session's target from the Setup
// (Target hot pressure row, as carried through the sessions), else this tyre's target from
// its closest earlier session that had a cold pressure set.
export function carriedTarget(m, s, t, side) {
  const setupTarget = effectiveValues(m, m.sessions.indexOf(s)).hotPressure?.[axleOf(side)];
  if (setupTarget) return setupTarget;
  const idx = (s.tyres || []).indexOf(t);
  for (let i = m.sessions.indexOf(s) - 1; i >= 0; i--) {
    const pt = sameTyre(m.sessions[i], t, idx);
    if (pt && (pt[side]?.cold ?? '') !== '' && (pt[side]?.target ?? '') !== '') return pt[side].target;
  }
  return '';
}

// Calculated values for one corner (lf/rf/lr/rr) of one tyre.
export function calc(m, s, t, side) {
  const st = settingsOf(m);
  const v = t[side] || {};
  const rimT = num(v.rimT), K = num(v.cold), Q = num(v.hot);
  const W = num(v.target ?? '') ?? num(carriedTarget(m, s, t, side));
  const rise = num(st.refRise) ?? PRESSURE_DEFAULTS.refRise;
  const out = { ref: null, riseCoeff: null, corrDelta: null, corrCold: null, target: W };
  if (rimT != null && K != null) out.ref = (st.refTemp - rimT) * st.psiPerDeg + K;
  if (Q != null && K != null) out.riseCoeff = ((Q + ATM) / (K + ATM)) / rise;
  if (K != null && Q != null && W != null) {
    out.corrDelta = ((W + ATM) - ((Q - K) / (Q + ATM)) * (W + ATM)) - ATM - K;
    out.corrCold = K + out.corrDelta;
  }
  return out;
}

// When a session has no tyres yet, start with the previous session's tyres (names only),
// or one tyre named after the session's tyre.
// Earlier versions stored Front/Rear only; keep them as the left-hand corners.
export function upgradeTyre(t) {
  if (t.f || t.r) { t.lf ||= t.f || {}; t.lr ||= t.r || {}; delete t.f; delete t.r; }
  for (const c of CORNERS) t[c.id] ||= {};
}

export function initialTyres(m, s, sessionTyreName) {
  for (let i = m.sessions.indexOf(s) - 1; i >= 0; i--) {
    const list = m.sessions[i].tyres || [];
    if (list.some(tyreHasData)) return list.map((t) => newTyre(t.name));
  }
  return [newTyre(sessionTyreName || '')];
}

// Tidy number for display/storage: at most 2 decimals, no trailing zeros.
export const tidy = (n) => String(Number(Number(n).toFixed(2)));

