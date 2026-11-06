// Função da Vercel: processos que as empresas do grupo GANHARAM num ano.
// GET /api/resultados?cnpj=10893674000116[,outro]&ano=2026
//
// Fonte pública: dados abertos do Compras.gov.br (resultados dos itens publicados no PNCP,
// Lei 14.133), filtrados pelo CNPJ do fornecedor e pela data do resultado. Para cada compra
// achada, o PNCP dá o órgão, o objeto, a sessão, os itens e o histórico de resultados de cada
// item: se depois do nosso resultado saiu outro (ex.: a empresa foi desclassificada), o item
// aparece como "substituído" e não entra no valor ganho.
// Cobre o que passa pelo PNCP (Compras.gov.br e portais integrados). O e-compras.AM continua
// sendo acompanhado pelo ranking da disputa, no portal.
//
// Segunda fonte: os dados abertos às vezes deixam de fora compras de portais estaduais e
// municipais (ex.: a Fundação Saúde do RJ, no compras.rj) e só acham o CNPJ exato, sem as
// filiais. Por isso o portal também procura no PNCP os CONTRATOS com o nome da empresa
// (?nome=DIMPI), fica com os de fornecedor da mesma raiz de CNPJ (matriz e filiais) e lê o
// resultado de cada item direto na compra de origem.

const { exigirLogin } = require("./_auth.js");
const { getJson } = require("./pncp.js");

const PNCP = "https://pncp.gov.br";
const DADOS = "https://dadosabertos.compras.gov.br/modulo-contratacoes/3_consultarResultadoItensContratacoes_PNCP_14133";

async function tentar(fn, vezes = 3) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= vezes - 1) throw e; await new Promise(r => setTimeout(r, 900 * (i + 1))); }
  }
}
const json = (url, ms) => tentar(() => getJson(url, ms || 20000));
const dataHora = s => { const m = String(s || "").match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/); return m ? m[1] + "T" + m[2] : ""; };
const n = v => Math.round((Number(v) || 0) * 100) / 100;
const SIGLA = { 6: "PE", 8: "DE", 4: "CE", 5: "CC", 7: "PP", 9: "IN" };

// Executa no máximo `lim` tarefas ao mesmo tempo
async function emLotes(itens, lim, fn) {
  const out = new Array(itens.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(lim, itens.length) }, async () => {
    while (i < itens.length) { const k = i++; out[k] = await fn(itens[k]).catch(e => ({ erro: e.message })); }
  }));
  return out;
}

const raiz = c => String(c || "").replace(/\D/g, "").slice(0, 8);
const daEmpresa = (c, raizes) => raizes.includes(raiz(c));

// Contratos publicados no PNCP com o nome da empresa, assinados a partir do ano pedido
// (o contrato vem depois da homologação). Devolve as compras de origem e as filiais achadas.
async function comprasPorContratos(nomes, raizes, ano) {
  const vistos = new Map();
  for (const nome of nomes) {
    for (let pag = 1; pag <= 3; pag++) {
      const d = await json(PNCP + "/api/search/?q=" + encodeURIComponent(nome) + "&tipos_documento=contrato&ordenacao=-data&pagina=" + pag + "&tam_pagina=100&status=todos", 30000).catch(() => null);
      const itens = (d && d.items) || [];
      itens.filter(i => Number(i.ano) >= Number(ano)).forEach(i => vistos.set(i.numero_controle_pncp, i));
      if (itens.length < 100 || itens.some(i => Number(i.ano) < Number(ano))) break; // vem do mais novo para o mais antigo
    }
  }
  const contratos = await emLotes([...vistos.values()], 5, i => json(PNCP + "/api/pncp/v1/orgaos/" + i.orgao_cnpj + "/contratos/" + i.ano + "/" + i.numero_sequencial).catch(() => null));
  const compras = new Set(), cnpjs = new Set();
  contratos.forEach(c => {
    if (!c || c.erro || !daEmpresa(c.niFornecedor, raizes)) return;
    cnpjs.add(String(c.niFornecedor).replace(/\D/g, ""));
    if (c.numeroControlePncpCompra) compras.add(c.numeroControlePncpCompra);
  });
  return { compras: [...compras], cnpjs: [...cnpjs] };
}

// Resultados dos itens de uma compra (direto no PNCP) que são da empresa e saíram no ano,
// no mesmo formato dos dados abertos
async function resultadosDaCompra(id, raizes, ano) {
  const m = id.match(/^(\d{14})-\d+-0*(\d+)\/(\d{4})$/);
  if (!m) return [];
  const base = PNCP + "/api/pncp/v1/orgaos/" + m[1] + "/compras/" + m[3] + "/" + m[2];
  const itens = ((await json(base + "/itens?pagina=1&tamanhoPagina=200").catch(() => [])) || []).filter(x => x.temResultado);
  const hist = await emLotes(itens, 4, x => json(base + "/itens/" + x.numeroItem + "/resultados").catch(() => null));
  const linhas = [];
  itens.forEach((x, i) => (Array.isArray(hist[i]) ? hist[i] : []).forEach(r => {
    if (!daEmpresa(r.niFornecedor, raizes) || r.dataCancelamento || r.situacaoCompraItemResultadoId === 2) return;
    if (String(r.dataResultado || "").slice(0, 4) !== String(ano)) return;
    linhas.push({ idContratacaoPNCP: id, numeroItemPncp: x.numeroItem, sequencialResultado: r.sequencialResultado, niFornecedor: r.niFornecedor,
      nomeRazaoSocialFornecedor: r.nomeRazaoSocialFornecedor, quantidadeHomologada: r.quantidadeHomologada, valorUnitarioHomologado: r.valorUnitarioHomologado,
      valorTotalHomologado: r.valorTotalHomologado, dataResultadoPncp: r.dataResultado, situacaoCompraItemResultadoId: r.situacaoCompraItemResultadoId });
  }));
  return linhas;
}

async function resultadosDoCnpj(cnpj, ano) {
  const fim = String(ano) === new Date().getFullYear().toString() ? new Date().toISOString().slice(0, 10) : ano + "-12-31";
  const linhas = [];
  for (let pag = 1; pag <= 10; pag++) {
    const d = await json(DADOS + "?pagina=" + pag + "&tamanhoPagina=200&dataResultadoPncpInicial=" + ano + "-01-01&dataResultadoPncpFinal=" + fim + "&niFornecedor=" + cnpj, 45000);
    linhas.push(...((d && d.resultado) || []));
    if (!d || !d.totalPaginas || pag >= d.totalPaginas) break;
  }
  return linhas;
}

// "90033" -> "PE 90033/2026"; portais estaduais já mandam "PE 10/24" (fica como veio)
function numeroProcesso(c) {
  const num = String(c.numeroCompra || "").trim().replace(/^0+(?=\d)/, "");
  if (/^[A-Za-z]/.test(num)) return /\//.test(num) ? num : num + "/" + c.anoCompra;
  return ((SIGLA[c.modalidadeId] || "") + " " + num + (/\//.test(num) ? "" : "/" + c.anoCompra)).trim();
}

// Uma compra do PNCP com os itens que a empresa ganhou e se o resultado ainda vale
async function lerCompra(id, nossas, raizes) {
  const m = id.match(/^(\d{14})-\d+-0*(\d+)\/(\d{4})$/);
  if (!m) return null;
  const [, cnpj, seq, ano] = m, base = PNCP + "/api/pncp/v1/orgaos/" + cnpj + "/compras/" + ano + "/" + seq;
  const [c, itens] = await Promise.all([json(PNCP + "/api/consulta/v1/orgaos/" + cnpj + "/compras/" + ano + "/" + seq), json(base + "/itens?pagina=1&tamanhoPagina=200").catch(() => [])]);
  if (!c) return null;
  const numeros = [...new Set(nossas.map(r => r.numeroItemPncp))];
  const historicos = await emLotes(numeros, 4, k => json(base + "/itens/" + k + "/resultados").catch(() => null));
  const itensGanhos = numeros.map((k, i) => {
    const item = (itens || []).find(x => x.numeroItem === k) || {};
    const hist = (Array.isArray(historicos[i]) ? historicos[i] : []).filter(x => !x.dataCancelamento && x.situacaoCompraItemResultadoId !== 2);
    const ultimo = hist.slice().sort((a, b) => (a.sequencialResultado || 0) - (b.sequencialResultado || 0)).pop();
    const nosso = nossas.filter(r => r.numeroItemPncp === k).sort((a, b) => (a.sequencialResultado || 0) - (b.sequencialResultado || 0)).pop();
    const vigente = !ultimo || daEmpresa(ultimo.niFornecedor, raizes);
    const qtd = Number(nosso.quantidadeHomologada) || Number(item.quantidade) || 0;
    return {
      numero: k, descricao: item.descricao || "", quantidade: qtd, unidade: item.unidadeMedida || "",
      valorUnitEstimado: n(item.valorUnitarioEstimado), valorEstimado: n((Number(item.valorUnitarioEstimado) || 0) * qtd),
      valorUnit: n(nosso.valorUnitarioHomologado), valor: n(nosso.valorTotalHomologado), data: String(nosso.dataResultadoPncp || "").slice(0, 10),
      fornecedor: nosso.nomeRazaoSocialFornecedor, cnpjFornecedor: nosso.niFornecedor, vigente,
      atual: vigente ? null : { fornecedor: ultimo.nomeRazaoSocialFornecedor, valor: n(ultimo.valorTotalHomologado), data: String(ultimo.dataResultado || "").slice(0, 10) },
      disputados: hist.length // resultados que o item já teve (troca de vencedor conta)
    };
  });
  const vig = itensGanhos.filter(x => x.vigente);
  const compraCnet = (String(c.linkSistemaOrigem || "").match(/compra=(\d{17})/) || [])[1] || (nossas[0] && nossas[0].idCompra) || "";
  const u = c.unidadeOrgao || {};
  return {
    id, pncp: { cnpj, ano: Number(ano), seq: Number(seq) },
    numero: numeroProcesso(c),
    modalidade: c.modalidadeNome || "", orgao: (c.orgaoEntidade || {}).razaoSocial || "", unidade: u.nomeUnidade || "", uasg: u.codigoUnidade || "",
    municipio: u.municipioNome || "", uf: u.ufSigla || "", objeto: String(c.objetoCompra || "").replace(/\s+/g, " ").trim(), processo: c.processo || "",
    sessao: dataHora(c.dataEncerramentoProposta || c.dataAberturaProposta), situacao: c.situacaoCompraNome || "", srp: !!c.srp,
    valorEstimadoCompra: n(c.valorTotalEstimado), valorHomologadoCompra: n(c.valorTotalHomologado), itensCompra: (itens || []).length,
    link: compraCnet ? "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=" + compraCnet : c.linkSistemaOrigem || "",
    linkPncp: PNCP + "/app/editais/" + cnpj + "/" + ano + "/" + seq, compra: compraCnet,
    itens: itensGanhos.sort((a, b) => a.numero - b.numero),
    valorGanho: n(vig.reduce((s, x) => s + x.valor, 0)), valorEstimadoGanho: n(vig.reduce((s, x) => s + x.valorEstimado, 0)),
    dataResultado: itensGanhos.map(x => x.data).sort().pop() || "", vigente: vig.length > 0
  };
}

async function resultados(cnpjs, ano, nomes) {
  const raizes = [...new Set(cnpjs.map(raiz))];
  // 1) Contratos com o nome da empresa: compras de origem e filiais (CNPJs da mesma raiz)
  const porContratos = nomes && nomes.length ? await comprasPorContratos(nomes, raizes, ano).catch(() => ({ compras: [], cnpjs: [] })) : { compras: [], cnpjs: [] };
  const todos = [...new Set(cnpjs.concat(porContratos.cnpjs))].slice(0, 10);
  // 2) Dados abertos do Compras.gov.br, por CNPJ (matriz, filiais e grupo)
  const linhas = (await Promise.all(todos.map(c => resultadosDoCnpj(c, ano).catch(() => [])))).flat()
    .filter(r => r.situacaoCompraItemResultadoId !== 2 && !r.dataCancelamentoPncp && r.idContratacaoPNCP);
  const porCompra = new Map();
  linhas.forEach(r => { if (!porCompra.has(r.idContratacaoPNCP)) porCompra.set(r.idContratacaoPNCP, []); porCompra.get(r.idContratacaoPNCP).push(r); });
  // 3) Compras achadas pelos contratos que os dados abertos não trouxeram: resultado direto no PNCP
  const faltam = porContratos.compras.filter(id => !porCompra.has(id));
  const extras = await emLotes(faltam, 3, id => resultadosDaCompra(id, raizes, ano));
  faltam.forEach((id, i) => { const l = Array.isArray(extras[i]) ? extras[i] : []; if (l.length) porCompra.set(id, l); });
  const ids = [...porCompra.keys()];
  const lidos = await emLotes(ids, 5, id => lerCompra(id, porCompra.get(id), raizes));
  const processos = lidos.map((p, i) => p && !p.erro ? p : { id: ids[i], erro: (p && p.erro) || "Compra não encontrada no PNCP", itens: porCompra.get(ids[i]).map(r => ({ numero: r.numeroItemPncp, valor: n(r.valorTotalHomologado), data: String(r.dataResultadoPncp || "").slice(0, 10), vigente: true })) });
  return { cnpjs: todos, processos: processos.sort((a, b) => String(b.dataResultado || "").localeCompare(String(a.dataResultado || ""))) };
}

module.exports = async (req, res) => {
  if (!(await exigirLogin(req, res))) return;
  const q = req.query || {};
  const cnpjs = [...new Set(String(q.cnpj || "").split(/[,;\s]+/).map(x => x.replace(/\D/g, "")).filter(x => x.length === 14))].slice(0, 6);
  const ano = Number(q.ano) || new Date().getFullYear();
  // Nomes da empresa e do grupo para achar os contratos no PNCP (ex.: "DIMPI")
  const nomes = [...new Set(String(q.nome || "").split(/[,;\n]+/).map(x => x.replace(/[^\p{L}\p{N} &.-]/gu, " ").replace(/\s+/g, " ").trim()).filter(x => x.length >= 3))].slice(0, 4);
  if (!cnpjs.length) return res.status(400).json({ erro: "Informe o CNPJ da empresa em Ajustes → Empresa." });
  if (ano < 2021 || ano > 2100) return res.status(400).json({ erro: "Ano inválido." });
  try {
    res.setHeader("Cache-Control", "s-maxage=1800");
    const r = await resultados(cnpjs, ano, nomes);
    res.status(200).json({ ano, cnpjs: r.cnpjs, consultadoEm: new Date().toISOString(), fonte: "Dados abertos do Compras.gov.br e contratos do PNCP", processos: r.processos });
  } catch (e) {
    res.status(502).json({ erro: "Não consegui consultar os resultados no PNCP agora (" + e.message + "). Tente de novo em alguns minutos." });
  }
};
module.exports.resultados = resultados;
