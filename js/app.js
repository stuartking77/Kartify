import { FIELDS, TIMES, CASTER_TOP, CASTER_BOTTOM, casterDegrees, signed } from './schema.js';
import * as store from './store.js';

const state = store.load();
const $app = document.getElementById('app');
const $hdr = document.getElementById('hdr');
const $nav = document.getElementById('nav');
const ui = { session: null, view: 'session' }; // session: id; view: session | grid

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
  ui.view = 'session';
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
      <button data-s="${s.id}" class="${s.id === ui.session && ui.view === 'session' ? 'act' : ''} ${store.sessionHasData(s) ? 'has' : ''} ${tabName(m, s) ? '' : 'unnamed'}">${esc(tabName(m, s) || m.sessions.indexOf(s) + 1)}</button>`).join('')}
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
function segHTML(fieldId, key, options, current, inherited = '') {
  return `<div class="seg" data-choice="${fieldId}:${key}" data-inh="${esc(inherited)}">${options.map((o) => {
    const v = typeof o === 'string' ? o : o.v;
    const txt = typeof o === 'string' ? o : `${o.v}<small>= ${o.note}</small>`;
    return `<button data-v="${v}" class="${segClass(v, current, inherited)}">${txt}</button>`;
  }).join('')}</div>`;
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
          <div class="lbl-ctl"><span>Top</span>${selectHTML('caster', 'top', CASTER_TOP, o('top'), 'Caster top position', i('top'))}</div>
          <div class="lbl-ctl"><span>Bottom</span>${segHTML('caster', 'bottom', CASTER_BOTTOM, o('bottom'), i('bottom'))}</div>
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
      <h3>Notes</h3>
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

  document.getElementById('saveSetup').onclick = () => saveSetupSheet(m, s);
  document.getElementById('loadSetup').onclick = () => loadSetupSheet(m, s);

  renderChanges(m, s);
  document.getElementById('notes').addEventListener('input', (e) => {
    s.notes = e.target.value; touch(m); markChip(m, s);
  });

}

function paintSeg(seg, current) {
  const inh = seg.dataset.inh;
  seg.querySelectorAll('button').forEach((x) => { x.className = segClass(x.dataset.v, current, inh); });
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
    if (a === 'carry') carryForward(m);
    if (a === 'clearSession' && confirm(`Clear "${label(m, sess)}"? Its changes, times and notes are removed, so it goes back to the setup carried from before. The tab and its name stay.`)) {
      sess.values = {};
      sess.notes = '';
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
