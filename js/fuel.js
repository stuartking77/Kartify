// Fuel, from the "Fuel Race" tab of the spreadsheet.
// The tank is measured with a dipstick in mm; the calibration table converts mm <-> litres
// (straight-line between the points, like the sheet's interpolating lookup).

export const FUEL_DEFAULTS = {
  table: [[29, 1], [54, 2], [79, 3], [104, 4], [126, 5], [151, 6], [173, 7], [212, 8], [280, 9]],
  minWeight: 162,   // kg
  margin: 0.5,      // kg above min weight to finish at
  density: 0.75,    // kg per litre
};

// The tank table is shared by all events (kept in the app's saved data, set by the app).
let tankTable = null;
export function setTankTable(t) { tankTable = t; }
export function cleanTable(t) {
  return (t || []).map(([a, b]) => [Number(a), Number(b)])
    .filter(([a, b]) => a !== '' && b !== '' && isFinite(a) && isFinite(b)).sort((x, y) => x[0] - y[0]);
}

export function fuelSettings(m) {
  const f = { ...FUEL_DEFAULTS, ...(m.fuel || {}) };
  const t = cleanTable(tankTable);
  f.table = (t.length >= 2 ? t : FUEL_DEFAULTS.table)
    .map(([a, b]) => [Number(a), Number(b)]).filter(([a, b]) => isFinite(a) && isFinite(b)).sort((x, y) => x[0] - y[0]);
  for (const k of ['minWeight', 'margin', 'density']) f[k] = Number(f[k]);
  return f;
}

const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));

// Piecewise-linear lookup from column `from` to column `to`, extending the end segments.
function lookup(x, table, from, to) {
  if (x == null || table.length < 2) return null;
  const pts = [...table].sort((a, b) => a[from] - b[from]);
  let i = pts.findIndex((p) => p[from] >= x);
  if (i === -1) i = pts.length - 1; else if (i === 0) i = 1;
  const [a, b] = [pts[i - 1], pts[i]];
  const y = a[to] + ((x - a[from]) * (b[to] - a[to])) / (b[from] - a[from]);
  return Math.max(0, y);
}
export const litresFromMm = (mm, table) => lookup(num(mm), table, 0, 1);
export const mmFromLitres = (l, table) => lookup(num(l), table, 1, 0);

export function fuelHasData(f) {
  return !!f && Object.values(f).some((v) => v !== '' && v != null);
}

// All the calculated values for one session's fuel.
export function fuelCalc(m, s) {
  const st = fuelSettings(m);
  const f = s.fuel || {};
  const startL = litresFromMm(f.start, st.table);
  const endL = litresFromMm(f.end, st.table);
  const used = startL != null && endL != null ? startL - endL : null;
  const mins = num(f.mins);
  const perMin = used != null && mins ? used / mins : null;
  const next = num(f.nextMins);
  const needed = next != null && perMin != null ? next * perMin : null;
  const totalNeeded = needed != null && endL != null ? endL + needed : null;
  const w = num(f.endWeight);
  const delta = w != null ? w - st.minWeight - st.margin : null;
  const forWeight = delta != null ? -(delta / st.density) : null;
  const uplift = forWeight != null && needed != null ? needed + forWeight : null;
  const upliftTotal = uplift != null && endL != null ? uplift + endL : null;
  const add = num(f.add) ?? uplift;
  const inTank = add != null && endL != null ? endL + add : null;
  const fillMm = inTank != null ? mmFromLitres(inTank, st.table) : null;
  return { st, startL, endL, used, perMin, needed, totalNeeded, delta, forWeight, uplift, upliftTotal, add, inTank, fillMm };
}
