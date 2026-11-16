/*
  TESTE DE CARGA NO ENDEREÇO REAL (Google Planilhas).
  Envia cadastros de teste direto para o seu formEndpoint e confere se todos foram aceitos.
  Os registros vão para a aba "Teste de carga" da planilha (apague a aba depois).

  Rodar (com o endereço que termina em /exec):
    cd testes
    node carga.js https://script.google.com/macros/s/SEU_CODIGO/exec [quantidade=130] [simultaneos=15]

  Não use com Formspree: cada envio de teste conta no limite mensal do plano.
*/
const [URL_ALVO, QTD = '130', SIMULT = '15'] = process.argv.slice(2);
if (!process.env.CARGA_TESTE_LOCAL && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(URL_ALVO || '')) {
  console.error('Informe o endereço do Apps Script (https://script.google.com/macros/s/.../exec).');
  process.exit(2);
}
const total = Number(QTD), simult = Number(SIMULT);
const resultados = { ok: 0, limite: 0, outro: [], erro: [] };
const tempos = [];
const marca = Date.now().toString(36);

async function enviar(i) {
  const corpo = new URLSearchParams({
    tipo: 'teste_carga', perfil: i % 4 === 0 ? 'empresa' : 'medico', lote: marca,
    nome: `Teste ${i}`, whatsapp: `(11) 9${String(30000000 + i)}`, enviado_em: new Date().toISOString(),
  });
  const t0 = Date.now();
  try {
    const r = await fetch(URL_ALVO, { method: 'POST', body: corpo, redirect: 'follow', signal: AbortSignal.timeout(30000) });
    const txt = (await r.text()).trim();
    tempos.push(Date.now() - t0);
    if (txt === 'ok') resultados.ok++;
    else if (txt === 'limite') resultados.limite++;
    else resultados.outro.push(`${i}: HTTP ${r.status} ${txt.slice(0, 80)}`);
  } catch (e) { resultados.erro.push(`${i}: ${e.message}`); }
}

(async () => {
  console.log(`Enviando ${total} cadastros de teste, ${simult} ao mesmo tempo (lote ${marca})...`);
  const t0 = Date.now();
  let prox = 0;
  await Promise.all([...Array(simult)].map(async () => { while (prox < total) await enviar(prox++); }));
  tempos.sort((a, b) => a - b);
  console.log(`\nAceitos: ${resultados.ok} de ${total}`);
  if (resultados.limite) console.log(`Barrados pelo limite por minuto: ${resultados.limite}`);
  if (resultados.outro.length) { console.log(`Respostas inesperadas: ${resultados.outro.length}`); resultados.outro.slice(0, 5).forEach(x => console.log('  - ' + x)); }
  if (resultados.erro.length) { console.log(`Erros de conexão: ${resultados.erro.length}`); resultados.erro.slice(0, 5).forEach(x => console.log('  - ' + x)); }
  if (tempos.length) console.log(`Tempo de resposta: mediana ${tempos[Math.floor(tempos.length / 2)]} ms, pior ${tempos.at(-1)} ms`);
  console.log(`Duração total: ${Math.round((Date.now() - t0) / 1000)} s`);
  console.log(`\nAgora confira na planilha: a aba "Teste de carga" deve ter ${resultados.ok} linhas com lote ${marca}. Depois apague a aba.`);
  process.exit(resultados.ok === total ? 0 : 1);
})();
