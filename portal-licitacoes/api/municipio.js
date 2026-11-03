// Função da Vercel: dados da cidade do órgão para o resumo da análise de edital.
// GET /api/municipio?nome=Florestópolis&uf=PR
//   -> { nome, uf, codigoIbge, capital, ehCapital, populacao, anoPopulacao, distanciaKm, tempoMin, fontes }
// População: estimativa mais recente do IBGE (SIDRA, tabela 6579). Distância e tempo: rota de carro (OSRM).

const { exigirLogin } = require("./_auth.js");
const { municipios } = require("./_municipios.json"); // [codigo, nome, uf, lat, lon, capital]

const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const UFS = { acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA", paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO" };

async function getJson(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json", "user-agent": "pregao-em-dia/1.0" } });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

async function populacao(codigo) {
  try {
    const j = await getJson("https://apisidra.ibge.gov.br/values/t/6579/n6/" + codigo + "/v/9324/p/last", 9000);
    const linha = Array.isArray(j) ? j[1] : null;
    const v = linha ? Number(linha.V) : NaN;
    return v > 0 ? { populacao: v, anoPopulacao: Number(linha.D3C) || null } : {};
  } catch (e) { return {}; }
}

async function rota(de, para) {
  try {
    const j = await getJson("https://router.project-osrm.org/route/v1/driving/" + de[4] + "," + de[3] + ";" + para[4] + "," + para[3] + "?overview=false", 9000);
    const r = j && j.routes && j.routes[0];
    if (r) return { distanciaKm: Math.round(r.distance / 1000), tempoMin: Math.round(r.duration / 60) };
  } catch (e) { /* usa a estimativa abaixo */ }
  // Sem resposta do serviço de rotas: estima pela distância em linha reta (estradas ~25% mais longas, ~75 km/h)
  const rad = x => x * Math.PI / 180, R = 6371;
  const a = Math.sin(rad(para[3] - de[3]) / 2) ** 2 + Math.cos(rad(de[3])) * Math.cos(rad(para[3])) * Math.sin(rad(para[4] - de[4]) / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(a)) * 1.25;
  return { distanciaKm: Math.round(km), tempoMin: Math.round(km / 75 * 60), distanciaEstimada: true };
}

module.exports = async (req, res) => {
  if (!(await exigirLogin(req, res))) return;
  const q = req.query || {};
  const nome = norm(q.nome);
  let uf = String(q.uf || "").trim().toUpperCase();
  if (uf.length > 2) uf = UFS[norm(uf)] || "";
  if (!nome) { res.status(400).json({ erro: "Informe o nome da cidade." }); return; }
  let achados = municipios.filter(m => norm(m[1]) === nome && (!uf || m[2] === uf));
  if (!achados.length) { res.status(404).json({ erro: "Não encontrei a cidade " + q.nome + (uf ? "/" + uf : "") + "." }); return; }
  if (achados.length > 1) { res.status(409).json({ erro: "Há mais de uma cidade chamada " + q.nome + ". Informe a UF.", opcoes: achados.map(m => m[1] + "/" + m[2]) }); return; }
  const m = achados[0];
  const capital = municipios.find(x => x[2] === m[2] && x[5] === 1);
  const ehCapital = m[5] === 1;
  const [pop, viagem] = await Promise.all([populacao(m[0]), ehCapital ? {} : rota(m, capital)]);
  res.setHeader("Cache-Control", "public, s-maxage=2592000, stale-while-revalidate=604800");
  res.status(200).json(Object.assign({
    nome: m[1], uf: m[2], codigoIbge: m[0], capital: capital ? capital[1] : "", ehCapital,
    fontes: { populacao: "IBGE, estimativa da população (SIDRA, tabela 6579)", distancia: "rota de carro calculada pelo OSRM (OpenStreetMap)" }
  }, pop, viagem));
};
