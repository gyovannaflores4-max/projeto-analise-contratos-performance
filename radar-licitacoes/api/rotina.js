// Função da Vercel: rotina automática de alertas e acompanhamento das licitações.
// Chamada pelo cron da Vercel (1x por dia), pelo GitHub Actions (a cada 30 minutos em horário comercial)
// e pelo botão "Verificar agora" do painel.
// GET /api/rotina                -> acompanha o PNCP e envia os avisos novos
// GET /api/rotina?tarefa=alertas -> só os avisos de prazo
// GET /api/rotina?tarefa=pncp    -> só o PNCP
// GET /api/rotina?tarefa=teste   -> manda uma mensagem de teste
const R = require("../regras.js");
const banco = require("./_lib/banco.js");
const acesso = require("./_lib/acesso.js");
const avisos = require("./_lib/avisos.js");
const monitor = require("./_lib/monitor.js");

const INTERVALO_PNCP_MS = 20 * 60000, MAX_PNCP = 40, PRAZO_PNCP_MS = 35000;

async function rodarPNCP(dados, agoraMs, forcar) {
  const inicio = Date.now();
  const fila = dados.licitacoes
    .filter(l => l.pncpId && R.statusLicitacao(l.status).ativa)
    .filter(l => forcar || !l.monitor || !l.monitor.verificadoEm || agoraMs - Date.parse(l.monitor.verificadoEm) > INTERVALO_PNCP_MS)
    .sort((a, b) => String(a.monitor && a.monitor.verificadoEm || "").localeCompare(String(b.monitor && b.monitor.verificadoEm || "")))
    .slice(0, MAX_PNCP);
  const salvar = [], novidades = [];
  let erros = 0, verificadas = 0;
  async function trabalhador() {
    while (fila.length && Date.now() - inicio < PRAZO_PNCP_MS) {
      const l = fila.shift();
      try {
        const r = await monitor.verificar(l, agoraMs);
        verificadas++;
        salvar.push(r.licitacao);
        for (const m of r.mudancas) novidades.push({ nivel: m.nivel, texto: R.rotuloLicitacao(l) + " — " + m.texto, link: m.link || l.link || "", emails: R.lerEmails(l.emails) });
      } catch (e) {
        erros++;
        salvar.push({ ...l, monitor: { ...(l.monitor || {}), verificadoEm: new Date(agoraMs).toISOString(), erro: String(e.message || e).slice(0, 200) } });
      }
    }
  }
  await Promise.all([1, 2, 3, 4].map(trabalhador));
  if (salvar.length) {
    await banco.salvar("licitacoes", salvar);
    const porId = new Map(salvar.map(l => [l.id, l]));
    dados.licitacoes = dados.licitacoes.map(l => porId.get(l.id) || l);
  }
  return { resumo: { verificadas, erros, mudancas: novidades.length, ficaramParaDepois: fila.length }, novidades };
}

function tituloDe(itens) {
  const n = k => itens.filter(i => i.nivel === k).length;
  const partes = [[n("vencido"), "vencido", "vencidos"], [n("urgente"), "urgente", "urgentes"], [n("novidade"), "novidade", "novidades"], [n("atencao") + n("ok"), "aviso", "avisos"]]
    .filter(p => p[0]).map(p => p[0] + " " + (p[0] === 1 ? p[1] : p[2]));
  return "Gestão de Prazos: " + partes.join(", ");
}

async function rodarAlertas(dados, agoraMs, novidades, link) {
  const ja = await banco.enviados();
  const lista = R.pendentes(dados, agoraMs, ja);
  const itens = lista.map(({ ev, a }) => ({ nivel: a.nivel, texto: R.textoAlerta(ev, a), link: ev.link || "", emails: ev.emails }));
  const todos = itens.concat(novidades);
  if (!todos.length) return { novos: 0, novidades: 0, envios: [] };
  const envios = await avisos.notificar(dados.config, tituloDe(todos), todos, link);
  const entregue = envios.some(e => e.ok);
  // Só marca como avisado se chegou por algum canal; senão tenta de novo na próxima rodada
  if (entregue) await banco.marcarEnviados(lista.map(x => x.a.chave), new Date(agoraMs).toISOString());
  return { novos: lista.length, novidades: novidades.length, envios, marcados: entregue };
}

module.exports = async (req, res) => {
  if (!acesso.exigir(req, res, { robo: true })) return;
  const q = req.query || {}, tarefa = String(q.tarefa || "tudo"), agoraMs = Date.now();
  try {
    const dados = await banco.lerTudo();
    const base = acesso.urlBase(req, dados.config), link = base ? base + "/gestao.html" : "";
    if (tarefa === "teste") {
      const envios = await avisos.notificar(dados.config, "Teste da Gestão de Prazos", [{ nivel: "ok", texto: "Se esta mensagem chegou, os avisos automáticos estão funcionando." }], link);
      return res.status(200).json({ tarefa, envios });
    }
    const out = { tarefa, em: new Date(agoraMs).toISOString() };
    let novidades = [];
    if (tarefa === "tudo" || tarefa === "pncp") {
      const r = await rodarPNCP(dados, agoraMs, q.forcar === "1");
      out.pncp = r.resumo; novidades = r.novidades;
    }
    if (tarefa === "tudo" || tarefa === "alertas") out.alertas = await rodarAlertas(dados, agoraMs, novidades, link);
    else if (novidades.length) out.alertas = { envios: await avisos.notificar(dados.config, tituloDe(novidades), novidades, link) };
    out.limpos = await banco.limparEnviados(new Date(agoraMs - 400 * R.DIA).toISOString());
    const quem = acesso.roboOk(req) ? (req.headers["user-agent"] || "").includes("vercel-cron") ? "cron da Vercel" : "robô" : "painel";
    await banco.registrar({ em: out.em, quem, tarefa, pncp: out.pncp || null, novos: out.alertas ? out.alertas.novos || 0 : 0, novidades: novidades.length, canais: out.alertas && out.alertas.envios ? out.alertas.envios.map(e => e.canal + ":" + (e.ok ? "ok" : e.pulado ? "pulado" : "erro")) : [] });
    res.status(200).json(out);
  } catch (e) {
    res.status(500).json({ erro: e.message || "Erro na rotina." });
  }
};
module.exports.rodarAlertas = rodarAlertas;
module.exports.tituloDe = tituloDe;
