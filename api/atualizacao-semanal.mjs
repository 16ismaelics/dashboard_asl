// Atualização automática: a Vercel chama esta rota toda segunda-feira às 17h do Acre
// (22:00 UTC — no plano gratuito, em algum momento entre 17:00 e 17:59; ver vercel.json).
// Ela dispara um novo deploy; o build lê a planilha de novo e publica os números novos.
// Variáveis: DEPLOY_HOOK_URL (obrigatória) e CRON_SECRET (recomendada).

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Não autorizado', { status: 401 });
  }
  const hook = process.env.DEPLOY_HOOK_URL || process.env.BUILD_HOOK_URL;
  if (!hook) return Response.json({ ok: false, erro: 'DEPLOY_HOOK_URL não configurado' }, { status: 500 });
  const r = await fetch(hook, { method: 'POST' });
  console.log(`Deploy semanal disparado: HTTP ${r.status}`);
  return Response.json({ ok: r.ok });
}
