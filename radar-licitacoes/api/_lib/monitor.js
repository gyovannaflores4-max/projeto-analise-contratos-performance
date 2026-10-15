// Acompanhamento automático das licitações pelo PNCP: situação da compra, documentos publicados
// (atas, resultados, avisos), valor homologado e mudança de datas. Funciona para qualquer portal,
// porque todos publicam no PNCP. O chat das sessões não é público e não aparece aqui.
const R = require("../../regras.js");
const { getJson, montar } = require("../editais.js");

const PNCP = "https://pncp.gov.br";

// Aceita link do PNCP, "cnpj-ano-sequencial", "cnpj/ano/sequencial" ou o número de controle "cnpj-1-000123/2026".
function idPNCP(texto) {
  const s = String(texto || "");
  let m = s.match(/(\d{14})[\/-](\d{4})[\/-](\d{1,7})(?!\d)/);
  if (m) return m[1] + "-" + m[2] + "-" + Number(m[3]);
  m = s.match(/(\d{14})-\d-(\d{1,7})\/(\d{4})/);
  if (m) return m[1] + "-" + m[3] + "-" + Number(m[2]);
  return null;
}
const compraDoLink = link => (String(link || "").match(/[?&]compra=(\d{10,20})/) || [])[1] || "";

async function consultar(id, timeoutMs = 9000) {
  const [cnpj, ano, seq] = id.split("-");
  const base = PNCP + "/api/consulta/v1/orgaos/" + cnpj + "/compras/" + ano + "/" + seq;
  const [det, arquivos] = await Promise.all([
    getJson(base, timeoutMs, 2),
    getJson(PNCP + "/api/pncp/v1/orgaos/" + cnpj + "/compras/" + ano + "/" + seq + "/arquivos", timeoutMs, 2).catch(() => null)
  ]);
  if (!det) throw new Error("Compra não encontrada no PNCP.");
  return { det, arquivos: Array.isArray(arquivos) ? arquivos.filter(a => a && a.statusAtivo !== false) : null };
}

// Dados para preencher uma licitação nova a partir do PNCP
function preencher(id, det) {
  const [cnpj, ano, seq] = id.split("-");
  const doc = montar({ cnpj, ano, seq }, {}, det);
  const sessao = (det.dataEncerramentoProposta || det.dataAberturaProposta || "").slice(0, 16);
  return {
    pncpId: id,
    orgao: doc.orgao + (doc.unidade && doc.unidade !== doc.orgao ? " — " + doc.unidade : ""),
    numero: (det.modalidadeNome ? det.modalidadeNome + " " : "") + (det.numeroCompra ? det.numeroCompra + "/" + ano : ""),
    processo: det.processo || "",
    portal: doc.fonte === "PNCP" ? "Outro" : doc.fonte,
    link: doc.linkOrigem || doc.url,
    linkPNCP: doc.url,
    objeto: String(det.objetoCompra || "").replace(/\s+/g, " ").trim(),
    valorEstimado: doc.valor,
    sessao: R.ehDataHora(sessao) ? sessao : "",
    uasg: doc.uasg || "",
    compraId: compraDoLink(det.linkSistemaOrigem),
    uf: doc.uf, municipio: doc.municipio
  };
}

function retrato(det, arquivos) {
  return {
    situacao: det.situacaoCompraNome || "",
    atualizacao: det.dataAtualizacaoGlobal || det.dataAtualizacao || "",
    homologado: Number(det.valorTotalHomologado) || null,
    encerramento: (det.dataEncerramentoProposta || "").slice(0, 16),
    arquivos: arquivos ? arquivos.map(a => ({ n: a.sequencialDocumento, titulo: String(a.tipoDocumentoNome || "Documento") + (a.titulo ? ": " + String(a.titulo).slice(0, 120) : ""), url: a.url || a.uri || "" })) : null
  };
}

function comparar(antes, depois) {
  const mudancas = [];
  if (antes.situacao !== depois.situacao && depois.situacao) mudancas.push({ nivel: "urgente", texto: "Situação no PNCP mudou de \"" + (antes.situacao || "—") + "\" para \"" + depois.situacao + "\"" });
  if (antes.encerramento && depois.encerramento && antes.encerramento !== depois.encerramento)
    mudancas.push({ nivel: "urgente", texto: "Data de abertura/encerramento das propostas mudou para " + R.formatarData(depois.encerramento) });
  if (depois.homologado && depois.homologado !== antes.homologado) mudancas.push({ nivel: "novidade", texto: "Valor homologado publicado: " + R.moeda(depois.homologado) });
  if (antes.arquivos && depois.arquivos) {
    const vistos = new Set(antes.arquivos.map(a => a.n));
    for (const a of depois.arquivos) if (!vistos.has(a.n)) mudancas.push({ nivel: "novidade", texto: "Novo documento no PNCP — " + a.titulo, link: a.url });
  }
  if (!mudancas.length && antes.atualizacao !== depois.atualizacao && depois.atualizacao)
    mudancas.push({ nivel: "novidade", texto: "A compra foi atualizada no PNCP (itens, resultados ou dados do edital)" });
  return mudancas;
}

// Verifica uma licitação. Devolve as mudanças e a licitação atualizada (ou null se não mudou nada que precise salvar).
async function verificar(l, agoraMs) {
  const { det, arquivos } = await consultar(l.pncpId);
  const depois = retrato(det, arquivos);
  const antes = l.monitor && l.monitor.retrato;
  const em = R.agoraBrasilia(agoraMs);
  const nova = { ...l, monitor: { retrato: depois, verificadoEm: new Date(agoraMs).toISOString(), erro: null }, historico: (l.historico || []).slice() };
  if (!nova.compraId) nova.compraId = compraDoLink(det.linkSistemaOrigem);
  if (!antes) {
    nova.historico.push({ id: R.novoId(), em, tipo: "pncp", auto: true, texto: "Acompanhamento automático pelo PNCP ligado. Situação: " + (depois.situacao || "—") });
    return { mudancas: [], licitacao: nova };
  }
  if (antes.arquivos === null || depois.arquivos === null) { depois.arquivos = depois.arquivos || antes.arquivos; }
  const mudancas = comparar(antes, depois);
  for (const m of mudancas) nova.historico.push({ id: R.novoId(), em, tipo: "pncp", auto: true, texto: m.texto, link: m.link || "" });
  return { mudancas, licitacao: nova };
}

module.exports = { idPNCP, compraDoLink, consultar, preencher, retrato, comparar, verificar };
