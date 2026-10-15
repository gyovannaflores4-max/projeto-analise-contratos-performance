// Testa as funções da Vercel com o banco em memória e respostas simuladas do PNCP, Resend e Telegram.
// Rodar com: node --test testes/
const test = require("node:test");
const assert = require("node:assert/strict");

delete process.env.KV_REST_API_URL; delete process.env.UPSTASH_REDIS_REST_URL;
process.env.SENHA_PAINEL = "senha-teste";
process.env.CRON_SECRET = "segredo-robo";
process.env.RESEND_API_KEY = "re_teste";
process.env.TELEGRAM_BOT_TOKEN = "123:abc";

const R = require("../regras.js");
const dados = require("../api/dados.js");
const rotina = require("../api/rotina.js");
const mensagens = require("../api/mensagens.js");

const chamadas = [];
let situacaoPNCP = "Divulgada no PNCP", arquivosPNCP = [{ sequencialDocumento: 1, tipoDocumentoNome: "Edital", titulo: "edital.pdf", statusAtivo: true, url: "https://pncp.gov.br/x/1" }];
global.fetch = async (url, opt = {}) => {
  url = String(url);
  chamadas.push({ url, corpo: opt.body ? JSON.parse(opt.body) : null });
  const resp = (status, corpo) => ({ ok: status < 300, status, json: async () => corpo, text: async () => JSON.stringify(corpo) });
  if (url.startsWith("https://api.resend.com")) return resp(200, { id: "x" });
  if (url.startsWith("https://api.telegram.org")) return resp(200, { ok: true });
  if (url.endsWith("/arquivos")) return resp(200, arquivosPNCP);
  if (url.includes("pncp.gov.br/api/consulta/v1/orgaos/12345678000199/compras/2026/7"))
    return resp(200, {
      situacaoCompraNome: situacaoPNCP, dataAtualizacaoGlobal: "2026-10-15T09:00:00", numeroCompra: "90012", modalidadeNome: "Pregão - Eletrônico",
      processo: "23537.009971/2026-18", objetoCompra: "Serviços médicos de plantão", valorTotalEstimado: 1500000,
      dataEncerramentoProposta: "2026-10-28T09:00:00", linkSistemaOrigem: "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=15502105900122026",
      orgaoEntidade: { razaoSocial: "HOSPITAL UNIVERSITÁRIO" }, unidadeOrgao: { nomeUnidade: "HU", codigoUnidade: "155021", ufSigla: "MG", municipioNome: "Belo Horizonte" }, usuarioNome: "Compras.gov.br"
    });
  return resp(404, {});
};

function chamar(fn, { method = "GET", query = {}, body, headers = {} } = {}) {
  return new Promise(resolve => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k] = v; },
      status(c) { this.statusCode = c; return this; },
      json(b) { this.body = b; resolve(this); return this; }
    };
    fn({ method, query, body, headers: { host: "radar.exemplo.app", ...headers } }, res);
  });
}
const painel = { "x-senha": "senha-teste" };
const robo = { authorization: "Bearer segredo-robo" };
const hoje = R.hojeBrasilia();

test("acesso exige senha ou token", async () => {
  assert.equal((await chamar(dados, { headers: { "x-senha": "errada" } })).statusCode, 401);
  assert.equal((await chamar(dados, { headers: robo })).statusCode, 401); // robô não lê os dados
  assert.equal((await chamar(rotina, { headers: { authorization: "Bearer x" } })).statusCode, 401);
  const r = await chamar(dados, { headers: painel });
  assert.equal(r.statusCode, 200);
  assert.equal(r.body.servidor.armazenamento, "memoria");
});

test("cadastro, alertas enviados uma vez e agenda", async () => {
  let r = await chamar(dados, { method: "POST", headers: painel, body: { acao: "config", config: { emails: "equipe@empresa.com.br, x", telegramChatId: "-100200", avisos: { vencimento: "60, 30, 10, 0" } } } });
  assert.deepEqual(r.body.config.emails, "equipe@empresa.com.br");
  r = await chamar(dados, { method: "POST", headers: painel, body: { acao: "salvar", colecao: "contratos", item: { numero: "12/2025", cliente: "Prefeitura X", fim: R.somaDias(hoje, 10), emails: "gestor@empresa.com.br" } } });
  assert.ok(r.body.item.id);
  await chamar(dados, { method: "POST", headers: painel, body: { acao: "importar", colecao: "documentos", itens: [{ nome: "CRF FGTS", tipo: "crf_fgts", validade: R.somaDias(hoje, 2) }, { nome: "CND", tipo: "cnd_federal", validade: R.somaDias(hoje, 100) }] } });

  chamadas.length = 0;
  r = await chamar(rotina, { headers: robo, query: { tarefa: "alertas" } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.alertas.novos, 2); // contrato (marco 10) e FGTS (marco 3); CND ainda longe
  const emails = chamadas.filter(c => c.url.includes("resend"));
  assert.deepEqual(emails.map(e => e.corpo.to).sort(), [["equipe@empresa.com.br"], ["gestor@empresa.com.br"]]);
  assert.match(emails[0].corpo.text, /Contrato 12\/2025/);
  assert.match(emails[0].corpo.html, /https:\/\/radar\.exemplo\.app\/gestao\.html/);
  assert.equal(chamadas.filter(c => c.url.includes("telegram")).length, 1);

  chamadas.length = 0;
  r = await chamar(rotina, { headers: robo, query: { tarefa: "alertas" } });
  assert.equal(r.body.alertas.novos, 0);
  assert.equal(chamadas.length, 0);
});

test("licitação pelo PNCP: preenchimento, acompanhamento e mudanças", async () => {
  let r = await chamar(dados, { headers: painel, query: { acao: "pncp", id: "https://pncp.gov.br/app/editais/12345678000199/2026/7" } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  const l = r.body.licitacao;
  assert.equal(l.pncpId, "12345678000199-2026-7");
  assert.equal(l.portal, "Compras.gov.br");
  assert.equal(l.compraId, "15502105900122026");
  assert.equal(l.sessao, "2026-10-28T09:00");
  assert.equal(l.numero, "Pregão - Eletrônico 90012/2026");

  r = await chamar(dados, { method: "POST", headers: painel, body: { acao: "salvar", colecao: "licitacoes", item: { ...l, status: "proposta", emails: "comercial@empresa.com.br" } } });
  const id = r.body.item.id;
  assert.match(r.body.item.historico[0].texto, /registrada/);

  r = await chamar(rotina, { headers: robo, query: { tarefa: "pncp" } });
  assert.equal(r.body.pncp.verificadas, 1);
  situacaoPNCP = "Homologada";
  arquivosPNCP = arquivosPNCP.concat({ sequencialDocumento: 2, tipoDocumentoNome: "Ata", titulo: "ata-sessao.pdf", statusAtivo: true, url: "https://pncp.gov.br/x/2" });
  chamadas.length = 0;
  r = await chamar(rotina, { headers: robo, query: { tarefa: "tudo", forcar: "1" } });
  assert.equal(r.body.pncp.mudancas, 2);
  const tg = chamadas.find(c => c.url.includes("telegram"));
  assert.match(tg.corpo.text, /Situação no PNCP mudou de "Divulgada no PNCP" para "Homologada"/);
  assert.match(tg.corpo.text, /Novo documento no PNCP — Ata/);

  // mudança de status pelo painel entra no histórico
  const atual = (await chamar(dados, { headers: painel })).body.licitacoes.find(x => x.id === id);
  r = await chamar(dados, { method: "POST", headers: painel, body: { acao: "salvar", colecao: "licitacoes", item: { ...atual, status: "recurso" } } });
  assert.ok(r.body.item.historico.some(h => /Proposta enviada → Fase recursal/.test(h.texto)));
  assert.ok(r.body.item.historico.some(h => /Homologada/.test(h.texto))); // não perdeu o que veio do PNCP
});

test("mensagens dos portais: liga à licitação, cria prazo e evita duplicadas", async () => {
  const msg = { id: "gmail-1", de: "naoresponda@compras.gov.br", assunto: "Compra 15502105900122026 - Mensagem do Agente de Contratação", texto: "Senhor fornecedor, encaminhe a proposta ajustada até " + R.formatarData(R.somaDias(hoje, 1)).replace(" às ", " ") + " às 14h.", data: new Date().toISOString() };
  chamadas.length = 0;
  let r = await chamar(mensagens, { method: "POST", headers: robo, body: { mensagens: [msg] } });
  assert.equal(r.statusCode, 200, JSON.stringify(r.body));
  assert.equal(r.body.ligadas, 1);
  assert.match(chamadas.find(c => c.url.includes("telegram")).corpo.text, /Convocação/);
  const l = (await chamar(dados, { headers: painel })).body.licitacoes.find(x => x.compraId === "15502105900122026");
  assert.equal(l.mensagens.length, 1);
  assert.ok(l.prazos.some(p => p.limite === R.somaDias(hoje, 1) + "T14:00" && p.tipo === "proposta_ajustada"));

  r = await chamar(mensagens, { method: "POST", headers: robo, body: { mensagens: [msg] } });
  assert.equal(r.body.duplicadas, 1);

  r = await chamar(mensagens, { method: "POST", headers: robo, body: { mensagens: [{ id: "gmail-2", assunto: "Pregão 555/2026 aberto", texto: "Mensagem qualquer" }] } });
  assert.equal(r.body.semLicitacao, 1);
  const tudo = (await chamar(dados, { headers: painel })).body;
  assert.equal(tudo.caixa.length, 1);
  r = await chamar(dados, { method: "POST", headers: painel, body: { acao: "caixa-ligar", id: tudo.caixa[0].id, licitacaoId: l.id } });
  assert.equal(r.body.item.mensagens.length, 2);
  assert.equal((await chamar(dados, { headers: painel })).body.caixa.length, 0);
});

test("mensagem de teste e registro da rotina", async () => {
  chamadas.length = 0;
  const r = await chamar(rotina, { headers: painel, query: { tarefa: "teste" } });
  assert.ok(r.body.envios.every(e => e.ok));
  const log = (await chamar(dados, { headers: painel })).body.log;
  assert.ok(log.length >= 3);
});
