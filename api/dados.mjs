// Atualização manual: o botão "Atualizar agora" chama /api/dados.
// Lê a planilha na hora e devolve os dados já normalizados.
// Com ?salvar=1 e DEPLOY_HOOK_URL configurado, dispara um novo deploy na Vercel
// para que a versão nova fique salva para todos — só se a planilha mudou.
import { fetchSheet } from '../lib/planilha.mjs';

const hookUrl = () => process.env.DEPLOY_HOOK_URL || process.env.BUILD_HOOK_URL;

export async function GET(request) {
  try {
    const data = await fetchSheet();
    let publicado = false;
    const url = new URL(request.url);
    if (url.searchParams.get('salvar') === '1' && hookUrl()) {
      let mudou = true;
      try {
        const atual = await (await fetch(`${url.origin}/data/monitoramento.json`, { cache: 'no-store' })).json();
        mudou = JSON.stringify(atual.rows) !== JSON.stringify(data.rows);
      } catch { /* sem versão anterior: publica */ }
      if (mudou) publicado = (await fetch(hookUrl(), { method: 'POST' })).ok;
    }
    return Response.json({ ...data, publicado }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ erro: err.message }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
  }
}
