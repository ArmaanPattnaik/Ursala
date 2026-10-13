/* Ursala frontend: router, API client, complaint form, tracking, police console. */
(function () {
  'use strict';

  /* ───────── helpers ───────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ico = (name, cls = '') => `<svg class="i ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const store = {
    get(k, area = localStorage) { try { return area.getItem(k); } catch { return null; } },
    set(k, v, area = localStorage) { try { area.setItem(k, v); } catch { /* storage blocked */ } },
    del(k, area = localStorage) { try { area.removeItem(k); } catch { /* ignore */ } }
  };

  const CATS = [
    { key: 'Theft', icon: 'bag' }, { key: 'Assault', icon: 'bolt' }, { key: 'Cybercrime', icon: 'terminal' },
    { key: 'Harassment', icon: 'chat' }, { key: 'Vandalism', icon: 'crack' }, { key: 'Fraud', icon: 'card' }, { key: 'Other', icon: 'dots' }
  ];
  const catIcon = (k) => (CATS.find((c) => c.key === k) || CATS[CATS.length - 1]).icon;

  // The backend stores status as a free string; these are the values this UI uses.
  const STATUS = {
    PENDING: { label: 'Pending', icon: 'clock', cls: 'st-pending', color: 'var(--s-pending)' },
    INVESTIGATING: { label: 'Investigating', icon: 'eye', cls: 'st-investigating', color: 'var(--s-prog)' },
    RESOLVED: { label: 'Resolved', icon: 'check', cls: 'st-resolved', color: 'var(--s-done)' },
    REJECTED: { label: 'Rejected', icon: 'ban', cls: 'st-rejected', color: 'var(--s-rej)' }
  };
  const statusOf = (r) => String(r.status || 'PENDING').toUpperCase();
  const pill = (s) => { const m = STATUS[s] || { label: s, icon: 'clock', cls: '' }; return `<span class="pill ${m.cls}">${ico(m.icon)}${esc(m.label)}</span>`; };

  // Category travels inside the title ("[Theft] Phone snatched") because the backend model has no category field.
  const splitTitle = (t) => { const m = /^\[([^\]]{1,30})\]\s*(.*)$/.exec(t || ''); return m ? { cat: m[1], title: m[2] || m[1] } : { cat: 'Other', title: t || 'Untitled report' }; };

  function parseDate(v) {
    if (!v) return null;
    if (Array.isArray(v)) { const [y, mo, d, h = 0, mi = 0, s = 0, ns = 0] = v; return new Date(y, mo - 1, d, h, mi, s, Math.floor(ns / 1e6)); }
    const d = new Date(v); return isNaN(d) ? null : d;
  }
  const fmtDate = (d) => d ? d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
  function ago(d) {
    if (!d) return '—';
    const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'Just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)} d ago`;
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function toast(msg, type = 'ok') {
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'err' ? ' err' : '');
    t.innerHTML = `${ico(type === 'err' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
    $('#toasts').append(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 400); }, 4200);
  }

  function setLoading(btn, on) { btn.classList.toggle('loading', on); btn.disabled = on; }

  function countTo(el, to) {
    const from = +el.dataset.v || 0; el.dataset.v = to;
    if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 800;
    const tick = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  /* ───────── API (same-origin, talks to CrimeReportController) ───────── */
  let auth = store.get('ursala.auth', sessionStorage);
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));

  class ApiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

  async function http(path, { method = 'GET', body, secure = false } = {}) {
    const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }; // XHR header stops the browser's native Basic-auth popup on 401
    if (body) headers['Content-Type'] = 'application/json';
    if (secure && auth) headers.Authorization = 'Basic ' + auth;
    let res;
    try { res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'omit' }); }
    catch { throw new ApiError(0, "Can't reach the server. Check your connection and try again."); }
    if (res.status === 204) return null;
    if (!res.ok) throw new ApiError(res.status, res.status === 401 ? 'Not signed in.' : res.status === 403 ? 'This account cannot do that.' : res.status === 404 ? 'Not found.' : 'The server could not complete that request.');
    return res.json();
  }
  const api = {
    create: (r) => http('/api/reports', { method: 'POST', body: r }),
    get: (id) => http(`/api/reports/${id}`),
    list: () => http('/api/reports', { secure: true }),
    setStatus: (id, status) => http(`/api/reports/${id}/status?status=${encodeURIComponent(status)}`, { method: 'PATCH', secure: true })
  };

  /* ───────── theme ───────── */
  const root = document.documentElement;
  const saved = store.get('ursala.theme'); if (saved) root.dataset.theme = saved;
  $('#themeBtn').addEventListener('click', () => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    const cur = root.dataset.theme || (dark ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next; store.set('ursala.theme', next);
  });

  /* ───────── router ───────── */
  const VIEWS = ['home', 'report', 'track', 'police'];
  let current = null;

  function movePill() {
    const a = $(`.nav a[data-nav="${current}"]`), pill = $('#navPill');
    $$('.nav a').forEach((x) => x.classList.toggle('on', x === a));
    if (!a) { pill.style.setProperty('--o', 0); return; }
    pill.style.setProperty('--x', a.offsetLeft + 'px'); pill.style.setProperty('--w', a.offsetWidth + 'px'); pill.style.setProperty('--o', 1);
  }

  function route() {
    const [name, arg] = location.hash.replace(/^#\/?/, '').split('/');
    const key = VIEWS.includes(name) ? name : 'home';
    const prev = current;
    if (key !== current) {
      current = key;
      $$('.view').forEach((v) => { const on = v.dataset.view === key; v.hidden = !on; v.classList.remove('enter'); if (on) { void v.offsetWidth; v.classList.add('enter'); } });
      window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
      closeDrawer();
    }
    movePill();
    if (key === 'track') trackInit(arg);
    if (key === 'police' && key !== prev) policeInit();
    if (key === 'report') $('#reportForm') && null;
    document.title = { home: 'Ursala · Report a crime, track the outcome', report: 'File a complaint · Ursala', track: 'Track a report · Ursala', police: 'Police console · Ursala' }[key];
  }
  window.addEventListener('hashchange', route);
  window.addEventListener('resize', movePill);

  /* ───────── home: quick track ───────── */
  $('#quickTrack').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = parseInt($('#quickId').value, 10);
    location.hash = id > 0 ? `#/track/${id}` : '#/track';
  });

  /* ───────── complaint form ───────── */
  $('#chips').innerHTML = CATS.map((c, i) => `<label class="chip"><input type="radio" name="category" value="${c.key}"${i === 0 ? ' required' : ''}><span>${ico(c.icon)}${c.key}</span></label>`).join('');

  const form = $('#reportForm');
  const rules = {
    title: { el: '#f-title', err: '#e-title', check: (v) => v.length >= 4 || 'Add a short summary, at least 4 characters.' },
    description: { el: '#f-desc', err: '#e-desc', check: (v) => v.length >= 15 || 'Describe what happened in at least 15 characters.' },
    location: { el: '#f-loc', err: '#e-loc', check: (v) => v.length >= 3 || 'Tell us where it happened.' },
    name: { el: '#f-name', err: '#e-name', check: (v) => v.length >= 2 || 'Enter your name.' },
    contact: { el: '#f-contact', err: '#e-contact', check: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || /^\+?[\d\s\-()]{7,18}$/.test(v) || 'Enter a valid phone number or email.' }
  };

  function flag(inputSel, errSel, msg) {
    const input = $(inputSel), err = $(errSel), field = input.closest('.field');
    field.classList.toggle('invalid', !!msg);
    err.textContent = msg || ''; err.classList.toggle('show', !!msg);
    if (msg) { field.style.animation = 'none'; void field.offsetWidth; field.style.animation = ''; }
  }
  Object.values(rules).forEach((r) => {
    const el = $(r.el);
    el.addEventListener('blur', () => { const m = r.check(el.value.trim()); flag(r.el, r.err, m === true ? '' : m); });
    el.addEventListener('input', () => { if (el.closest('.field').classList.contains('invalid') && r.check(el.value.trim()) === true) flag(r.el, r.err, ''); });
  });
  $('#f-desc').addEventListener('input', (e) => { $('#count').textContent = `${e.target.value.length}/255`; });
  form.addEventListener('change', (e) => { if (e.target.name === 'category') { $('#e-category').classList.remove('show'); $('.cats').classList.remove('invalid'); } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let ok = true, firstBad = null;
    const cat = form.elements.category.value;
    if (!cat) { ok = false; $('.cats').classList.add('invalid'); $('#e-category').textContent = 'Pick the closest type.'; $('#e-category').classList.add('show'); firstBad = $('.chip input'); }
    for (const r of Object.values(rules)) {
      const el = $(r.el), m = r.check(el.value.trim());
      flag(r.el, r.err, m === true ? '' : m);
      if (m !== true) { ok = false; firstBad = firstBad || el; }
    }
    if (!ok) { firstBad.focus(); return; }

    const btn = $('#submitBtn'); setLoading(btn, true);
    try {
      const saved = await api.create({
        title: `[${cat}] ${$('#f-title').value.trim()}`,
        description: $('#f-desc').value.trim(),
        location: $('#f-loc').value.trim(),
        complainantName: $('#f-name').value.trim(),
        complainantContact: $('#f-contact').value.trim()
      });
      rememberId(saved.id);
      $('#doneId').textContent = '#' + saved.id;
      $('#doneTrack').href = `#/track/${saved.id}`;
      form.hidden = true; $('#reportDone').hidden = false;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast(err.message, 'err');
    } finally { setLoading(btn, false); }
  });

  $('#copyId').addEventListener('click', async () => {
    const id = $('#doneId').textContent.replace('#', '');
    try { await navigator.clipboard.writeText(id); toast('Report ID copied'); } catch { toast('Copy failed. Select the ID and copy it manually.', 'err'); }
  });
  $('#again').addEventListener('click', () => { form.reset(); $('#count').textContent = '0/255'; $$('.field.invalid').forEach((f) => f.classList.remove('invalid')); $$('.err.show').forEach((x) => x.classList.remove('show')); $('#reportDone').hidden = true; form.hidden = false; });

  /* ───────── track ───────── */
  const recentIds = () => { try { return JSON.parse(store.get('ursala.recent') || '[]'); } catch { return []; } };
  function rememberId(id) { store.set('ursala.recent', JSON.stringify([id, ...recentIds().filter((x) => x !== id)].slice(0, 5))); }
  function renderRecent() {
    const ids = recentIds();
    $('#recent').innerHTML = ids.length ? `<span class="sub" style="margin:0 6px 0 0;align-self:center;font-size:14px">Recent:</span>` + ids.map((id) => `<button type="button" data-id="${id}">${ico('hash')}${id}</button>`).join('') : '';
  }
  $('#recent').addEventListener('click', (e) => { const b = e.target.closest('button[data-id]'); if (b) location.hash = `#/track/${b.dataset.id}`; });

  async function lookup(id) {
    const btn = $('#trackForm button'); setLoading(btn, true);
    const out = $('#trackResult');
    try {
      const r = await api.get(id);
      rememberId(r.id); renderRecent();
      out.innerHTML = renderResult(r);
      requestAnimationFrame(() => requestAnimationFrame(() => { const s = $('.stepper', out); if (s) s.style.setProperty('--p', s.dataset.p); }));
    } catch (err) {
      out.innerHTML = err.status === 404
        ? `<div class="result empty">${ico('inbox')}<h3>No report with ID ${esc(id)}</h3><p>Check the number on your confirmation and try again.</p></div>`
        : `<div class="result empty">${ico('alert')}<h3>Couldn't load the report</h3><p>${esc(err.message)}</p></div>`;
    } finally { setLoading(btn, false); }
  }

  function renderResult(r) {
    const s = statusOf(r), { cat, title } = splitTitle(r.title);
    const rejected = s === 'REJECTED';
    const labels = rejected ? ['Received', 'Reviewed', 'Closed'] : ['Received', 'Investigating', 'Resolved'];
    const idx = { PENDING: 0, INVESTIGATING: 1, RESOLVED: 2, REJECTED: 2 }[s] ?? 0;
    const p = { 0: 0, 1: 50, 2: 100 }[idx];
    const steps = labels.map((l, i) => {
      let c = '', icon = 'check';
      if (i < idx) c = 'done'; else if (i === idx) { c = s === 'RESOLVED' ? 'done' : rejected ? 'bad' : 'now'; }
      if (i === idx && rejected) icon = 'ban'; else if (c === 'now') icon = i === 1 ? 'eye' : 'clock';
      return `<div class="step ${c}"><span class="node">${ico(icon)}</span>${l}</div>`;
    }).join('');
    const c = (STATUS[s] || {}).color || 'var(--accent)';
    const note = { PENDING: 'Your report is in the queue. An officer will pick it up soon.', INVESTIGATING: 'An officer is working on your report.', RESOLVED: 'The police have marked this report resolved.', REJECTED: 'The police closed this report without further action.' }[s] || '';
    return `<article class="result">
      <div class="r-top"><div><span class="r-id">Report #${esc(r.id)} · ${ico(catIcon(cat)).replace('class="i ', 'style="vertical-align:-4px;margin-right:4px" class="i ')}${esc(cat)}</span><h3>${esc(title)}</h3></div>${pill(s)}</div>
      <div class="stepper" style="--c:${c}" data-p="${p}">${steps}</div>
      ${note ? `<p class="sub" style="margin:-8px 0 22px">${esc(note)}</p>` : ''}
      <div class="facts">
        <div class="fact"><small>${ico('pin')}Where</small><b>${esc(r.location || '—')}</b></div>
        <div class="fact"><small>${ico('clock')}Filed</small><b>${esc(fmtDate(parseDate(r.createdAt)))}</b></div>
        <div class="fact"><small>${ico('refresh')}Last update</small><b>${esc(fmtDate(parseDate(r.updatedAt)))}</b></div>
      </div></article>`;
  }

  function trackInit(arg) {
    renderRecent();
    const input = $('#t-id');
    const id = parseInt(arg, 10);
    if (id > 0) { input.value = id; lookup(id); } else { $('#trackResult').innerHTML = ''; }
  }
  $('#trackForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = parseInt($('#t-id').value, 10);
    if (!(id > 0)) { flag('#t-id', '#e-tid', 'Enter the numeric report ID.'); return; }
    flag('#t-id', '#e-tid', '');
    if (location.hash === `#/track/${id}`) lookup(id); else location.hash = `#/track/${id}`;
  });

  /* ───────── police console ───────── */
  let reports = [], loaded = false, timer = null;
  const filt = { status: 'ALL', q: '', limit: 20 };

  function showGate(msg) {
    $('#gate').hidden = false; $('#console').hidden = true;
    const e = $('#e-login'); e.textContent = msg || ''; e.classList.toggle('show', !!msg);
  }

  function policeInit(fresh) {
    if (!auth) { showGate(); clearInterval(timer); return; }
    $('#gate').hidden = true; $('#console').hidden = false;
    if (fresh) { $('#synced').textContent = `Updated ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · refreshes every 30 s`; render(); }
    else { if (!loaded) skeleton(); load(true); }
    clearInterval(timer);
    timer = setInterval(() => { if (current === 'police' && auth && !document.hidden) load(true); }, 30000);
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = $('#l-user').value.trim(), p = $('#l-pass').value;
    if (!u || !p) { showGate('Enter your username and password.'); return; }
    const btn = e.submitter || $('#loginForm button'); setLoading(btn, true);
    const prev = auth; auth = b64(`${u}:${p}`);
    try {
      reports = await api.list(); loaded = true;
      store.set('ursala.auth', auth, sessionStorage);
      $('#l-pass').value = '';
      policeInit(true);
    } catch (err) {
      auth = prev;
      showGate(err.status === 401 ? 'Wrong username or password.' : err.message);
    } finally { setLoading(btn, false); }
  });

  $('#logoutBtn').addEventListener('click', () => { auth = null; loaded = false; reports = []; store.del('ursala.auth', sessionStorage); clearInterval(timer); closeDrawer(); showGate(); toast('Signed out'); });
  $('#refreshBtn').addEventListener('click', () => load());

  async function load(silent) {
    const b = $('#refreshBtn'); b.classList.add('busy');
    try {
      reports = await api.list(); loaded = true;
      $('#synced').textContent = `Updated ${new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} · refreshes every 30 s`;
      render();
      if (!silent) toast('Reports refreshed');
    } catch (err) {
      if (err.status === 401 || err.status === 403) { auth = null; loaded = false; store.del('ursala.auth', sessionStorage); showGate('Your session ended. Sign in again.'); }
      else toast(err.message, 'err');
    } finally { setTimeout(() => b.classList.remove('busy'), 400); }
  }

  function skeleton() {
    $('#kpis').innerHTML = Array(4).fill('<div class="kpi"><span class="kpi-num sk">00</span><div class="kpi-bar"></div></div>').join('');
    $('#rows').innerHTML = Array(4).fill('<div class="row"><span class="sk">.</span><span class="sk">.</span><span class="sk">.</span><span class="sk">.</span><span class="sk">.</span></div>').join('');
  }

  function counts() {
    const c = { ALL: reports.length, PENDING: 0, INVESTIGATING: 0, RESOLVED: 0, REJECTED: 0 };
    reports.forEach((r) => { const s = statusOf(r); c[s] = (c[s] || 0) + 1; });
    return c;
  }

  function render() { renderKpis(); renderCharts(); renderFilters(); renderRows(); }

  function renderKpis() {
    const c = counts(), t = c.ALL || 1;
    const defs = [['ALL', 'Total reports', 'inbox', 'var(--accent)'], ['PENDING', 'Pending', 'clock', STATUS.PENDING.color], ['INVESTIGATING', 'Investigating', 'eye', STATUS.INVESTIGATING.color], ['RESOLVED', 'Resolved', 'check', STATUS.RESOLVED.color]];
    const host = $('#kpis');
    if (!host.querySelector('.kpi[data-k]')) {
      host.innerHTML = defs.map(([k, l, i, col]) => `<button type="button" class="kpi" data-k="${k}" style="--c:${col}"><div class="kpi-top"><span>${l}</span><span class="kpi-ico">${ico(i)}</span></div><span class="kpi-num" data-v="0">0</span><div class="kpi-bar"><i></i></div></button>`).join('');
      host.addEventListener('click', (e) => { const k = e.target.closest('.kpi')?.dataset.k; if (k) setStatusFilter(k); });
    }
    defs.forEach(([k]) => {
      const el = host.querySelector(`.kpi[data-k="${k}"]`);
      countTo(el.querySelector('.kpi-num'), c[k]);
      el.querySelector('.kpi-bar i').style.setProperty('--w', (k === 'ALL' ? 100 : (c[k] / t) * 100) + '%');
      el.classList.toggle('on', filt.status === k);
    });
  }

  function setStatusFilter(k) { filt.status = filt.status === k ? 'ALL' : k; filt.limit = 20; render(); }

  function renderCharts() {
    const c = counts();
    Charts.donut($('#chStatus'), Object.keys(STATUS).map((k) => ({ key: k, label: STATUS[k].label, value: c[k] || 0, color: STATUS[k].color })), { center: 'Reports', active: filt.status, onPick: setStatusFilter });

    const byCat = {}; reports.forEach((r) => { const k = splitTitle(r.title).cat; byCat[k] = (byCat[k] || 0) + 1; });
    const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5), rest = sorted.slice(5).reduce((a, [, v]) => a + v, 0);
    const items = top.map(([k, v], i) => ({ key: k, label: k, value: v, color: `var(--c${i + 1})` }));
    if (rest) items.push({ key: '__other', label: 'Other types', value: rest, color: 'var(--c-other)' });
    Charts.donut($('#chType'), items.length ? items : [{ key: 'none', label: 'No reports yet', value: 0, color: 'var(--c-other)' }], { center: 'Reports', onPick: (k) => { $('#q').value = k === '__other' || k === 'none' ? '' : `[${k}]`; filt.q = $('#q').value.toLowerCase(); filt.limit = 20; renderRows(); $('#q').scrollIntoView({ behavior: 'smooth', block: 'center' }); } });

    const days = [], today = new Date(); today.setHours(0, 0, 0, 0);
    for (let i = 6; i >= 0; i--) { const d = new Date(today); d.setDate(d.getDate() - i); days.push({ d, value: 0, label: d.toLocaleDateString(undefined, { weekday: 'short' }), sub: d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' }), today: i === 0 }); }
    reports.forEach((r) => { const d = parseDate(r.createdAt); if (!d) return; d.setHours(0, 0, 0, 0); const slot = days.find((x) => x.d.getTime() === d.getTime()); if (slot) slot.value++; });
    Charts.bars($('#chWeek'), days);
    const week = days.reduce((a, d) => a + d.value, 0), best = days.reduce((a, d) => (d.value > a.value ? d : a), days[0]);
    const c2 = counts(), rate = c2.ALL ? Math.round(((c2.RESOLVED || 0) / c2.ALL) * 100) : 0;
    $('#chWeek').insertAdjacentHTML('beforeend', `<div class="mini">
      <div><small>This week</small><b>${week}</b></div>
      <div><small>Busiest day</small><b>${best.value ? esc(best.label) : '—'}</b></div>
      <div><small>Resolved rate</small><b>${rate}%</b></div></div>`);
  }

  function renderFilters() {
    const c = counts();
    const defs = [['ALL', 'All'], ...Object.keys(STATUS).map((k) => [k, STATUS[k].label])];
    $('#filters').innerHTML = defs.map(([k, l]) => `<button type="button" role="tab" class="${filt.status === k ? 'on' : ''}" aria-selected="${filt.status === k}" data-k="${k}">${l}<small>${c[k] || 0}</small></button>`).join('');
  }
  $('#filters').addEventListener('click', (e) => { const k = e.target.closest('button')?.dataset.k; if (k) { filt.status = k; filt.limit = 20; render(); } });
  $('#q').addEventListener('input', (e) => { filt.q = e.target.value.trim().toLowerCase(); filt.limit = 20; renderRows(); });
  $('#moreBtn').addEventListener('click', () => { filt.limit += 20; renderRows(true); });

  function visible() {
    return reports.filter((r) => {
      if (filt.status !== 'ALL' && statusOf(r) !== filt.status) return false;
      if (!filt.q) return true;
      return `${r.id} ${r.title} ${r.location} ${r.complainantName} ${r.description}`.toLowerCase().includes(filt.q);
    }).sort((a, b) => (parseDate(b.createdAt) || 0) - (parseDate(a.createdAt) || 0) || b.id - a.id);
  }

  function renderRows(append) {
    const all = visible(), shown = all.slice(0, filt.limit), host = $('#rows');
    if (!all.length) {
      host.innerHTML = `<div class="empty">${ico('inbox')}<h3>${reports.length ? 'No reports match' : 'No reports yet'}</h3><p>${reports.length ? 'Try a different search or status filter.' : 'New complaints from citizens will appear here.'}</p></div>`;
    } else {
      const start = append ? filt.limit - 20 : 0;
      host.innerHTML = shown.map((r, n) => {
        const { cat, title } = splitTitle(r.title), d = parseDate(r.createdAt);
        return `<button type="button" class="row" data-id="${r.id}" style="--i:${Math.max(0, n - start)}">
          <span class="r-id">#${r.id}</span>
          <span class="r-title"><span class="r-cat">${ico(catIcon(cat))}</span><span style="min-width:0"><b>${esc(title)}</b><small>${esc(cat)}</small></span></span>
          <span class="r-loc">${esc(r.location || '—')}</span>
          <span class="r-when" title="${esc(fmtDate(d))}">${esc(ago(d))}</span>
          ${pill(statusOf(r))}</button>`;
      }).join('');
    }
    $('#more').hidden = all.length <= shown.length;
    $('#moreBtn').textContent = `Show more (${all.length - shown.length} left)`;
    $$('.kpi').forEach((k) => k.classList.toggle('on', filt.status === k.dataset.k));
  }
  $('#rows').addEventListener('click', (e) => { const row = e.target.closest('.row[data-id]'); if (row) openDrawer(+row.dataset.id, row); });

  /* drawer */
  let lastFocus = null, openId = null;
  function openDrawer(id, from) {
    const r = reports.find((x) => x.id === id); if (!r) return;
    openId = id; lastFocus = from || document.activeElement;
    drawerHtml(r);
    $('#scrim').hidden = false; requestAnimationFrame(() => { $('#scrim').classList.add('open'); $('#drawer').classList.add('open'); });
    $('#drawer').setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#dClose')?.focus(), 50);
  }
  function drawerHtml(r) {
    const s = statusOf(r), { cat, title } = splitTitle(r.title);
    const contact = r.complainantContact || '', isMail = contact.includes('@');
    $('#drawer').innerHTML = `
      <div class="d-head"><div><span class="r-id">Report #${r.id} · ${esc(cat)}</span><h3 id="dTitle">${esc(title)}</h3></div>
        <button class="icon-btn sm" id="dClose" type="button" aria-label="Close">${ico('x')}</button></div>
      ${pill(s)}
      <div class="d-sec"><h4>What happened</h4><div class="d-desc">${esc(r.description || 'No description given.')}</div></div>
      <div class="d-sec d-grid">
        <div class="fact"><small>${ico('pin')}Where</small><b>${esc(r.location || '—')}</b></div>
        <div class="fact"><small>${ico('user')}Complainant</small><b>${esc(r.complainantName || '—')}</b></div>
        <div class="fact"><small>${ico(isMail ? 'mail' : 'phone')}Contact</small><b>${contact ? `<a href="${isMail ? 'mailto:' : 'tel:'}${esc(contact)}">${esc(contact)}</a>` : '—'}</b></div>
        <div class="fact"><small>${ico('clock')}Filed</small><b>${esc(fmtDate(parseDate(r.createdAt)))}</b></div>
      </div>
      <div class="d-sec"><h4>Move this report to</h4>
        <div class="moves">${Object.keys(STATUS).map((k) => `<button type="button" class="mv${k === s ? ' cur' : ''}" data-s="${k}" style="--c:${STATUS[k].color}" ${k === s ? 'disabled' : ''}>${ico(STATUS[k].icon)}${STATUS[k].label}</button>`).join('')}</div></div>`;
  }
  function closeDrawer() {
    const d = $('#drawer'); if (!d.classList.contains('open')) return;
    d.classList.remove('open'); $('#scrim').classList.remove('open'); d.setAttribute('aria-hidden', 'true');
    setTimeout(() => { $('#scrim').hidden = true; }, 320);
    openId = null; if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  $('#scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  $('#drawer').addEventListener('click', async (e) => {
    if (e.target.closest('#dClose')) return closeDrawer();
    const mv = e.target.closest('.mv[data-s]'); if (!mv || openId == null) return;
    const id = openId, next = mv.dataset.s;
    $$('.mv').forEach((b) => (b.disabled = true));
    try {
      const upd = await api.setStatus(id, next);
      const i = reports.findIndex((x) => x.id === id); if (i >= 0) reports[i] = upd;
      drawerHtml(upd); render();
      toast(`Report #${id} moved to ${STATUS[next].label}`);
    } catch (err) {
      if (err.status === 401 || err.status === 403) { closeDrawer(); auth = null; showGate('Your session ended. Sign in again.'); }
      else { toast(err.message, 'err'); drawerHtml(reports.find((x) => x.id === id)); }
    }
  });

  /* ───────── go ───────── */
  route();
  requestAnimationFrame(movePill);
})();
