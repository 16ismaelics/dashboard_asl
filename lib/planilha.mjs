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
    car_completo: (o.car_full || '').toUpperCase().replace(/\s/g, '') || null,
    prop: o.prop || null,
    mun: o.mun || null,
    area: num(o.area),
    data: isoDate(o.data),
    ano: o.ano || null,
    plantio: num(o.plantio),
    enriq: num(o.enriq),
  };
  for (const k of ['sis', 'mod', 'est', 'sob', 'des', 'sit', 'op', 'pp', 'dst', 'rec', 'av', 'obs'])
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

export async function fetchSheet({ id = SHEET_ID, gid = SHEET_GID, timeoutMs = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(sheetCsvUrl(id, gid), { redirect: 'follow', signal: ctrl.signal });
    if (!res.ok) throw new Error(`Google Sheets respondeu ${res.status}`);
    const text = await res.text();
    if (/^\s*<!DOCTYPE html|<html/i.test(text)) throw new Error('A planilha não está pública ("Qualquer pessoa com o link")');
    const rows = rowsFromCsv(text);
    return { atualizado_em: new Date().toISOString(), fonte: 'Google Sheets', linhas: rows.length, rows };
  } finally { clearTimeout(t); }
}
