// Recebe mensagens dos portais (e-mails de notificação lidos pelo script do Gmail, ou texto do chat colado na página),
// liga cada uma à licitação certa, registra no histórico e cria os prazos citados para conferência.
const crypto = require("crypto");
const R = require("../../regras.js");
const banco = require("./banco.js");

const PRAZO_DA_CLASSE = { recurso: "recurso", convocacao: "proposta_ajustada", retorno: "outro", suspensao: "outro", lances: "outro" };
const resumo = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// lista: [{ id?, de?, assunto?, texto, data?, fonte?, licitacaoId? }]
async function receber(lista, agoraMs) {
  const dados = await banco.lerTudo();
  const porId = new Map(dados.licitacoes.map(l => [l.id, l]));
  const ativasPrimeiro = dados.licitacoes.slice().sort((a, b) => Number(R.statusLicitacao(b.status).ativa) - Number(R.statusLicitacao(a.status).ativa));
  const alteradas = new Map(), avisos = [], caixa = [];
  let duplicadas = 0;
  const em = R.agoraBrasilia(agoraMs);

  for (const m of lista.slice(0, 200)) {
    const texto = String(m.texto || "").slice(0, 8000), assunto = String(m.assunto || "").slice(0, 300);
    if (!texto.trim() && !assunto.trim()) continue;
    const quando = m.data && !isNaN(Date.parse(m.data)) ? Date.parse(m.data) : agoraMs;
    const idExterno = m.id ? String(m.id) : crypto.createHash("sha1").update([m.de, assunto, texto, m.data].join("|")).digest("hex");
    if (!(await banco.mensagemNova(idExterno, em))) { duplicadas++; continue; }

    const cls = R.classificarMensagem(assunto + "\n" + texto);
    const msg = {
      id: R.novoId(), idExterno, em: R.agoraBrasilia(quando), recebidaEm: em, de: String(m.de || "").slice(0, 200), assunto, texto,
      fonte: String(m.fonte || "e-mail").slice(0, 40), classe: cls.classe, nomeClasse: cls.nome, urgente: cls.urgente, lida: false
    };
    let l = m.licitacaoId ? alteradas.get(m.licitacaoId) || porId.get(m.licitacaoId) : null;
    if (!l) { const achada = R.encontrarLicitacao(ativasPrimeiro, assunto + "\n" + texto); l = achada && (alteradas.get(achada.id) || achada); }
    if (!l) {
      await banco.caixaGuardar(msg);
      caixa.push(msg);
      avisos.push({ nivel: "novidade", texto: "Mensagem de portal sem licitação ligada — " + resumo(assunto || texto, 160) });
      continue;
    }
    l = { ...l, mensagens: (l.mensagens || []).concat(msg).slice(-banco.MAX_MENSAGENS), historico: (l.historico || []).slice(), prazos: (l.prazos || []).slice() };
    l.historico.push({ id: R.novoId(), em: msg.em, tipo: "mensagem", auto: true, texto: "[" + cls.nome + "] " + resumo(assunto ? assunto + " — " + texto : texto, 240) });
    // Prazos citados na mensagem viram prazos "a confirmar" (só datas futuras, até 60 dias)
    if (cls.urgente) {
      for (const d of R.datasNoTexto(texto, quando)) {
        const ms = R.msBrasilia(R.ehDataHora(d) ? d : d + "T23:59");
        if (ms < agoraMs || ms - agoraMs > 60 * R.DIA) continue;
        const limite = R.ehDataHora(d) ? d : d + "T23:59";
        if (l.prazos.some(p => p.limite === limite)) continue;
        l.prazos.push({ id: R.novoId(), tipo: PRAZO_DA_CLASSE[cls.classe] || "outro", descricao: "Conferir: " + cls.nome.toLowerCase() + " (prazo citado em mensagem)", limite, origem: "mensagem", feito: false });
        l.historico.push({ id: R.novoId(), em, tipo: "prazo", auto: true, texto: "Prazo de " + R.formatarData(limite) + " criado a partir da mensagem. Confira no portal." });
      }
    }
    alteradas.set(l.id, l);
    avisos.push({ nivel: cls.urgente ? "urgente" : "novidade", texto: R.rotuloLicitacao(l) + " — " + cls.nome + ": " + resumo(assunto && !texto.includes(assunto) ? assunto + " — " + texto : texto, 300), link: l.link || "", emails: R.lerEmails(l.emails) });
  }
  if (alteradas.size) await banco.salvar("licitacoes", [...alteradas.values()]);
  return { recebidas: lista.length, duplicadas, ligadas: [...alteradas.keys()], caixa: caixa.length, avisos, config: dados.config };
}

module.exports = { receber };
