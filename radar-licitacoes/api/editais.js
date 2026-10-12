// Função da Vercel: consulta o PNCP e devolve os editais de serviços médicos com prazo aberto.
// GET /api/editais          -> resposta guardada em cache por até 15 minutos
// GET /api/editais?t=<n>    -> o botão Atualizar muda t a cada 5 minutos para forçar uma busca nova

const PNCP = "https://pncp.gov.br";
const TERMOS = ["hemodiálise", "plantões médicos", "serviços médicos urgência emergência", "UTI médicos", "credenciamento serviços médicos"];
const MAX_DETALHES = 45;
const PRAZO_TOTAL_MS = 50000;

const INCLUI = /m[eé]dic|plant[aã]o|plant[oõ]es|hemodi[aá]l|di[aá]lise|nefrolog|renal|urg[eê]ncia|emerg[eê]ncia|\buti\b|terapia intensiva|pronto[- ]?(socorro|atendimento)|samu|ambul[aâ]ncia|cl[ií]nica geral|anestesi|pediatr|obstetr|ortoped|cirurg/i;
const EXCLUI = /medicament|insumo|material|materiais|equipament|aquisi[cç][aã]o de|g[eê]neros aliment|mobili[aá]rio|ve[ií]culo|combust[ií]vel|uniforme|software|limpeza|obra|reforma/i;

const PORTAIS = [
  [/compras\.gov|comprasnet|siasg|serpro|comprasgovernamentais/i, "Compras.gov.br"],
  [/\bbll\b|bolsa de licita/i, "BLL"],
  [/licitac[oõ]es-e|licitacoes-e|banco do brasil/i, "Licitações-e"],
  [/portal de compras p[uú]blicas|portaldecompraspublicas/i, "Portal de Compras Públicas"],
  [/\bbnc\b|bolsa nacional de compras/i, "BNC"],
  [/licitanet/i, "Licitanet"],
  [/licitar digital|licitardigital/i, "Licitar Digital"],
  [/e-?compras\s*am|compras\s*am\b|amazonas/i, "Compras AM"]
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Busca JSON no PNCP com tempo limite e uma nova tentativa quando o PNCP falha
// ou pede para esperar (429, 5xx, tempo esgotado).
async function getJson(url, timeoutMs, tentativas = 2) {
  for (let i = 0; ; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json", "user-agent": "radar-licitacoes/1.0" } });
      if (r.status === 204) return null;
      if (r.status === 429 || r.status >= 500) throw Object.assign(new Error("HTTP " + r.status), { repetir: true });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      const repetir = e.repetir || e.name === "AbortError" || e.name === "TypeError";
      if (!repetir || i + 1 >= tentativas) throw e;
      await sleep(600 * (i + 1) + Math.random() * 400);
    } finally { clearTimeout(t); }
  }
}

// Datas do PNCP vêm no horário de Brasília. Normaliza para "AAAA-MM-DDTHH:MM:SS" sem fuso.
function brasilia(s) {
  if (!s) return null;
  const str = String(s);
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(str)) {
    const d = new Date(str);
    if (isNaN(d)) return null;
    return new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 19);
  }
  const m = str.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?/);
  if (!m) return null;
  return m[1] + "T" + (m[2] ? (m[2].length === 5 ? m[2] + ":00" : m[2]) : "23:59:59");
}
const prazoFuturo = p => !!p && new Date(p + "-03:00").getTime() > Date.now();

function especialidade(txt) {
  if (/hemodi[aá]l|di[aá]lise|nefrolog|renal/i.test(txt)) return "hemodialise";
  if (/urg[eê]ncia|emerg[eê]ncia|pronto[- ]?socorro|samu/i.test(txt)) return "urgencia";
  if (/plant[aã]o|plant[oõ]es|plantonista/i.test(txt)) return "plantoes";
  return "outros";
}
function fonte(...txts) {
  const t = txts.filter(Boolean).join(" ");
  for (const [re, nome] of PORTAIS) if (re.test(t)) return nome;
  return "PNCP";
}
function corta(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 30).replace(/\s+\S*$/, "") + "… Objeto completo no PNCP." : s;
}

// Lê um item da busca do PNCP e devolve a chave {cnpj, ano, seq}
function chave(it) {
  let cnpj = it.orgao_cnpj, ano = it.ano, seq = it.numero_sequencial;
  const m = String(it.item_url || "").match(/(\d{14})\/(\d{4})\/(\d+)/);
  if (m) { cnpj = cnpj || m[1]; ano = ano || m[2]; seq = seq || m[3]; }
  if (!cnpj || !ano || !seq) return null;
  return { cnpj: String(cnpj), ano: String(ano), seq: String(seq) };
}

function montar(k, it, det) {
  const d = det || {};
  const uo = d.unidadeOrgao || {}, oe = d.orgaoEntidade || {};
  const objeto = d.objetoCompra || it.description || it.title || "";
  const valor = Number(d.valorTotalEstimado ?? it.valor_global);
  const orgao = oe.razaoSocial || it.orgao_nome || "";
  const doc = {
    id: k.cnpj + "-" + k.ano + "-" + k.seq,
    orgao,
    unidade: uo.nomeUnidade || it.unidade_nome || null,
    uf: uo.ufSigla || it.uf || "",
    municipio: uo.municipioNome || it.municipio_nome || "",
    objeto: corta(objeto, 300),
    modalidade: d.modalidadeNome || it.modalidade_licitacao_nome || "",
    edital: it.title || (d.numeroCompra ? "Edital nº " + d.numeroCompra + "/" + k.ano : null),
    processo: d.processo || null,
    prazo: brasilia(d.dataEncerramentoProposta || it.data_fim_vigencia),
    publicacao: (brasilia(d.dataPublicacaoPncp || it.data_publicacao_pncp) || "").slice(0, 10) || null,
    valor: valor > 0 ? valor : null,
    srp: !!(d.srp ?? false),
    uasg: uo.codigoUnidade && /^\d{6}$/.test(String(uo.codigoUnidade)) ? String(uo.codigoUnidade) : null,
    ebserh: /ebserh|servi[cç]os hospitalares/i.test(orgao),
    especialidade: especialidade(objeto),
    fonte: fonte(d.usuarioNome, d.linkSistemaOrigem),
    url: PNCP + "/app/editais/" + k.cnpj + "/" + k.ano + "/" + k.seq,
    linkOrigem: /^https?:\/\//i.test(String(d.linkSistemaOrigem || "")) ? String(d.linkSistemaOrigem) : null
  };
  if (!doc.valor) doc.valorNota = det ? "Não divulgado no PNCP" : "Não consultado nesta busca";
  return doc;
}

async function coletar() {
  const inicio = Date.now(), avisos = [], consultas = [];
  const vistos = new Map();

  const buscas = await Promise.allSettled(TERMOS.map(termo =>
    getJson(PNCP + "/api/search/?q=" + encodeURIComponent(termo) + "&tipos_documento=edital&ordenacao=-data&pagina=1&tam_pagina=100&status=recebendo_proposta", 15000)
      .then(r => ({ termo, r }))));
  for (const b of buscas) {
    if (b.status !== "fulfilled") { avisos.push("Uma busca no PNCP não respondeu."); continue; }
    const { termo, r } = b.value;
    const items = Array.isArray(r && r.items) ? r.items : [];
    consultas.push({ termo, retornadas: Number(r && r.total) || items.length });
    for (const it of items) {
      const txt = [it.title, it.description].join(" ");
      if (!INCLUI.test(txt) || EXCLUI.test(it.description || "")) continue;
      const k = chave(it); if (!k) continue;
      const id = k.cnpj + "-" + k.ano + "-" + k.seq;
      if (!vistos.has(id)) vistos.set(id, { k, it });
    }
  }
  if (!consultas.length) throw new Error("O PNCP não respondeu às buscas.");

  // Detalhe de cada compra: prazo exato, valor, modalidade e portal de origem
  const fila = [...vistos.values()].slice(0, MAX_DETALHES), editais = [];
  let lidas = 0;
  async function trabalhador() {
    while (fila.length && Date.now() - inicio < PRAZO_TOTAL_MS) {
      const { k, it } = fila.shift();
      let det = null;
      try { det = await getJson(PNCP + "/api/consulta/v1/orgaos/" + k.cnpj + "/compras/" + k.ano + "/" + k.seq, 8000); lidas++; }
      catch { await sleep(150); }
      const doc = montar(k, it, det);
      if (prazoFuturo(doc.prazo)) editais.push(doc);
    }
  }
  await Promise.all(Array.from({ length: 4 }, trabalhador));
  if (fila.length) avisos.push(fila.length + " editais ficaram de fora porque o PNCP demorou a responder.");

  editais.sort((a, b) => a.prazo.localeCompare(b.prazo));
  return { base: "PNCP", coletadaEm: new Date().toISOString(), consultas, lidas, avisos, editais };
}

module.exports = async (req, res) => {
  try {
    const dados = await coletar();
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
    res.status(200).json(dados);
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ erro: "Não consegui consultar o PNCP agora. " + (e && e.message ? e.message : "") });
  }
};
module.exports.coletar = coletar;
module.exports.getJson = getJson;
module.exports.montar = montar;
