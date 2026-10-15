// Executado pela Vercel a cada deploy (e a cada atualização semanal):
// 1) baixa a planilha e grava data/monitoramento.json
//    (se a planilha estiver inacessível, mantém o último arquivo salvo);
// 2) copia o site para dist/, que é a pasta publicada.
import { readFile, writeFile, rm, mkdir, cp } from 'node:fs/promises';
import { fetchSheet, rowsFromCsv } from '../lib/planilha.mjs';

const root = new URL('../', import.meta.url);
const OUT = new URL('data/monitoramento.json', root);

try {
  let data;
  if (process.env.SHEET_CSV_FILE) {
    const rows = rowsFromCsv(await readFile(process.env.SHEET_CSV_FILE, 'utf8'));
    data = { atualizado_em: new Date().toISOString(), fonte: 'arquivo CSV local', linhas: rows.length, rows };
  } else {
    data = await fetchSheet();
    if (!data.cadastro) {
      console.warn(`[dados] AVISO: planilha de cadastro indisponível (${data.aviso_cadastro}). Mantendo a última versão.`);
      try { data.cadastro = JSON.parse(await readFile(OUT, 'utf8')).cadastro || null; } catch { /* sem versão anterior */ }
    } else console.log(`[dados] ${data.cadastro.length} imóveis lidos da planilha de cadastro`);
  }
  await writeFile(OUT, JSON.stringify(data));
  console.log(`[dados] ${data.linhas} linhas da planilha gravadas em data/monitoramento.json`);
} catch (err) {
  console.warn(`[dados] AVISO: não foi possível ler a planilha (${err.message}). Mantendo o último arquivo salvo.`);
}

const dist = new URL('dist/', root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const item of ['index.html', 'assets', 'data']) {
  await cp(new URL(item, root), new URL(item, dist), { recursive: true });
}
console.log('[site] arquivos copiados para dist/');
