// Função da Vercel: procura agora, num estado, as licitações com proposta aberta que têm o perfil.
// GET /api/garimpo?uf=RJ&mod=6&pagina=1[&termos=...&excluir=...]
// Lê UMA página (50 licitações) do PNCP e devolve só as com nota de aderência boa. O portal chama
// página por página e mostra o andamento. Mesma nota do robô diário (alerta-csc/garimpo.py).

const { exigirLogin } = require("./_auth.js");
const { getJson } = require("./pncp.js");

const PNCP = "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta";
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const MODALIDADES = { 6: "Pregão eletrônico", 4: "Concorrência eletrônica", 8: "Dispensa" };
const SIGLA = { 6: "PE", 4: "CE", 8: "DE" };
const TERMOS = {
  "servicos medicos": 4, "servico medico": 4, "profissionais medicos": 4, "plantao": 3, "plantoes": 3, "plantonista": 3,
  "medico": 2, "medicos": 2, "medica": 2, "hemodialise": 4, "terapia renal": 4, "nefrolog": 4, "dialise": 4,
  "uti": 3, "terapia intensiva": 3, "pediatr": 2, "neonat": 2, "anestesi": 3, "obstetr": 2, "ortoped": 2, "cirurg": 2,
  "enfermagem": 2, "pronto atendimento": 3, "pronto socorro": 3, "upa": 2, "urgencia e emergencia": 3, "radiolog": 2,
  "gestao hospitalar": 3, "assistencia medica": 4, "atendimento medico": 4, "telemedicina": 3, "regulacao medica": 3
};
const EXCLUIR = ["aquisicao", "fornecimento de", "medicamento", "material", "materiais", "equipamento", "insumo", "manutencao", "alimentacao",
  "combustive", "veiculo", "locacao de", "obra", "reforma", "medico do trabalho", "exames laboratoriais", "gases medicinais", "uniforme", "limpeza"];
const SEMPRE_FORA = /veterinar|turismo|viagem|transporte (?:rodoviario|de passageiros|escolar)|manutencao (?:preventiva|corretiva)|locacao de veiculo/;
const RUIDO_MEDICO = /medic[oa]s?[- ]+hospitalar\w*|medico[- ]+laborator\w*|medico[- ]+odontolog\w*|(?:dispositivos?|equipamentos?|materia(?:l|is)|instrumenta(?:l|is)|instrumentos?|insumos?|produtos?|gases|aparelhos?)(?:\s+(?:e|de|para|permanentes|laboratoriais)\s+\w+){0,3}\s+medic\w*/g;
const SERVICO = /prestac\w* (?:de |complementar |continuad\w* )*servic|servicos? (?:medic|de saude|assistenc|de plant|de atendimento)|plant(?:ao|oes|onista)|mao de obra|profissionais|equipe medica/;
const NOTA_MINIMA = 4;

const sem = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const lista = t => String(t || "").split(/[,;\n]+/).map(x => sem(x).trim()).filter(Boolean);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function nota(objeto, termos, excluir) {
  const o = sem(objeto).replace(RUIDO_MEDICO, " ");
  const achados = Object.keys(termos).filter(t => new RegExp("(^|[^a-z])" + esc(t)).test(o));
  let n = achados.reduce((s, t) => s + termos[t], 0);
  if (SEMPRE_FORA.test(o)) return { n: n - 10, achados };
  const servico = SERVICO.test(o);
  if (excluir.some(x => o.includes(x))) n -= servico ? 2 : 8;
  else if (!servico) n -= 2;
  return { n, achados };
}

function item(mod, c, n, achados) {
  const u = c.unidadeOrgao || {}, o = c.orgaoEntidade || {};
  const num = String(c.numeroCompra || "").replace(/^0+(?=\w)/, "") || "?";
  return { id: c.numeroControlePNCP, nota: n, achado_em: new Date().toISOString(), dados: {
    numero: ((SIGLA[mod] || "") + " " + num + (/\//.test(num) ? "" : "/" + c.anoCompra)).trim(), modalidade: MODALIDADES[mod] || c.modalidadeNome,
    orgao: o.razaoSocial, cnpj: o.cnpj, unidade: u.nomeUnidade, uasg: u.codigoUnidade, municipio: u.municipioNome, uf: u.ufSigla,
    objeto: String(c.objetoCompra || "").replace(/\s+/g, " ").trim().slice(0, 900), valorEstimado: c.valorTotalEstimado,
    abertura: String(c.dataAberturaProposta || "").slice(0, 16), encerramento: String(c.dataEncerramentoProposta || "").slice(0, 16), srp: c.srp,
    link: c.linkSistemaOrigem || "", linkPncp: "https://pncp.gov.br/app/editais/" + o.cnpj + "/" + c.anoCompra + "/" + c.sequencialCompra, termos: achados.slice(0, 8) } };
}

module.exports = async (req, res) => {
  if (!(await exigirLogin(req, res))) return;
  const q = req.query || {};
  const uf = String(q.uf || "").toUpperCase(), mod = Number(q.mod) || 6, pagina = Math.max(1, Math.min(200, Number(q.pagina) || 1));
  if (!UFS.includes(uf)) return res.status(400).json({ erro: "Escolha um estado." });
  if (!MODALIDADES[mod]) return res.status(400).json({ erro: "Modalidade inválida." });
  const termosUsuario = lista(q.termos);
  const termos = termosUsuario.length ? Object.fromEntries(termosUsuario.map(t => [t, 3])) : TERMOS;
  const excluir = lista(q.excluir).length ? lista(q.excluir) : EXCLUIR;
  const ate = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10).replace(/-/g, "");
  try {
    const d = await getJson(PNCP + "?dataFinal=" + ate + "&codigoModalidadeContratacao=" + mod + "&uf=" + uf + "&pagina=" + pagina + "&tamanhoPagina=50", 50000) || {};
    const lidas = d.data || [];
    const itens = lidas.map(c => { const r = nota(c.objetoCompra, termos, excluir); return r.n >= NOTA_MINIMA ? item(mod, c, r.n, r.achados) : null; }).filter(Boolean);
    res.setHeader("Cache-Control", "s-maxage=1800");
    res.status(200).json({ uf, mod, pagina, totalPaginas: d.totalPaginas || (lidas.length ? 1 : 0), totalRegistros: d.totalRegistros || lidas.length, lidas: lidas.length, itens });
  } catch (e) {
    res.status(502).json({ erro: "O PNCP não respondeu agora (" + e.message + "). Tente de novo em instantes." });
  }
};
module.exports.nota = (objeto, termos, excluir) => nota(objeto, termos || TERMOS, excluir || EXCLUIR);
