// Mirrors the "Setup" tab of the original spreadsheet.

export const SESSIONS = [
  { id: 't1', label: 'Test 1', short: 'T1' },
  { id: 't2', label: 'Test 2', short: 'T2' },
  { id: 't3', label: 'Test 3', short: 'T3' },
  { id: 'q',  label: 'Qualifying', short: 'Q' },
  { id: 'h1', label: 'Heat 1', short: 'H1' },
  { id: 'h2', label: 'Heat 2', short: 'H2' },
  { id: 'f',  label: 'Final', short: 'F' },
];

// kind: 'num'    -> numeric keypad
//       'signed' -> numeric keypad + a ± button (iOS decimal pad has no minus key)
//       'text'   -> full keyboard
// single: one value per session instead of Front/Rear
export const FIELDS = [
  { id: 'hotPressure',  label: 'Hot pressure', kind: 'num', unit: 'psi' },
  { id: 'camber',       label: 'Camber', kind: 'signed', hint: '+ pos / − neg' },
  { id: 'caster',       label: 'Caster', kind: 'num', unit: '°' },
  { id: 'toe',          label: 'Toe', kind: 'signed', hint: '+ out / − in' },
  { id: 'steeringYoke', label: 'Steering yoke', kind: 'text' },
  { id: 'stubPos',      label: 'Stub pos', kind: 'num', hint: '1–5, see Ref' },
  { id: 'width',        label: 'Width', kind: 'num' },
  { id: 'wbase',        label: 'Wheelbase', kind: 'text' },
  { id: 'seatH',        label: 'Seat height', kind: 'text' },
  { id: 'weightDist',   label: 'Weight dist', kind: 'num' },
  { id: 'rideH',        label: 'Ride height', kind: 'text' },
  { id: 'jet',          label: 'Jet', kind: 'num' },
  { id: 'pinion',       label: 'Pinion', kind: 'num' },
  { id: 'sprocket',     label: 'Sprocket', kind: 'num' },
  { id: 'third',        label: '3rd', kind: 'text' },
  { id: 'fBar',         label: 'Front bar', kind: 'text' },
  { id: 'brkPedal',     label: 'Brake pedal', kind: 'num', hint: '1 = top' },
  { id: 'brkCyl',       label: 'Brake cyl', kind: 'text' },
  { id: 'other1',       label: 'Other', kind: 'text' },
  { id: 'other2',       label: 'Other', kind: 'text' },
  { id: 'other3',       label: 'Other', kind: 'text' },
  { id: 'time',         label: 'Time', kind: 'text', single: true },
  { id: 'refTime',      label: 'Ref time', kind: 'text', single: true },
];

// Caster calculator from the sheet: =16.5 + IF(pos="FWD",0,3) + offset
export const CASTER_BASE = 16.5;
export const CASTER_OFFSETS = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
export function casterDegrees(position, offset) {
  return CASTER_BASE + (position === 'FWD' ? 0 : 3) + Number(offset);
}
