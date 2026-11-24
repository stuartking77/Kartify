// Mirrors the "Setup" tab of the original spreadsheet.

// Sessions are added per event and named by the user (see store.nextSessionName).
// Older saved data used these fixed sessions; they are migrated on load.
export const LEGACY_SESSIONS = [
  ['t1', 'Test 1'], ['t2', 'Test 2'], ['t3', 'Test 3'], ['q', 'Qualifying'],
  ['h1', 'Heat 1'], ['h2', 'Heat 2'], ['f', 'Final'],
];

// Lap times: one value per session, shown at the top of each session.
export const TIMES = [
  { id: 'time',    label: 'Time',     kind: 'text' },
  { id: 'refTime', label: 'Ref time', kind: 'text' },
];

// Setup rows. `sides` lists which of Front (f) / Rear (r) can be adjusted;
// the cells greyed out in the spreadsheet are left out.
// kind: 'num'    -> numeric keypad
//       'signed' -> numeric keypad + a ± button (iOS decimal pad has no minus key)
//       'text'   -> full keyboard
//       'caster' -> top / bottom positions, caster degrees calculated
export const FIELDS = [
  { id: 'hotPressure',  label: 'Hot pressure', kind: 'num', unit: 'psi', sides: ['f', 'r'] },
  { id: 'camber',       label: 'Camber', kind: 'signed', hint: '+ pos / − neg', sides: ['f'] },
  { id: 'caster',       label: 'Caster', kind: 'caster', sides: ['f'] },
  { id: 'toe',          label: 'Toe', kind: 'signed', hint: '+ out / − in', sides: ['f'] },
  { id: 'steeringYoke', label: 'Steering yoke', kind: 'text', sides: ['f'] },
  { id: 'stubPos',      label: 'Stub pos', kind: 'num', hint: '1–5, see Ref', sides: ['f'] },
  { id: 'width',        label: 'Width', kind: 'num', sides: ['f', 'r'] },
  { id: 'wbase',        label: 'Wheelbase', kind: 'text', sides: ['r'] },
  { id: 'seatH',        label: 'Seat height', kind: 'text', sides: ['r'] },
  { id: 'weightDist',   label: 'Weight dist', kind: 'num', sides: ['r'] },
  { id: 'rideH',        label: 'Ride height', kind: 'text', sides: ['f', 'r'] },
  { id: 'jet',          label: 'Jet', kind: 'num', sides: ['f', 'r'] },
  { id: 'pinion',       label: 'Pinion', kind: 'num', sides: ['r'] },
  { id: 'sprocket',     label: 'Sprocket', kind: 'num', sides: ['r'] },
  { id: 'third',        label: '3rd', kind: 'text', sides: ['f', 'r'] },
  { id: 'fBar',         label: 'Front bar', kind: 'text', sides: ['f', 'r'] },
  { id: 'brkPedal',     label: 'Brake pedal', kind: 'num', hint: '1 = top', sides: ['r'] },
  { id: 'brkCyl',       label: 'Brake cyl', kind: 'text', sides: ['r'] },
  { id: 'other1',       label: 'Other', kind: 'text', sides: ['f', 'r'] },
  { id: 'other2',       label: 'Other', kind: 'text', sides: ['f', 'r'] },
  { id: 'other3',       label: 'Other', kind: 'text', sides: ['f', 'r'] },
];

// Caster from the sheet: =16.5 + IF(top="FWD",0,3) + bottom
export const CASTER_BASE = 16.5;
export const CASTER_TOP = ['FWD', 'BACK'];
export const CASTER_BOTTOM = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
export function casterDegrees(top, bottom) {
  if (!top || bottom === '' || bottom == null) return null;
  return CASTER_BASE + (top === 'FWD' ? 0 : 3) + Number(bottom);
}
export const signed = (n) => (Number(n) > 0 ? '+' + n : String(n));
