// Leitura e normalização da planilha de monitoramento (Google Sheets → JSON).
// Usado pelo build (scripts/build-data.mjs) e pela função de atualização manual
// (api/dados.mjs, na Vercel). Sem dependências externas.

export const SHEET_ID = process.env.SHEET_ID || '1bokxfcigtEh6OHa3dn0GNsR2K6WJcC7I';
export const SHEET_GID = process.env.SHEET_GID || '714297731';

export function sheetCsvUrl(id = SHEET_ID, gid = SHEET_GID) {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

// Cabeçalho da planilha (sem acento, maiúsculo) → chave curta usada no painel.
// CONTATO é propositalmente ignorado: telefone não é publicado.
const COLS = {
  'ID': 'id', 'CAR': 'car_full', 'PROPRIETARIO': 'proprietario', 'PROPRIEDADE': 'prop',
  'MUNICIPIO': 'mun', 'AREA (HA)': 'area', 'DATA VISITA': 'data',
  'ANO DE IMPLEMENTACAO': 'ano', 'PLANTIO': 'plantio', 'PLANTIO ENRIQUECIMENTO': 'enriq',
  'SISTEMA': 'sis', 'MODELO': 'mod', 'ESTAGIO': 'est', 'SOBREVIVENCIA': 'sob',
  'DESENVOLVIMENTO': 'des', 'CAPINA': 'cap', 'ADUBACAO': 'adu', 'PODA': 'pod',
  'IRRIGACAO': 'irr', 'REPLANTIO': 'rep', 'SITUACAO': 'sit', 'FALTA DE MANEJO': 'fm',
  'MORTALIDADE': 'mor', 'PRAGAS E DOENCAS': 'pd', 'SOLO DEGRADADO': 'sd',
  'FALTA DE INSUMOS': 'fi', 'PROBLEMAS CLIMATICOS': 'pc', 'OUTROS PROBLEMAS': 'op',
  'PRODUCAO': 'prod', 'PRINCIPAIS PRODUTOS': 'pp', 'DESTINO': 'dst',
  'RECOMENDACOES': 'rec', 'FOTO EM SOLO': 'foto_solo', 'FOTO AREA': 'foto_area',
  'AVALIACAO FINAL': 'av', 'OBSERVACOES': 'obs',
};
const YES_NO = ['cap', 'adu', 'pod', 'irr', 'rep', 'fm', 'mor', 'pd', 'sd', 'fi', 'pc', 'prod', 'foto_solo', 'foto_area'];
const UPPER = ['mun', 'sis', 'est', 'sob', 'des', 'sit', 'av', 'pp', 'dst'];

const stripAccents = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const clean = (s) => (s ?? '').toString().replace(/\s+/g, ' ').trim();

// Parser CSV com suporte a aspas, vírgulas e quebras de linha dentro do campo.
export function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const num = (s) => {
  s = clean(s).replace(/\s/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

const isoDate = (s) => {
  const m = clean(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const y = m[3].length === 2 ? '20' + m[3] : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
};

// Número completo do CAR no formato AC-1200000-XXXXXXXX… (corrige hífen ausente)
export function formatCar(s) {
  const t = stripAccents(clean(s)).toUpperCase().replace(/\s/g, '');
  const m = t.match(/^([A-Z]{2})-?(\d{7})-?([0-9A-F]{8,})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : (t || null);
}

// Código curto do CAR = últimos 4 caracteres do hash (mesmo campo ID_CAR dos shapes).
export const carCode = (s) => {
  const t = stripAccents(clean(s)).toUpperCase().replace(/[^0-9A-Z]/g, '');
  return t.length >= 4 ? t.slice(-4) : null;
};

function normalizeRow(r) {
  const o = {};
  for (const k of Object.keys(r)) o[k] = clean(r[k]);
  for (const k of UPPER) if (o[k] !== undefined) o[k] = o[k].toUpperCase();
  for (const k of YES_NO) {
    if (o[k] === undefined) continue;
    const v = stripAccents(o[k]).toUpperCase();
    o[k] = v === 'SIM' ? true : v === 'NAO' ? false : null;
  }
  if (o.sob) o.sob = o.sob.replace(/[–—]/g, '-').replace(/\s/g, '');
  if (o.des) o.des = o.des.replace('ÓTIMÓ', 'ÓTIMO');
  if (o.av) o.av = o.av.replace('ÓTIMÓ', 'ÓTIMO');
  if (o.mod) o.mod = o.mod.toLowerCase();
  // "OUTROS PROBLEMAS" pode vir "NÃO" ou texto livre
  if (o.op && ['NAO', 'NÃO', '-'].includes(o.op.toUpperCase())) o.op = '';
  const out = {
    id: o.id || null,
    car: carCode(o.car_full ?? o.car),
    car_completo: formatCar(o.car_full),
    prop: o.prop || null,
    mun: o.mun || null,
    area: num(o.area),
    data: isoDate(o.data),
    ano: o.ano || null,
    plantio: num(o.plantio),
    enriq: num(o.enriq),
  };
  // OUTROS PROBLEMAS, RECOMENDAÇÕES e OBSERVAÇÕES são anotações internas: não são publicadas
  for (const k of ['sis', 'mod', 'est', 'sob', 'des', 'sit', 'pp', 'dst', 'av'])
    out[k] = o[k] || null;
  for (const k of YES_NO) out[k] = o[k] ?? null;
  out.visitado = Boolean(out.data || out.sit || out.av);
  return out;
}

export function rowsFromCsv(text) {
  const table = parseCsv(text).filter((r) => r.some((c) => clean(c)));
  if (!table.length) throw new Error('Planilha vazia');
  const header = table[0].map((h) => COLS[stripAccents(clean(h)).toUpperCase()] || null);
  if (!header.includes('car_full')) throw new Error('Coluna CAR não encontrada no cabeçalho da planilha');
  const rows = [];
  for (const line of table.slice(1)) {
    const r = {};
    header.forEach((k, i) => { if (k) r[k] = line[i] ?? ''; });
    const n = normalizeRow(r);
    if (n.car) rows.push(n);
  }
  return rows;
}

async function getCsv(id, gid, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(sheetCsvUrl(id, gid), { redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error(`Google Sheets respondeu ${res.status}`);
    const text = await res.text();
    if (/^\s*<!DOCTYPE html|<html/i.test(text)) throw new Error('A planilha não está pública ("Qualquer pessoa com o link")');
    return text;
  } finally { clearTimeout(t); }
}

// ---------------------------------------------------------------------------
// Planilha complementar (cadastro dos imóveis): usada SÓ para preencher o
// sistema/modelo de imóveis que estão sem SISTEMA na planilha de monitoramento.
// Lê apenas Cód_CAR e Modelo SAF — nomes, CPF e telefones são descartados aqui.
export const CADASTRO_ID = process.env.CADASTRO_ID || '1nrAwc0Kss9exozA3oZuG9TGIvdfrGAzD';
export const CADASTRO_GID = process.env.CADASTRO_GID || '660062963';

// "Povoamento" é o nome antigo de Enriquecimento.
export function sistemaDoModelo(txt) {
  const t = stripAccents(clean(txt)).toLowerCase();
  const saf = /\bsaf\b/.test(t), enr = /enriq|povoam/.test(t);
  return saf && enr ? 'SAF + Enriquecimento' : saf ? 'SAF' : enr ? 'Enriquecimento' : null;
}

export function cadastroFromCsv(text) {
  const table = parseCsv(text).filter((r) => r.some((c) => clean(c)));
  const head = table[0].map((h) => stripAccents(clean(h)).toUpperCase());
  const iCar = head.findIndex((h) => h === 'COD_CAR' || h === 'COD CAR');
  const iFull = head.findIndex((h) => h.startsWith('CODIGO (IMOVEL)'));
  const iMod = head.findIndex((h) => h === 'MODELO SAF');
  if (iMod < 0 || (iCar < 0 && iFull < 0)) throw new Error('Colunas Cód_CAR / Modelo SAF não encontradas na planilha de cadastro');
  const by = new Map();
  for (const line of table.slice(1)) {
    const car = carCode(line[iCar] || line[iFull] || '');
    const sis = sistemaDoModelo(line[iMod]);
    if (!car || !sis) continue;
    const mods = (clean(line[iMod]).match(/saf\s*0?(\d+)/gi) || []).map((m) => String(Number(m.replace(/\D/g, ''))));
    const o = by.get(car) || { car, sis, mod: [], car_completo: iFull >= 0 ? formatCar(line[iFull]) : null };
    if (o.sis !== sis) o.sis = 'SAF + Enriquecimento';
    for (const m of mods) if (!o.mod.includes(m)) o.mod.push(m);
    by.set(car, o);
  }
  return [...by.values()].map((o) => ({ car: o.car, sis: o.sis, mod: o.mod.join(' e ') || null, car_completo: o.car_completo }));
}

export async function fetchSheet({ id = SHEET_ID, gid = SHEET_GID, timeoutMs = 15000 } = {}) {
  const [main, cad] = await Promise.allSettled([
    getCsv(id, gid, timeoutMs),
    getCsv(CADASTRO_ID, CADASTRO_GID, timeoutMs),
  ]);
  if (main.status === 'rejected') throw main.reason;
  const rows = rowsFromCsv(main.value);
  let cadastro = null, aviso_cadastro = null;
  if (cad.status === 'fulfilled') {
    try { cadastro = cadastroFromCsv(cad.value); } catch (e) { aviso_cadastro = e.message; }
  } else aviso_cadastro = cad.reason?.message || 'falha ao ler';
  return { atualizado_em: new Date().toISOString(), fonte: 'Google Sheets', linhas: rows.length, rows, cadastro, aviso_cadastro };
}
