// Função da Vercel: acompanha um pregão suspenso.
// GET /api/suspensos?ref=<link>   (Compras.gov.br, PNCP ou Portal de Compras Públicas)
// Devolve a situação, desde quando está suspenso, o motivo, a nova data (quando publicada),
// os documentos e eventos depois da suspensão e os editais do MESMO órgão com objeto parecido
// publicados depois (possível republicação com outro número).
//
// Fontes públicas:
//   - PNCP: situação, datas, documentos e histórico da compra; lista de compras do órgão por período.
//     O Compras.gov.br não deixa ler (captcha); a compra é achada no PNCP pela UASG, número e ano.
//   - Portal de Compras Públicas: API pública usada pela própria página (situação, datas e chat).

const { exigirLogin } = require("./_auth.js");
const { getJson } = require("./pncp.js");

const PNCP = "https://pncp.gov.br";
const PCP = "https://compras.api.portaldecompraspublicas.com.br";

async function tentar(fn, vezes = 3) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= vezes - 1) throw e; await new Promise(r => setTimeout(r, 900 * (i + 1))); }
  }
}
const json = (url, ms) => tentar(() => getJson(url, ms || 15000));
const dataHora = s => { const m = String(s || "").match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/); return m ? m[1] + "T" + m[2] : ""; };
// Datas do Portal de Compras Públicas vêm em UTC ("2026-10-22T13:01:00Z"): passa para Brasília (UTC-3)
const deUtc = s => { const d = new Date(s); if (isNaN(d)) return ""; const b = new Date(d.getTime() - 3 * 3600000); return b.toISOString().slice(0, 16); };
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const ymd = iso => iso.slice(0, 10).replace(/-/g, "");

/* ---------- semelhança de objeto ---------- */
const VAZIAS = new Set(("contratacao contratar empresa empresas especializada especializado especializados prestacao prestar servico servicos para atender atendimento " +
  "conforme termo referencia edital editais anexo anexos objeto aquisicao registro precos preco eventual eventuais futura futuro demanda demandas municipio municipal " +
  "municipais estado estadual secretaria fundo fundacao saude publica publico publicos unidade unidades rede hospital hospitais hospitalar hospitalares forma " +
  "carater regime pelo pela pelos pelas periodo meses mes dias ano com sem dos das nos nas que como tipo tipos pessoa pessoas juridica juridicas fornecimento " +
  "execucao portal compras publicas visando visa objetivando objetivo abastecer necessidade necessidades estabelecimento estabelecimentos vinculado vinculados " +
  "vinculada departamento atencao ambiente paciente pacientes internados usuarios diversos diversas materiais material consumo geral gerais item itens lote lotes " +
  "srp pregao eletronico numero processo e-mail pdf zip doc final finais municipio sobre entre ate apos cada mais demais outro outros outras sua seu suas seus " +
  "acordo condicao condicoes estabelecida estabelecidas estabelecido estabelecidos pertencente pertencentes neste nesta deste desta presente quantidade quantidades " +
  "especificacao especificacoes constante constantes descrito descritas exigencia exigencias " +
  "republicacao republicado republicada reabertura reaberto nova novo emergencial emergencia ordinaria ordinario retificacao retificado aviso").split(" "));
const semAcento = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// tira o texto-modelo ("de acordo com as condições estabelecidas no Edital e seus Anexos")
const semModelo = s => semAcento(s).replace(/de acordo com[^.;]*?(edital|anexos?|termo de referencia)[^.;]*/g, " ").replace(/conforme (as )?(condicoes|especificacoes|quantidades)[^.;]*/g, " ");
const palavras = (s, fora) => new Set(semModelo(s).replace(/\[[^\]]*\]/g, " ").replace(/\.pdf|\.zip/g, " ").split(/[^a-z0-9]+/)
  .map(w => w.replace(/(oes|aes|ais|eis|is)$/, "").replace(/s$/, "")).filter(w => w.length >= 3 && !VAZIAS.has(w) && !VAZIAS.has(w + "s") && !/^\d+$/.test(w) && !(fora && fora.has(w))));
// Parecido: pelo menos 2 palavras técnicas em comum e Dice >= 0,4 (com uma só, só quando os objetos são curtos)
// "fora": palavras do nome do órgão e da cidade (SESMA, Belém, Macaé...), que aparecem em todo objeto do órgão
function semelhanca(a, b, fora) {
  const F = fora instanceof Set ? fora : fora ? palavras(fora) : null;
  const A = palavras(a, F), B = palavras(b, F);
  if (!A.size || !B.size) return 0;
  let comum = 0; A.forEach(w => { if (B.has(w)) comum++; });
  const dice = 2 * comum / (A.size + B.size);
  if (comum >= 2) return dice;
  // objeto curto ("neurocirurgia"): basta a palavra técnica, se o outro lado também for curto
  return comum === 1 && Math.min(A.size, B.size) === 1 && Math.max(A.size, B.size) <= 3 ? dice : 0;
}

/* ---------- PNCP ---------- */
// Compra do Compras.gov.br no PNCP. Código do link: UASG(6) + modalidade(2) + número(5) + ano(4).
// 1) a UASG dá o CNPJ do órgão (dados abertos do Compras.gov.br); 2) a consulta oficial do PNCP, filtrada
// por CNPJ + UASG, acha a compra mês a mês, do mais recente para trás. A busca textual do PNCP fica por último
// (ela costuma não responder para quem chama de servidores na nuvem).
const MODALIDADE_PNCP = { "05": 6, "06": 8, "03": 4, "02": 5, "07": 7 };
async function pncpDoComprasGov(codigo) {
  const uasg = codigo.slice(0, 6), mod = codigo.slice(6, 8), num = String(parseInt(codigo.slice(8, 13), 10)), ano = codigo.slice(13, 17);
  const u = await json("https://dadosabertos.compras.gov.br/modulo-uasg/1_consultarUasg?codigoUasg=" + uasg + "&statusUasg=true", 15000).catch(() => null);
  const cnpj = u && u.resultado && u.resultado[0] && u.resultado[0].cnpjCpfOrgao;
  if (cnpj) {
    const meses = [], fim = new Date(Date.now() - 3 * 3600000);
    for (let d = new Date(Date.UTC(fim.getUTCFullYear(), fim.getUTCMonth(), 1)); d.getUTCFullYear() >= +ano && meses.length < 12; d.setUTCMonth(d.getUTCMonth() - 1)) meses.push(new Date(d));
    const mesmo = c => String(parseInt(c.numeroCompra, 10)) === num && String(c.anoCompra) === ano;
    for (let i = 0; i < meses.length; i += 4) { // 4 meses por vez, em paralelo
      const lotes = await Promise.all(meses.slice(i, i + 4).map(async m => {
        const ini = m.toISOString().slice(0, 10), f = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
        const achados = [];
        for (let pg = 1; pg <= 6; pg++) {
          const l = await json(PNCP + "/api/consulta/v1/contratacoes/publicacao?dataInicial=" + ymd(ini) + "&dataFinal=" + ymd(f) + "&codigoModalidadeContratacao=" + (MODALIDADE_PNCP[mod] || 6) +
            "&cnpj=" + cnpj + "&codigoUnidadeAdministrativa=" + uasg + "&pagina=" + pg + "&tamanhoPagina=50", 25000).catch(() => null);
          const lista = (l && l.data) || [];
          achados.push(...lista.filter(mesmo));
          if (achados.length || !l || pg >= (l.totalPaginas || 1)) break;
        }
        return achados;
      }));
      const c = lotes.flat()[0];
      if (c) return { cnpj: c.orgaoEntidade.cnpj, ano: String(c.anoCompra), seq: String(c.sequencialCompra) };
    }
  }
  // último recurso: busca textual do PNCP
  const re = new RegExp("\\b0*" + num + "\\s*/\\s*" + ano + "\\b");
  let falhas = 0;
  for (const [q, pg] of [[uasg, 1], [num + "/" + ano, 1], [uasg, 2]]) {
    const j = await json(PNCP + "/api/search/?q=" + encodeURIComponent(q) + "&tipos_documento=edital&pagina=" + pg + "&tam_pagina=100").catch(() => { falhas++; return null; });
    const it = ((j && j.items) || []).find(x => String(x.unidade_codigo) === uasg && re.test(String(x.title)));
    const m = it && String(it.item_url || "").match(/(\d{14})\/(\d{4})\/(\d+)/);
    if (m) return { cnpj: m[1], ano: m[2], seq: m[3] };
  }
  if (falhas >= 3 && !cnpj) throw Object.assign(new Error("O PNCP não respondeu agora. Tento de novo na próxima leitura."), { status: 503 });
  return null;
}
// Pregão de outro portal no PNCP: mesmo número/ano e objeto parecido (o nome do órgão muda entre os sistemas)
async function pncpPorTexto(q, objeto, numero) {
  const re = new RegExp("\\b0*" + numero.replace("/", "\\s*/\\s*") + "\\b");
  for (const busca of [q, objeto.slice(0, 80) + " " + numero]) {
    for (const pg of [1, 2]) {
      const j = await json(PNCP + "/api/search/?q=" + encodeURIComponent(busca) + "&tipos_documento=edital&pagina=" + pg + "&tam_pagina=100").catch(() => null);
      const it = ((j && j.items) || []).find(x => re.test(String(x.title)) && semelhanca(objeto, x.description) >= 0.4);
      const m = it && String(it.item_url || "").match(/(\d{14})\/(\d{4})\/(\d+)/);
      if (m) return { cnpj: m[1], ano: m[2], seq: m[3] };
    }
  }
  return null;
}
async function lerPncp(id) {
  const base = id.cnpj + "/compras/" + id.ano + "/" + id.seq;
  const [c, arquivos, historico] = await Promise.all([
    json(PNCP + "/api/consulta/v1/orgaos/" + base),
    json(PNCP + "/api/pncp/v1/orgaos/" + base + "/arquivos", 12000).catch(() => []),
    json(PNCP + "/api/pncp/v1/orgaos/" + base + "/historico", 12000).catch(() => [])
  ]);
  if (!c) return null;
  const uo = c.unidadeOrgao || {};
  const eventos = (Array.isArray(historico) ? historico : [])
    .filter(h => /^Contratação$|^Documento de Contratação$/.test(h.categoriaLogManutencaoNome || ""))
    .map(h => ({ data: dataHora(h.logManutencaoDataInclusao), texto: (h.categoriaLogManutencaoNome === "Contratação" ? "Compra: " : "Documento: ") + (h.tipoLogManutencaoNome || "") + (h.documentoTitulo ? " · " + h.documentoTitulo : "") + (h.justificativa ? " · " + h.justificativa : "") }));
  // a última "Retificação" da compra costuma ser a mudança de situação (ex.: para Suspensa)
  const retificacoes = eventos.filter(e => /^Compra: Retificação/.test(e.texto)).map(e => e.data).sort();
  const situacao = c.situacaoCompraNome || "";
  return {
    fonte: "PNCP", pncp: id, numero: (c.modalidadeNome || "").replace(/ - /, " ") + " " + c.numeroCompra + "/" + c.anoCompra,
    modalidadeId: c.modalidadeId, orgao: (c.orgaoEntidade || {}).razaoSocial || "", unidade: uo.nomeUnidade || "", municipio: uo.municipioNome || "", uf: uo.ufSigla || "",
    objeto: String(c.objetoCompra || "").replace(/\s+/g, " ").trim(), situacao, suspenso: /suspens/i.test(situacao),
    desde: /suspens/i.test(situacao) ? (retificacoes.pop() || dataHora(c.dataAtualizacao)) : "",
    abertura: dataHora(c.dataAberturaProposta), sessao: dataHora(c.dataEncerramentoProposta), publicacao: dataHora(c.dataPublicacaoPncp),
    atualizado: dataHora(c.dataAtualizacao), link: c.linkSistemaOrigem || PNCP + "/app/editais/" + id.cnpj + "/" + id.ano + "/" + id.seq,
    linkPncp: PNCP + "/app/editais/" + id.cnpj + "/" + id.ano + "/" + id.seq,
    documentos: (Array.isArray(arquivos) ? arquivos : []).filter(a => a.statusAtivo !== false).map(a => ({ data: dataHora(a.dataPublicacaoPncp), titulo: a.titulo || a.tipoDocumentoNome, tipo: a.tipoDocumentoNome || "", url: a.url || a.uri })),
    eventos: eventos.slice(-15)
  };
}
// Compras do mesmo órgão publicadas depois, com objeto parecido (possível republicação)
async function parecidosPncp(base) {
  if (!base.pncp || !base.pncp.cnpj) return [];
  const ini = (base.publicacao || base.abertura || hoje()).slice(0, 10);
  const modalidades = [...new Set([base.modalidadeId || 6, 6, 8])].slice(0, 3); // a mesma, pregão eletrônico e dispensa
  const listas = await Promise.all(modalidades.flatMap(mod => [1, 2].map(pg =>
    json(PNCP + "/api/consulta/v1/contratacoes/publicacao?dataInicial=" + ymd(ini) + "&dataFinal=" + ymd(hoje()) + "&codigoModalidadeContratacao=" + mod + "&cnpj=" + base.pncp.cnpj + "&pagina=" + pg + "&tamanhoPagina=50", 20000).catch(() => null))));
  const editais = (base.documentos || []).filter(d => /edital|termo de refer/i.test(d.tipo + " " + d.titulo)).map(d => d.titulo).join(" ");
  const textoBase = palavras(base.objeto, palavras([base.orgao, base.unidade, base.municipio].join(" "))).size <= 2 ? base.objeto + " " + editais : base.objeto;
  const vistos = new Set(), todos = [];
  listas.forEach(l => ((l && l.data) || []).forEach(c => { if (!vistos.has(c.numeroControlePNCP)) { vistos.add(c.numeroControlePNCP); todos.push(c); } }));
  // Palavras que o órgão repete em muitos editais (nome do hospital, "médicos"...) não distinguem o objeto
  const fora = palavras([base.orgao, base.unidade, base.municipio].join(" ")), df = new Map();
  todos.forEach(c => palavras(c.objetoCompra, fora).forEach(w => df.set(w, (df.get(w) || 0) + 1)));
  const limite = Math.max(3, Math.ceil(todos.length * 0.15));
  df.forEach((n, w) => { if (n >= limite) fora.add(w); });
  const out = [];
  todos.forEach(c => {
    if (String(c.sequencialCompra) === String(base.pncp.seq) && String(c.anoCompra) === String(base.pncp.ano)) return; // ele mesmo
    const s = semelhanca(textoBase, c.objetoCompra, fora);
    if (s < 0.4) return;
    out.push({ numero: (c.modalidadeNome || "").replace(/ - /, " ") + " " + c.numeroCompra + "/" + c.anoCompra, situacao: c.situacaoCompraNome || "", publicacao: dataHora(c.dataPublicacaoPncp),
      sessao: dataHora(c.dataEncerramentoProposta), objeto: String(c.objetoCompra || "").replace(/\s+/g, " ").trim().slice(0, 300), semelhanca: Math.round(s * 100),
      link: c.linkSistemaOrigem || PNCP + "/app/editais/" + c.orgaoEntidade.cnpj + "/" + c.anoCompra + "/" + c.sequencialCompra,
      linkPncp: PNCP + "/app/editais/" + c.orgaoEntidade.cnpj + "/" + c.anoCompra + "/" + c.sequencialCompra });
  });
  return out.sort((a, b) => b.semelhanca - a.semelhanca || b.publicacao.localeCompare(a.publicacao)).slice(0, 6);
}

/* ---------- Portal de Compras Públicas ---------- */
async function lerPcp(link) {
  const m = link.match(/portaldecompraspublicas\.com\.br\/processos\/([A-Z]{2})\/([^/?#]+)\/([^/?#]+)/i);
  if (!m) return null;
  const lic = await json(PCP + "/v2/licitacao/" + m[1] + "/" + m[2] + "/" + m[3]);
  if (!lic || !lic.codigoLicitacao) return null;
  const cod = lic.codigoLicitacao;
  const [chat, docs] = await Promise.all([
    json(PCP + "/v1/licitacao/" + cod + "/chat", 12000).catch(() => null),
    json(PCP + "/v2/licitacao/" + cod + "/documentos/processo", 12000).catch(() => null)
  ]);
  const situacao = (lic.statusProcesso && lic.statusProcesso.descricao) || "";
  const frases = ((chat && chat.frasesChat) || []).map(f => ({ data: deUtc(f.dataHoraFrase), autor: f.apelido || "", texto: String(f.frase || "").replace(/\s+/g, " ").trim() }))
    .sort((a, b) => a.data.localeCompare(b.data));
  const suspensao = frases.filter(f => /suspens/i.test(f.texto)).pop();
  const listaDocs = (Array.isArray(docs) ? docs : (docs && (docs.arquivos || docs.documentos)) || []);
  return {
    fonte: "Portal de Compras Públicas", numero: (lic.tipoLicitacao === "Pregão Eletrônico" ? "Pregão Eletrônico " : (lic.tipoLicitacao || "") + " ") + lic.numeroProcesso,
    orgao: lic.razaoSocialComprador || "", municipio: lic.cidadeEstadoComprador || "", uf: m[1].toUpperCase(),
    objeto: String(lic.resumo || "").replace(/\s+/g, " ").trim(), situacao, suspenso: /suspens/i.test(situacao),
    desde: /suspens/i.test(situacao) && suspensao ? suspensao.data : "",
    motivo: (frases.find(f => /^motivo:/i.test(f.texto)) || {}).texto || "",
    abertura: deUtc(lic.dataHoraInicioRecebimentoPropostas), sessao: deUtc(lic.dataHoraAbertura), publicacao: deUtc(lic.dataHoraPublicacao),
    limiteImpugnacao: deUtc(lic.dataHoraLimiteImpugnacoes), link,
    documentos: listaDocs.map(d => ({ data: String(d.dataHora || "").replace(/^(\d{2})\/(\d{2})\/(\d{4}).*$/, "$3-$2-$1"), titulo: d.nome || d.titulo || "", tipo: d.tipo || "", url: d.url || "" })),
    eventos: frases.slice(-15).map(f => ({ data: f.data, texto: (f.autor ? f.autor + ": " : "") + f.texto }))
  };
}

/* ---------- nova data ---------- */
// A nova data vem (1) da data da sessão quando ela fica no futuro depois da suspensão, ou
// (2) de um aviso/mensagem que fala em reabertura, retomada ou nova data.
function novaData(r) {
  const agora = new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 16);
  if (r.sessao && r.sessao > agora && (!r.desde || r.sessao > r.desde)) return { data: r.sessao, origem: "data da sessão no " + r.fonte };
  const textos = (r.eventos || []).concat((r.documentos || []).map(d => ({ data: d.data, texto: d.titulo })));
  for (const e of textos.slice().reverse()) {
    if (!/reabert|retomad|nova data|remarc|redesignad|prosseguimento|reinici/i.test(semAcento(e.texto))) continue;
    const d = e.texto.match(/(\d{2})\/(\d{2})\/(\d{4})(?:[^\d]{1,12}(\d{1,2})[:h](\d{2})?)?/);
    if (d) return { data: d[3] + "-" + d[2] + "-" + d[1] + (d[4] ? "T" + String(d[4]).padStart(2, "0") + ":" + (d[5] || "00") : ""), origem: "aviso: " + e.texto.slice(0, 140) };
  }
  return null;
}

async function acompanhar(ref, pncpConhecido) {
  ref = String(ref || "").trim();
  const conhecido = String(pncpConhecido || "").match(/^(\d{14})[-/](\d{4})[-/](\d+)$/);
  let r = null;
  const compra = (ref.match(/compra=(\d{17})/) || [])[1];
  const pncpLink = ref.match(/pncp\.gov\.br\/app\/editais\/(\d{14})\/(\d{4})\/(\d+)/) || ref.match(/^(\d{14})[-/](\d{4})[-/](\d+)$/);
  if (/portaldecompraspublicas\.com\.br/i.test(ref)) {
    r = await lerPcp(ref);
    if (r) { // no PNCP também, para achar o CNPJ e buscar republicação
      const num = (r.numero.match(/(\d+\/\d{4})/) || [])[1];
      const id = conhecido ? { cnpj: conhecido[1], ano: conhecido[2], seq: conhecido[3] } : num ? await pncpPorTexto(r.orgao + " " + num, r.objeto, num).catch(() => null) : null;
      if (id) { const p = await lerPncp(id).catch(() => null); if (p) { r.pncp = id; r.modalidadeId = p.modalidadeId; r.linkPncp = p.linkPncp; r.situacaoPncp = p.situacao; } }
    }
  } else if (compra || pncpLink) {
    const id = conhecido ? { cnpj: conhecido[1], ano: conhecido[2], seq: conhecido[3] } : compra ? await pncpDoComprasGov(compra) : { cnpj: pncpLink[1], ano: pncpLink[2], seq: pncpLink[3] };
    if (!id) throw Object.assign(new Error("Achei a compra no Compras.gov.br, mas ela ainda não aparece no PNCP."), { status: 404 });
    r = await lerPncp(id);
    if (r && compra) { r.link = ref; r.portal = "Compras.gov.br"; }
  } else {
    throw Object.assign(new Error("Cole o link do Compras.gov.br (acompanhamento da compra), do PNCP ou do Portal de Compras Públicas."), { status: 400 });
  }
  if (!r) throw Object.assign(new Error("Não encontrei esse pregão."), { status: 404 });
  r.portal = r.portal || (r.fonte === "PNCP" ? "PNCP" : r.fonte);
  r.novaData = novaData(r);
  r.parecidos = await parecidosPncp(r).catch(() => []);
  r.consultadoEm = new Date().toISOString();
  return r;
}

module.exports = async (req, res) => {
  if (!(await exigirLogin(req, res))) return;
  try {
    const r = await acompanhar((req.query || {}).ref, (req.query || {}).pncp);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(r);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(e.status || 502).json({ erro: e.status ? e.message : "O portal de compras não respondeu agora. Tento de novo na próxima leitura." });
  }
};
module.exports.acompanhar = acompanhar;
module.exports.semelhanca = semelhanca;
