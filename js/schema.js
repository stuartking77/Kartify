// Mirrors the "Setup" tab of the original spreadsheet.

// Sessions are added per event and named by the user (see store.nextSessionName).
// Older saved data used these fixed sessions; they are migrated on load.
export const LEGACY_SESSIONS = [
  ['t1', 'Test 1'], ['t2', 'Test 2'], ['t3', 'Test 3'], ['q', 'Qualifying'],
  ['h1', 'Heat 1'], ['h2', 'Heat 2'], ['f', 'Final'],
];

// Session info at the top of each session (not part of a saved setup).
// carry: blank shows the value from the closest earlier session (greyed), like setup values.
export const TIMES = [
  { id: 'tyre',    label: 'Tyre',     kind: 'text', wide: true, carry: true, placeholder: 'e.g. Komet K2H set 1' },
  { id: 'comment', label: 'Comment',  kind: 'text', wide: true, placeholder: 'Short comment' },
  { id: 'time',    label: 'Time',     kind: 'num' },
  { id: 'refTime', label: 'Ref Time', kind: 'num' },
];

// Setup rows. `sides` lists which of Front (f) / Rear (r) can be adjusted;
// the cells greyed out in the spreadsheet are left out.
// kind: 'num'    -> numeric keypad
//       'text'   -> full keyboard
//       'dir'    -> number plus a direction button (camber POS/NEG, toe IN/OUT)
//       'choice' -> buttons, pick one of `options` (steering yoke, wheelbase, 3rd, front bar)
//       'select' -> drop-down of `options` (stub pos, pinion)
//       'caster' -> top / bottom positions, caster degrees calculated
export const FIELDS = [
  { id: 'hotPressure',  label: 'Target Hot', kind: 'num', link: 'pressure', sides: ['f', 'r'] },
  { id: 'camber',       label: 'Camber', kind: 'dir', options: ['POS', 'NEG'], sides: ['f'] },
  { id: 'caster',       label: 'Caster', kind: 'caster', ref: 'caster', sides: ['f'] },
  { id: 'toe',          label: 'Toe', kind: 'dir', options: ['IN', 'OUT'], sides: ['f'] },
  { id: 'steeringYoke', label: 'Steering Yoke', kind: 'choice', sides: ['f'],
    options: [{ v: 'SHORT', note: 'LIGHT' }, { v: 'LONG', note: 'HEAVY' }] },
  { id: 'stubPos',      label: 'Stub Pos', kind: 'select', options: ['1', '2', '3', '4', '5'], ref: 'stub', sides: ['f'] },
  { id: 'width',        label: 'Width', kind: 'num', sides: ['f', 'r'] },
  { id: 'wbase',        label: 'Wheelbase', kind: 'choice', options: ['S', 'M', 'L'], sides: ['r'] },
  { id: 'seatH',        label: 'Seat Height', kind: 'text', wideInput: true, sides: ['r'] },
  { id: 'seatPos',      label: 'Seat Pos', kind: 'text', wideInput: true, sides: ['r'] },
  { id: 'weightDist',   label: 'Weight Dist', kind: 'num', sides: ['r'] },
  { id: 'rideH',        label: 'Ride Height', kind: 'select', options: ['LOW', 'STD', 'HIGH'], sides: ['f', 'r'] },
  { id: 'third',        label: '3rd', kind: 'choice', options: ['IN', 'OUT'], sides: ['r'] },
  { id: 'fBar',         label: 'Front Bar', kind: 'choice', options: ['OUT', 'NYLON', 'STEEL'], sides: ['f'] },
  { id: 'jet',          label: 'Jet', kind: 'num', sides: ['r'] },
  { id: 'pinion',       label: 'Pinion', kind: 'select', options: ['10', '11', '12', '13', '14'], sides: ['r'] },
  { id: 'sprocket',     label: 'Sprocket', kind: 'num', sides: ['r'] },
  { id: 'brkPedal',     label: 'Brake Pedal Pos', kind: 'num', hint: '1 = top', ref: 'brake', sides: ['r'] },
  { id: 'brkCyl',       label: 'Master Cyl Pos', kind: 'text', sides: ['r'] },
  { id: 'other1',       label: 'Other', kind: 'text', sides: ['f', 'r'] },
  { id: 'other2',       label: 'Other', kind: 'text', sides: ['f', 'r'] },
  { id: 'other3',       label: 'Other', kind: 'text', sides: ['f', 'r'] },
];

// Caster from the sheet: =16.5 + IF(bottom="FWD",0,3) + top
// Top position is -4..+4, bottom position is FWD/BACK.
export const CASTER_BASE = 16.5;
export const CASTER_TOP = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
export const CASTER_BOTTOM = ['FWD', 'BACK'];
export function casterDegrees(top, bottom) {
  if (top === '' || top == null || !bottom) return null;
  return CASTER_BASE + (bottom === 'FWD' ? 0 : 3) + Number(top);
}
export const signed = (n) => (Number(n) > 0 ? '+' + n : String(n));
