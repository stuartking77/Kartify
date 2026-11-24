import { FIELDS, TIMES, CASTER_TOP, CASTER_BOTTOM, casterDegrees, signed } from './schema.js';
import * as store from './store.js';

const state = store.load();
const $app = document.getElementById('app');
const $hdr = document.getElementById('hdr');
const $nav = document.getElementById('nav');
const ui = { session: null, view: 'session' }; // session: id; view: session | log | grid

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
  } else if (parts[0] === 'ref') {
    renderRef();
  } else {
    renderHome();
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

function topNav(active) {
  $nav.className = '';
  $nav.innerHTML = `
    <button data-go="#/" class="${active === 'setup' ? 'act' : ''}">Setup</button>
    <button data-go="#/ref" class="${active === 'ref' ? 'act' : ''}">Reference</button>`;
  $nav.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => { location.hash = b.dataset.go; });
}

function openSession(m, sid) {
  ui.view = 'session';
  ui.session = sid;
  const h = `#/m/${m.id}/${sid}`;
  if (location.hash === h) renderMeeting(m); else location.hash = h;
}

// ---------- Home ----------
function renderHome() {
  $hdr.innerHTML = `${LOGO}<h1>KARTIFY</h1><button id="new" class="pri sm">+ New event</button>`;
  topNav('setup');
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
      <button data-s="${s.id}" class="${s.id === ui.session && ui.view === 'session' ? 'act' : ''} ${store.sessionHasData(s) ? 'has' : ''} ${s.name.trim() || store.defaultSessionName(m, s) ? '' : 'unnamed'}">${esc(label(m, s))}</button>`).join('')}
    <button id="addSession" aria-label="Add session">+</button>
    <span class="sep"></span>
    <button data-view="log" class="${ui.view === 'log' ? 'act' : ''}">Changes</button>
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
  if (ui.view === 'log') return renderLog(m);
  renderSessionForm(m, sess);
}

function previousFilled(m, sess) {
  for (let i = m.sessions.indexOf(sess) - 1; i >= 0; i--) {
    if (store.sessionHasData(m.sessions[i])) return m.sessions[i];
  }
  return null;
}

function inputHTML(field, side, value) {
  const mode = field.kind === 'text' ? 'text' : 'decimal';
  return `
    <div class="cell">
      <input data-field="${field.id}" data-side="${side}" value="${esc(value)}"
        inputmode="${mode}" autocomplete="off" autocorrect="off" autocapitalize="characters" spellcheck="false"
        aria-label="${esc(field.label)} ${side === 'f' ? 'front' : side === 'r' ? 'rear' : ''}">
      ${field.kind === 'signed' ? `<button class="sign" tabindex="-1" data-sign="${field.id}:${side}" aria-label="Toggle sign">±</button>` : ''}
    </div>`;
}

function casterRowHTML(s) {
  const { top, bottom } = store.getCaster(s);
  const deg = casterDegrees(top, bottom);
  return `
    <div class="frow caster">
      <div class="flabel">Caster</div>
      <div class="caster-ctl">
        <div class="seg" id="casterTop">
          ${CASTER_TOP.map((t) => `<button data-v="${t}" class="${t === top ? 'act' : ''}">${t}</button>`).join('')}
        </div>
        <select id="casterBottom" aria-label="Caster bottom position">
          <option value="" ${bottom === '' ? 'selected' : ''}>–</option>
          ${CASTER_BOTTOM.map((o) => `<option value="${o}" ${String(o) === String(bottom) ? 'selected' : ''}>${signed(o)}</option>`).join('')}
        </select>
        <div class="caster-out" id="casterOut">${deg == null ? '–' : deg.toFixed(1) + '°'}</div>
      </div>
      <div class="caster-lbl mute"><span>Top</span><span>Bottom</span><span></span></div>
    </div>`;
}

function renderSessionForm(m, s) {
  const prev = previousFilled(m, s);

  $app.innerHTML = `
    <div class="card times">
      <label class="time name"><span>Session</span>
        <input id="sessName" value="${esc(s.name)}" placeholder="${esc(store.defaultSessionName(m, s) || 'Name, e.g. Test 1')}"
          autocomplete="off" autocapitalize="words" class="${store.defaultSessionName(m, s) ? 'has-default' : ''}"></label>
      ${TIMES.map((t) => `
        <label class="time"><span>${t.label}</span>
          <input data-time="${t.id}" value="${esc(store.getVal(s, t))}" inputmode="decimal" autocomplete="off" placeholder="–"></label>`).join('')}
    </div>
    <div class="row">
      ${prev ? `<button id="copyPrev" style="flex:1 1 100%">Copy setup from ${esc(label(m, prev))}</button>` : ''}
      <button id="saveSetup" style="flex:1">Save setup</button>
      <button id="loadSetup" style="flex:1">Load setup</button>
    </div>
    <div id="changes"></div>
    <div class="card form">
      <div class="form-head"><span></span><span>Front</span><span>Rear</span></div>
      ${FIELDS.map((f) => f.kind === 'caster' ? casterRowHTML(s) : `
        <div class="frow">
          <div class="flabel">${esc(f.label)}${f.unit ? ` <span class="unit">${esc(f.unit)}</span>` : ''}
            ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</div>
          ${['f', 'r'].map((side) => f.sides.includes(side)
            ? inputHTML(f, side, store.getVal(s, f, side))
            : '<div class="cell na"></div>').join('')}
        </div>`).join('')}
    </div>
    <div class="card">
      <h3>Notes</h3>
      <textarea id="notes" rows="5" placeholder="How did it feel? What changed?">${esc(s.notes)}</textarea>
    </div>`;

  const changed = () => { touch(m); markChip(m, s); renderChanges(m, s, prev); };

  // Session name: blank by default; the next session's tab follows it ("Test 1" -> "Test 2").
  document.getElementById('sessName').addEventListener('input', (e) => {
    s.name = e.target.value;
    touch(m);
    const i = m.sessions.indexOf(s);
    for (const x of m.sessions.slice(i, i + 2)) {
      const b = $nav.querySelector(`[data-s="${x.id}"]`);
      if (b) { b.textContent = label(m, x); b.classList.toggle('unnamed', !x.name.trim() && !store.defaultSessionName(m, x)); }
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
  $app.querySelectorAll('[data-sign]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => e.preventDefault()); // keep keyboard focus
    btn.addEventListener('click', () => {
      const [fid, side] = btn.dataset.sign.split(':');
      const input = $app.querySelector(`input[data-field="${fid}"][data-side="${side}"]`);
      let v = input.value.trim();
      if (v.startsWith('-') || v.startsWith('−')) v = v.slice(1);
      else if (v.startsWith('+')) v = '-' + v.slice(1);
      else v = '-' + v;
      input.value = v;
      input.dispatchEvent(new Event('input'));
    });
  });

  // Caster: pick top and bottom positions, degrees are calculated.
  const updateCaster = () => {
    const { top, bottom } = store.getCaster(s);
    const deg = casterDegrees(top, bottom);
    document.getElementById('casterOut').textContent = deg == null ? '–' : deg.toFixed(1) + '°';
    changed();
  };
  document.querySelectorAll('#casterTop button').forEach((b) => b.onclick = () => {
    const cur = store.getCaster(s);
    const top = cur.top === b.dataset.v ? '' : b.dataset.v; // tap again to clear
    s.values.caster = { ...cur, top };
    document.querySelectorAll('#casterTop button').forEach((x) => x.classList.toggle('act', x.dataset.v === top));
    updateCaster();
  });
  document.getElementById('casterBottom').onchange = (e) => {
    s.values.caster = { ...store.getCaster(s), bottom: e.target.value };
    updateCaster();
  };

  document.getElementById('saveSetup').onclick = () => saveSetupSheet(m, s);
  document.getElementById('loadSetup').onclick = () => loadSetupSheet(m, s);

  renderChanges(m, s, prev);
  document.getElementById('notes').addEventListener('input', (e) => {
    s.notes = e.target.value; touch(m); markChip(m, s);
  });

  if (prev) {
    document.getElementById('copyPrev').onclick = () => {
      if (store.sessionHasData(s) && !confirm(`Replace this setup with ${label(m, prev)}? Times and notes are kept.`)) return;
      store.applySetup(s, prev.values);
      touch(m);
      renderMeeting(m);
      toast(`Copied setup from ${label(m, prev)}`);
    };
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

function renderChanges(m, s, prev) {
  const el = document.getElementById('changes');
  if (!el) return;
  if (!prev || !store.sessionHasData(s)) { el.innerHTML = ''; return; }
  const diffs = store.diffSessions(prev, s);
  el.innerHTML = `
    <div class="card changes-card">
      <h3>Changes from ${esc(label(m, prev))}</h3>
      ${diffs.length ? changeListHTML(diffs) : '<div class="mute">No setup changes.</div>'}
    </div>`;
}

function timesLine(s) {
  const t = store.getVal(s, TIMES[0]), rt = store.getVal(s, TIMES[1]);
  if (!t && !rt) return '';
  return `<span class="log-time">${esc(t)}${rt ? ` <span class="mute">ref ${esc(rt)}</span>` : ''}</span>`;
}

// Changes record: every session in order, what changed going into it, times and notes.
function renderLog(m) {
  const filled = m.sessions.filter((s) => store.sessionHasData(s));
  if (!filled.length) {
    $app.innerHTML = '<div class="card"><div class="mute">No sessions recorded yet.</div></div>';
    return;
  }
  $app.innerHTML = filled.map((s, i) => {
    const prev = i > 0 ? filled[i - 1] : null;
    const diffs = prev ? store.diffSessions(prev, s) : null;
    return `
      <div class="card">
        <div class="log-head"><button class="link" data-s="${s.id}">${esc(label(m, s))}</button>${timesLine(s)}</div>
        ${prev
          ? (diffs.length ? changeListHTML(diffs) : `<div class="mute">No changes from ${esc(label(m, prev))}.</div>`)
          : '<div class="mute">Baseline setup.</div>'}
        ${s.notes ? `<div class="log-notes">${esc(s.notes)}</div>` : ''}
      </div>`;
  }).join('');
  $app.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => openSession(m, b.dataset.s));
}

function renderGrid(m) {
  const cols = m.sessions;
  // Highlight values that differ from the previous session that had a value.
  const cell = (s, f, side) => {
    const v = store.display(s, f, side);
    let changed = false;
    if (v) {
      for (let j = cols.indexOf(s) - 1; j >= 0; j--) {
        const pv = store.display(cols[j], f, side);
        if (pv) { changed = pv !== v; break; }
      }
    }
    return `<td class="${changed ? 'chg' : ''} ${side === 'r' || f.sides.length === 1 ? 'edge' : ''}">${esc(v)}</td>`;
  };
  const rowFor = (f) => `
    <tr><th class="stick">${esc(f.label)}${f.sides.length === 1 ? ` <span class="mute">${sideLabel(f.sides[0])}</span>` : ''}</th>
      ${cols.map((s) => f.sides.length === 1
        ? cell(s, f, f.sides[0]).replace('<td', '<td colspan="2"')
        : cell(s, f, 'f') + cell(s, f, 'r')).join('')}</tr>`;

  $app.innerHTML = `
    <div class="mute" style="margin:4px 0 8px">Green cells changed from the previous session. Tap a session to edit it.</div>
    <div class="grid-wrap">
      <table class="grid">
        <thead>
          <tr><th class="stick"></th>${cols.map((s) =>
            `<th colspan="2" class="edge"><button class="link" data-s="${s.id}">${esc(label(m, s))}</button></th>`).join('')}</tr>
        </thead>
        <tbody>
          ${TIMES.map((t) => `
            <tr class="time-row"><th class="stick">${t.label}</th>${cols.map((s) =>
              `<td colspan="2" class="edge">${esc(store.getVal(s, t))}</td>`).join('')}</tr>`).join('')}
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
      <div class="mute">Saves this session's setup (not times or notes) so you can load it into any session later.</div>
      <div class="row"><button class="pri" value="save" style="flex:1">Save</button></div>
    </form>`);
  const inp = d.querySelector('[name=name]');
  inp.focus(); inp.select();
  d.querySelector('form').addEventListener('submit', () => {
    const name = inp.value.trim() || suggested || 'Setup';
    const existing = state.setups.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (existing && !confirm(`Replace the saved setup "${existing.name}"?`)) return;
    const entry = { id: existing?.id || store.uid(), name, track: m.track, kartClass: m.kartClass,
      values: store.setupValues(s), savedAt: Date.now() };
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
    n.sessions[0].values = store.setupValues(last);
  }
  state.meetings.push(n);
  store.save(state, true);
  ui.session = n.sessions[0].id; ui.view = 'session';
  location.hash = `#/m/${n.id}`;
  setTimeout(() => openDetails(n, true), 50);
  if (last) toast(`First session pre-filled from ${label(m, last)}`);
}

// ---------- Reference ----------
function renderRef() {
  $hdr.innerHTML = `${LOGO}<h1>KARTIFY</h1>`;
  topNav('ref');
  $app.innerHTML = `
    <div class="card">
      <h3>Caster</h3>
      <label>Top<div class="seg" id="rTop">${CASTER_TOP.map((t) =>
        `<button data-v="${t}" class="${t === 'BACK' ? 'act' : ''}">${t}</button>`).join('')}</div></label>
      <label>Bottom<select id="rBottom">${CASTER_BOTTOM.map((o) =>
        `<option value="${o}" ${o === 0 ? 'selected' : ''}>${signed(o)}</option>`).join('')}</select></label>
      <div class="res" id="rOut"></div>
      <div class="mute" style="text-align:center">16.5° base, +3° when top is BACK, plus bottom position.</div>
    </div>
    <div class="card">
      <h3>Stub position (LHS)</h3>
      <div class="stub">
        <span style="grid-area:a">1</span><span style="grid-area:b">2</span><span style="grid-area:c">3</span>
        <span style="grid-area:d">4</span><span style="grid-area:e">5</span>
      </div>
    </div>
    <div class="card">
      <h3>Sign conventions</h3>
      <table>
        <tr><td>Camber</td><td><b>+</b> positive</td><td><b>−</b> negative</td></tr>
        <tr><td>Toe</td><td><b>+</b> out</td><td><b>−</b> in</td></tr>
        <tr><td>Brake pos</td><td colspan="2"><b>1</b> = top</td></tr>
      </table>
    </div>`;
  let top = 'BACK';
  const bottom = document.getElementById('rBottom');
  const update = () => { document.getElementById('rOut').textContent = casterDegrees(top, bottom.value).toFixed(1) + '°'; };
  document.querySelectorAll('#rTop button').forEach((b) => b.onclick = () => {
    top = b.dataset.v;
    document.querySelectorAll('#rTop button').forEach((x) => x.classList.toggle('act', x === b));
    update();
  });
  bottom.onchange = update;
  update();
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
  navigator.serviceWorker.register('./sw.js');
}

route();
