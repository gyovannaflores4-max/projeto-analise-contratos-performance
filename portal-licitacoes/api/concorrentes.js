// Função da Vercel: quem ganhou cada item de uma compra e por quanto (concorrência).
// GET /api/concorrentes?ref=<link do Compras.gov.br ou do PNCP | cnpj-ano-seq>
// Fonte: resultados dos itens publicados no PNCP. Devolve, por item, o valor estimado e o
// resultado vigente (fornecedor, valor unitário e total) e o histórico (troca de vencedor).

const { exigirLogin } = require("./_auth.js");
const { getJson } = require("./pncp.js");
const { pncpDoComprasGov } = require("./suspensos.js");

const PNCP = "https://pncp.gov.br";
async function tentar(fn, vezes = 3) {
  for (let i = 0; ; i++) {
    try { return await fn(); } catch (e) { if (i >= vezes - 1) throw e; await new Promise(r => setTimeout(r, 900 * (i + 1))); }
  }
}
const json = (url, ms) => tentar(() => getJson(url, ms || 20000));
const n = v => Math.round((Number(v) || 0) * 100) / 100;
async function emLotes(itens, lim, fn) {
  const out = new Array(itens.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(lim, itens.length) }, async () => { while (i < itens.length) { const k = i++; out[k] = await fn(itens[k]).catch(() => null); } }));
  return out;
}

const MOD = { "05": 6, "06": 8, "03": 4, "02": 5, "07": 7 };
// Compra do Compras.gov.br no PNCP, procurando primeiro nos meses perto da sessão (bem mais rápido)
async function pncpPerto(codigo, sessao) {
  const uasg = codigo.slice(0, 6), num = String(parseInt(codigo.slice(8, 13), 10)), ano = codigo.slice(13, 17);
  const u = await json("https://dadosabertos.compras.gov.br/modulo-uasg/1_consultarUasg?codigoUasg=" + uasg + "&statusUasg=true", 15000).catch(() => null);
  const cnpj = u && u.resultado && u.resultado[0] && u.resultado[0].cnpjCpfOrgao;
  const m0 = String(sessao || "").match(/^(\d{4})-(\d{2})/);
  if (!cnpj || !m0) return null;
  const meses = [0, -1, -2, -3].map(k => new Date(Date.UTC(+m0[1], +m0[2] - 1 + k, 1)));
  const achados = await Promise.all(meses.map(async d => {
    const ini = d.toISOString().slice(0, 10).replace(/-/g, ""), fim = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10).replace(/-/g, "");
    for (let pg = 1; pg <= 4; pg++) {
      const l = await json(PNCP + "/api/consulta/v1/contratacoes/publicacao?dataInicial=" + ini + "&dataFinal=" + fim + "&codigoModalidadeContratacao=" + (MOD[codigo.slice(6, 8)] || 6) +
        "&cnpj=" + cnpj + "&codigoUnidadeAdministrativa=" + uasg + "&pagina=" + pg + "&tamanhoPagina=50", 20000).catch(() => null);
      const c = ((l && l.data) || []).find(c => String(parseInt(c.numeroCompra, 10)) === num && String(c.anoCompra) === ano);
      if (c) return c;
      if (!l || pg >= (l.totalPaginas || 1)) return null;
    }
    return null;
  }));
  const c = achados.find(Boolean);
  return c ? { cnpj: c.orgaoEntidade.cnpj, ano: String(c.anoCompra), seq: String(c.sequencialCompra) } : null;
}
async function idDaRef(ref, sessao) {
  ref = String(ref || "");
  let m = ref.match(/^(\d{14})-\d+-0*(\d+)\/(\d{4})$/); // número de controle do PNCP
  if (m) return { cnpj: m[1], ano: m[3], seq: String(+m[2]) };
  m = ref.match(/(\d{14})[-/](\d{4})[-/](\d+)/) || ref.match(/editais\/(\d{14})\/(\d{4})\/(\d+)/);
  if (m) return { cnpj: m[1], ano: m[2], seq: String(+m[3]) };
  m = ref.match(/compra=(\d{17})/) || ref.match(/^(\d{17})$/);
  if (m) return (await pncpPerto(m[1], sessao)) || pncpDoComprasGov(m[1]);
  return null;
}

async function concorrencia(ref, sessao) {
  const id = await idDaRef(ref, sessao);
  if (!id) return null;
  const base = PNCP + "/api/pncp/v1/orgaos/" + id.cnpj + "/compras/" + id.ano + "/" + id.seq;
  const itens = (await json(base + "/itens?pagina=1&tamanhoPagina=300")) || [];
  const comRes = itens.filter(x => x.temResultado).slice(0, 120);
  const hist = await emLotes(comRes, 5, x => json(base + "/itens/" + x.numeroItem + "/resultados"));
  return {
    pncp: id, linkPncp: PNCP + "/app/editais/" + id.cnpj + "/" + id.ano + "/" + id.seq, totalItens: itens.length,
    itens: comRes.map((x, i) => {
      const todos = (Array.isArray(hist[i]) ? hist[i] : []).sort((a, b) => (a.sequencialResultado || 0) - (b.sequencialResultado || 0));
      const valido = r => !r.dataCancelamento && r.situacaoCompraItemResultadoId !== 2;
      const atual = todos.filter(valido).pop();
      const rs = todos.filter(r => r !== atual).concat(atual ? [atual] : []);
      const qtd = Number(x.quantidade) || 0;
      return {
        numero: x.numeroItem, descricao: String(x.descricao || "").slice(0, 160), quantidade: qtd, unidade: x.unidadeMedida || "",
        valorEstimado: n((Number(x.valorUnitarioEstimado) || 0) * qtd), valorUnitEstimado: n(x.valorUnitarioEstimado),
        vencedor: atual ? { nome: atual.nomeRazaoSocialFornecedor, cnpj: String(atual.niFornecedor || ""), valorUnit: n(atual.valorUnitarioHomologado), valor: n(atual.valorTotalHomologado), data: String(atual.dataResultado || "").slice(0, 10) } : null,
        anteriores: rs.filter(r => r !== atual).map(r => ({ nome: r.nomeRazaoSocialFornecedor, cnpj: String(r.niFornecedor || ""), valor: n(r.valorTotalHomologado), data: String(r.dataResultado || "").slice(0, 10), cancelado: !valido(r) }))
      };
    })
  };
}

module.exports = async (req, res) => {
  if (!(await exigirLogin(req, res))) return;
  const ref = (req.query || {}).ref, sessao = (req.query || {}).sessao;
  if (!ref) return res.status(400).json({ erro: "Informe o link da compra." });
  try {
    const r = await concorrencia(ref, sessao);
    if (!r) return res.status(404).json({ erro: "Não achei essa compra no PNCP." });
    res.setHeader("Cache-Control", "s-maxage=3600");
    res.status(200).json(Object.assign({ lidoEm: new Date().toISOString() }, r));
  } catch (e) {
    res.status(e.status || 502).json({ erro: "Não consegui ler os resultados no PNCP agora (" + e.message + ")." });
  }
};
module.exports.concorrencia = concorrencia;
