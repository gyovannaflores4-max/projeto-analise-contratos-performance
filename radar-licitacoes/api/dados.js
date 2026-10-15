// Função da Vercel: dados da Gestão de Prazos (contratos, documentos, licitações e configuração).
// Exige a senha do painel no cabeçalho x-senha.
// GET  /api/dados                      -> tudo
// GET  /api/dados?acao=pncp&id=<link>  -> dados de uma compra do PNCP para preencher uma licitação nova
// POST /api/dados { acao, ... }        -> salvar, importar, remover, config, verificar-pncp, mensagens, caixa-ligar, caixa-descartar
const R = require("../regras.js");
const banco = require("./_lib/banco.js");
const acesso = require("./_lib/acesso.js");
const avisos = require("./_lib/avisos.js");
const monitor = require("./_lib/monitor.js");
const mensagens = require("./_lib/mensagens.js");

const idValido = s => typeof s === "string" && /^[\w-]{1,40}$/.test(s);
const colecaoValida = c => banco.COLECOES.includes(c);

function preparar(item, agora) {
  if (!item || typeof item !== "object" || Array.isArray(item)) throw Object.assign(new Error("Registro inválido."), { status: 400 });
  const out = { ...item };
  if (!idValido(out.id)) out.id = R.novoId();
  out.criadoEm = out.criadoEm || agora;
  out.atualizadoEm = agora;
  if (JSON.stringify(out).length > 900000) throw Object.assign(new Error("Registro grande demais."), { status: 413 });
  return out;
}

function limparConfig(c) {
  c = c || {};
  const avisosCfg = {};
  for (const k of Object.keys(R.AVISOS_PADRAO)) if (c.avisos && c.avisos[k] !== undefined && String(c.avisos[k]).trim()) avisosCfg[k] = R.lerAvisos(c.avisos[k]).join(", ");
  return {
    emails: R.lerEmails(c.emails).join(", "),
    telegramChatId: String(c.telegramChatId || "").trim().slice(0, 40),
    urlPainel: /^https:\/\//.test(c.urlPainel || "") ? String(c.urlPainel).slice(0, 300) : "",
    avisos: avisosCfg
  };
}

module.exports = async (req, res) => {
  if (!acesso.exigir(req, res)) return;
  const agoraMs = Date.now(), agora = new Date(agoraMs).toISOString();
  try {
    if (req.method === "GET") {
      if ((req.query || {}).acao === "pncp") {
        const id = monitor.idPNCP(req.query.id);
        if (!id) return res.status(400).json({ erro: "Cole o link do edital no PNCP (pncp.gov.br/app/editais/...)." });
        const { det } = await monitor.consultar(id);
        return res.status(200).json({ licitacao: monitor.preencher(id, det) });
      }
      const dados = await banco.lerTudo();
      return res.status(200).json({ ...dados, servidor: { armazenamento: banco.tipoArmazenamento(), canais: avisos.canais(), robo: !!process.env.CRON_SECRET, agora: agoraMs } });
    }
    if (req.method !== "POST") return res.status(405).json({ erro: "Método não permitido." });

    const b = acesso.corpo(req);
    switch (b.acao) {
      case "salvar": {
        if (!colecaoValida(b.colecao)) return res.status(400).json({ erro: "Coleção inválida." });
        const item = preparar(b.item, agora);
        if (b.colecao === "licitacoes") {
          const antigo = await banco.ler("licitacoes", item.id);
          item.historico = (item.historico || []).slice();
          if (!antigo) item.historico.push({ id: R.novoId(), em: R.agoraBrasilia(agoraMs), tipo: "status", texto: "Licitação registrada (" + R.statusLicitacao(item.status).nome + ")" });
          else if (antigo.status !== item.status) item.historico.push({ id: R.novoId(), em: R.agoraBrasilia(agoraMs), tipo: "status", texto: "Status: " + R.statusLicitacao(antigo.status).nome + " → " + R.statusLicitacao(item.status).nome });
          if (item.pncpId) item.pncpId = monitor.idPNCP(item.pncpId) || "";
        }
        const [salvo] = await banco.salvar(b.colecao, item);
        return res.status(200).json({ item: salvo });
      }
      case "importar": {
        if (!colecaoValida(b.colecao) || !Array.isArray(b.itens)) return res.status(400).json({ erro: "Importação inválida." });
        if (b.itens.length > 3000) return res.status(413).json({ erro: "Importe no máximo 3.000 linhas por vez." });
        const itens = b.itens.map(i => preparar(i, agora));
        if (b.colecao === "licitacoes") for (const i of itens) i.historico = (i.historico || []).concat({ id: R.novoId(), em: R.agoraBrasilia(agoraMs), tipo: "status", texto: "Atualizada pela planilha (" + R.statusLicitacao(i.status).nome + ")" });
        await banco.salvar(b.colecao, itens);
        return res.status(200).json({ importados: itens.length });
      }
      case "remover": {
        if (!colecaoValida(b.colecao) || !idValido(b.id)) return res.status(400).json({ erro: "Registro inválido." });
        await banco.remover(b.colecao, b.id);
        return res.status(200).json({ ok: true });
      }
      case "config": {
        const cfg = limparConfig(b.config);
        await banco.salvarConfig(cfg);
        return res.status(200).json({ config: cfg });
      }
      case "verificar-pncp": {
        const l = idValido(b.id) && (await banco.ler("licitacoes", b.id));
        if (!l || !l.pncpId) return res.status(400).json({ erro: "Licitação sem link do PNCP." });
        const r = await monitor.verificar(l, agoraMs);
        const [salvo] = await banco.salvar("licitacoes", r.licitacao);
        return res.status(200).json({ item: salvo, mudancas: r.mudancas });
      }
      case "mensagens": {
        // Texto do chat colado na página: registra sem mandar aviso (quem colou já está vendo)
        if (!Array.isArray(b.mensagens)) return res.status(400).json({ erro: "Nada para registrar." });
        const r = await mensagens.receber(b.mensagens.map(m => ({ ...m, fonte: m.fonte || "chat colado" })), agoraMs);
        return res.status(200).json({ ligadas: r.ligadas, caixa: r.caixa, duplicadas: r.duplicadas });
      }
      case "caixa-ligar": {
        const msg = idValido(b.id) && (await banco.caixaLer(b.id));
        const l = idValido(b.licitacaoId) && (await banco.ler("licitacoes", b.licitacaoId));
        if (!msg || !l) return res.status(400).json({ erro: "Mensagem ou licitação não encontrada." });
        l.mensagens = (l.mensagens || []).concat(msg).slice(-banco.MAX_MENSAGENS);
        l.historico = (l.historico || []).concat({ id: R.novoId(), em: msg.em, tipo: "mensagem", texto: "[" + msg.nomeClasse + "] " + (msg.assunto || msg.texto).slice(0, 240) });
        const [salvo] = await banco.salvar("licitacoes", l);
        await banco.caixaRemover(b.id);
        return res.status(200).json({ item: salvo });
      }
      case "caixa-descartar": {
        if (!idValido(b.id)) return res.status(400).json({ erro: "Mensagem inválida." });
        await banco.caixaRemover(b.id);
        return res.status(200).json({ ok: true });
      }
      default:
        return res.status(400).json({ erro: "Ação desconhecida." });
    }
  } catch (e) {
    res.status(e.status || 500).json({ erro: e.message || "Erro no servidor." });
  }
};
