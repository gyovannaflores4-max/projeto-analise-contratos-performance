// Função da Vercel: contratos da empresa (e filiais) publicados no PNCP.
// GET /api/contratos?cnpj=10893674000116[,outro]&nome=DIMPI[,outro]
// Procura no PNCP os contratos com o nome da empresa, fica com os de fornecedor da mesma raiz de
// CNPJ (matriz e filiais) e, para os vigentes, lê o contrato (compra de origem e processo).

const { exigirLogin } = require("./_auth.js");
const { getJson } = require("./pncp.js");

const PNCP = "https://pncp.gov.br";
async function tentar(fn, vezes = 3) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= vezes - 1) throw e; await new Promise(r => setTimeout(r, 1200 * (i + 1))); }
  }
}
const json = (url, ms) => tentar(() => getJson(url, ms || 20000));
const raiz = c => String(c || "").replace(/\D/g, "").slice(0, 8);
const hoje = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
async function emLotes(itens, lim, fn) {
  const out = new Array(itens.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(lim, itens.length) }, async () => { while (i < itens.length) { const k = i++; out[k] = await fn(itens[k]).catch(() => null); } }));
  return out;
}

async function contratos(cnpjs, nomes) {
  const raizes = [...new Set(cnpjs.map(raiz))];
  const achados = new Map();
  let falhas = 0;
  for (const nome of nomes) {
    for (let pag = 1; pag <= 10; pag++) {
      // páginas pequenas: com 100 por página o PNCP às vezes não responde
      const d = await json(PNCP + "/api/search/?q=" + encodeURIComponent(nome) + "&tipos_documento=contrato&ordenacao=-data&pagina=" + pag + "&tam_pagina=20&status=todos", 25000).catch(() => { falhas++; return null; });
      const itens = (d && d.items) || [];
      itens.filter(i => raizes.includes(raiz(i.fornecedor_ni)) && !i.cancelado).forEach(i => achados.set(i.numero_controle_pncp, i));
      if (!d || itens.length < 20 || pag * 20 >= (d.total || 0)) break;
    }
  }
  if (!achados.size && falhas) throw Object.assign(new Error("A busca do PNCP não respondeu agora."), { status: 503 });
  const limite = new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10);
  const lista = [...achados.values()].filter(i => !i.data_fim_vigencia || i.data_fim_vigencia >= limite);
  const detalhes = await emLotes(lista, 4, i => json(PNCP + "/api/pncp/v1/orgaos/" + i.orgao_cnpj + "/contratos/" + i.ano + "/" + i.numero_sequencial));
  return lista.map((i, k) => {
    const c = detalhes[k] || {};
    return {
      id: i.numero_controle_pncp, compra: c.numeroControlePncpCompra || "", numero: (i.numero_contrato_empenho || String(i.title || "").replace(/^Contrato nº\s*/i, "")) + (i.ano && !/\//.test(i.numero_contrato_empenho || "") ? "/" + i.ano : ""),
      tipo: i.tipo_contrato_nome || "", orgao: i.orgao_nome, orgaoCnpj: i.orgao_cnpj, unidade: i.unidade_nome, municipio: i.municipio_nome, uf: i.uf,
      objeto: String(i.description || c.objetoContrato || "").replace(/\s+/g, " ").trim().slice(0, 500), fornecedor: i.fornecedor_nome, cnpjFornecedor: i.fornecedor_ni,
      assinatura: i.data_assinatura || c.dataAssinatura || "", inicio: i.data_inicio_vigencia || c.dataVigenciaInicio || "", fim: c.dataVigenciaFim || i.data_fim_vigencia || "",
      valorGlobal: Number(c.valorGlobal || i.valor_global) || null, valorParcela: Number(c.valorParcela) || null, parcelas: c.numeroParcelas || null, processo: c.processo || "",
      vigente: !(c.dataVigenciaFim || i.data_fim_vigencia) || (c.dataVigenciaFim || i.data_fim_vigencia) >= hoje(),
      linkPncp: PNCP + "/app/contratos/" + i.orgao_cnpj + "/" + i.ano + "/" + i.numero_sequencial
    };
  }).sort((a, b) => String(a.fim || "9").localeCompare(String(b.fim || "9")));
}

module.exports = async (req, res) => {
  if (!(await exigirLogin(req, res))) return;
  const q = req.query || {};
  const cnpjs = [...new Set(String(q.cnpj || "").split(/[,;\s]+/).map(x => x.replace(/\D/g, "")).filter(x => x.length === 14))].slice(0, 6);
  const nomes = [...new Set(String(q.nome || "").split(/[,;\n]+/).map(x => x.replace(/[^\p{L}\p{N} &.-]/gu, " ").replace(/\s+/g, " ").trim()).filter(x => x.length >= 3))].slice(0, 4);
  if (!cnpjs.length || !nomes.length) return res.status(400).json({ erro: "Informe o CNPJ e o nome da empresa em Ajustes → Empresa." });
  try {
    res.setHeader("Cache-Control", "s-maxage=3600");
    res.status(200).json({ consultadoEm: new Date().toISOString(), contratos: await contratos(cnpjs, nomes) });
  } catch (e) {
    res.status(e.status || 502).json({ erro: "Não consegui ler os contratos no PNCP agora (" + e.message + ")." });
  }
};
module.exports.contratos = contratos;
