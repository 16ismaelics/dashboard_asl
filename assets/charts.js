/* Gráficos SVG leves para o painel (sem dependências).
   Barras finas, ponta de dados arredondada (4px), 2px de espaço entre segmentos,
   grade discreta, dica (tooltip) em cada barra e clique opcional. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const tip = () => document.getElementById('tip');
  const nf = (d) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || v;

  // retângulo com a ponta de dados arredondada (direita ou topo)
  function barPath(x, y, w, h, r, end) {
    if (w <= 0 || h <= 0) return '';
    if (end === 'right') {
      r = Math.min(r, w, h / 2);
      return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
    }
    if (end === 'top') {
      r = Math.min(r, h, w / 2);
      return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
    }
    return `M${x},${y}h${w}v${h}h${-w}Z`;
  }

  function showTip(evt, html) {
    const t = tip(); if (!t) return;
    t.innerHTML = html; t.hidden = false;
    const pad = 14, w = t.offsetWidth, h = t.offsetHeight;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    if (x + w > innerWidth - 8) x = evt.clientX - w - pad;
    if (y + h > innerHeight - 8) y = evt.clientY - h - pad;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  const hideTip = () => { const t = tip(); if (t) t.hidden = true; };

  function bindHover(container, target, marks, html, onClick) {
    target.addEventListener('mousemove', (e) => {
      container.classList.add('hovering');
      marks.forEach((m) => m.classList.add('hl'));
      showTip(e, html);
    });
    target.addEventListener('mouseleave', () => {
      container.classList.remove('hovering');
      marks.forEach((m) => m.classList.remove('hl'));
      hideTip();
    });
    if (onClick) target.addEventListener('click', onClick);
    else target.style.cursor = 'default';
  }

  function legend(container, series) {
    const lg = document.createElement('div');
    lg.className = 'c-legend';
    lg.innerHTML = series.map((s) => `<span class="it"><span class="sw" style="background:${s.color}"></span>${esc(s.label)}</span>`).join('');
    container.appendChild(lg);
  }

  function emptyState(container, msg) {
    container.innerHTML = `<p class="empty">${esc(msg || 'Sem dados para os filtros selecionados.')}</p>`;
  }

  /* Barras horizontais (série única ou empilhadas).
     opts: { rows:[{label, parts:{key:val}} | {label, value}], series:[{key,label,color}],
             color, decimals, unit, pct (0-100 scale), onClick(row), tipExtra(row) } */
  function hbar(container, opts) {
    container.innerHTML = '';
    const rows = opts.rows.filter((r) => (r.value ?? 0) > 0 || r.parts);
    if (!rows.length) return emptyState(container);
    const stacked = !!opts.series;
    if (stacked && opts.series.length > 1) legend(container, opts.series);
    const W = Math.max(260, container.clientWidth || 360);
    const labelW = Math.min(150, Math.max(...rows.map((r) => r.label.length)) * 7 + 10);
    const valW = 64, bh = 16, gap = 12, top = 4;
    const H = top + rows.length * (bh + gap);
    const plotW = W - labelW - valW;
    const totals = rows.map((r) => stacked ? opts.series.reduce((s, k) => s + (r.parts[k.key] || 0), 0) : r.value);
    const max = opts.max ?? Math.max(...totals, 1e-9);
    const f = nf(opts.decimals ?? 0);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, container);
    // linha de base
    el('line', { x1: labelW, x2: labelW, y1: 0, y2: H - gap + 4, stroke: css('--axis'), 'stroke-width': 1 }, svg);
    rows.forEach((r, i) => {
      const y = top + i * (bh + gap);
      const t = el('text', { x: labelW - 8, y: y + bh / 2 + 4, 'text-anchor': 'end', 'font-size': 12, fill: css('--ink-2') }, svg);
      t.textContent = r.label;
      const marks = [];
      let x = labelW;
      if (stacked) {
        const segs = opts.series.filter((s) => (r.parts[s.key] || 0) > 0);
        segs.forEach((s, j) => {
          const w = (r.parts[s.key] / max) * plotW;
          const last = j === segs.length - 1;
          const w2 = Math.max(0, w - (last ? 0 : 2));
          marks.push(el('path', { d: barPath(x, y, w2, bh, 4, last ? 'right' : null), fill: s.color, class: 'mark' }, svg));
          x += w;
        });
      } else {
        const w = (r.value / max) * plotW;
        marks.push(el('path', { d: barPath(x, y, w, bh, 4, 'right'), fill: r.color || opts.color || css('--bar'), class: 'mark' }, svg));
        x += w;
      }
      const v = el('text', { x: x + 6, y: y + bh / 2 + 4, 'font-size': 12, 'font-weight': 600, fill: css('--ink') }, svg);
      v.textContent = f.format(totals[i]) + (opts.unit || '');
      const hit = el('rect', { x: 0, y: y - gap / 2, width: W, height: bh + gap, class: 'hit' }, svg);
      const lines = stacked
        ? opts.series.map((s) => `<div class="row"><span><span class="sw" style="background:${s.color};display:inline-block;margin-right:6px"></span>${esc(s.label)}</span><b>${f.format(r.parts[s.key] || 0)}${opts.unit || ''}</b></div>`).join('')
        : `<div class="row"><span>${esc(opts.valueLabel || 'Valor')}</span><b>${f.format(r.value)}${opts.unit || ''}</b></div>`;
      const extra = opts.tipExtra ? opts.tipExtra(r) : '';
      bindHover(container, hit, marks, `<div style="font-weight:700;margin-bottom:4px">${esc(r.label)}</div>${lines}${extra}`,
        opts.onClick ? () => opts.onClick(r) : null);
    });
    return { W, labelW, plotW };   // geometria, para alinhar elementos ao gráfico
  }

  /* Colunas (série única ou empilhadas). opts como hbar. */
  function cols(container, opts) {
    container.innerHTML = '';
    const rows = opts.rows;
    const stacked = !!opts.series;
    const totals = rows.map((r) => stacked ? opts.series.reduce((s, k) => s + (r.parts[k.key] || 0), 0) : r.value);
    if (!totals.some((t) => t > 0)) return emptyState(container);
    if (stacked && opts.series.length > 1) legend(container, opts.series);
    const W = Math.max(240, container.clientWidth || 320);
    const H = opts.height || 190, bottom = 34, top = 20, left = 6;
    const plotH = H - bottom - top;
    const band = (W - left * 2) / rows.length;
    const bw = Math.min(44, band * 0.5);
    const max = Math.max(...totals, 1e-9);
    const f = nf(opts.decimals ?? 0);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.aria || '' }, container);
    // grade: 2 linhas discretas
    [0.5, 1].forEach((p) => el('line', { x1: left, x2: W - left, y1: top + plotH * (1 - p), y2: top + plotH * (1 - p), stroke: css('--grid'), 'stroke-width': 1 }, svg));
    el('line', { x1: left, x2: W - left, y1: top + plotH, y2: top + plotH, stroke: css('--axis'), 'stroke-width': 1 }, svg);
    rows.forEach((r, i) => {
      const cx = left + band * i + band / 2;
      const x = cx - bw / 2;
      let y = top + plotH;
      const marks = [];
      if (stacked) {
        const segs = opts.series.filter((s) => (r.parts[s.key] || 0) > 0);
        segs.forEach((s, j) => {
          const h = (r.parts[s.key] / max) * plotH;
          const last = j === segs.length - 1;
          const h2 = Math.max(0, h - (last ? 0 : 2));
          marks.push(el('path', { d: barPath(x, y - h2, bw, h2, 4, last ? 'top' : null), fill: s.color, class: 'mark' }, svg));
          y -= h;
        });
      } else {
        const h = (r.value / max) * plotH;
        marks.push(el('path', { d: barPath(x, y - h, bw, h, 4, 'top'), fill: r.color || opts.color || css('--bar'), class: 'mark' }, svg));
        y -= h;
      }
      if (totals[i] > 0) {
        const v = el('text', { x: cx, y: y - 6, 'text-anchor': 'middle', 'font-size': 12, 'font-weight': 600, fill: css('--ink') }, svg);
        v.textContent = f.format(totals[i]) + (opts.unit || '');
      }
      const lab = el('text', { x: cx, y: top + plotH + 16, 'text-anchor': 'middle', 'font-size': 11.5, fill: css('--ink-2') }, svg);
      lab.textContent = r.label;
      if (r.sub) {
        const s2 = el('text', { x: cx, y: top + plotH + 29, 'text-anchor': 'middle', 'font-size': 10.5, fill: css('--muted') }, svg);
        s2.textContent = r.sub;
      }
      const hit = el('rect', { x: cx - band / 2, y: 0, width: band, height: H, class: 'hit' }, svg);
      const lines = stacked
        ? opts.series.map((s) => `<div class="row"><span><span class="sw" style="background:${s.color};display:inline-block;margin-right:6px"></span>${esc(s.label)}</span><b>${f.format(r.parts[s.key] || 0)}${opts.unit || ''}</b></div>`).join('')
        : `<div class="row"><span>${esc(opts.valueLabel || 'Valor')}</span><b>${f.format(r.value)}${opts.unit || ''}</b></div>`;
      const extra = opts.tipExtra ? opts.tipExtra(r) : '';
      bindHover(container, hit, marks, `<div style="font-weight:700;margin-bottom:4px">${esc(r.title || r.label)}</div>${lines}${extra}`,
        opts.onClick ? () => opts.onClick(r) : null);
    });
  }

  window.Charts = { hbar, cols, hideTip, nf };
})();
