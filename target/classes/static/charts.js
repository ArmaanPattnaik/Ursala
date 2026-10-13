/* Ursala charts: tiny dependency-free SVG donut + bar chart with hover tooltips. */
(function () {
  'use strict';

  const tipEl = () => document.getElementById('tip');

  function showTip(html, ev) {
    const t = tipEl(); if (!t) return;
    t.innerHTML = html;
    t.classList.add('on');
    moveTip(ev);
  }
  function moveTip(ev) {
    const t = tipEl(); if (!t) return;
    const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let x = ev.clientX + pad, y = ev.clientY + pad;
    if (x + w > innerWidth - 8) x = ev.clientX - w - pad;
    if (y + h > innerHeight - 8) y = ev.clientY - h - pad;
    t.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
  }
  function hideTip() { const t = tipEl(); if (t) { t.classList.remove('on'); } }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pct = (v, total) => (total ? Math.round((v / total) * 100) : 0);

  /**
   * items: [{key, label, value, color}]  (color is a CSS value, e.g. "var(--s-done)")
   * opts:  {center, active, onPick(key|null)}
   */
  function donut(host, items, opts = {}) {
    const R = 78, C = 2 * Math.PI * R;
    const total = items.reduce((a, i) => a + i.value, 0);
    const live = items.filter((i) => i.value > 0);
    const gap = live.length > 1 ? 3 : 0;
    let acc = 0;
    const segs = live.map((i) => {
      const len = (i.value / total) * C;
      const s = { ...i, start: acc, len: Math.max(len - gap, 0.5) };
      acc += len;
      return s;
    });
    const label = `${opts.center || 'Total'}: ${total}. ` + items.map((i) => `${i.label} ${i.value}`).join(', ');

    host.innerHTML = `
      <div class="donut-box">
        <svg viewBox="0 0 200 200" class="donut" role="img" aria-label="${esc(label)}">
          <circle class="trk" cx="100" cy="100" r="${R}"/>
          <g transform="rotate(-90 100 100)">
            ${segs.map((s) => `<circle class="seg" data-key="${esc(s.key)}" tabindex="0" cx="100" cy="100" r="${R}"
              style="stroke:${s.color}" stroke-dasharray="0 ${C}" stroke-dashoffset="${-s.start}"
              data-len="${s.len}"><title>${esc(s.label)}: ${s.value}</title></circle>`).join('')}
          </g>
          <text class="d-num" x="100" y="107">${total}</text>
          <text class="d-lbl" x="100" y="127">${esc(opts.center || 'Total')}</text>
        </svg>
        <ul class="legend">
          ${items.map((i) => `<li><button type="button" data-key="${esc(i.key)}" aria-pressed="${opts.active === i.key}">
            <span class="sw" style="background:${i.color}"></span><span>${esc(i.label)}</span><b>${i.value}</b><em>${pct(i.value, total)}%</em></button></li>`).join('')}
        </ul>
      </div>`;

    const svg = host.querySelector('.donut');
    const num = svg.querySelector('.d-num'), lbl = svg.querySelector('.d-lbl');
    const baseNum = String(total), baseLbl = opts.center || 'Total';

    // animate segments in
    requestAnimationFrame(() => requestAnimationFrame(() => {
      svg.querySelectorAll('.seg').forEach((el, i) => {
        el.style.transitionDelay = `${i * 90}ms`;
        const len = +el.dataset.len;
        el.setAttribute('stroke-dasharray', `${len} ${C - len}`);
      });
    }));

    const focus = (key, on) => {
      svg.querySelectorAll('.seg').forEach((el) => el.classList.toggle('hot', on && el.dataset.key === key));
      host.querySelectorAll('.legend button').forEach((b) => b.classList.toggle('hot', on && b.dataset.key === key));
      if (on) svg.setAttribute('data-hot', ''); else svg.removeAttribute('data-hot');
      const it = items.find((i) => i.key === key);
      if (on && it) { num.textContent = it.value; lbl.textContent = it.label; }
      else { num.textContent = baseNum; lbl.textContent = baseLbl; }
    };

    host.querySelectorAll('.seg').forEach((el) => {
      const it = items.find((i) => i.key === el.dataset.key);
      el.addEventListener('pointerenter', (e) => { focus(it.key, true); showTip(`<b>${esc(it.label)}</b><span>${it.value} · ${pct(it.value, total)}%</span>`, e); });
      el.addEventListener('pointermove', moveTip);
      el.addEventListener('pointerleave', () => { focus(it.key, false); hideTip(); });
      el.addEventListener('focus', () => focus(it.key, true));
      el.addEventListener('blur', () => focus(it.key, false));
      el.addEventListener('click', () => opts.onPick && opts.onPick(it.key));
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onPick && opts.onPick(it.key); } });
    });
    host.querySelectorAll('.legend button').forEach((b) => {
      b.addEventListener('pointerenter', () => focus(b.dataset.key, true));
      b.addEventListener('pointerleave', () => focus(b.dataset.key, false));
      b.addEventListener('focus', () => focus(b.dataset.key, true));
      b.addEventListener('blur', () => focus(b.dataset.key, false));
      b.addEventListener('click', () => opts.onPick && opts.onPick(b.dataset.key));
    });
  }

  /** items: [{label, value, sub, today}] */
  function bars(host, items) {
    const W = 420, H = 210, L = 30, R = 6, T = 18, B = 28;
    const iw = W - L - R, ih = H - T - B;
    const rawMax = Math.max(0, ...items.map((i) => i.value));
    const max = Math.max(4, Math.ceil(rawMax / 2) * 2);
    const slot = iw / items.length, bw = Math.min(34, slot * 0.58);
    const y = (v) => T + ih - (v / max) * ih;
    const ticks = [0, max / 2, max];
    const peakIdx = rawMax > 0 ? items.findIndex((i) => i.value === rawMax) : -1;
    const sum = items.reduce((a, i) => a + i.value, 0);

    const col = (it, idx) => {
      const x = L + slot * idx + (slot - bw) / 2;
      const h = (it.value / max) * ih, top = T + ih - h, r = Math.min(5, h / 2, bw / 2);
      const d = h <= 0 ? '' : `M${x},${top + h} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${top + h} Z`;
      return `<g class="col" data-i="${idx}" tabindex="0" role="img" aria-label="${it.sub}: ${it.value} reports">
        <rect class="hit" x="${L + slot * idx}" y="${T}" width="${slot}" height="${ih + B}"/>
        ${d ? `<path class="bar${it.today ? ' today' : ''}" style="--i:${idx}" d="${d}"/>` : ''}
        ${idx === peakIdx ? `<text class="peak" x="${x + bw / 2}" y="${top - 6}">${it.value}</text>` : ''}
        <text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${it.label}</text></g>`;
    };

    host.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="bars" role="group" aria-label="New reports per day, last 7 days: ${sum} in total">
      ${ticks.map((t) => `<line class="gl" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('')}
      ${items.map(col).join('')}</svg>`;

    host.querySelectorAll('.col').forEach((g) => {
      const it = items[+g.dataset.i];
      const html = `<b>${esc(it.sub)}</b><span>${it.value} ${it.value === 1 ? 'report' : 'reports'}</span>`;
      g.addEventListener('pointerenter', (e) => showTip(html, e));
      g.addEventListener('pointermove', moveTip);
      g.addEventListener('pointerleave', hideTip);
      g.addEventListener('focus', () => { const b = g.getBoundingClientRect(); showTip(html, { clientX: b.left + b.width / 2, clientY: b.top }); });
      g.addEventListener('blur', hideTip);
    });
  }

  window.Charts = { donut, bars, hideTip };
})();
