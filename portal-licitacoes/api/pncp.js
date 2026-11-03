// Função da Vercel: importa os dados de um edital publicado no PNCP.
// GET /api/pncp?url=https://pncp.gov.br/app/editais/<cnpj>/<ano>/<sequencial>
//   (também aceita "<cnpj>-<ano>-<sequencial>" ou "<cnpj>/<ano>/<sequencial>")
// Devolve os campos no formato do formulário de edital do portal.

const PNCP = "https://pncp.gov.br";
const PORTAIS = [
  [/compras\.gov|comprasnet|siasg|serpro|comprasgovernamentais/i, "Compras.gov.br"],
  [/\bbll\b|bolsa de licita/i, "BLL"],
  [/licitac[oõ]es-e|licitacoes-e|banco do brasil/i, "Licitações-e"],
  [/portal de compras p[uú]blicas|portaldecompraspublicas/i, "Portal de Compras Públicas"],
  [/\bbnc\b|bolsa nacional de compras/i, "BNC"],
  [/licitanet/i, "Licitanet"],
  [/licitar digital|licitardigital/i, "Licitar Digital"],
  [/e-?compras\.?am/i, "e-compras AM"]
];

async function getJson(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json", "user-agent": "pregao-em-dia/1.0" } });
    if (r.status === 204 || r.status === 404) return null;
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// Datas do PNCP vêm no horário de Brasília: "2026-11-10T09:00:00" -> "2026-11-10T09:00"
const dataHora = s => { const m = String(s || "").match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/); return m ? m[1] + "T" + m[2] : ""; };

function modalidade(nome) {
  const n = String(nome || "").toLowerCase();
  if (n.includes("pregão") || n.includes("pregao")) return "Pregão eletrônico";
  if (n.includes("concorr")) return "Concorrência eletrônica";
  if (n.includes("dispensa")) return "Dispensa eletrônica";
  if (n.includes("credenc") || n.includes("inexig")) return "Credenciamento";
  return "Outra";
}
function sigla(mod) { return { "Pregão eletrônico": "PE", "Concorrência eletrônica": "CE", "Dispensa eletrônica": "DE", "Credenciamento": "CH" }[mod] || "ED"; }

const { exigirLogin } = require("./_auth.js");

// Dados de uma compra do PNCP no formato do formulário de edital (null se não existir)
async function dadosPncp(cnpj, ano, seq) {
  const [d, arquivos] = await Promise.all([
    getJson(PNCP + "/api/consulta/v1/orgaos/" + cnpj + "/compras/" + ano + "/" + seq, 15000),
    getJson(PNCP + "/api/pncp/v1/orgaos/" + cnpj + "/compras/" + ano + "/" + seq + "/arquivos", 12000).catch(() => [])
  ]);
  if (!d) return null;
  const uo = d.unidadeOrgao || {}, oe = d.orgaoEntidade || {};
  const mod = modalidade(d.modalidadeNome);
  const origem = [d.usuarioNome, d.linkSistemaOrigem].filter(Boolean).join(" ");
  const portal = (PORTAIS.find(([re]) => re.test(origem)) || [null, "PNCP"])[1];
  const valor = Number(d.valorTotalEstimado);
  return {
    id: cnpj + "-" + ano + "-" + seq,
    numero: sigla(mod) + " " + (d.numeroCompra || seq) + "/" + ano,
    modalidade: mod,
    orgao: oe.razaoSocial || "",
    municipio: uo.municipioNome || "",
    uf: uo.ufSigla || "",
    objeto: String(d.objetoCompra || "").replace(/\s+/g, " ").trim(),
    sessao: dataHora(d.dataEncerramentoProposta || d.dataAberturaProposta),
    limiteProposta: dataHora(d.dataEncerramentoProposta),
    valorEstimado: valor > 0 ? valor : null,
    srp: !!d.srp,
    portal,
    processo: d.processo || "",
    uasg: /^\d{6}$/.test(String(uo.codigoUnidade || "")) ? String(uo.codigoUnidade) : "",
    link: /^https?:\/\//i.test(String(d.linkSistemaOrigem || "")) ? d.linkSistemaOrigem : PNCP + "/app/editais/" + cnpj + "/" + ano + "/" + seq,
    pncp: PNCP + "/app/editais/" + cnpj + "/" + ano + "/" + seq,
    arquivos: (Array.isArray(arquivos) ? arquivos : []).filter(a => a && a.statusAtivo !== false).map(a => ({ titulo: a.titulo || a.tipoDocumentoNome || "Documento", url: a.url || a.uri || "" }))
  };
}

module.exports = async (req, res) => {
  if (!(await exigirLogin(req, res))) return;
  const entrada = String((req.query && req.query.url) || "");
  const m = entrada.match(/(\d{14})[\/-](\d{4})[\/-](\d{1,7})/);
  if (!m) { res.status(400).json({ erro: "Cole o link do edital no PNCP, no formato pncp.gov.br/app/editais/CNPJ/ANO/NÚMERO." }); return; }
  try {
    const dados = await dadosPncp(m[1], m[2], m[3]);
    if (!dados) { res.status(404).json({ erro: "Não encontrei esse edital no PNCP." }); return; }
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json(dados);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ erro: "O PNCP não respondeu agora. Tente de novo em alguns minutos." });
  }
};
module.exports.dadosPncp = dadosPncp;
module.exports.getJson = getJson;
