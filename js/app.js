import { FIELDS, TIMES, CASTER_TOP, CASTER_BOTTOM, casterDegrees, signed } from './schema.js';
import * as store from './store.js';
import * as P from './pressure.js';
import * as F from './fuel.js';

const state = store.load();
F.setTankTable(state.tank);
const $app = document.getElementById('app');
const $hdr = document.getElementById('hdr');
const $nav = document.getElementById('nav');
const ui = { session: null, view: 'session', tyre: null }; // view: session | pressure | grid

const LOGO = `<svg class="logo" viewBox="0 0 86 86" aria-label="Shift Motorsport"><defs><mask id="sm_logo"><rect width="86" height="86" fill="#fff"/><path d="M25 0h5v30H0v-5h25zM56 0h5v61H0v-5h56z" fill="#000"/></mask></defs><rect width="86" height="86" rx="7" fill="var(--acc)" mask="url(#sm_logo)"/></svg>`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

const findMeeting = (id) => state.meetings.find((m) => m.id === id);
const label = (m, s) => store.sessionLabel(m, s);
const tabName = (m, s) => s.name.trim() || store.defaultSessionName(m, s);
function touch(m) { m.updatedAt = Date.now(); store.save(state); }

// ---------- Router ----------
function route() {
  const parts = (location.hash.slice(1) || '/').split('/').filter(Boolean);
  if (parts[0] === 'm' && parts[1]) {
    const m = findMeeting(parts[1]);
    if (!m) { location.hash = '#/'; return; }
    if (parts[2] && m.sessions.some((s) => s.id === parts[2])) ui.session = parts[2];
    if (!m.sessions.some((s) => s.id === ui.session)) ui.session = m.sessions[0].id;
    renderMeeting(m);
  } else {
    renderHome();
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => {
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  route();
});

function openSession(m, sid) {
  ui.view = ['pressure', 'fuel'].includes(ui.view) ? ui.view : 'session'; // stay on the pressure / fuel page when switching session
  ui.session = sid;
  const h = `#/m/${m.id}/${sid}`;
  if (location.hash === h) renderMeeting(m); else location.hash = h;
}

// ---------- Home ----------
function renderHome() {
  $hdr.innerHTML = `${LOGO}<h1>KARTIFY</h1><button id="new" class="pri sm">+ New event</button>`;
  $nav.className = ''; $nav.innerHTML = '';
  const meetings = [...state.meetings].sort((a, b) =>
    (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);

  $app.innerHTML = `
    ${meetings.length === 0 ? `
      <div class="card empty">
        <h3>No events yet</h3>
        <p class="mute">Create one for each race meeting or test day, then fill in the setup for each session.</p>
      </div>` : meetings.map((m) => {
        const used = m.sessions.filter((s) => store.sessionHasData(s));
        return `
        <a class="card event" href="#/m/${m.id}">
          <div class="ev-title">${esc(m.track) || '<span class="mute">Untitled event</span>'}</div>
          <div class="mute">${esc(fmtDate(m.date))}${m.kartClass ? ' · ' + esc(m.kartClass) : ''}</div>
          ${used.length ? `<div class="pips">${used.map((s) => `<span class="pill on">${esc(label(m, s))}</span>`).join('')}</div>` : ''}
        </a>`;
      }).join('')}
    ${state.setups.length ? `
    <div class="card">
      <h3>Saved setups</h3>
      ${savedSetupsSorted().map((x) => `
        <div class="saved">
          <div><div>${esc(x.name)}</div><div class="mute">${esc(setupMeta(x))}</div></div>
          <button class="sm danger" data-del-setup="${x.id}">Delete</button>
        </div>`).join('')}
    </div>` : ''}
    <div class="card">
      <h3>Backup</h3>
      <p class="mute">Data is stored on this phone only. Export a backup now and then.</p>
      <div class="row">
        <button id="export" style="flex:1">Export</button>
        <button id="importBtn" style="flex:1">Import</button>
        <input type="file" id="import" accept="application/json,.json" hidden>
      </div>
    </div>`;

  document.getElementById('new').onclick = () => {
    const m = store.newMeeting();
    state.meetings.push(m);
    store.save(state, true);
    ui.session = m.sessions[0].id; ui.view = 'session';
    location.hash = `#/m/${m.id}`;
    setTimeout(() => openDetails(m, true), 50);
  };
  $app.querySelectorAll('[data-del-setup]').forEach((b) => b.onclick = () => {
    const x = state.setups.find((y) => y.id === b.dataset.delSetup);
    if (!confirm(`Delete saved setup "${x.name}"?`)) return;
    state.setups = state.setups.filter((y) => y !== x);
    store.save(state, true);
    renderHome();
  });
  document.getElementById('export').onclick = exportBackup;
  document.getElementById('importBtn').onclick = () => document.getElementById('import').click();
  document.getElementById('import').onchange = importBackup;
}

async function exportBackup() {
  const text = store.exportJSON(state);
  const name = `kartify-backup-${store.today()}.json`;
  const file = new File([text], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Kartify backup' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importBackup(e) {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const { added, updated } = store.importJSON(state, await f.text());
    store.save(state, true);
    toast(`Imported: ${added} new, ${updated} updated`);
    renderHome();
  } catch (err) {
    alert('That file could not be imported: ' + err.message);
  }
}

// ---------- Event ----------
function renderMeeting(m) {
  const sess = m.sessions.find((s) => s.id === ui.session) || m.sessions[0];
  ui.session = sess.id;

  $hdr.innerHTML = `
    <button class="sm back" id="back" aria-label="Back">‹</button>
    <button class="hdr-title" id="details">
      <span class="t">${esc(m.track) || 'Untitled event'}</span>
      <span class="s">${esc(fmtDate(m.date))}${m.kartClass ? ' · ' + esc(m.kartClass) : ''}</span>
    </button>
    <button class="sm" id="menu" aria-label="More">•••</button>`;
  document.getElementById('back').onclick = () => { location.hash = '#/'; };
  document.getElementById('details').onclick = () => openDetails(m);
  document.getElementById('menu').onclick = () => openMenu(m, sess);

  $nav.className = 'strip';
  $nav.innerHTML = `
    ${m.sessions.map((s) => `
      <button data-s="${s.id}" class="${s.id === ui.session && ui.view !== 'grid' ? 'act' : ''} ${store.sessionHasData(s) ? 'has' : ''} ${tabName(m, s) ? '' : 'unnamed'}">${esc(tabName(m, s) || m.sessions.indexOf(s) + 1)}</button>`).join('')}
    <button id="addSession" aria-label="Add session">+</button>
    <span class="sep"></span>
    <button data-view="grid" class="${ui.view === 'grid' ? 'act' : ''}">Grid</button>`;
  $nav.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => openSession(m, b.dataset.s));
  $nav.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { ui.view = b.dataset.view; renderMeeting(m); });
  document.getElementById('addSession').onclick = () => {
    const s = store.newSession();
    m.sessions.push(s);
    touch(m);
    openSession(m, s.id);
  };
  $nav.querySelector('.act')?.scrollIntoView({ inline: 'center', block: 'nearest' });

  if (ui.view === 'grid') return renderGrid(m);
  if (ui.view === 'pressure') return renderPressure(m, sess);
  if (ui.view === 'fuel') return renderFuel(m, sess);
  renderSessionForm(m, sess);
}

// Inputs show this session's own value; when blank, the value carried from earlier
// sessions shows greyed out as the placeholder.
function inputHTML(field, side, value, inherited = '') {
  const mode = field.kind === 'text' ? 'text' : 'decimal';
  return `
    <div class="cell">
      <input data-field="${field.id}" data-side="${side}" value="${esc(value)}" placeholder="${esc(inherited)}"
        inputmode="${mode}" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false"
        aria-label="${esc(field.label)} ${side === 'f' ? 'front' : side === 'r' ? 'rear' : ''}">
    </div>`;
}

const segClass = (v, current, inherited) => (v === current ? 'act' : !current && v === inherited ? 'inh' : '');

// Buttons where tapping the selected one again clears it (back to the carried value).
// Green double chevron: "tap for more" on Target hot pressure and Fuel.
const CHEV = '<svg class="chev" viewBox="0 0 16 12" aria-hidden="true"><path d="M2 1.5 6.5 6 2 10.5M8.5 1.5 13 6l-4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// Options with a `note` (steering yoke) show the note for the picked option beside the buttons.
const noteFor = (options, v) => options.find((o) => typeof o === 'object' && o.v === v)?.note || '';
function segHTML(fieldId, key, options, current, inherited = '') {
  const notes = options.some((o) => typeof o === 'object' && o.note);
  return `<div class="seg" data-choice="${fieldId}:${key}" data-inh="${esc(inherited)}">${options.map((o) => {
    const v = typeof o === 'string' ? o : o.v;
    return `<button data-v="${v}" class="${segClass(v, current, inherited)}">${v}</button>`;
  }).join('')}</div>${notes ? `<span class="seg-note" data-note="${fieldId}:${key}">${esc(noteFor(options, current))}</span>` : ''}`;
}

const optText = (o) => (typeof o === 'number' || /^-?\d+$/.test(o) && Number(o) < 0 ? signed(o) : String(o));

function selectHTML(fieldId, key, options, current, aria, inherited = '') {
  const blank = inherited !== '' ? optText(options.find((o) => String(o) === inherited) ?? inherited) : '–';
  return `<select data-select="${fieldId}:${key}" aria-label="${esc(aria)}" class="${current === '' && inherited !== '' ? 'inh' : ''}">
    <option value="" ${current === '' ? 'selected' : ''}>${esc(blank)}</option>
    ${options.map((o) => `<option value="${o}" ${String(o) === String(current) ? 'selected' : ''}>${typeof o === 'number' ? signed(o) : o}</option>`).join('')}
  </select>`;
}

function labelHTML(f) {
  const inner = `${esc(f.label)}${f.unit ? ` <span class="unit">${esc(f.unit)}</span>` : ''}${f.ref ? ' <span class="info">i</span>' : ''}
    ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}`;
  if (f.link) {
    return `<button class="flabel ref link" data-goto="${f.link}" aria-label="${esc(f.label)} – open tyre pressures"><span class="nowrap">${esc(f.label).replace(/ (\S+)$/, ' <span class="nowrap">$1')}${CHEV}</span></span>${f.unit ? ` <span class="unit">${esc(f.unit)}</span>` : ''}${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</button>`;
  }
  return f.ref
    ? `<button class="flabel ref" data-ref="${f.ref}" aria-label="${esc(f.label)} reference">${inner}</button>`
    : `<div class="flabel">${inner}</div>`;
}

// ---------- Reference content (Reference tab and pop-ups from the setup) ----------
function stubHTML(selected = '', pickable = false) {
  const areas = { 1: 'a', 2: 'b', 3: 'c', 4: 'd', 5: 'e' };
  return `<div class="stub">${Object.entries(areas).map(([n, a]) => pickable
    ? `<button style="grid-area:${a}" data-pick="${n}" class="${String(selected) === n ? 'act' : ''}">${n}</button>`
    : `<span style="grid-area:${a}">${n}</span>`).join('')}</div>`;
}

// Every top/bottom combination; tap a cell to pick it when `pickable`.
function casterTableHTML(top = '', bottom = '', pickable = false) {
  return `<table class="caster-table">
    <tr><th>Top</th>${CASTER_BOTTOM.map((b) => `<th>${b}</th>`).join('')}</tr>
    ${CASTER_TOP.map((t) => `<tr><th>${signed(t)}</th>${CASTER_BOTTOM.map((b) => {
      const on = String(t) === String(top) && b === bottom;
      const deg = casterDegrees(t, b).toFixed(1) + '°';
      return `<td class="${on ? 'act' : ''}">${pickable ? `<button data-top="${t}" data-bottom="${b}">${deg}</button>` : deg}</td>`;
    }).join('')}</tr>`).join('')}
  </table>`;
}

const BRAKE_HTML = `<div class="brake"><b>1</b> = top position</div>`;

function openRefSheet(ref, m, s, onPick) {
  let body = '';
  const eff = { values: store.effectiveAt(m, s) };
  if (ref === 'stub') {
    body = `<h3>Stub position (LHS)</h3>${stubHTML(eff.values.stubPos?.f || '', true)}
      <div class="mute" style="text-align:center">Tap a position to select it.</div>`;
  } else if (ref === 'caster') {
    const { top, bottom } = store.getCaster(eff);
    body = `<h3>Caster</h3>
      <div class="mute">16.5° base, +3° when bottom is BACK, plus top position. Tap a value to select it.</div>
      ${casterTableHTML(top, bottom, true)}`;
  } else if (ref === 'brake') {
    body = `<h3>Brake pedal</h3>${BRAKE_HTML}`;
  }
  const d = sheet(`<div class="sheet-body">${body}<button data-a="close">Close</button></div>`);
  d.querySelector('[data-a=close]').onclick = () => d.close();
  d.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => { d.close(); onPick({ stubPos: b.dataset.pick }); });
  d.querySelectorAll('[data-top]').forEach((b) => b.onclick = () => {
    d.close(); onPick({ casterTop: b.dataset.top, casterBottom: b.dataset.bottom });
  });
}

// `inh` holds the setup carried from the sessions before this one.
function rowHTML(f, s, inh) {
  const v = s.values[f.id] || {};
  const iv = inh[f.id] || {};
  const o = (k) => (v[k] == null ? '' : String(v[k]));
  const i = (k) => iv[k] ?? '';
  if (f.kind === 'caster') {
    return `
      <div class="frow wide">
        ${labelHTML(f)}
        <div class="wide-ctl">
          ${segHTML('caster', 'bottom', CASTER_BOTTOM, o('bottom'), i('bottom'))}
          ${selectHTML('caster', 'top', CASTER_TOP, o('top'), 'Caster top position', i('top'))}
          <div class="caster-out" id="casterOut"></div>
        </div>
      </div>`;
  }
  if (f.kind === 'dir') {
    return `
      <div class="frow wide">
        ${labelHTML(f)}
        <div class="wide-ctl">
          ${inputHTML(f, 'f', o('f'), i('f'))}
          ${segHTML(f.id, 'd', f.options, o('d'), i('d'))}
        </div>
      </div>`;
  }
  if (f.kind === 'choice') {
    const side = f.sides[0];
    return `<div class="frow wide">${labelHTML(f)}<div class="wide-ctl">${segHTML(f.id, side, f.options, o(side), i(side))}</div></div>`;
  }
  if (f.kind === 'select') {
    return `
      <div class="frow">${labelHTML(f)}
        ${['f', 'r'].map((side) => f.sides.includes(side)
          ? `<div class="cell">${selectHTML(f.id, side, f.options, o(side), f.label, i(side))}</div>`
          : '<div class="cell na"></div>').join('')}
      </div>`;
  }
  if (f.wideInput) {
    const side = f.sides[0];
    return `<div class="frow wide-in">${labelHTML(f)}${inputHTML(f, side, o(side), i(side)).replace('class="cell"', 'class="cell span2"')}</div>`;
  }
  return `
    <div class="frow">
      ${labelHTML(f)}
      ${['f', 'r'].map((side) => f.sides.includes(side)
        ? inputHTML(f, side, o(side), i(side))
        : '<div class="cell na"></div>').join('')}
    </div>`;
}

function renderSessionForm(m, s) {
  const idx = m.sessions.indexOf(s);
  // Unchanged items are left blank (no carried values shown); Save setup pulls them through.
  const inh = {};

  $app.innerHTML = `
    <div class="card times">
      <label class="time name"><span>Session</span>
        <input id="sessName" value="${esc(s.name)}" placeholder="${esc(store.defaultSessionName(m, s) || 'Name, e.g. Test 1')}"
          autocomplete="off" autocapitalize="words" class="${store.defaultSessionName(m, s) ? 'has-default' : ''}"></label>
      ${TIMES.map((t) => `
        <label class="time ${t.wide ? 'info-field' : ''}"><span>${t.label}</span>
          <input data-time="${t.id}" value="${esc(store.getVal(s, t))}" inputmode="${t.kind === 'num' ? 'decimal' : 'text'}"
            autocomplete="off" autocapitalize="sentences" maxlength="${t.id === 'comment' ? 60 : 40}"
            placeholder="${esc((t.carry && store.carriedInfo(m, s, t)) || t.placeholder || '–')}"
            class="${t.carry && store.carriedInfo(m, s, t) ? 'carried' : ''}"></label>`).join('')}
    </div>
    ${fuelSummaryHTML(m, s)}
    <div class="row">
      <button id="saveSetup" style="flex:1">Save setup</button>
      <button id="loadSetup" style="flex:1">Load setup</button>
    </div>
    <div id="changes"></div>
    <div class="card form">
      <div class="form-head"><span></span><span>Front</span><span>Rear</span></div>
      ${FIELDS.map((f) => rowHTML(f, s, inh)).join('')}
      ${idx > 0 ? '<div class="mute form-foot">Only enter what changes. Blank means the same as before.</div>' : ''}
    </div>
    <div class="card">
      <div class="notes-head"><h3>Notes</h3>
        <button type="button" id="dictate" class="sm dictate" aria-label="Dictate notes">🎤</button></div>
      <textarea id="notes" rows="5" placeholder="How did it feel? What changed?">${esc(s.notes)}</textarea>
    </div>`;

  const changed = () => { touch(m); markChip(m, s); renderChanges(m, s); };

  // Session name: blank by default; the next session's tab follows it ("Test 1" -> "Test 2").
  document.getElementById('sessName').addEventListener('input', (e) => {
    s.name = e.target.value;
    touch(m);
    const i = m.sessions.indexOf(s);
    for (const x of m.sessions.slice(i, i + 2)) {
      const b = $nav.querySelector(`[data-s="${x.id}"]`);
      if (b) { b.textContent = tabName(m, x) || m.sessions.indexOf(x) + 1; b.classList.toggle('unnamed', !tabName(m, x)); }
    }
  });

  $app.querySelectorAll('input[data-field]').forEach((el) => {
    el.addEventListener('input', () => {
      const f = FIELDS.find((x) => x.id === el.dataset.field);
      store.setVal(s, f, el.dataset.side, el.value.trim());
      changed();
    });
    el.addEventListener('focus', () => el.select());
  });
  $app.querySelectorAll('input[data-time]').forEach((el) => {
    el.addEventListener('input', () => {
      store.setVal(s, TIMES.find((t) => t.id === el.dataset.time), 'v', el.value.trim());
      touch(m); markChip(m, s);
    });
    el.addEventListener('focus', () => el.select());
  });
  // Caster degrees from the setup in force (this session's values, else carried ones).
  const updateCaster = () => {
    const out = document.getElementById('casterOut');
    // Shown only when caster is changed in this session (a missing half comes from before).
    const changedHere = store.hasOwn(s, FIELDS.find((f) => f.id === 'caster'));
    const { top, bottom } = store.getCaster({ values: store.effectiveAt(m, s) });
    const deg = casterDegrees(top, bottom);
    out.textContent = changedHere && deg != null ? deg.toFixed(1) + '°' : '–';
  };
  updateCaster();
  const setPart = (fid, key, value) => {
    s.values[fid] = { ...(s.values[fid] || {}), [key]: value };
    if (fid === 'caster') updateCaster();
    changed();
  };
  $app.querySelectorAll('[data-choice]').forEach((seg) => {
    const [fid, key] = seg.dataset.choice.split(':');
    seg.querySelectorAll('button').forEach((b) => b.onclick = () => {
      const cur = (s.values[fid] || {})[key] || '';
      const next = cur === b.dataset.v ? '' : b.dataset.v; // tap again to clear
      paintSeg(seg, next);
      setPart(fid, key, next);
    });
  });
  $app.querySelectorAll('[data-select]').forEach((sel) => {
    const [fid, key] = sel.dataset.select.split(':');
    sel.onchange = () => { sel.classList.toggle('inh', sel.value === '' && sel.options[0].text !== '–'); setPart(fid, key, sel.value); };
  });

  // Tap a row name with an ⓘ to see its reference; picks made there fill the row.
  $app.querySelectorAll('[data-ref]').forEach((b) => b.onclick = () => openRefSheet(b.dataset.ref, m, s, (pick) => {
    if (pick.stubPos) {
      const sel = $app.querySelector('[data-select="stubPos:f"]');
      sel.value = pick.stubPos; sel.classList.remove('inh');
      setPart('stubPos', 'f', pick.stubPos);
    }
    if (pick.casterTop != null) {
      s.values.caster = { top: pick.casterTop, bottom: pick.casterBottom };
      const sel = $app.querySelector('[data-select="caster:top"]');
      sel.value = pick.casterTop; sel.classList.remove('inh');
      paintSeg($app.querySelector('[data-choice="caster:bottom"]'), pick.casterBottom);
      setPart('caster', 'bottom', pick.casterBottom);
    }
  }));

  $app.querySelectorAll('[data-goto=pressure]').forEach((b) => b.onclick = () => { ui.view = 'pressure'; renderMeeting(m); window.scrollTo(0, 0); });
  $app.querySelectorAll('[data-goto=fuel]').forEach((b) => b.onclick = () => { ui.view = 'fuel'; renderMeeting(m); window.scrollTo(0, 0); });
  bindFuelInputs(m, s);
  document.getElementById('saveSetup').onclick = () => saveSetupSheet(m, s);
  document.getElementById('loadSetup').onclick = () => loadSetupSheet(m, s);

  renderChanges(m, s);
  document.getElementById('notes').addEventListener('input', (e) => {
    s.notes = e.target.value; touch(m); markChip(m, s);
  });
  // Voice notes use the iPhone keyboard's own dictation (reliable, no repeated mic prompts).
  document.getElementById('dictate').addEventListener('click', () => {
    const ta = document.getElementById('notes');
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    toast('Tap the 🎤 on the keyboard to dictate');
  });

}

function paintSeg(seg, current) {
  const inh = seg.dataset.inh;
  seg.querySelectorAll('button').forEach((x) => { x.className = segClass(x.dataset.v, current, inh); });
  const note = document.querySelector(`[data-note="${seg.dataset.choice}"]`);
  if (note) {
    const f = FIELDS.find((x) => x.id === seg.dataset.choice.split(':')[0]);
    note.textContent = noteFor(f?.options || [], current);
  }
}

function markChip(m, s) {
  $nav.querySelector(`[data-s="${s.id}"]`)?.classList.toggle('has', store.sessionHasData(s));
}

const sideLabel = (side) => (side === 'f' ? 'F' : side === 'r' ? 'R' : '');
// Only show F/R in the change record where a row has both.
const fieldSide = (field, side) => (field.sides.length > 1 ? ' ' + sideLabel(side) : '');

function changeListHTML(diffs) {
  return `<table class="changes">${diffs.map((d) => `
    <tr><td>${esc(d.field.label)}${fieldSide(d.field, d.side)}</td>
      <td class="from">${esc(d.from) || '–'}</td><td class="arrow">→</td><td class="to">${esc(d.to) || '–'}</td></tr>`).join('')}</table>`;
}

function renderChanges(m, s) {
  const el = document.getElementById('changes');
  const i = m.sessions.indexOf(s);
  if (!el) return;
  if (i === 0 || !store.sessionHasData(s)) { el.innerHTML = ''; return; }
  const diffs = store.diffSessions({ values: store.effectiveBefore(m, s) }, { values: store.effectiveAt(m, s) });
  if (!diffs.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="card changes-card">
      <h3>Changes from ${esc(label(m, m.sessions[i - 1]))}</h3>
      ${changeListHTML(diffs)}
    </div>`;
}

function renderGrid(m) {
  const cols = m.sessions;
  // Each column shows the setup in force at that session; green = changed in that session,
  // grey = carried from an earlier one.
  const eff = cols.map((_, i) => ({ values: store.effectiveValues(m, i) }));
  const cell = (s, f, side) => {
    const i = cols.indexOf(s);
    const v = store.display(eff[i], f, side);
    const changed = i > 0 && v !== store.display(eff[i - 1], f, side);
    const carried = !changed && v && !store.hasOwn(s, f);
    return `<td class="${changed ? 'chg' : carried ? 'inh' : ''} ${side === 'r' || f.sides.length === 1 ? 'edge' : ''}">${esc(v)}</td>`;
  };
  const rowFor = (f) => `
    <tr><th class="stick">${esc(f.label)}${f.sides.length === 1 ? ` <span class="mute">${sideLabel(f.sides[0])}</span>` : ''}</th>
      ${cols.map((s) => f.sides.length === 1
        ? cell(s, f, f.sides[0]).replace('<td', '<td colspan="2"')
        : cell(s, f, 'f') + cell(s, f, 'r')).join('')}</tr>`;

  $app.innerHTML = `
    <div class="mute" style="margin:4px 0 8px">Green = changed in that session, grey = carried from before. Tap a session to edit it.</div>
    <div class="grid-wrap">
      <table class="grid">
        <thead>
          <tr><th class="stick"></th>${cols.map((s) =>
            `<th colspan="2" class="edge"><button class="link" data-s="${s.id}">${esc(label(m, s))}</button></th>`).join('')}</tr>
        </thead>
        <tbody>
          ${TIMES.map((t) => `
            <tr class="time-row ${t.wide ? 'info-row' : ''}"><th class="stick">${t.label}</th>${cols.map((s) => {
              const v = store.getVal(s, t), c = !v && t.carry ? store.carriedInfo(m, s, t) : '';
              return `<td colspan="2" class="edge ${c ? 'inh' : ''}">${esc(v || c)}</td>`;
            }).join('')}</tr>`).join('')}
          <tr class="sub"><th class="stick"></th>${cols.map(() => '<th>F</th><th class="edge">R</th>').join('')}</tr>
          ${FIELDS.map(rowFor).join('')}
          <tr><th class="stick">Notes</th>${cols.map((s) =>
            `<td colspan="2" class="note edge">${esc(s.notes)}</td>`).join('')}</tr>
        </tbody>
      </table>
    </div>`;
  $app.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => openSession(m, b.dataset.s));
}

// ---------- Tyre pressures ----------
const fmt = (v, d = 1) => (v == null || !isFinite(v) ? '–' : v.toFixed(d));
const fmtSigned = (v, d = 1) => (v == null || !isFinite(v) ? '–' : (v > 0 ? '+' : '') + v.toFixed(d));

function renderPressure(m, s) {
  if (!s.tyres || !s.tyres.length) {
    const tyreItem = TIMES.find((x) => x.id === 'tyre');
    s.tyres = P.initialTyres(m, s, store.getVal(s, tyreItem) || store.carriedInfo(m, s, tyreItem));
    store.save(state);
  }
  const t = s.tyres.find((x) => x.id === ui.tyre) || s.tyres[0];
  ui.tyre = t.id;
  const st = P.settingsOf(m);
  const tyreLabel = (x) => x.name.trim() || `Tyre ${s.tyres.indexOf(x) + 1}`;
  const CALC = [
    { id: 'ref', label: `Ref @ ${st.refTemp}°`, f: (c) => fmt(c.ref, 2) },
    { id: 'riseCoeff', label: 'Rise coeff', f: (c) => (c.riseCoeff == null ? '–' : (c.riseCoeff * 100).toFixed(1) + '%') },
    { id: 'corrDelta', label: 'Corr delta', f: (c) => fmtSigned(c.corrDelta) },
    { id: 'corrCold', label: 'Corr cold', f: (c) => fmt(c.corrCold), main: true },
  ];
  const HINT = { hot: 'came in at', target: 'Corr uses this; blank = Setup' };
  const FILL_ALL = ['rimT'];

  $app.innerHTML = `
    <div class="ptop">
      <button class="sm" id="toSetup">‹ Setup</button>
      <div class="ptitle">Tyre pressures · ${esc(label(m, s))}</div>
    </div>
    <div class="tyre-tabs">
      ${s.tyres.map((x) => `<button data-t="${x.id}" class="${x === t ? 'act' : ''} ${P.tyreHasData(x) ? 'has' : ''}">${esc(tyreLabel(x))}</button>`).join('')}
      <button id="addTyre">+ Tyre</button>
    </div>
    <div class="card times">
      <label class="time info-field"><span>Tyre</span>
        <input id="tyreName" value="${esc(t.name)}" placeholder="e.g. Set 1 (new)" autocomplete="off" autocapitalize="words"></label>
    </div>
    <div class="card form pform">
      <div class="prow phead"><span></span><span class="axle">Front</span><span class="axle">Rear</span></div>
      <div class="prow psub"><span></span>${P.CORNERS.map((c) => `<span>${c.label}</span>`).join('')}</div>
      ${P.P_INPUTS.map((p) => `
        ${p.id === 'target' ? `
        <div class="prow setup-target axle-row">
          <div class="flabel">Setup target<div class="hint">from Setup sheet</div></div>
          ${['lf', 'lr'].map((c) => `<div class="cell out span2 ${c === 'lf' ? 'gap' : ''}">${esc(P.setupTarget(m, s, c) || '–')}</div>`).join('')}
        </div>
        <div class="prow axle-row">
          <div class="flabel">${p.label}<div class="hint">${HINT.target}</div></div>
          ${['f', 'r'].map((ax) => `
            <div class="cell span2 target ${ax === 'f' ? 'gap' : ''}"><input data-tgt="${ax}" value="${esc(t.targets?.[ax] ?? '')}"
              placeholder="${esc(P.carriedTarget(m, s, t, ax))}" inputmode="decimal" autocomplete="off"
              aria-label="New target ${ax === 'f' ? 'front' : 'rear'}"></div>`).join('')}
        </div>` : `
        <div class="prow">
          ${p.id === 'cold'
            ? `<button class="flabel ref" data-adjust>${p.label} <span class="go">›</span><div class="hint">tap to adjust</div></button>`
            : `<div class="flabel">${p.label}${HINT[p.id] ? `<div class="hint">${HINT[p.id]}</div>` : ''}
            ${FILL_ALL.includes(p.id) ? `<button class="fill-all" data-fill="${p.id}">Copy to all</button>` : ''}</div>`}
          ${P.CORNERS.map((c) => `
            <div class="cell ${c.id === 'rf' ? 'gap' : ''} ${isAdj(t, c.id, p.id) ? 'adj' : ''} ${p.id === 'hot' ? 'hot' : ''} ${p.id === 'cold' ? 'cold' : ''} ${p.id === 'rimT' ? 'rim' : ''}"><input data-p="${p.id}" data-side="${c.id}" value="${esc(t[c.id]?.[p.id] ?? '')}"
              placeholder="${esc(p.id === 'target' ? P.carriedTarget(m, s, t, c.id) : '')}" inputmode="decimal" autocomplete="off"
              aria-label="${p.label} ${c.id.toUpperCase()}"></div>`).join('')}
        </div>`}`).join('')}
      <div class="calc-head">Calculated</div>
      ${CALC.map((k) => `
        <div class="prow calc ${k.main ? 'main' : ''}">
          <div class="flabel">${k.label}</div>
          ${P.CORNERS.map((c) => `<div class="cell out ${c.id === 'rf' ? 'gap' : ''}" data-calc="${k.id}" data-side="${c.id}"></div>`).join('')}
        </div>`).join('')}
    </div>
    <div class="row adj-actions">
      <button id="adjustBtn" class="adjust-btn" data-adjust>Adjust pressures &amp; rim temp</button>
      ${t.adjusted ? '<button id="revertAdj" class="revert-btn">Revert adjustment</button>' : ''}
    </div>
    ${t.adjusted ? '<div class="mute adj-note"><span class="adj-dot"></span> adjusted values</div>' : ''}
    <div class="row">
      <button id="copyCold" style="flex:1">Copy cold set</button>
      <button id="copyCorr" style="flex:1">Copy corr cold</button>
      <button id="pastePress" class="pri" style="flex:1 1 100%" ${ui.clip ? '' : 'hidden'}></button>
    </div>
    <div class="row"><button id="delTyre" class="sm danger">Delete ${esc(tyreLabel(t))}</button></div>
    <div class="mute">Pressure settings (ref temperature, PSI per °C, ref rise) are in the ••• menu.</div>`;

  const updateCalc = () => {
    for (const c of P.CORNERS) {
      const r = P.calc(m, s, t, c.id);
      for (const k of CALC) $app.querySelector(`[data-calc="${k.id}"][data-side="${c.id}"]`).textContent = k.f(r);
    }
  };
  updateCalc();
  ui.refreshPressure = updateCalc;

  document.getElementById('toSetup').onclick = () => { ui.view = 'session'; renderMeeting(m); window.scrollTo(0, 0); };
  $app.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { ui.tyre = b.dataset.t; renderPressure(m, s); });
  document.getElementById('addTyre').onclick = () => {
    const n = P.newTyre();
    s.tyres.push(n); ui.tyre = n.id; touch(m); renderPressure(m, s);
    document.getElementById('tyreName').focus();
  };
  document.getElementById('tyreName').addEventListener('input', (e) => {
    t.name = e.target.value; touch(m);
    $app.querySelector(`[data-t="${t.id}"]`).textContent = tyreLabel(t);
  });
  const coldInput = (c) => $app.querySelector(`input[data-p="cold"][data-side="${c}"]`);
  $app.querySelectorAll('[data-adjust]').forEach((b) => b.onclick = () => adjustSheet(m, s, t));
  // Typing over an adjusted value removes its marker.
  const unmark = (c, field) => {
    const marks = t.adjusted?.marks?.[c];
    if (!marks || !marks.includes(field)) return;
    t.adjusted.marks[c] = marks.filter((x) => x !== field);
    $app.querySelector(`input[data-p="${field}"][data-side="${c}"]`).parentElement.classList.remove('adj');
  };
  document.getElementById('revertAdj')?.addEventListener('click', () => {
    if (!confirm('Put the cold pressures and rim temps back to how they were before adjusting?')) return;
    for (const c of P.CORNERS) {
      const b = t.adjusted.before[c.id] || {};
      t[c.id] = { ...(t[c.id] || {}), cold: b.cold ?? '', rimT: b.rimT ?? '' };
    }
    delete t.adjusted;
    touch(m); renderPressure(m, s);
    toast('Adjustment reverted');
  });

  $app.querySelectorAll('input[data-tgt]').forEach((el) => {
    el.addEventListener('input', () => {
      t.targets = { ...(t.targets || {}), [el.dataset.tgt]: el.value.trim() };
      touch(m); markChip(m, s); updateCalc();
      $app.querySelector(`[data-t="${t.id}"]`).classList.toggle('has', P.tyreHasData(t));
    });
    el.addEventListener('focus', () => el.select());
  });
  $app.querySelectorAll('input[data-p]').forEach((el) => {
    el.addEventListener('input', () => {
      t[el.dataset.side] = { ...(t[el.dataset.side] || {}), [el.dataset.p]: el.value.trim() };
      unmark(el.dataset.side, el.dataset.p);
      ui.lastCorner = { [el.dataset.p]: el.dataset.side, ...(ui.lastCorner || {}), [el.dataset.p]: el.dataset.side };
      touch(m); markChip(m, s); updateCalc();
      $app.querySelector(`[data-t="${t.id}"]`).classList.toggle('has', P.tyreHasData(t));
    });
    el.addEventListener('focus', () => el.select());
  });
  // "Copy to all": the value last typed in that row (or the first one filled) goes to all four tyres.
  $app.querySelectorAll('[data-fill]').forEach((b) => {
    b.addEventListener('pointerdown', (e) => e.preventDefault()); // keep the keyboard up
    b.onclick = () => {
      const id = b.dataset.fill;
      const from = ui.lastCorner?.[id] && t[ui.lastCorner[id]]?.[id] ? ui.lastCorner[id]
        : P.CORNERS.map((c) => c.id).find((c) => (t[c]?.[id] ?? '') !== '');
      if (!from) { toast('Type a value first'); return; }
      const v = t[from][id];
      for (const c of P.CORNERS) {
        t[c.id] = { ...(t[c.id] || {}), [id]: v };
        $app.querySelector(`input[data-p="${id}"][data-side="${c.id}"]`).value = v;
        unmark(c.id, id);
      }
      touch(m); markChip(m, s); updateCalc();
      $app.querySelector(`[data-t="${t.id}"]`).classList.toggle('has', P.tyreHasData(t));
    };
  });

  // Copy / paste cold pressures between tyres and sessions (kept while the app is open).
  const pasteBtn = document.getElementById('pastePress');
  const showPaste = () => {
    if (!ui.clip) return;
    pasteBtn.hidden = false;
    const v = ui.clip.values;
    pasteBtn.innerHTML = `Paste: cold ${P.CORNERS.map((c) => v[c.id].cold || '–').join(' / ')}`
      + (P.CORNERS.some((c) => v[c.id].rimT) ? `<small>rim T ${P.CORNERS.map((c) => v[c.id].rimT || '–').join(' / ')}</small>` : '')
      + (ui.clip.targets?.f || ui.clip.targets?.r ? `<small>new target F ${ui.clip.targets.f || '–'} / R ${ui.clip.targets.r || '–'}</small>` : '');
  };
  showPaste();
  const copy = (what) => {
    const values = {};
    for (const c of P.CORNERS) {
      const v = what === 'cold' ? t[c.id]?.cold : P.calc(m, s, t, c.id).corrCold;
      values[c.id] = {
        cold: v == null || v === '' ? '' : what === 'cold' ? String(v) : (Math.round(v * 10) / 10).toFixed(1),
        rimT: t[c.id]?.rimT ?? '',
      };
    }
    if (!Object.values(values).some((x) => x.cold)) { toast(what === 'cold' ? 'No cold set to copy' : 'No corr cold to copy'); return; }
    ui.clip = { values, targets: { ...(t.targets || {}) }, what: what === 'cold' ? 'cold set' : 'corr cold', from: `${tyreLabel(t)}, ${label(m, s)}`, name: t.name.trim() };
    showPaste();
    sendClipSheet(m);
  };
  document.getElementById('copyCold').onclick = () => copy('cold');
  document.getElementById('copyCorr').onclick = () => copy('corr');
  pasteBtn.onclick = () => {
    const has = P.CORNERS.some((c) => (t[c.id]?.cold ?? '') !== '' || (t[c.id]?.rimT ?? '') !== '');
    if (has && !confirm(`Replace the cold set and rim temps on ${tyreLabel(t)}?`)) return;
    applyClip(t, ui.clip);
    touch(m); markChip(m, s); renderPressure(m, s);
    toast(`Pasted into ${tyreLabel(t)}`);
  };

  document.getElementById('delTyre').onclick = () => {
    if (!confirm(`Delete ${tyreLabel(t)} from this session?`)) return;
    s.tyres = s.tyres.filter((x) => x !== t);
    if (!s.tyres.length) s.tyres.push(P.newTyre());
    ui.tyre = null; touch(m); markChip(m, s); renderPressure(m, s);
  };
}

const isAdj = (t, corner, field) => !!t.adjusted?.marks?.[corner]?.includes(field);

// Put copied pressures (cold + rim temps) into a tyre.
function applyClip(t, clip) {
  delete t.adjusted;
  for (const c of P.CORNERS) {
    const v = clip.values[c.id];
    t[c.id] = { ...(t[c.id] || {}), ...(v.cold ? { cold: v.cold } : {}), ...(v.rimT ? { rimT: v.rimT } : {}) };
  }
  for (const ax of ['f', 'r']) if (clip.targets?.[ax]) (t.targets ||= {})[ax] = clip.targets[ax];
}

// After copying: send to a new tyre in any session, or keep in the clipboard.
function sendClipSheet(m) {
  const clip = ui.clip;
  const v = clip.values;
  const d = sheet(`
    <div class="sheet-body">
      <h3>Copied ${esc(clip.what)}, rim temps + target</h3>
      <div class="mute">From ${esc(clip.from)}<br>
        Cold ${P.CORNERS.map((c) => esc(v[c.id].cold || '–')).join(' / ')}
        ${P.CORNERS.some((c) => v[c.id].rimT) ? ` · rim T ${P.CORNERS.map((c) => esc(v[c.id].rimT || '–')).join(' / ')}` : ''}
        ${clip.targets?.f || clip.targets?.r ? `<br>New target F ${esc(clip.targets.f || '–')} / R ${esc(clip.targets.r || '–')}` : ''}</div>
      <label class="field">New tyre name<input id="clipName" value="${esc(clip.name)}" placeholder="e.g. Set 2 (scrubbed)" autocapitalize="words"></label>
      <div class="mute">Send to (goes into that tyre if the session already has it, otherwise a new tyre):</div>
      <div class="send-list">
        ${m.sessions.map((x) => `<button data-send="${x.id}" class="${x.id === ui.session ? 'here' : ''}">${esc(label(m, x))}</button>`).join('')}
      </div>
      <button data-a="keep" class="pri" autofocus>Keep in clipboard</button>
    </div>`);
  d.querySelector('[data-a=keep]').onclick = () => { d.close(); toast('In the clipboard: tap Paste on any tyre'); };
  d.querySelectorAll('[data-send]').forEach((b) => b.onclick = () => {
    const target = m.sessions.find((x) => x.id === b.dataset.send);
    const name = d.querySelector('#clipName').value.trim();
    // Same tyre already in that session: copy the data into it rather than adding another.
    let n = name && (target.tyres || []).find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
    const existed = !!n;
    if (!n) { n = P.newTyre(name); target.tyres = [...(target.tyres || []), n]; }
    applyClip(n, clip);
    d.close();
    touch(m);
    ui.session = target.id; ui.tyre = n.id; ui.view = 'pressure';
    const h = `#/m/${m.id}/${target.id}`;
    if (location.hash === h) renderMeeting(m); else location.hash = h;
    toast(existed ? `Copied into ${n.name} in ${label(m, target)}` : `Sent to new tyre in ${label(m, target)}`);
  });
}

// Adjust a tyre's cold set in one go: new rim temp (optionally compensating the cold
// pressures for the temperature change) and front / rear offsets, with a live preview.
function adjustSheet(m, s, t) {
  const psi = Number(P.settingsOf(m).psiPerDeg);
  const n = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
  const nowRim = (c) => t[c.id]?.rimT ?? '';
  const rims = P.CORNERS.map(nowRim).filter((v) => v !== '');
  // New rim temp per tyre (starts at the current one); the "all tyres" box sets all four.
  const st = {
    all: rims.length && rims.every((v) => v === rims[0]) ? rims[0] : '',
    rim: Object.fromEntries(P.CORNERS.map((c) => [c.id, nowRim(c)])),
    comp: true, off: { f: 0, r: 0 },
  };

  const result = (c) => {
    const cold = n(t[c.id]?.cold);
    if (cold == null) return null;
    let v = cold;
    const from = n(nowRim(c)), to = n(st.rim[c.id]);
    if (st.comp && from != null && to != null) v += (to - from) * psi;
    return v + st.off[c.axle];
  };

  const d = sheet(`
    <form method="dialog" class="sheet-body adjust">
      <h3>Adjust ${esc(t.name.trim() || `Tyre ${s.tyres.indexOf(t) + 1}`)} · ${esc(label(m, s))}</h3>
      <section class="adj-sec">
        <div class="adj-h">1 · Rim temp (°C)</div>
        <div class="adj-line">
          <span class="adj-lbl">All tyres</span>
          <div class="stepper"><button type="button" data-rim="-1">−</button>
            <input id="adjRim" value="${esc(st.all)}" inputmode="decimal" placeholder="–" aria-label="New rim temp, all tyres">
            <button type="button" data-rim="1">+</button></div>
        </div>
        <div class="adj-corners">
          ${P.CORNERS.map((c) => `<label><span>${c.id.toUpperCase()}</span>
            <input data-rimc="${c.id}" value="${esc(st.rim[c.id])}" inputmode="decimal" placeholder="–" aria-label="New rim temp ${c.id.toUpperCase()}">
            <small>now ${nowRim(c) ? esc(nowRim(c)) + '°' : '–'}</small></label>`).join('')}
        </div>
        <label class="switch-row"><input type="checkbox" id="adjComp" checked>
          <span>Temp compensation<small>cold pressure changes ${psi} psi per °C of rim temp</small></span></label>
      </section>
      <section class="adj-sec">
        <div class="adj-h">2 · Pressure adjust (psi)</div>
        <div class="nudge-row">
          ${[['f', 'Front'], ['r', 'Rear']].map(([ax, name]) => `
            <div class="nudge-axle">
              <span>${name}</span>
              <button type="button" data-off="${ax}" data-d="-1" aria-label="${name} minus 0.1">−</button>
              <b id="off-${ax}"></b>
              <button type="button" data-off="${ax}" data-d="1" aria-label="${name} plus 0.1">+</button>
            </div>`).join('')}
        </div>
      </section>
      <section class="adj-sec result">
        <div class="adj-h">3 · Cold set</div>
        <table class="adj-preview">
          <tr><th></th><th>LF</th><th>RF</th><th>LR</th><th>RR</th></tr>
          <tr><td>Now</td>${P.CORNERS.map((c) => `<td>${esc(t[c.id]?.cold || '–')}</td>`).join('')}</tr>
          <tr class="new"><td>New</td>${P.CORNERS.map((c) => `<td data-new="${c.id}"></td>`).join('')}</tr>
        </table>
      </section>
      <div class="row">
        <button type="button" data-a="cancel" style="flex:1">Cancel</button>
        <button class="pri" value="apply" style="flex:2">Apply</button>
      </div>
    </form>`);

  const rimIn = d.querySelector('#adjRim');
  const show = () => {
    for (const ax of ['f', 'r']) {
      const v = Math.round(st.off[ax] * 10) / 10;
      d.querySelector(`#off-${ax}`).textContent = (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v).toFixed(1);
    }
    for (const c of P.CORNERS) {
      const v = result(c);
      d.querySelector(`[data-new="${c.id}"]`).textContent = v == null ? '–' : P.tidy(v);
    }
  };
  const setAll = (v) => {
    st.all = v;
    for (const c of P.CORNERS) { st.rim[c.id] = v; d.querySelector(`[data-rimc="${c.id}"]`).value = v; }
    show();
  };
  show();
  rimIn.addEventListener('input', () => { if (n(rimIn.value.trim()) != null) setAll(rimIn.value.trim()); });
  d.querySelectorAll('[data-rim]').forEach((b) => b.onclick = () => {
    const base = n(st.all) ?? n(rims[0]) ?? 0;
    const v = P.tidy(base + Number(b.dataset.rim));
    rimIn.value = v; setAll(v);
  });
  d.querySelectorAll('[data-rimc]').forEach((el) => {
    el.addEventListener('input', () => { st.rim[el.dataset.rimc] = el.value.trim(); show(); });
    el.addEventListener('focus', () => el.select());
  });
  d.querySelector('#adjComp').onchange = (e) => { st.comp = e.target.checked; show(); };
  d.querySelectorAll('[data-off]').forEach((b) => b.onclick = () => { st.off[b.dataset.off] += Number(b.dataset.d) / 10; show(); });
  d.querySelector('[data-a=cancel]').onclick = () => d.close();
  d.querySelector('form').addEventListener('submit', () => {
    // Keep the values from before the first adjustment so it can be reverted.
    const adj = t.adjusted || {
      before: Object.fromEntries(P.CORNERS.map((c) => [c.id, { cold: t[c.id]?.cold ?? '', rimT: t[c.id]?.rimT ?? '' }])),
      marks: {},
    };
    for (const c of P.CORNERS) {
      const v = result(c);
      t[c.id] = { ...(t[c.id] || {}) };
      const marks = new Set(adj.marks[c.id] || []);
      if (v != null) { const nv = P.tidy(v); if (nv !== (t[c.id].cold ?? '')) marks.add('cold'); t[c.id].cold = nv; }
      if (n(st.rim[c.id]) != null) { if (st.rim[c.id] !== (t[c.id].rimT ?? '')) marks.add('rimT'); t[c.id].rimT = st.rim[c.id]; }
      adj.marks[c.id] = [...marks];
    }
    if (Object.values(adj.marks).some((x) => x.length)) { adj.at = Date.now(); t.adjusted = adj; }
    touch(m); markChip(m, s); renderPressure(m, s);
    toast('Pressures adjusted');
  });
}

function openPressureSettings(m) {
  const st = P.settingsOf(m);
  const d = sheet(`
    <form method="dialog" class="sheet-body">
      <h3>Pressure settings (this event)</h3>
      <label class="field">Ref temperature (°C) – pressures are compared at this rim temp
        <input name="refTemp" value="${esc(st.refTemp)}" inputmode="decimal"></label>
      <label class="field">PSI per °C rim temp
        <input name="psiPerDeg" value="${esc(st.psiPerDeg)}" inputmode="decimal"></label>
      <label class="field">Ref rise (generic) – Rise coeff compares each tyre's hot/cold rise with this (1.1 = 10%)
        <input name="refRise" value="${esc(st.refRise)}" inputmode="decimal"></label>
      <div class="row"><button class="pri" value="save" style="flex:1">Done</button></div>
    </form>`);
  d.querySelector('form').addEventListener('submit', () => {
    const fd = new FormData(d.querySelector('form'));
    m.pressure = {};
    for (const k of ['refTemp', 'psiPerDeg', 'refRise']) {
      const v = String(fd.get(k)).trim();
      if (v !== '' && !isNaN(Number(v))) m.pressure[k] = v;
    }
    touch(m);
    renderMeeting(m);
  });
}

// ---------- Sheets ----------
function sheet(html) {
  const d = document.createElement('dialog');
  d.className = 'sheet';
  d.innerHTML = html;
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.showModal();
  return d;
}

function openDetails(m, isNew = false) {
  const d = sheet(`
    <form method="dialog" class="sheet-body">
      <h3>${isNew ? 'New event' : 'Event details'}</h3>
      <label class="field">Track<input name="track" value="${esc(m.track)}" placeholder="e.g. Whilton Mill" autocapitalize="words"></label>
      <label class="field">Date<input name="date" type="date" value="${esc(m.date)}"></label>
      <label class="field">Class / kart<input name="kartClass" value="${esc(m.kartClass)}" placeholder="e.g. Junior Rotax" autocapitalize="words"></label>
      <div class="row"><button class="pri" value="save" style="flex:1">Done</button></div>
    </form>`);
  if (isNew) d.querySelector('[name=track]').focus();
  d.querySelector('form').addEventListener('submit', () => {
    const fd = new FormData(d.querySelector('form'));
    m.track = fd.get('track').trim();
    m.date = fd.get('date');
    m.kartClass = fd.get('kartClass').trim();
    touch(m);
    store.save(state, true);
    renderMeeting(m);
  });
}

function openMenu(m, sess) {
  const canDelete = ui.view === 'session' && m.sessions.length > 1;
  const d = sheet(`
    <div class="sheet-body">
      <button data-a="details">Edit event details</button>
      <button data-a="pressure">Pressure settings</button>
      <button data-a="fuel">Fuel settings</button>
      ${ui.view === 'session' ? `<button data-a="clearSession">Clear session "${esc(label(m, sess))}"</button>` : ''}
      <button data-a="clearAll">Clear all sessions</button>
      ${canDelete ? `<button data-a="delSession" class="danger">Delete session "${esc(label(m, sess))}"</button>` : ''}
      <button data-a="carry">New event from this setup</button>
      <button data-a="delete" class="danger">Delete event</button>
      <button data-a="cancel">Cancel</button>
    </div>`);
  d.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.a;
    d.close();
    if (a === 'details') openDetails(m);
    if (a === 'pressure') openPressureSettings(m);
    if (a === 'fuel') openFuelSettings(m);
    if (a === 'carry') carryForward(m);
    if (a === 'clearSession' && confirm(`Clear "${label(m, sess)}"? Its changes, times and notes are removed, so it goes back to the setup carried from before. The tab and its name stay.`)) {
      sess.values = {};
      sess.notes = '';
      sess.tyres = [];
      sess.fuel = {};
      touch(m);
      renderMeeting(m);
      toast('Session cleared');
    }
    if (a === 'clearAll' && confirm('Clear every session in this event? All setups, times, notes and session names are removed and you start again with 7 blank sessions. Track and date stay.')) {
      m.sessions = store.newMeeting().sessions;
      touch(m);
      openSession(m, m.sessions[0].id);
      toast('All sessions cleared');
    }
    if (a === 'delSession' && confirm(`Delete session "${label(m, sess)}"? This cannot be undone.`)) {
      const i = m.sessions.indexOf(sess);
      m.sessions.splice(i, 1);
      touch(m);
      openSession(m, m.sessions[Math.max(0, i - 1)].id);
    }
    if (a === 'delete' && confirm(`Delete "${m.track || 'Untitled event'}"? This cannot be undone.`)) {
      state.meetings = state.meetings.filter((x) => x !== m);
      store.save(state, true);
      location.hash = '#/';
    }
  }));
}

// ---------- Saved setups ----------
const savedSetupsSorted = () => [...state.setups].sort((a, b) => b.savedAt - a.savedAt);
const setupMeta = (x) => [x.track, x.kartClass, new Date(x.savedAt).toLocaleDateString()].filter(Boolean).join(' · ');

function saveSetupSheet(m, s) {
  const suggested = [m.track, label(m, s)].filter(Boolean).join(' – ');
  const d = sheet(`
    <form method="dialog" class="sheet-body">
      <h3>Save setup</h3>
      <label class="field">Name<input name="name" value="${esc(suggested)}" placeholder="e.g. Whilton dry baseline" autocapitalize="words"></label>
      <div class="mute">Saves the full setup in force at this session (including values carried from earlier sessions) so you can load it later.</div>
      <div class="row"><button class="pri" value="save" style="flex:1">Save</button></div>
    </form>`);
  const inp = d.querySelector('[name=name]');
  inp.focus(); inp.select();
  d.querySelector('form').addEventListener('submit', () => {
    const name = inp.value.trim() || suggested || 'Setup';
    const existing = state.setups.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (existing && !confirm(`Replace the saved setup "${existing.name}"?`)) return;
    const entry = { id: existing?.id || store.uid(), name, track: m.track, kartClass: m.kartClass,
      values: store.effectiveAt(m, s), savedAt: Date.now() };
    state.setups = state.setups.filter((x) => x !== existing);
    state.setups.push(entry);
    store.save(state, true);
    toast(`Saved "${name}"`);
  });
}

function loadSetupSheet(m, s) {
  const list = savedSetupsSorted();
  const d = sheet(`
    <div class="sheet-body">
      <h3>Load setup into ${esc(label(m, s))}</h3>
      ${list.length ? list.map((x) => `
        <button class="saved-pick" data-id="${x.id}"><span>${esc(x.name)}</span><span class="mute">${esc(setupMeta(x))}</span></button>`).join('')
        : '<div class="mute">No saved setups yet. Use “Save setup” on a session first.</div>'}
      <button data-a="cancel">Cancel</button>
    </div>`);
  d.querySelector('[data-a=cancel]').onclick = () => d.close();
  d.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => {
    const x = state.setups.find((y) => y.id === b.dataset.id);
    d.close();
    if (store.sessionHasData(s) && !confirm(`Replace this session's setup with "${x.name}"? Times and notes are kept.`)) return;
    store.applySetup(s, x.values);
    touch(m);
    store.save(state, true);
    renderMeeting(m);
    toast(`Loaded "${x.name}"`);
  });
}

// Start a new event using the last session with data as the first session's setup.
function carryForward(m) {
  const last = [...m.sessions].reverse().find((s) => store.sessionHasData(s));
  const n = store.newMeeting({ track: m.track, kartClass: m.kartClass });
  if (last) {
    n.sessions[0].values = store.effectiveAt(m, last);
  }
  state.meetings.push(n);
  store.save(state, true);
  ui.session = n.sessions[0].id; ui.view = 'session';
  location.hash = `#/m/${n.id}`;
  setTimeout(() => openDetails(n, true), 50);
  if (last) toast(`First session pre-filled from ${label(m, last)}`);
}

// ---------- Fuel ----------
const fmtL = (v) => (v == null || !isFinite(v) ? '–' : v.toFixed(1));

// Fuel start / end on the Setup page; tapping a name opens the fuel page.
function fuelSummaryHTML(m, s) {
  const f = s.fuel || {};
  const c = F.fuelCalc(m, s);
  return `
    <div class="card fuel-sum">
      <button class="fuel-top link" data-goto="fuel" aria-label="Open fuel page"><h3>Fuel</h3>${CHEV}</button>
      ${[['start', 'Fuel start', c.startL], ['end', 'Fuel end', c.endL]].map(([k, name, l]) => `
        <div class="fuel-line">
          <button class="flabel ref" data-goto="fuel">${name}</button>
          <input data-fuel="${k}" value="${esc(f[k] ?? '')}" inputmode="decimal" placeholder="mm" autocomplete="off" aria-label="${name} mm">
          <span class="fuel-l" data-fuel-l="${k}">${fmtL(l)} L</span>
        </div>`).join('')}
      <div class="fuel-used mute">Used <b data-fuel-used>${fmtL(c.used)}</b> L</div>
    </div>`;
}

function bindFuelInputs(m, s, after) {
  $app.querySelectorAll('input[data-fuel]').forEach((el) => {
    el.addEventListener('input', () => {
      s.fuel = { ...(s.fuel || {}), [el.dataset.fuel]: el.value.trim() };
      touch(m); markChip(m, s);
      const c = F.fuelCalc(m, s);
      $app.querySelectorAll('[data-fuel-l=start]').forEach((x) => { x.textContent = `${fmtL(c.startL)} L`; });
      $app.querySelectorAll('[data-fuel-l=end]').forEach((x) => { x.textContent = `${fmtL(c.endL)} L`; });
      $app.querySelectorAll('[data-fuel-used]').forEach((x) => { x.textContent = fmtL(c.used); });
      if (after) after(c);
    });
    el.addEventListener('focus', () => el.select());
  });
}

function renderFuel(m, s) {
  const f = s.fuel || {};
  const row = (label, inner, hint = '') => `<div class="fuel-row"><div class="flabel">${label}${hint ? `<div class="hint">${hint}</div>` : ''}</div>${inner}</div>`;
  const input = (k, ph, aria) => `<input data-fuel="${k}" value="${esc(f[k] ?? '')}" inputmode="decimal" placeholder="${ph}" autocomplete="off" aria-label="${aria}">`;
  const out = (k, unit = '') => `<div class="fuel-out" data-out="${k}"></div><span class="unit">${unit}</span>`;

  $app.innerHTML = `
    <div class="ptop">
      <button class="sm" id="toSetup">‹ Setup</button>
      <div class="ptitle">Fuel · ${esc(label(m, s))}</div>
    </div>
    <div class="card fuel">
      <h3>Tank (dipstick)</h3>
      ${row('Start', `${input('start', 'mm', 'Fuel start mm')}<span class="fuel-l" data-fuel-l="start"></span>`)}
      ${row('End', `${input('end', 'mm', 'Fuel end mm')}<span class="fuel-l" data-fuel-l="end"></span>`)}
      ${row('<b>Used</b>', out('used', 'L'))}
    </div>
    <div class="card fuel">
      <h3>Consumption</h3>
      ${row('Session mins', input('mins', 'mins', 'Session minutes'))}
      ${row('Used / min', out('perMin', 'L'))}
      ${row('Next session mins', input('nextMins', 'mins', 'Next session minutes'))}
      ${row('Fuel needed to add', out('needed', 'L'))}
      ${row('Total needed', out('totalNeeded', 'L'), 'in tank at the start')}
    </div>
    <div class="card fuel">
      <h3>Weight</h3>
      ${row('Weight at end of session', input('endWeight', 'kg', 'Weight at end of session'))}
      ${row('Delta', out('delta', 'kg'), 'vs min weight + margin')}
      ${row('Fuel req for weight', out('forWeight', 'L'))}
      ${row('<b>Uplift</b>', out('uplift', 'L'), 'fuel needed + fuel for weight')}
      ${row('Total in tank', out('upliftTotal', 'L'))}
    </div>
    <div class="card fuel main">
      <h3>Fill to</h3>
      ${row('Litres to add', input('add', '', 'Litres to add'), 'blank = uplift')}
      ${row('In tank', out('inTank', 'L'))}
      ${row('<b>Dipstick</b>', out('fillMm', 'mm'))}
    </div>
    <div class="card fuel">
      <h3>Convert</h3>
      ${row('mm → litres', `<input id="cvMm" inputmode="decimal" placeholder="mm" autocomplete="off"><span class="fuel-l" id="cvL"></span>`)}
      ${row('litres → mm', `<input id="cvL2" inputmode="decimal" placeholder="L" autocomplete="off"><span class="fuel-l" id="cvMm2"></span>`)}
    </div>
    <div class="card fuel tank">
      <h3>Tank table <span class="mute">· all events</span></h3>
      <div class="tank-head"><span>Dipstick mm</span><span>Litres</span><span></span></div>
      <div id="tankRows"></div>
      <div class="row">
        <button id="addTankRow" style="flex:1">+ Add row</button>
        <button id="resetTank" class="sm">Reset to default</button>
      </div>
    </div>
    <div class="mute">Min weight, margin and fuel density are in ••• → Fuel settings.</div>`;

  const show = (c) => {
    const set = (k, v) => { const el = $app.querySelector(`[data-out="${k}"]`); if (el) el.textContent = v; };
    $app.querySelectorAll('[data-fuel-l=start]').forEach((x) => { x.textContent = `${fmtL(c.startL)} L`; });
    $app.querySelectorAll('[data-fuel-l=end]').forEach((x) => { x.textContent = `${fmtL(c.endL)} L`; });
    set('used', fmtL(c.used));
    set('perMin', c.perMin == null ? '–' : c.perMin.toFixed(2));
    set('needed', fmtL(c.needed));
    set('totalNeeded', fmtL(c.totalNeeded));
    set('delta', c.delta == null ? '–' : (c.delta > 0 ? '+' : '') + c.delta.toFixed(1));
    set('forWeight', fmtL(c.forWeight));
    set('uplift', fmtL(c.uplift));
    set('upliftTotal', fmtL(c.upliftTotal));
    set('inTank', fmtL(c.inTank));
    set('fillMm', c.fillMm == null ? '–' : Math.round(c.fillMm));
    const addIn = $app.querySelector('input[data-fuel=add]');
    addIn.placeholder = c.uplift == null ? 'L' : c.uplift.toFixed(1);
  };
  show(F.fuelCalc(m, s));
  bindFuelInputs(m, s, show);

  const st = F.fuelSettings(m);
  const cv = (inp, outEl, fn, unit, d) => inp.addEventListener('input', () => {
    const v = fn(inp.value.trim(), F.fuelSettings(m).table);
    outEl.textContent = v == null ? '' : `${v.toFixed(d)} ${unit}`;
  });
  cv(document.getElementById('cvMm'), document.getElementById('cvL'), F.litresFromMm, 'L', 1);
  cv(document.getElementById('cvL2'), document.getElementById('cvMm2'), F.mmFromLitres, 'mm', 0);
  document.getElementById('toSetup').onclick = () => { ui.view = 'session'; renderMeeting(m); window.scrollTo(0, 0); };

  // Tank table: edit in place, saved as you type, used by every event.
  if (!state.tank) state.tank = F.FUEL_DEFAULTS.table.map((r) => r.map(String));
  const rowsEl = document.getElementById('tankRows');
  const saveTank = () => {
    F.setTankTable(state.tank);
    store.save(state);
    show(F.fuelCalc(m, s));
  };
  const drawTank = () => {
    rowsEl.innerHTML = state.tank.map(([mm, l], i) => `
      <div class="tank-row">
        <input data-tank="${i}:0" value="${esc(mm)}" inputmode="decimal" placeholder="mm" aria-label="Row ${i + 1} mm">
        <input data-tank="${i}:1" value="${esc(l)}" inputmode="decimal" placeholder="L" aria-label="Row ${i + 1} litres">
        <button class="sm" data-del-tank="${i}" aria-label="Delete row ${i + 1}">✕</button>
      </div>`).join('');
    rowsEl.querySelectorAll('[data-tank]').forEach((el) => {
      el.addEventListener('input', () => {
        const [i, j] = el.dataset.tank.split(':').map(Number);
        state.tank[i][j] = el.value.trim();
        saveTank();
      });
      el.addEventListener('focus', () => el.select());
    });
    rowsEl.querySelectorAll('[data-del-tank]').forEach((b) => b.onclick = () => {
      state.tank.splice(Number(b.dataset.delTank), 1);
      saveTank(); drawTank();
    });
  };
  drawTank();
  document.getElementById('addTankRow').onclick = () => {
    state.tank.push(['', '']);
    drawTank();
    rowsEl.querySelector(`[data-tank="${state.tank.length - 1}:0"]`).focus();
  };
  document.getElementById('resetTank').onclick = () => {
    if (!confirm('Put the tank table back to the original values from the spreadsheet?')) return;
    state.tank = F.FUEL_DEFAULTS.table.map((r) => r.map(String));
    saveTank(); drawTank();
  };
}

function openFuelSettings(m) {
  const st = F.fuelSettings(m);
  const d = sheet(`
    <form method="dialog" class="sheet-body">
      <h3>Fuel settings (this event)</h3>
      <label class="field">Min weight (kg)<input name="minWeight" value="${esc(st.minWeight)}" inputmode="decimal"></label>
      <label class="field">Margin (kg above min weight)<input name="margin" value="${esc(st.margin)}" inputmode="decimal"></label>
      <label class="field">Fuel density (kg per litre)<input name="density" value="${esc(st.density)}" inputmode="decimal"></label>
      <div class="mute">The tank table (dipstick mm = litres) is on the Fuel page and is shared by all events.</div>
      <div class="row"><button class="pri" value="save" style="flex:1">Done</button></div>
    </form>`);
  d.querySelector('form').addEventListener('submit', () => {
    const fd = new FormData(d.querySelector('form'));
    const fuel = {};
    for (const k of ['minWeight', 'margin', 'density']) {
      const v = String(fd.get(k)).trim();
      if (v !== '' && !isNaN(Number(v))) fuel[k] = Number(v);
    }
    m.fuel = fuel;
    touch(m);
    renderMeeting(m);
  });
}

// ---------- Misc ----------
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.save(state, true);
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // When an updated version installs, reload once so it shows straight away.
  const hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    store.save(state, true);
    location.reload();
  });
  navigator.serviceWorker.register('./sw.js');
}

route();
