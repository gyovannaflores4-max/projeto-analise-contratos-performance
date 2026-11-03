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

async function buscarPregao(processo) {
  const [n, a] = processo.split("/");
  const numero = parseInt(n, 10), ano = a.slice(-2);
  const dados = {
    periodo: "20" + ano, draw: "1", start: "0", length: "50",
    "order[0][column]": "1", "order[0][dir]": "desc",
    "search[value]": numero + "/" + ano, "search[regex]": "false"
  };
  COLUNAS.forEach((c, i) => { dados["columns[" + i + "][data]"] = c; dados["columns[" + i + "][searchable]"] = "true"; });
  const resposta = JSON.parse(await requisitar(BASE + "qry/qry_licitacoes_todas.asp", dados));
  const alvo = new RegExp("^PE\\s+0*" + numero + "/(20)?" + ano + "$");
  const linha = (resposta.data || []).find(l => alvo.test(String(l.edital || "").trim()));
  if (!linha || !/^\d+$/.test(String(linha.id_edital))) return null;
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
  const texto = limpar((await requisitar(link)).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " "));
  const m = texto.match(/Acompanhamento de Licita\S*\s+(.+?\d+\/\d+)\s+-\s+(.+?)\s+\(([^()]+)\)\s+(.+?)\s+HOR[ÁA]RIO/i);
  if (!m) return null;
  return { id: ident, edital: m[1].trim(), objeto: m[2].trim(), status: m[3].trim(), orgao: m[4].trim(), link };
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
  const processo = String(q.processo || "").replace(/\s/g, "");
  if (q.ident && !/^\d+$/.test(ident)) { res.status(400).json({ erro: "O ident do e-compras.AM precisa ser um número, por exemplo 256066." }); return; }
  if (!ident && !/^\d{1,5}\/\d{2,4}$/.test(processo)) { res.status(400).json({ erro: "Informe o pregão como número/ano (ex.: 408/26) ou cole o link de acompanhamento do e-compras.AM." }); return; }
  try {
    const pregao = ident ? await pregaoPorIdent(ident) : await buscarPregao(processo);
    if (!pregao) { res.status(404).json({ erro: ident ? "Não encontrei o pregão com ident " + ident + " no e-compras.AM." : "Não encontrei o PE " + processo + " no e-compras.AM." }); return; }
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
