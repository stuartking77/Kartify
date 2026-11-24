import { SESSIONS, FIELDS, CASTER_OFFSETS, casterDegrees } from './schema.js';
import * as store from './store.js';

const state = store.load();
const $app = document.getElementById('app');
const ui = { session: 't1', view: 'session' }; // view: session | grid | log

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function findMeeting(id) { return state.meetings.find((m) => m.id === id); }

function touch(m) { m.updatedAt = Date.now(); store.save(state); }

// ---------- Router ----------
function route() {
  const hash = location.hash.slice(1) || '/';
  const parts = hash.split('/').filter(Boolean);
  document.querySelectorAll('.tabbar a').forEach((a) =>
    a.classList.toggle('active', a.dataset.tab === (parts[0] === 'ref' ? 'ref' : 'setup')));
  if (parts[0] === 'm' && parts[1]) {
    const m = findMeeting(parts[1]);
    if (!m) { location.hash = '#/'; return; }
    if (parts[2] && SESSIONS.some((s) => s.id === parts[2])) ui.session = parts[2];
    renderMeeting(m);
  } else if (parts[0] === 'ref') {
    renderRef();
  } else {
    renderHome();
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// ---------- Home ----------
function renderHome() {
  const meetings = [...state.meetings].sort((a, b) =>
    (b.date || '').localeCompare(a.date || '') || b.createdAt - a.createdAt);

  $app.innerHTML = `
    <header class="bar">
      <h1>Events</h1>
      <button class="btn primary" id="new">+ New</button>
    </header>
    <main class="content">
      ${meetings.length === 0 ? `
        <div class="empty">
          <p>No events yet.</p>
          <p class="muted">Create one for each race event or test day, then fill in the setup for each session.</p>
        </div>` : `
        <ul class="cards">
          ${meetings.map((m) => {
            const used = SESSIONS.filter((s) => store.sessionHasData(m.sessions[s.id]));
            return `
            <li><a class="card" href="#/m/${m.id}">
              <div class="card-main">
                <div class="card-title">${esc(m.track) || '<span class="muted">Untitled event</span>'}</div>
                <div class="card-sub">${esc(fmtDate(m.date))}${m.kartClass ? ' · ' + esc(m.kartClass) : ''}</div>
              </div>
              <div class="pips">${SESSIONS.map((s) =>
                `<span class="pip ${used.includes(s) ? 'on' : ''}" title="${s.label}">${s.short}</span>`).join('')}</div>
            </a></li>`;
          }).join('')}
        </ul>`}
      <section class="backup">
        <h2>Backup</h2>
        <p class="muted small">Data is stored on this device only. Export a backup now and then.</p>
        <div class="row gap">
          <button class="btn" id="export">Export</button>
          <label class="btn">Import<input type="file" id="import" accept="application/json,.json" hidden></label>
        </div>
      </section>
    </main>`;

  document.getElementById('new').onclick = () => {
    const m = store.newMeeting();
    state.meetings.push(m);
    store.save(state, true);
    ui.session = 't1';
    location.hash = `#/m/${m.id}`;
    setTimeout(() => openDetails(m, true), 50);
  };
  document.getElementById('export').onclick = exportBackup;
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
  const idx = SESSIONS.findIndex((s) => s.id === ui.session);
  const sess = SESSIONS[idx];

  $app.innerHTML = `
    <header class="bar">
      <a class="btn ghost back" href="#/" aria-label="Back">‹</a>
      <button class="title-btn" id="details">
        <span class="t">${esc(m.track) || 'Untitled event'}</span>
        <span class="s">${esc(fmtDate(m.date))}${m.kartClass ? ' · ' + esc(m.kartClass) : ''}</span>
      </button>
      <button class="btn ghost" id="menu" aria-label="More">•••</button>
    </header>
    <nav class="sessions" id="sessions">
      ${SESSIONS.map((s) => `
        <a href="#/m/${m.id}/${s.id}" class="chip ${s.id === ui.session && ui.view === 'session' ? 'active' : ''} ${store.sessionHasData(m.sessions[s.id]) ? 'has' : ''}">${s.label}</a>`).join('')}
      <button class="chip view-chip ${ui.view === 'log' ? 'active' : ''}" data-view="log">Changes</button>
      <button class="chip view-chip ${ui.view === 'grid' ? 'active' : ''}" data-view="grid">Grid</button>
    </nav>
    <main class="content" id="body"></main>`;

  document.getElementById('details').onclick = () => openDetails(m);
  document.getElementById('menu').onclick = () => openMenu(m);
  document.querySelectorAll('#sessions [data-view]').forEach((b) =>
    b.addEventListener('click', () => { ui.view = b.dataset.view; renderMeeting(m); }));
  document.querySelectorAll('#sessions a').forEach((a) =>
    a.addEventListener('click', () => {
      const same = a.getAttribute('href') === location.hash;
      ui.view = 'session';
      if (same) renderMeeting(m); // hash unchanged, so no hashchange event
    }));
  // keep active chip visible
  document.querySelector('#sessions .active')?.scrollIntoView({ inline: 'center', block: 'nearest' });

  const body = document.getElementById('body');
  if (ui.view === 'grid') { renderGrid(m, body); return; }
  if (ui.view === 'log') { renderLog(m, body); return; }
  renderSessionForm(m, sess, idx, body);
}

function previousFilled(m, idx) {
  for (let i = idx - 1; i >= 0; i--) {
    if (store.sessionHasData(m.sessions[SESSIONS[i].id])) return SESSIONS[i];
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

function renderSessionForm(m, sess, idx, body) {
  const s = m.sessions[sess.id];
  const prev = previousFilled(m, idx);

  body.innerHTML = `
    <div class="toolbar">
      ${prev ? `<button class="btn small" id="copyPrev">Copy from ${prev.label}</button>` : '<span></span>'}
      <label class="switch"><input type="checkbox" id="wets" ${s.wets ? 'checked' : ''}><span>Wets</span></label>
    </div>
    <div id="changes"></div>
    <div class="form">
      <div class="form-head"><span></span><span>Front</span><span>Rear</span></div>
      ${FIELDS.map((f) => `
        <div class="frow ${f.single ? 'single' : ''}">
          <div class="flabel">${esc(f.label)}${f.unit ? ` <span class="unit">${esc(f.unit)}</span>` : ''}
            ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</div>
          ${f.single
            ? inputHTML(f, 'v', store.getVal(s, f))
            : inputHTML(f, 'f', store.getVal(s, f, 'f')) + inputHTML(f, 'r', store.getVal(s, f, 'r'))}
        </div>`).join('')}
    </div>
    <label class="notes">
      <span>Notes</span>
      <textarea id="notes" rows="5" placeholder="How did it feel? What changed?">${esc(s.notes)}</textarea>
    </label>`;

  body.querySelectorAll('input[data-field]').forEach((el) => {
    el.addEventListener('input', () => {
      const f = FIELDS.find((x) => x.id === el.dataset.field);
      store.setVal(s, f, el.dataset.side, el.value.trim());
      touch(m);
      markChip(m, sess);
      renderChanges(m, sess, prev);
    });
    el.addEventListener('focus', () => el.select());
  });
  body.querySelectorAll('[data-sign]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => e.preventDefault()); // keep keyboard focus
    btn.addEventListener('click', () => {
      const [fid, side] = btn.dataset.sign.split(':');
      const input = body.querySelector(`input[data-field="${fid}"][data-side="${side}"]`);
      let v = input.value.trim();
      if (v.startsWith('-') || v.startsWith('−')) v = v.slice(1);
      else if (v.startsWith('+')) v = '-' + v.slice(1);
      else v = '-' + v;
      input.value = v;
      input.dispatchEvent(new Event('input'));
    });
  });
  renderChanges(m, sess, prev);
  document.getElementById('notes').addEventListener('input', (e) => {
    s.notes = e.target.value; touch(m); markChip(m, sess);
  });
  document.getElementById('wets').addEventListener('change', (e) => { s.wets = e.target.checked; touch(m); });

  if (prev) {
    document.getElementById('copyPrev').onclick = () => {
      if (store.sessionHasData(s) && !confirm(`Replace ${sess.label} values with ${prev.label}? Notes are kept.`)) return;
      const src = m.sessions[prev.id];
      const values = JSON.parse(JSON.stringify(src.values));
      delete values.time; // lap times belong to the session they were set in
      s.values = values;
      s.wets = src.wets;
      touch(m);
      renderMeeting(m);
      toast(`Copied setup from ${prev.label}`);
    };
  }
}

const sideLabel = (side) => (side === 'f' ? 'F' : side === 'r' ? 'R' : '');

function changeListHTML(diffs) {
  return `<ul class="changes-list">${diffs.map((d) => `
    <li><span class="cl-field">${esc(d.field.label)} ${sideLabel(d.side)}</span>
      <span class="cl-from">${esc(d.from) || '—'}</span><span class="cl-arrow">→</span><span class="cl-to">${esc(d.to) || '—'}</span></li>`).join('')}</ul>`;
}

// Live "what changed vs the previous session" card at the top of the session form.
function renderChanges(m, sess, prev) {
  const el = document.getElementById('changes');
  if (!el) return;
  const cur = m.sessions[sess.id];
  if (!prev || !store.sessionHasData(cur)) { el.innerHTML = ''; return; }
  const diffs = store.diffSessions(m.sessions[prev.id], cur);
  el.innerHTML = `
    <section class="changes-card">
      <h3>Changes from ${esc(prev.label)}</h3>
      ${diffs.length ? changeListHTML(diffs) : '<p class="muted small">No setup changes.</p>'}
    </section>`;
}

// Event changes record: every session in order, what changed going into it, its times and notes.
function renderLog(m, body) {
  const filled = SESSIONS.filter((s) => store.sessionHasData(m.sessions[s.id]));
  if (!filled.length) {
    body.innerHTML = '<div class="empty"><p>No sessions recorded yet.</p></div>';
    return;
  }
  const timeF = FIELDS.find((f) => f.id === 'time');
  const refF = FIELDS.find((f) => f.id === 'refTime');
  body.innerHTML = `<ol class="log">${filled.map((s, i) => {
    const cur = m.sessions[s.id];
    const prev = i > 0 ? filled[i - 1] : null;
    const diffs = prev ? store.diffSessions(m.sessions[prev.id], cur) : null;
    const t = store.getVal(cur, timeF), rt = store.getVal(cur, refF);
    return `
      <li class="log-item">
        <div class="log-head">
          <a href="#/m/${m.id}/${s.id}" data-sess class="log-title">${s.label}${cur.wets ? ' <span class="wet-tag">WETS</span>' : ''}</a>
          ${t || rt ? `<span class="log-time">${t ? esc(t) : ''}${rt ? ` <span class="muted">ref ${esc(rt)}</span>` : ''}</span>` : ''}
        </div>
        ${prev
          ? (diffs.length ? changeListHTML(diffs) : `<p class="muted small">No changes from ${prev.label}.</p>`)
          : '<p class="muted small">Baseline setup.</p>'}
        ${cur.notes ? `<p class="log-notes">${esc(cur.notes)}</p>` : ''}
      </li>`;
  }).join('')}</ol>`;
  body.querySelectorAll('[data-sess]').forEach((a) => a.addEventListener('click', () => { ui.view = 'session'; }));
}

function markChip(m, sess) {
  const chip = document.querySelector(`#sessions a[href$="/${sess.id}"]`);
  chip?.classList.toggle('has', store.sessionHasData(m.sessions[sess.id]));
}

function renderGrid(m, body) {
  const cols = [];
  for (const s of SESSIONS) cols.push(s);
  const cell = (s, f, side) => {
    const sess = m.sessions[s.id];
    const v = store.getVal(sess, f, side);
    // highlight values that changed from the previous session that had a value
    const i = SESSIONS.indexOf(s);
    let changed = false;
    if (v) {
      for (let j = i - 1; j >= 0; j--) {
        const pv = store.getVal(m.sessions[SESSIONS[j].id], f, side);
        if (pv) { changed = pv !== v; break; }
      }
    }
    return `<td class="${changed ? 'changed' : ''}">${esc(v)}</td>`;
  };

  body.innerHTML = `
    <p class="muted small pad">Highlighted cells changed from the previous session. Tap a session name to edit it.</p>
    <div class="grid-wrap">
      <table class="grid">
        <thead>
          <tr><th class="stick"></th>${cols.map((s) =>
            `<th colspan="2" class="${m.sessions[s.id].wets ? 'wet' : ''}"><a href="#/m/${m.id}/${s.id}" data-sess>${s.label}${m.sessions[s.id].wets ? ' 💧' : ''}</a></th>`).join('')}</tr>
          <tr><th class="stick"></th>${cols.map(() => '<th class="fr">F</th><th class="fr">R</th>').join('')}</tr>
        </thead>
        <tbody>
          ${FIELDS.map((f) => `
            <tr><th class="stick">${esc(f.label)}</th>${cols.map((s) => f.single
              ? `<td colspan="2" class="span">${esc(store.getVal(m.sessions[s.id], f))}</td>`
              : cell(s, f, 'f') + cell(s, f, 'r')).join('')}</tr>`).join('')}
          <tr class="notes-row"><th class="stick">Notes</th>${cols.map((s) =>
            `<td colspan="2" class="note">${esc(m.sessions[s.id].notes)}</td>`).join('')}</tr>
        </tbody>
      </table>
    </div>`;
  body.querySelectorAll('[data-sess]').forEach((a) => a.addEventListener('click', () => { ui.view = 'session'; }));
}

// ---------- Sheets / dialogs ----------
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
      <h2>${isNew ? 'New event' : 'Event details'}</h2>
      <label class="field"><span>Track</span>
        <input name="track" value="${esc(m.track)}" placeholder="e.g. Whilton Mill" autocapitalize="words"></label>
      <label class="field"><span>Date</span>
        <input name="date" type="date" value="${esc(m.date)}"></label>
      <label class="field"><span>Class / kart</span>
        <input name="kartClass" value="${esc(m.kartClass)}" placeholder="e.g. Junior Rotax" autocapitalize="words"></label>
      <div class="row gap end">
        <button class="btn primary" value="save">Done</button>
      </div>
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

function openMenu(m) {
  const d = sheet(`
    <div class="sheet-body menu">
      <button class="btn block" data-a="details">Edit details</button>
      <button class="btn block" data-a="carry">New event from this setup</button>
      <button class="btn block danger" data-a="delete">Delete event</button>
      <button class="btn block ghost" data-a="cancel">Cancel</button>
    </div>`);
  d.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.a;
    d.close();
    if (a === 'details') openDetails(m);
    if (a === 'carry') carryForward(m);
    if (a === 'delete') {
      if (confirm(`Delete "${m.track || 'Untitled event'}"? This cannot be undone.`)) {
        state.meetings = state.meetings.filter((x) => x !== m);
        store.save(state, true);
        location.hash = '#/';
      }
    }
  }));
}

// Start a new meeting using the last session with data as the Test 1 baseline.
function carryForward(m) {
  const last = [...SESSIONS].reverse().find((s) => store.sessionHasData(m.sessions[s.id]));
  const n = store.newMeeting({ track: m.track, kartClass: m.kartClass });
  if (last) {
    const values = JSON.parse(JSON.stringify(m.sessions[last.id].values));
    delete values.time;
    n.sessions.t1.values = values;
  }
  state.meetings.push(n);
  store.save(state, true);
  ui.session = 't1'; ui.view = 'session';
  location.hash = `#/m/${n.id}`;
  setTimeout(() => openDetails(n, true), 50);
  if (last) toast(`Test 1 pre-filled from ${last.label}`);
}

// ---------- Reference ----------
function renderRef() {
  $app.innerHTML = `
    <header class="bar"><h1>Reference</h1></header>
    <main class="content ref">
      <section class="panel">
        <h2>Caster calculator</h2>
        <div class="row gap wrap">
          <div class="seg" id="casterPos">
            <button data-v="FWD">FWD</button><button data-v="BACK" class="on">BACK</button>
          </div>
          <select id="casterOff" aria-label="Offset">
            ${CASTER_OFFSETS.map((o) => `<option value="${o}" ${o === 0 ? 'selected' : ''}>${o > 0 ? '+' + o : o}</option>`).join('')}
          </select>
        </div>
        <div class="big" id="casterOut"></div>
        <p class="muted small">16.5° base, +3° when BACK, plus offset.</p>
      </section>

      <section class="panel">
        <h2>Stub position <span class="muted small">(LHS)</span></h2>
        <div class="stub">
          <span style="grid-area:a">1</span>
          <span style="grid-area:b">2</span>
          <span style="grid-area:c">3</span>
          <span style="grid-area:d">4</span>
          <span style="grid-area:e">5</span>
        </div>
      </section>

      <section class="panel">
        <h2>Sign conventions</h2>
        <table class="legend">
          <tr><th>Camber</th><td><b>+</b> positive</td><td><b>−</b> negative</td></tr>
          <tr><th>Toe</th><td><b>+</b> out</td><td><b>−</b> in</td></tr>
          <tr><th>Brake pos</th><td colspan="2"><b>1</b> = top</td></tr>
        </table>
      </section>
    </main>`;

  let pos = 'BACK';
  const out = document.getElementById('casterOut');
  const off = document.getElementById('casterOff');
  const update = () => { out.textContent = casterDegrees(pos, off.value).toFixed(1) + '°'; };
  document.querySelectorAll('#casterPos button').forEach((b) => b.addEventListener('click', () => {
    pos = b.dataset.v;
    document.querySelectorAll('#casterPos button').forEach((x) => x.classList.toggle('on', x === b));
    update();
  }));
  off.addEventListener('change', update);
  update();
}

// ---------- Misc ----------
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
}

// Flush pending saves when the app is backgrounded.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') store.save(state, true);
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js');
}

route();
