// Função da Vercel: procura agora, num estado, as licitações com proposta aberta que têm o perfil.
// GET /api/garimpo?uf=RJ&mod=6&pagina=1[&termos=...&excluir=...]
// Lê UMA página (50 licitações) do PNCP e devolve só as com nota de aderência boa. O portal chama
// página por página e mostra o andamento. Mesma nota do robô diário (alerta-csc/garimpo.py).

const { exigirLogin } = require("./_auth.js");
const { getJson } = require("./pncp.js");

const PNCP = "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta";
const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const MODALIDADES = { 6: "Pregão eletrônico", 4: "Concorrência eletrônica", 8: "Dispensa", 7: "Pregão presencial", 5: "Concorrência presencial" }; // sem credenciamento: a equipe não disputa
const SIGLA = { 6: "PE", 4: "CE", 8: "DE", 7: "PP", 5: "CC" };
// Prioridade da equipe: nefrologia (terapia renal, hemodiálise, diálise peritoneal) e mão de obra médica
const TERMOS_NEFRO = { "hemodialise": 6, "dialise peritoneal": 7, "peritoneal": 5, "dialise": 6, "nefrolog": 7, "terapia renal": 7, "renal substitutiva": 7,
  "hemodiafiltra": 6, "insuficiencia renal": 5, "doenca renal": 5, "doente renal": 5, "pacientes renais": 5, "renal cronic": 5, "fistula arteriovenosa": 4 };
const TERMOS_MAO_OBRA = { "mao de obra medica": 6, "fornecimento de mao de obra": 3, "cessao de mao de obra": 3, "profissionais medicos": 5, "medicos plantonistas": 6,
  "plantonista": 4, "plantao medico": 5, "plantoes medicos": 5, "escala medica": 5, "escalas medicas": 5, "servicos medicos": 5, "servico medico": 5,
  "equipe medica": 4, "gestao de escalas": 4, "coordenacao medica": 4, "responsavel tecnico medico": 3 };
const TERMOS = Object.assign({
  "plantao": 3, "plantoes": 3, "medico": 2, "medicos": 2, "medica": 2,
  "uti": 3, "terapia intensiva": 3, "pediatr": 2, "neonat": 2, "anestesi": 3, "obstetr": 2, "ortoped": 2, "cirurg": 2,
  "enfermagem": 2, "pronto atendimento": 3, "pronto socorro": 3, "upa": 2, "urgencia e emergencia": 3, "radiolog": 2,
  "gestao hospitalar": 3, "assistencia medica": 4, "atendimento medico": 4, "telemedicina": 3, "regulacao medica": 3
}, TERMOS_MAO_OBRA, TERMOS_NEFRO);
const EXCLUIR = ["aquisicao", "fornecimento de", "medicamento", "material", "materiais", "equipamento", "insumo", "manutencao", "alimentacao",
  "combustive", "veiculo", "locacao de", "obra", "reforma", "medico do trabalho", "gases medicinais", "uniforme", "limpeza"];
const SEMPRE_FORA = /veterinar|turismo|viagem|transporte (?:rodoviario|de passageiros|escolar)|manutencao (?:preventiva|corretiva)|locacao de veiculo/;
const RUIDO_MEDICO = /medic[oa]s?[- ]+hospitalar\w*|medico[- ]+laborator\w*|medico[- ]+odontolog\w*|(?:dispositivos?|equipamentos?|materia(?:l|is)|instrumenta(?:l|is)|instrumentos?|insumos?|produtos?|gases|aparelhos?)(?:\s+(?:e|de|para|permanentes|laboratoriais)\s+\w+){0,3}\s+medic\w*/g;
const SERVICO = /prestac\w* (?:de |complementar |continuad\w* )*servic|servicos? (?:medic|de saude|assistenc|de plant|de atendimento|de (?:hemo)?dialise|de terapia|de nefrolog)|plant(?:ao|oes|onista)|mao de obra|profissionais|equipe medica|credenciamento|realizacao de (?:sessoes |procedimentos |tratamento )?(?:de )?(?:hemo)?dialise|tratamento dialitico|realizacao de terapia/;
const NEFRO = /hemodialise|dialise|dialitic|dialisador|diasafe|nefrolog|terapia renal|renal substitutiva|hemodiafiltra|insuficiencia renal|doen(?:ca|te)s? renal|pacientes renais|renal cronic/;
const MAO_OBRA = /mao de obra medica|medicos plantonistas|plantonista|plant(?:ao|oes) medic|escalas? medica|profissionais medicos|servicos? medic|equipe medica|gestao de escalas/;
const NOTA_MINIMA = 4;

const sem = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const lista = t => String(t || "").split(/[,;\n]+/).map(x => sem(x).trim()).filter(Boolean);
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function categoria(objeto) {
  const o = sem(objeto).replace(RUIDO_MEDICO, " ");
  return NEFRO.test(o) ? "nefrologia" : MAO_OBRA.test(o) ? "mao_obra" : "";
}

function nota(objeto, termos, excluir) {
  const o = sem(objeto).replace(RUIDO_MEDICO, " ");
  const achados = Object.keys(termos).filter(t => new RegExp("(^|[^a-z])" + esc(t)).test(o));
  let n = achados.reduce((s, t) => s + termos[t], 0);
  const servico = SERVICO.test(o);
  // nefrologia é prioridade: serviço sobe; compra/locação de máquina e insumo de diálise continua na lista, mais abaixo
  if (NEFRO.test(o) && !o.includes("veterinar")) return { n: servico ? n + 4 : Math.max(NOTA_MINIMA, n - 4), achados };
  if (SEMPRE_FORA.test(o)) return { n: n - 10, achados };
  if (excluir.some(x => o.includes(x))) n -= servico ? 2 : 8;
  else if (!servico) n -= 2;
  if (MAO_OBRA.test(o) && servico) n += 3;
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
    link: c.linkSistemaOrigem || "", linkPncp: "https://pncp.gov.br/app/editais/" + o.cnpj + "/" + c.anoCompra + "/" + c.sequencialCompra, termos: achados.slice(0, 8), categoria: categoria(c.objetoCompra) } };
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
module.exports.categoria = categoria;
