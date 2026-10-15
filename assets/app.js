/* Painel de monitoramento PRA-SAF / PSAM-CI — Programa ASL Brasil (Acre) */
(function () {
  'use strict';

  // ------------------------------------------------------------------ utilidades
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nf = Charts.nf;
  const n0 = nf(0), n1 = nf(1), n2 = nf(2);
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const title = (s) => String(s ?? '').toLowerCase().replace(/(^|[\s/(-])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase())
    .replace(/(^|\s)(De|Da|Do|Das|Dos|E|É)(?=\s)/g, (m, a, w) => a + w.toLowerCase()).replace(/\bSaf\b/g, 'SAF');
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const fmtDate = (iso) => iso ? iso.split('-').reverse().join('/') : '—';
  const fmtStamp = (iso) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Rio_Branco', dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
    } catch { return iso; }
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } },
  };

  // ------------------------------------------------------------------ vocabulário
  const FASES = ['Fase I · 2022/23', 'Fase II · 2023/24', 'Fase III · 2024/25', 'Fase IV · 2025/26'];
  const FASE_VAR = { 'Fase I · 2022/23': '--f1', 'Fase II · 2023/24': '--f2', 'Fase III · 2024/25': '--f3', 'Fase IV · 2025/26': '--f4' };
  // Sistema de cada imóvel: vem SÓ da coluna SISTEMA da planilha
  const SIS_BASE = ['SAF', 'SAF + Enriquecimento', 'Enriquecimento'];
  const SEM_SIS = 'Sem informação';
  let TIPOS = [...SIS_BASE, SEM_SIS];
  const TIPO_VAR = { 'SAF': '--t-saf', 'SAF + Enriquecimento': '--t-pov', 'Enriquecimento': '--t-enr', [SEM_SIS]: '--s-none' };
  const tipoVar = (t) => TIPO_VAR[t] || '--s-none';
  function sistemaDe(sis) {
    const t = norm(sis).replace(/\s+/g, ' ').trim();
    if (!t) return SEM_SIS;
    const saf = /\bsaf\b/.test(t), enr = t.includes('enriq') || t.includes('povoam'); // povoamento = nome antigo
    if (saf && enr) return 'SAF + Enriquecimento';
    if (saf) return 'SAF';
    if (enr) return 'Enriquecimento';
    return title(sis);
  }
  const SIT = [
    { key: 'good', raw: 'BEM CONDUZIDO', label: 'Bem conduzido', v: '--s-good' },
    { key: 'warn', raw: 'EM RECUPERAÇÃO', label: 'Em recuperação', v: '--s-warn' },
    { key: 'crit', raw: 'ABANDONADO', label: 'Abandonado', v: '--s-crit' },
    { key: 'none', raw: null, label: 'Sem visita', v: '--s-none' },
  ];
  const SIT_NONE = SIT.find((s) => s.key === 'none');
  const sitOf = (i) => SIT.find((s) => s.raw && s.raw === i.mon?.sit) || SIT_NONE;
  const AV = ['RUIM', 'REGULAR', 'BOM', 'ÓTIMO'];
  const PROBLEMAS = [['fm', 'Falta de manejo'], ['mor', 'Mortalidade'], ['fi', 'Falta de insumos'], ['pc', 'Problemas climáticos'],
    ['sd', 'Solo degradado'], ['pd', 'Pragas e doenças']];
  const MANEJO = [['cap', 'Capina'], ['adu', 'Adubação'], ['rep', 'Replantio'], ['pod', 'Poda'], ['irr', 'Irrigação']];
  const SOB = [['<50%', '< 50%'], ['50-80%', '50–80%'], ['>80%', '> 80%']];
  const EST = [['ESTABELECIMENTO', 'Estabelecimento'], ['INTERMEDIÁRIO', 'Intermediário'], ['AVANÇADO', 'Avançado']];

  // ------------------------------------------------------------------ estado
  const S = {
    f: { mun: '', fase: '', tipo: '', sit: '', av: '', q: '' },
    colorBy: store.get('asl.colorBy') || 'tipo',
    base: store.get('asl.base') || 'mapa',
    sel: null,          // CAR do imóvel selecionado
    selPlt: null,       // uid do plantio selecionado
    sort: { key: 'haPlant', dir: -1 },
  };
  let D = null;         // dados carregados
  let V = null;         // visão filtrada

  // ------------------------------------------------------------------ carga
  async function getJSON(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return r.json();
  }

  async function load() {
    const [mun, imo, plt, mon] = await Promise.all([
      getJSON('data/municipios.geojson'), getJSON('data/propriedades.geojson'),
      getJSON('data/areas.geojson'), getJSON('data/monitoramento.json').catch(() => ({ rows: [] })),
    ]);
    D = { munFC: mun, imoveis: [], plantios: [], byCar: new Map(), monMeta: {} };
    for (const f of imo.features) {
      const p = f.properties;
      const i = { ...p, feature: f, plantios: [], haPlant: 0, mon: null };
      D.imoveis.push(i); D.byCar.set(p.car, i);
    }
    for (const f of plt.features) {
      const p = { ...f.properties, feature: f };
      D.plantios.push(p);
      const i = D.byCar.get(p.car);
      if (i) { i.plantios.push(p); i.haPlant += p.ha || 0; }
    }
    for (const i of D.imoveis) i.faseRecente = [...i.fases].sort().slice(-1)[0];
    applyMonitoring(mon);
  }

  function applyMonitoring(mon) {
    D.monMeta = { atualizado_em: mon.atualizado_em, fonte: mon.fonte, linhas: mon.rows?.length || 0 };
    // planilha complementar (cadastro): se não veio nesta leitura, mantém a anterior
    if (Array.isArray(mon.cadastro)) D.cadastro = new Map(mon.cadastro.map((c) => [c.car, c]));
    else if (!D.cadastro) D.cadastro = new Map();
    D.semPoligono = [];
    D.imoveis.forEach((i) => { i.mon = null; });
    for (const r of mon.rows || []) {
      const i = D.byCar.get(r.car);
      if (!i) { D.semPoligono.push(r); continue; }
      // se houver mais de uma linha para o mesmo CAR, vale a visita mais recente
      if (!i.mon || (r.data || '') > (i.mon.data || '')) i.mon = r;
    }
    for (const i of D.imoveis) {
      i.sistema = sistemaDe(i.mon?.sis);
      i.sisFonte = i.sistema !== SEM_SIS ? 'monitoramento' : null;
      const cad = D.cadastro.get(i.car);
      if (i.sistema === SEM_SIS && cad?.sis) { i.sistema = sistemaDe(cad.sis); i.sisFonte = 'cadastro'; }
      i.modelo = i.mon?.mod || cad?.mod || null;
      i.tipoPrincipal = i.sistema; i.tipos = [i.sistema];
      i.plantios.forEach((p) => { p.tipo = i.sistema; });
    }
    const extras = [...new Set(D.imoveis.map((i) => i.sistema))].filter((t) => !SIS_BASE.includes(t) && t !== SEM_SIS);
    TIPOS = [...SIS_BASE, ...extras, ...(D.imoveis.some((i) => i.sistema === SEM_SIS) ? [SEM_SIS] : [])];
    $('#upd').textContent = fmtStamp(D.monMeta.atualizado_em);
    $('#upd').title = `${D.monMeta.linhas} linhas · ${D.monMeta.fonte || ''}`;
  }

  // ------------------------------------------------------------------ filtros
  function imovelPasses(i, f) {
    if (f.mun && i.municipio !== f.mun) return false;
    if (f.sit && sitOf(i).key !== f.sit) return false;
    if (f.av && i.mon?.av !== f.av) return false;
    if (f.q) {
      // CAR completo colado (ex.: AC-1200401-DFAF…F6E2CE): compara pelo código de 4 caracteres
      const alnum = f.q.toUpperCase().replace(/[^0-9A-Z]/g, '');
      if (/^AC/.test(alnum) && alnum.length >= 12) return i.car === alnum.slice(-4);
      const hay = norm([i.propriedade, i.proprietario, i.nucleo, i.local, i.car, i.mon?.car_completo, i.municipio, i.mon?.prop].join(' '));
      if (!norm(f.q).split(/\s+/).every((w) => hay.includes(w))) return false;
    }
    return true;
  }
  function plantioPasses(p, f) {
    if (f.fase && p.fase !== f.fase) return false;
    if (f.tipo && p.tipo !== f.tipo) return false;
    return true;
  }

  function computeView() {
    const f = S.f;
    const plantios = [], imoveis = [];
    for (const i of D.imoveis) {
      if (!imovelPasses(i, f)) continue;
      const ps = i.plantios.filter((p) => plantioPasses(p, f));
      if (!ps.length && (f.fase || f.tipo)) continue;
      imoveis.push(i); plantios.push(...ps);
    }
    const carSet = new Set(imoveis.map((i) => i.car));
    V = { imoveis, plantios, carSet, visit: imoveis.filter((i) => i.mon?.visitado) };
  }

  function fillSelect(id, opts, allLabel) {
    const s = $(id);
    s.innerHTML = `<option value="">${allLabel}</option>` + opts.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('');
  }

  function setupFilters() {
    const muns = [...new Set(D.imoveis.map((i) => i.municipio))].sort((a, b) => a.localeCompare(b, 'pt'));
    fillSelect('#f-mun', muns.map((m) => [m, m]), 'Todos');
    fillSelect('#f-fase', FASES.map((x) => [x, x]), 'Todas');
    fillSelect('#f-tipo', TIPOS.map((x) => [x, x]), 'Todos');
    fillSelect('#f-sit', SIT.map((s) => [s.key, s.label]), 'Todas');
    fillSelect('#f-av', [...AV].reverse().map((a) => [a, title(a)]), 'Todas');
    const map = { '#f-mun': 'mun', '#f-fase': 'fase', '#f-tipo': 'tipo', '#f-sit': 'sit', '#f-av': 'av' };
    for (const [id, k] of Object.entries(map)) $(id).addEventListener('change', (e) => setFilter(k, e.target.value));
    let t; $('#f-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => setFilter('q', e.target.value.trim()), 180); });
    $('#f-clear').addEventListener('click', () => {
      S.f = { mun: '', fase: '', tipo: '', sit: '', av: '', q: '' }; $('#f-q').value = '';
      S.sel = null; S.selPlt = null; render(true);
    });
  }

  function setFilter(k, v, opts = {}) {
    S.f[k] = S.f[k] === v && opts.toggle ? '' : v;
    if (S.sel && !D.byCar.get(S.sel) /* nunca */) S.sel = null;
    render(true);
  }

  function syncFilterUI() {
    const map = { mun: '#f-mun', fase: '#f-fase', tipo: '#f-tipo', sit: '#f-sit', av: '#f-av' };
    for (const [k, id] of Object.entries(map)) { $(id).value = S.f[k]; $(id).classList.toggle('active', !!S.f[k]); }
    $('#f-count').textContent = `${V.imoveis.length} de ${D.imoveis.length} imóveis`;
  }

  // ------------------------------------------------------------------ KPIs
  function renderKPIs() {
    const I = V.imoveis, P = V.plantios, vis = V.visit;
    const haPlant = P.reduce((s, p) => s + (p.ha || 0), 0);
    const haImo = I.reduce((s, i) => s + (i.ha || 0), 0);
    const muns = new Set(I.map((i) => i.municipio)).size;
    const cnt = (k) => vis.filter((i) => sitOf(i).key === k).length;
    const good = cnt('good'), warn = cnt('warn'), crit = cnt('crit');
    const sob50 = vis.filter((i) => ['50-80%', '>80%'].includes(i.mon.sob)).length;
    const pct = (a, b) => b ? Math.round((a / b) * 100) : 0;
    const bar = (parts) => `<div class="kpi-bar">${parts.filter((p) => p[0] > 0).map(([v, c]) => `<i style="flex:${v};background:${c}"></i>`).join('')}</div>`;
    const tiles = [
      { l: 'Imóveis atendidos', v: n0.format(I.length), s: `em ${muns} município${muns === 1 ? '' : 's'}` },
      { l: 'Área plantada', v: n1.format(haPlant), u: 'ha', s: `${P.length} polígonos de plantio` },
      { l: 'Área dos imóveis', v: n0.format(haImo), u: 'ha', s: `plantio ocupa ${haImo ? n1.format((haPlant / haImo) * 100) : 0}% da área` },
      { l: 'Imóveis visitados', v: n0.format(vis.length), s: `${pct(vis.length, I.length)}% dos imóveis filtrados`,
        x: bar([[vis.length, css('--accent')], [I.length - vis.length, css('--s-none')]]) },
      { l: 'Bem conduzidos', v: pct(good, vis.length) + '%', s: `${warn} em recuperação · ${crit} abandonados`,
        x: bar([[good, css('--s-good')], [warn, css('--s-warn')], [crit, css('--s-crit')]]) },
      { l: 'Sobrevivência ≥ 50%', v: pct(sob50, vis.length) + '%', s: `${sob50} de ${vis.length} imóveis visitados` },
    ];
    $('#kpis').innerHTML = tiles.map((t) => `<div class="card kpi"><span class="kpi-label">${t.l}</span>
      <span class="kpi-value">${t.v}${t.u ? `<small>${t.u}</small>` : ''}</span><span class="kpi-sub">${t.s}</span>${t.x || ''}</div>`).join('');
  }

  // ------------------------------------------------------------------ mapa
  let map, baseLayers = {}, L_mun, L_imo, L_plt, L_pts, munLabels;
  const ZOOM_POLY = 12;

  function initMap() {
    map = L.map('map', { zoomControl: true, preferCanvas: false, attributionControl: true }).setView([-10.1, -68.5], 7);
    const dark = matchMedia('(prefers-color-scheme: dark)').matches;
    // OpenStreetMap: não exige chave de acesso (a CARTO passou a exigir)
    baseLayers.mapa = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, className: dark ? 'tiles-dark' : 'tiles-light',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>' });
    baseLayers.sat = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19, attribution: 'Imagens &copy; Esri, Maxar, Earthstar Geographics' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
    ]);
    baseLayers[S.base].addTo(map);
    map.createPane('munPane').style.zIndex = 380;
    map.createPane('imoPane').style.zIndex = 410;
    map.createPane('pltPane').style.zIndex = 420;
    map.createPane('ptsPane').style.zIndex = 430;
    L.control.scale({ imperial: false }).addTo(map);
    map.on('zoomend', updateZoomLayers);

    document.querySelectorAll('[data-base]').forEach((b) => {
      b.classList.toggle('on', b.dataset.base === S.base);
      b.addEventListener('click', () => {
        if (S.base === b.dataset.base) return;
        map.removeLayer(baseLayers[S.base]); S.base = b.dataset.base; store.set('asl.base', S.base);
        baseLayers[S.base].addTo(map);
        document.querySelectorAll('[data-base]').forEach((x) => x.classList.toggle('on', x === b));
        renderMap(false);
      });
    });
    document.querySelectorAll('[data-color]').forEach((b) => {
      b.classList.toggle('on', b.dataset.color === S.colorBy);
      b.addEventListener('click', () => {
        S.colorBy = b.dataset.color; store.set('asl.colorBy', S.colorBy);
        document.querySelectorAll('[data-color]').forEach((x) => x.classList.toggle('on', x === b));
        renderMap(false); renderLegend();
      });
    });
    ['#l-mun', '#l-imo', '#l-plt'].forEach((id) => $(id).addEventListener('change', () => renderMap(false)));
  }

  function plantioColor(p) {
    if (S.colorBy === 'fase') return css(FASE_VAR[p.fase]);
    if (S.colorBy === 'sit') return css(sitOf(D.byCar.get(p.car)).v);
    return css(tipoVar(p.tipo));
  }
  function imovelColor(i) {
    if (S.colorBy === 'fase') return css(FASE_VAR[i.faseRecente]);
    if (S.colorBy === 'sit') return css(sitOf(i).v);
    return css(tipoVar(i.tipoPrincipal));
  }

  function munStats() {
    const m = new Map();
    for (const i of V.imoveis) {
      const s = m.get(i.municipio) || { imo: 0, plt: 0, ha: 0, good: 0, vis: 0 };
      s.imo++; if (i.mon?.visitado) { s.vis++; if (sitOf(i).key === 'good') s.good++; }
      m.set(i.municipio, s);
    }
    for (const p of V.plantios) { const s = m.get(p.municipio); if (s) { s.plt++; s.ha += p.ha || 0; } }
    return m;
  }

  function renderMap(fit) {
    const sat = S.base === 'sat';
    const stats = munStats();
    [L_mun, L_imo, L_plt, L_pts, munLabels].forEach((l) => l && map.removeLayer(l));

    // municípios
    munLabels = L.layerGroup();
    L_mun = L.geoJSON(D.munFC, {
      pane: 'munPane',
      style: (f) => {
        const nm = f.properties.nome, has = stats.has(nm), selm = S.f.mun === nm;
        return { color: selm ? css('--accent') : (sat ? '#ffffff' : css('--mun-line')), weight: selm ? 2.5 : 1,
          opacity: sat ? 0.8 : 0.9, fillColor: css('--mun-fill'), fillOpacity: has ? (selm ? 0.12 : 0.07) : 0 };
      },
      onEachFeature: (f, layer) => {
        const nm = f.properties.nome, s = stats.get(nm);
        layer.bindTooltip(s ? `<b>${esc(nm)}</b><br>${s.imo} imóveis · ${s.plt} plantios<br>${n1.format(s.ha)} ha plantados`
          : `<b>${esc(nm)}</b><br>Sem imóveis nos filtros atuais`, { sticky: true, className: 'hover-tip' });
        layer.on('click', (e) => { if (s || S.f.mun === nm) { setFilter('mun', nm, { toggle: true }); } L.DomEvent.stopPropagation(e); });
        if (s) {
          const c = layer.getBounds().getCenter();
          munLabels.addLayer(L.marker(c, { opacity: 0, interactive: false, keyboard: false, icon: L.divIcon({ className: '', html: '' }) })
            .bindTooltip(nm, { permanent: true, direction: 'center', className: 'mun-label' }));
        }
      },
    });
    if ($('#l-mun').checked) { L_mun.addTo(map); munLabels.addTo(map); }

    // imóveis
    L_imo = L.geoJSON({ type: 'FeatureCollection', features: V.imoveis.map((i) => i.feature) }, {
      pane: 'imoPane',
      style: (f) => {
        const isSel = f.properties.car === S.sel;
        return { color: isSel ? css('--sema-yellow') : (sat ? '#ffffff' : css('--imo-line')), weight: isSel ? 3 : 1.4,
          opacity: isSel ? 1 : 0.75, fillColor: sat ? '#ffffff' : css('--imo-line'), fillOpacity: isSel ? 0.08 : 0.03 };
      },
      onEachFeature: (f, layer) => {
        const i = D.byCar.get(f.properties.car);
        layer.bindTooltip(`<b>${esc(title(i.propriedade))}</b><br>${esc(i.municipio)} · ${n1.format(i.ha)} ha`, { sticky: true, className: 'hover-tip' });
        layer.on('click', (e) => { select(i.car); L.DomEvent.stopPropagation(e); });
      },
    });
    if ($('#l-imo').checked) L_imo.addTo(map);

    // plantios
    L_plt = L.geoJSON({ type: 'FeatureCollection', features: V.plantios.map((p) => p.feature) }, {
      pane: 'pltPane',
      style: (f) => {
        const p = f.properties, isSel = p.uid === S.selPlt;
        return { color: isSel ? css('--sema-yellow') : (sat ? '#ffffff' : css('--surface')), weight: isSel ? 3 : 1,
          fillColor: plantioColor(p), fillOpacity: 0.8 };
      },
      onEachFeature: (f, layer) => {
        const p = f.properties, i = D.byCar.get(p.car);
        layer.bindTooltip(`<b>${esc(p.tipo)}</b> · ${n2.format(p.ha)} ha<br>${esc(title(i?.propriedade))} · ${esc(p.fase)}`,
          { sticky: true, className: 'hover-tip' });
        layer.on('click', (e) => { select(p.car, p.uid); L.DomEvent.stopPropagation(e); });
      },
    });

    // pontos (visão geral, zoom baixo)
    L_pts = L.layerGroup(V.imoveis.map((i) => {
      const isSel = i.car === S.sel;
      return L.circleMarker([i.lat, i.lon], { pane: 'ptsPane', radius: isSel ? 8 : 6, weight: isSel ? 3 : 1.5,
        color: isSel ? css('--sema-yellow') : (sat ? '#ffffff' : css('--surface')), fillColor: imovelColor(i), fillOpacity: 0.95 })
        .bindTooltip(`<b>${esc(title(i.propriedade))}</b><br>${esc(i.municipio)} · ${n2.format(i.haPlant)} ha plantados`, { className: 'hover-tip' })
        .on('click', (e) => { select(i.car); L.DomEvent.stopPropagation(e); });
    }));
    updateZoomLayers();

    if (fit) {
      const g = V.imoveis.length ? L.featureGroup([L_imo]) : null;
      if (S.sel && D.byCar.get(S.sel)) zoomTo(D.byCar.get(S.sel));
      else if (g && g.getBounds().isValid()) map.fitBounds(g.getBounds(), { padding: [30, 30], maxZoom: 13 });
    }
  }

  function updateZoomLayers() {
    if (!L_plt) return;
    const z = map.getZoom(), showPlt = $('#l-plt').checked;
    if (showPlt && z >= ZOOM_POLY - 2) L_plt.addTo(map); else map.removeLayer(L_plt);
    if (showPlt && z < ZOOM_POLY) L_pts.addTo(map); else map.removeLayer(L_pts);
  }

  function zoomTo(i, plt) {
    const layer = L.geoJSON(plt ? plt.feature : i.feature);
    map.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: plt ? 17 : 16 });
  }

  function renderLegend() {
    let items;
    if (S.colorBy === 'fase') items = FASES.map((f) => [css(FASE_VAR[f]), f]);
    else if (S.colorBy === 'sit') items = SIT.map((s) => [css(s.v), s.label]);
    else items = TIPOS.map((t) => [css(tipoVar(t)), t]);
    $('#legend').innerHTML = items.map(([c, l]) => `<span class="it"><span class="sw" style="background:${c}"></span>${esc(l)}</span>`).join('')
      + `<span class="it"><span class="sw sw-line" style="border-color:${css('--imo-line')}"></span>Limite do imóvel</span>`
      + `<span class="it" style="margin-left:auto;color:var(--muted)">Pontos = imóveis (zoom afastado) · polígonos aparecem ao aproximar</span>`;
  }

  // ------------------------------------------------------------------ painel de detalhe
  const yn = (v) => v === true ? 'yes' : '';
  function select(car, plt = null) {
    S.sel = car; S.selPlt = plt;
    const i = D.byCar.get(car);
    renderDetail(); renderMap(false); highlightRow();
    if (i) zoomTo(i, plt ? i.plantios.find((p) => p.uid === plt) : null);
    if (innerWidth < 1200) $('#detail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderDetail() {
    const box = $('#detail');
    const i = S.sel && D.byCar.get(S.sel);
    if (!i) return renderSummary();
    const m = i.mon, s = sitOf(i);
    const dl = (pairs) => `<dl class="d-grid">${pairs.filter((p) => p[1] !== undefined).map(([k, v]) => `<div><dt>${k}</dt><dd>${v ?? '—'}</dd></div>`).join('')}</dl>`;
    const plts = i.plantios.map((p) => `<div class="plt ${p.uid === S.selPlt ? 'sel' : ''}" data-plt="${p.uid}">
        <span class="sw" style="background:${plantioColor(p)}"></span>
        <span>${esc(p.fase)}<small>${esc(p.tipo)}${i.modelo ? ' · modelo ' + esc(i.modelo) : ''}</small></span><b>${n2.format(p.ha)} ha</b></div>`).join('');
    let mon = '<p class="empty">Imóvel ainda sem visita de monitoramento de acordo com a última atualização.</p>';
    if (m && m.visitado) {
      const chips = (list, bad) => list.map(([k, l]) => `<span class="chip ${m[k] ? (bad ? 'bad' : 'yes') : ''}">${m[k] ? (bad ? '●' : '✓') : '–'} ${l}</span>`).join('');
      mon = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <span class="badge"><span class="dot" style="background:${css(s.v)}"></span>${s.label}</span>
          ${m.av ? `<span class="badge">Avaliação: ${title(m.av)}</span>` : ''}
        </div>
        ${dl([['Data da visita', fmtDate(m.data)], ['Implantação', esc(m.ano)], ['Sistema', esc(title(m.sis))], ['Modelo', esc(m.mod)],
          ['Estágio', esc(title(m.est))], ['Sobrevivência', esc(m.sob)], ['Desenvolvimento', esc(title(m.des))],
          ['Produção', m.prod === true ? 'Sim' : m.prod === false ? 'Não' : '—']])}
        ${m.pp || m.dst ? `<div class="note"><b>Produtos:</b> ${esc(title(m.pp) || '—')}${m.dst ? ` · <b>Destino:</b> ${esc(title(m.dst))}` : ''}</div>` : ''}
        <div class="d-sec"><h3>Práticas de manejo</h3><div class="chips">${chips(MANEJO, false)}</div></div>
        <div class="d-sec"><h3>Problemas observados</h3><div class="chips">${chips(PROBLEMAS, true)}</div></div>
`;
    }
    box.innerHTML = `
      <div class="d-head"><div><h2>${esc(title(i.propriedade))}</h2>
        <div class="d-sub">${esc(i.municipio)} · ${esc(i.nucleo || '')}</div></div>
        <button class="d-close" type="button" aria-label="Fechar detalhe">✕</button></div>
      ${dl([['Proprietário(a)', esc(title(i.proprietario))], ['Código CAR', carCompleto(i) ? `<span style="word-break:break-all;font-size:12px">${esc(carCompleto(i))}</span>` : esc(i.car)], ['Local', esc(i.local)],
        ['Fase(s)', i.fases.map((f) => f.split(' · ')[0]).join(', ')], ['Área do imóvel', `${n2.format(i.ha)} ha`],
        ['Área plantada', `${n2.format(i.haPlant)} ha`],
        ['Sistema', i.sistema === SEM_SIS ? '—' : esc(i.sistema) + (i.sisFonte === 'cadastro' ? ' <span style="font-weight:400;color:var(--muted);font-size:11px">(planilha de cadastro)</span>' : '')],
        ['Modelo', i.modelo ? esc(i.modelo) : '—']])}
      <div class="d-sec"><h3>Áreas de plantio (${i.plantios.length})</h3><div class="plt-list">${plts}</div></div>
      <div class="d-sec"><h3>Monitoramento</h3>${mon}</div>`;
    box.querySelector('.d-close').onclick = () => { S.sel = null; S.selPlt = null; renderDetail(); renderMap(true); highlightRow(); };
    box.querySelectorAll('[data-plt]').forEach((el) => el.onclick = () => select(i.car, el.dataset.plt));
  }

  function renderSummary() {
    const stats = [...munStats().entries()].sort((a, b) => b[1].ha - a[1].ha);
    const tot = stats.reduce((t, [, s]) => ({ imo: t.imo + s.imo, plt: t.plt + s.plt, ha: t.ha + s.ha }), { imo: 0, plt: 0, ha: 0 });
    $('#detail').innerHTML = `
      <div><h2>Resumo por município</h2><div class="d-sub">Clique em um imóvel ou plantio no mapa para ver os detalhes da visita.</div></div>
      <table class="mini-table"><thead><tr><th>Município</th><th>Imóveis</th><th>Plantios</th><th>ha plant.</th><th>Bem cond.</th></tr></thead>
      <tbody>${stats.map(([m, s]) => `<tr class="click" data-mun="${esc(m)}"><td>${esc(m)}</td><td>${s.imo}</td><td>${s.plt}</td>
        <td>${n1.format(s.ha)}</td><td>${s.vis ? Math.round((s.good / s.vis) * 100) + '%' : '—'}</td></tr>`).join('')}
        <tr><td><b>Total</b></td><td><b>${tot.imo}</b></td><td><b>${tot.plt}</b></td><td><b>${n1.format(tot.ha)}</b></td><td></td></tr></tbody></table>
      ${D.semPoligono.length ? `<div class="note">${D.semPoligono.length} linha(s) da planilha sem imóvel correspondente nos shapes (códigos CAR: ${D.semPoligono.map((r) => esc(r.car)).join(', ')}).</div>` : ''}`;
    $('#detail').querySelectorAll('[data-mun]').forEach((tr) => tr.onclick = () => setFilter('mun', tr.dataset.mun, { toggle: true }));
  }


  // tom de uma mesma cor proporcional ao valor (monocromático)
  function hexRgb(h) { h = h.replace('#', ''); return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16)); }
  function mix(a, b, t) {
    const A = hexRgb(a), B = hexRgb(b);
    return '#' + A.map((v, k) => Math.round(v + (B[k] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function rampa(rows, lo, hi) {
    const max = Math.max(...rows.map((r) => r.value), 1e-9), a = css(lo), b = css(hi);
    rows.forEach((r) => { r.color = mix(a, b, r.value / max); });
    return rows;
  }
  // número completo do CAR: planilha de monitoramento > planilha de cadastro
  const carCompleto = (i) => i.mon?.car_completo || D.cadastro?.get(i.car)?.car_completo || '';

  // ------------------------------------------------------------------ gráficos
  function renderCharts() {
    const I = V.imoveis, P = V.plantios, vis = V.visit;
    const muns = [...new Set(I.map((i) => i.municipio))];

    // situação por município (empilhado, cores de status)
    const sitRows = muns.map((m) => {
      const parts = {}; I.filter((i) => i.municipio === m).forEach((i) => { const k = sitOf(i).key; parts[k] = (parts[k] || 0) + 1; });
      return { label: m, parts };
    }).sort((a, b) => Object.values(b.parts).reduce((x, y) => x + y, 0) - Object.values(a.parts).reduce((x, y) => x + y, 0));
    Charts.hbar($('#ch-sit'), { rows: sitRows, series: SIT.map((s) => ({ key: s.key, label: s.label, color: css(s.v) })),
      aria: 'Situação dos imóveis por município', onClick: (r) => setFilter('mun', r.label, { toggle: true }) });

    // área por fase × tipo
    const faseRows = FASES.map((f) => {
      const parts = {}; P.filter((p) => p.fase === f).forEach((p) => { parts[p.tipo] = (parts[p.tipo] || 0) + (p.ha || 0); });
      const [a, b] = f.split(' · ');
      return { label: a, sub: b, title: f, key: f, parts };
    });
    Charts.cols($('#ch-fase'), { rows: faseRows, series: TIPOS.map((t) => ({ key: t, label: t, color: css(tipoVar(t)) })),
      decimals: 1, aria: 'Área plantada por fase', height: 210,
      tipExtra: (r) => `<div style="color:var(--muted);margin-top:4px">hectares · clique para filtrar</div>`,
      onClick: (r) => setFilter('fase', r.key, { toggle: true }) });

    // área por município
    const munRows = muns.map((m) => ({ label: m, value: P.filter((p) => p.municipio === m).reduce((s, p) => s + (p.ha || 0), 0) }))
      .sort((a, b) => b.value - a.value);
    munRows.forEach((r, j) => { r.color = css(j === 0 ? '--mun-top' : '--mun-rest'); });  // 1º lugar mais escuro
    Charts.hbar($('#ch-mun'), { rows: munRows, decimals: 1, unit: ' ha', valueLabel: 'Área plantada',
      onClick: (r) => setFilter('mun', r.label, { toggle: true }) });

    // problemas / manejo (% dos visitados)
    const pctRows = (list) => list.map(([k, l]) => {
      const n = vis.filter((i) => i.mon[k] === true).length;
      return { label: l, value: vis.length ? (n / vis.length) * 100 : 0, n };
    }).sort((a, b) => b.value - a.value);
    const tipN = (r) => `<div style="color:var(--muted);margin-top:4px">${r.n} de ${vis.length} imóveis visitados</div>`;
    Charts.hbar($('#ch-prob'), { rows: rampa(pctRows(PROBLEMAS), '--prob-lo', '--prob-hi'), max: 100, unit: '%', valueLabel: 'Imóveis', tipExtra: tipN });
    Charts.hbar($('#ch-man'), { rows: rampa(pctRows(MANEJO), '--man-lo', '--man-hi'), max: 100, unit: '%', valueLabel: 'Imóveis', tipExtra: tipN });

    // distribuições
    const dist = (list, k, cores) => list.map(([v, l], j) => ({ label: l, key: v, value: vis.filter((i) => i.mon[k] === v).length,
      color: cores ? css(cores[j]) : undefined }));
    const RUIM_BOM = ['--s-crit', '--s-warn', '--s-good'];            // vermelho → amarelo → verde
    const AV_CORES = ['--s-crit', '--s-none', '--s-warn', '--s-good']; // Ruim, Regular, Bom, Ótimo
    Charts.cols($('#ch-sob'), { rows: dist(SOB, 'sob', RUIM_BOM), valueLabel: 'Imóveis' });
    Charts.cols($('#ch-av'), { rows: dist(AV.map((a) => [a, title(a)]), 'av', AV_CORES), valueLabel: 'Imóveis',
      onClick: (r) => setFilter('av', r.key, { toggle: true }) });
    Charts.cols($('#ch-est'), { rows: dist(EST, 'est', RUIM_BOM), valueLabel: 'Imóveis' });
  }

  // ------------------------------------------------------------------ tabela
  // primeiro nome + primeiro sobrenome (ignora "de", "da", "dos"… e partes entre parênteses)
  function nomeCurto(nome) {
    const w = title(String(nome || '').split(/\s+-\s+/)[0].replace(/\(.*?\)/g, ''))
      .split(/\s+/).filter((x) => x && !/^(de|da|do|das|dos|e)$/i.test(x));
    return w.slice(0, 2).join(' ');
  }

  const COLS = [
    { k: 'propriedade', l: 'Imóvel', v: (i) => title(i.propriedade) },
    { k: 'dono', l: 'Proprietário(a)', v: (i) => nomeCurto(i.proprietario) },
    { k: 'municipio', l: 'Município', v: (i) => i.municipio },
    { k: 'fases', l: 'Fase(s)', v: (i) => i.fases.map((f) => f.split(' · ')[0].replace('Fase ', '')).join(', ') },
    { k: 'sistema', l: 'Sistema', v: (i) => i.sistema === SEM_SIS ? '' : i.sistema },
    { k: 'ha', l: 'Área imóvel (ha)', n: true, v: (i) => i.ha, f: (x) => n1.format(x) },
    { k: 'haPlant', l: 'Área plantada (ha)', n: true, v: (i) => i.haPlant, f: (x) => n2.format(x) },
    { k: 'nplt', l: 'Plantios', n: true, v: (i) => i.plantios.length },
    { k: 'sit', l: 'Situação', v: (i) => sitOf(i).label, h: (i) => `<span class="dot" style="background:${css(sitOf(i).v)};margin-right:6px"></span>${sitOf(i).label}` },
    { k: 'av', l: 'Avaliação', v: (i) => title(i.mon?.av || '') },
    { k: 'sob', l: 'Sobrevivência', v: (i) => i.mon?.sob || '' },
    { k: 'data', l: 'Última visita', v: (i) => i.mon?.data || '', f: fmtDate },
  ];

  function renderTable() {
    const c = COLS.find((x) => x.k === S.sort.key) || COLS[6];
    const rows = [...V.imoveis].sort((a, b) => {
      const x = c.v(a), y = c.v(b);
      return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'pt')) * S.sort.dir;
    });
    $('#tbl').innerHTML = `<thead><tr>${COLS.map((x) => `<th data-sort="${x.k}" class="${x.n ? 'n ' : ''}${x.k === S.sort.key ? (S.sort.dir > 0 ? 'asc' : 'desc') : ''}">${x.l}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((i) => `<tr data-car="${esc(i.car)}" class="${i.car === S.sel ? 'sel' : ''}">${COLS.map((x) => {
        const v = x.v(i);
        return `<td class="${x.n ? 'n' : ''}">${x.h ? x.h(i) : esc(x.f ? (v === '' ? '—' : x.f(v)) : (v === '' ? '—' : v))}</td>`;
      }).join('')}</tr>`).join('')}</tbody>`;
    $('#tbl').querySelectorAll('th').forEach((th) => th.onclick = () => {
      const k = th.dataset.sort; S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : (COLS.find((x) => x.k === k).n ? -1 : 1) };
      renderTable();
    });
    $('#tbl').querySelectorAll('tbody tr').forEach((tr) => tr.onclick = () => {
      select(tr.dataset.car); $('#map').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  function highlightRow() { document.querySelectorAll('#tbl tbody tr').forEach((tr) => tr.classList.toggle('sel', tr.dataset.car === S.sel)); }

  function exportCSV() {
    const head = ['CAR', 'CAR completo', 'Imóvel', 'Proprietário', 'Município', 'Núcleo', 'Local', 'Fases', 'Sistema', 'Área imóvel (ha)', 'Área plantada (ha)', 'Plantios',
      'Situação', 'Avaliação', 'Sobrevivência', 'Desenvolvimento', 'Estágio', 'Data visita', 'Ano implantação',
      ...MANEJO.map((m) => m[1]), ...PROBLEMAS.map((p) => p[1]), 'Produção', 'Produtos', 'Destino'];
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const dec = (x) => (x ?? '') === '' ? '' : String(Math.round(x * 10000) / 10000).replace('.', ',');
    const sn = (v) => v === true ? 'Sim' : v === false ? 'Não' : '';
    const lines = V.imoveis.map((i) => { const m = i.mon || {};
      return [i.car, carCompleto(i), title(i.propriedade), i.proprietario, i.municipio, i.nucleo, i.local, i.fases.join(' | '), i.sistema === SEM_SIS ? '' : i.sistema,
        dec(i.ha), dec(i.haPlant), i.plantios.length, sitOf(i).label, m.av, m.sob, m.des, m.est, fmtDate(m.data).replace('—', ''), m.ano,
        ...MANEJO.map(([k]) => sn(m[k])), ...PROBLEMAS.map(([k]) => sn(m[k])), sn(m.prod), m.pp, m.dst].map(q).join(';'); });
    const blob = new Blob(['﻿' + [head.map(q).join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `ASL_imoveis_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ------------------------------------------------------------------ atualização manual
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 6000);
  }
  async function refresh() {
    const b = $('#btn-refresh'); b.disabled = true; b.setAttribute('aria-busy', 'true');
    try {
      const r = await fetch('/api/dados?salvar=1', { cache: 'no-store' });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data || data.erro) throw new Error(data?.erro || (r.status === 404
        ? 'a atualização manual funciona no site publicado na Vercel' : `HTTP ${r.status}`));
      applyMonitoring(data); render(false);
      toast(`Dados atualizados: ${data.linhas} linhas lidas da planilha agora.` + (data.publicado ? ' A nova versão também está sendo publicada para todos.' : ''));
    } catch (e) {
      toast(`Não foi possível atualizar: ${e.message}.`, true);
    } finally { b.disabled = false; b.removeAttribute('aria-busy'); }
  }

  // ------------------------------------------------------------------ render geral
  function render(fit) {
    computeView();
    if (S.sel && !V.carSet.has(S.sel)) { S.sel = null; S.selPlt = null; }
    syncFilterUI(); renderKPIs(); renderMap(fit); renderLegend(); renderDetail(); renderCharts(); renderTable();
  }

  async function start() {
    try {
      await load();
    } catch (e) {
      $('#detail').innerHTML = `<p class="empty">Erro ao carregar os dados: ${esc(e.message)}</p>`; console.error(e); return;
    }
    setupFilters(); initMap();
    $('#btn-refresh').addEventListener('click', refresh);
    $('#btn-csv').addEventListener('click', exportCSV);
    render(true);
    let rt; new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(renderCharts, 120); }).observe($('.charts'));
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => location.reload());
  }
  start();
})();
