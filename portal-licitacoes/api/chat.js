// Função da Vercel: lê o chat público de acompanhamento de um pregão no e-compras.AM.
// GET /api/chat?processo=408/26  -> { pregao: {id, edital, status, objeto, link}, mensagens: [{hora, autor, texto}] }
// GET /api/chat?ident=256066     -> o mesmo, pelo número interno do e-compras
// GET /api/chat?url=<link de acompanhamento> -> aceita o link copiado do navegador (…acompanhamento.asp?ident=256066)
// GET /api/chat?ping=1           -> teste de conexão usado na tela de Ajustes
// Mesma lógica de alerta-csc/alerta_chat.py, que roda no GitHub Actions.

const BASE = "https://www.e-compras.am.gov.br/publico/";
const COLUNAS = ["null", "edital", "cod_ug", "objeto", "status", "processo", "rp", "tipo_edital", "id_edital", "id_modalidade", "id_status", "modalidade"];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// O e-compras derruba conexões com frequência: tenta de novo algumas vezes.
async function requisitar(url, dados, tentativas = 3) {
  const corpo = dados ? new URLSearchParams(dados).toString() : undefined;
  for (let i = 1; ; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 9000);
    try {
      const r = await fetch(url, {
        method: dados ? "POST" : "GET", body: corpo, signal: ctrl.signal,
        headers: { "user-agent": "Mozilla/5.0 (pregao-em-dia)", ...(dados ? { "content-type": "application/x-www-form-urlencoded" } : {}) }
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return new TextDecoder("windows-1252").decode(await r.arrayBuffer());
    } catch (e) {
      if (i >= tentativas) throw e;
      await sleep(1200 * i);
    } finally { clearTimeout(t); }
  }
}

const ACENTO = { acute: "\u0301", grave: "\u0300", tilde: "\u0303", circ: "\u0302", cedil: "\u0327", uml: "\u0308" };
const decodificar = s => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&([a-zA-Z])(acute|grave|tilde|circ|cedil|uml);/g, (_, l, a) => (l + ACENTO[a]).normalize("NFC"))
  .replace(/&ordm;/g, "º").replace(/&ordf;/g, "ª")
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const limpar = html => decodificar(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

// processo: "408/26", "PE 408/26" ou "DLE 061/26". O mesmo número existe em vários órgãos
// (ex.: DLE 061/26 da FCECON, da FHAJ e do HEMOAM): a dica de órgão e objeto escolhe o certo.
async function buscarPregao(processo, dica) {
  dica = dica || {};
  const mp = String(processo).toUpperCase().replace(/\s+/g, "").match(/^([A-Z]{2,4})?(\d{1,5})\/(\d{2,4})$/);
  if (!mp) return null;
  const pref = mp[1] || "", nTxt = mp[2], numero = parseInt(nTxt, 10), ano = mp[3].slice(-2);
  const dados = {
    periodo: "20" + ano, draw: "1", start: "0", length: "50",
    "order[0][column]": "1", "order[0][dir]": "desc",
    "search[value]": nTxt + "/" + ano, "search[regex]": "false"
  };
  COLUNAS.forEach((c, i) => { dados["columns[" + i + "][data]"] = c; dados["columns[" + i + "][searchable]"] = "true"; });
  const resposta = JSON.parse(await requisitar(BASE + "qry/qry_licitacoes_todas.asp", dados));
  const alvo = new RegExp("^([A-Z]{2,4})\\s*0*" + numero + "/+(20)?" + ano + "$");
  const sem = x => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const palavras = x => new Set(sem(x).split(/[^A-Z0-9]+/).filter(w => w.length >= 4));
  const objDica = palavras(dica.objeto), orgDica = sem(dica.orgao);
  const candidatos = (resposta.data || []).filter(l => alvo.test(String(l.edital || "").trim()) && /^\d+$/.test(String(l.id_edital))).map(l => {
    const pl = alvo.exec(String(l.edital).trim())[1];
    let nota = pref ? (pl === pref ? 10 : -10) : (pl === "PE" ? 2 : 0);
    const ug = sem(l.cod_ug), nomeUg = sem(l.nome_ug);
    if (orgDica && ((ug && orgDica.includes(ug)) || (nomeUg && (orgDica.includes(nomeUg) || nomeUg.includes(orgDica))))) nota += 6;
    const comuns = [...palavras(l.objeto)].filter(w => objDica.has(w)).length;
    nota += Math.min(comuns, 4);
    if (!/homologad|anulad|revogad|fracassad|desert/i.test(String(l.status || ""))) nota += 1;
    return { l, nota };
  }).sort((a, b) => b.nota - a.nota);
  if (!candidatos.length || candidatos[0].nota < 0) return null;
  const linha = candidatos[0].l;
  return {
    id: String(linha.id_edital),
    edital: String(linha.edital).trim(),
    status: String(linha.status || "").trim(),
    objeto: String(linha.objeto || "").trim(),
    processo: String(linha.processo || "").trim(),
    publicacao: String(linha.publicacao || "").trim(),
    orgao: String(linha.nome_ug || "").trim(),
    link: BASE + "licitacoes_acompanhamento.asp?ident=" + linha.id_edital
  };
}

// Pelo número interno: lê o cabeçalho da página de acompanhamento
// ("Acompanhamento de Licitações PE 408/26 - OBJETO (Situação) ÓRGÃO HORÁRIO LOCAL…")
async function pregaoPorIdent(ident) {
  const link = BASE + "licitacoes_acompanhamento.asp?ident=" + ident;
  const html = await requisitar(link);
  const texto = limpar(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " "));
  const m = texto.match(/Acompanhamento de Licita\S*\s+(.+?\d+\/\d+)\s+-\s+(.+?)\s+\(([^()]+)\)\s+(.+?)\s+HOR[ÁA]RIO/i);
  if (!m) return null;
  return { id: ident, edital: m[1].trim(), objeto: m[2].trim(), status: m[3].trim(), orgao: m[4].trim(), link, disputa: lerDisputa(html) };
}

// Ranking de cada lote na página pública de acompanhamento: empresas em ordem de valor, com os
// sinais da legenda do e-compras (classificada, melhor lance, habilitada) e o troféu do vencedor.
// Antes da abertura da sessão a lista vem vazia ("Nenhuma empresa ofereceu lance").
const SINAL = { verde: true, vermelho: false, cinza: null };
function lerDisputa(html) {
  const situacao = ((html.match(/id="box_situacao">\s*\(([^)<]*)\)/i) || [])[1] || "").trim();
  const lotes = [];
  // tira as janelinhas "Ver itens" (tabelas dentro da linha), que atrapalham a leitura das colunas
  const blocos = html.replace(/<div id="ppItensLote2?-[\s\S]*?<\/div>/gi, "").split(/<div id="box_item-/i).slice(1);
  for (const b of blocos) {
    const numero = ((b.match(/class="ident_item">\s*([^<]+?)\s*</i) || [])[1] || "").trim();
    const desc = [...b.matchAll(/class="descricao_item"[^>]*>\s*([\s\S]*?)\s*<\/td>/gi)].map(m => limpar(m[1]));
    const participantes = [];
    for (const tr of b.match(/<tr[^>]*>\s*<td height="20"\s*>[\s\S]*?<\/tr>/gi) || []) {
      const tds = tr.match(/<td[\s\S]*?<\/td>/gi) || [];
      if (tds.length < 8) continue;
      const nomeTd = limpar(tds[0]);
      const m = nomeTd.match(/^(\d+)\s*-\s*(.+)$/);
      if (!m) continue;
      const sinal = td => { const g = (td.match(/sinal_(verde|vermelho|cinza)/i) || [])[1]; return g ? SINAL[g.toLowerCase()] : null; };
      const valor = td => { const v = (limpar(td).match(/\d{1,3}(?:\.\d{3})*,\d{2}/) || [])[0]; return v ? Number(v.replace(/\./g, "").replace(",", ".")) : null; };
      participantes.push({
        codigo: m[1], nome: m[2].trim(), vencedor: /trofeu/i.test(tds[0]),
        exame1: sinal(tds[1]), exame2: sinal(tds[2]), valor: valor(tds[4]), adjudicado: /color\s*=\s*"green"/i.test(tds[4]),
        melhor: sinal(tds[5]), negociado: valor(tds[6]), habilitado: sinal(tds[7])
      });
    }
    lotes.push({ numero, nome: desc[0] || "Lote " + numero, situacao: desc[1] || "", participantes, semLances: /Nenhuma empresa ofereceu lance/i.test(b) });
  }
  return { situacao, lotes };
}

async function lerChat(ident) {
  const pagina = await requisitar(BASE + "qry/qry_acompanhamento_mensagem_chat.asp?ident=" + ident + "&limite=0");
  const mensagens = [], vistas = new Set();
  for (const tr of pagina.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const celulas = (tr.match(/<td[\s\S]*?<\/td>/gi) || []).map(limpar);
    if (celulas.length < 2) continue;
    const m = celulas[0].match(/^(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})\s*-\s*(.*?)\s*:?$/);
    if (!m) continue;
    const chave = m[1] + "|" + m[2] + "|" + celulas[1];
    if (vistas.has(chave)) continue; // o e-compras às vezes repete a mesma linha
    vistas.add(chave);
    mensagens.push({ hora: m[1], autor: m[2], texto: celulas[1] });
  }
  return mensagens; // da mais nova para a mais antiga, como o e-compras mostra
}

const { exigirLogin } = require("./_auth.js");

module.exports = async (req, res) => {
  if (!(await exigirLogin(req, res))) return;
  const q = req.query || {};
  if (q.ping) { res.status(200).json({ ok: true, mensagem: "A API do portal está no ar." }); return; }
  const url = String(q.url || "");
  if (/ident=(?!\d)/i.test(url)) { res.status(400).json({ erro: "Esse link está sem o número do pregão (ident=" + (url.match(/ident=([^&#]*)/i) || [])[1] + "). Abra o pregão de novo no e-compras.AM e copie o link, ou informe o número/ano, por exemplo 408/26." }); return; }
  const ident = String(q.ident || (url.match(/ident=(\d+)/i) || [])[1] || "");
  const processo = String(q.processo || "").replace(/\s/g, "").toUpperCase();
  if (q.ident && !/^\d+$/.test(ident)) { res.status(400).json({ erro: "O ident do e-compras.AM precisa ser um número, por exemplo 256066." }); return; }
  if (!ident && !/^(?:[A-Z]{2,4})?\d{1,5}\/\d{2,4}$/.test(processo)) { res.status(400).json({ erro: "Informe o pregão como número/ano (ex.: 408/26 ou DLE 061/26) ou cole o link de acompanhamento do e-compras.AM." }); return; }
  try {
    let pregao = ident ? await pregaoPorIdent(ident) : await buscarPregao(processo, { orgao: q.orgao, objeto: q.objeto });
    if (!pregao) { res.status(404).json({ erro: ident ? "Não encontrei o pregão com ident " + ident + " no e-compras.AM." : "Não encontrei o " + processo + " no e-compras.AM." }); return; }
    if (!pregao.disputa) { // achado pela lista: lê a página para trazer a situação e o ranking dos lotes
      const p2 = await pregaoPorIdent(pregao.id).catch(() => null);
      if (p2) pregao = Object.assign({}, pregao, { status: p2.status || pregao.status, disputa: p2.disputa });
    }
    const mensagens = await lerChat(pregao.id);
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    res.status(200).json({ fonte: "e-compras.AM", consultadoEm: new Date().toISOString(), pregao, mensagens });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ erro: "O e-compras.AM não respondeu agora. Tento de novo na próxima leitura." });
  }
};
module.exports.buscarPregao = buscarPregao;
module.exports.pregaoPorIdent = pregaoPorIdent;
module.exports.lerChat = lerChat;
module.exports.lerDisputa = lerDisputa;
