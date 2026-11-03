// Função da Vercel: importa um edital a partir de QUALQUER link.
// GET /api/importar?url=<link>
//   - PNCP (pncp.gov.br/app/editais/CNPJ/ANO/SEQ)                 -> dados completos do PNCP
//   - Compras.gov.br (…acompanhamento-compra?compra=UASG+MOD+NUM+ANO) -> acha a compra no PNCP pela UASG e número
//   - e-compras.AM (…licitacoes_acompanhamento.asp?ident=N)          -> dados do e-compras e data da sessão pelo chat
//   - qualquer outra página ou PDF                                    -> devolve o texto (ou o PDF) para o portal analisar
// Por segurança só acessa endereços públicos (http/https, portas 80/443, sem IPs internos).

const dns = require("dns").promises;
const zlib = require("zlib");
const net = require("net");
const { exigirLogin } = require("./_auth.js");
const { dadosPncp, getJson } = require("./pncp.js");
const { buscarPregao, pregaoPorIdent, lerChat } = require("./chat.js");

const PNCP = "https://pncp.gov.br";
const PORTAIS = [
  [/compras\.gov\.br|comprasnet|cnetmobile|estaleiro\.serpro/i, "Compras.gov.br"], [/bllcompras|bll\.org/i, "BLL"], [/bnccompras|bnc\.org/i, "BNC"],
  [/licitacoes-e/i, "Licitações-e"], [/portaldecompraspublicas/i, "Portal de Compras Públicas"], [/licitanet/i, "Licitanet"],
  [/licitardigital/i, "Licitar Digital"], [/e-compras\.am/i, "e-compras AM"], [/pncp\.gov\.br/i, "PNCP"]
];
const portalDo = host => (PORTAIS.find(([re]) => re.test(host)) || [null, ""])[1];

function ipPrivado(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:") && ipPrivado(x.slice(7));
}
async function validar(urlTexto) {
  let u;
  try { u = new URL(urlTexto); } catch (e) { throw Object.assign(new Error("Link inválido. Cole o endereço completo, começando com https://"), { status: 400 }); }
  if (!/^https?:$/.test(u.protocol) || (u.port && !["80", "443"].includes(u.port)) || u.username || u.password) throw Object.assign(new Error("Só aceito links públicos http ou https."), { status: 400 });
  const ips = await dns.lookup(u.hostname, { all: true }).catch(() => []);
  if (!ips.length) throw Object.assign(new Error("Não encontrei esse site. Confira o link."), { status: 400 });
  if (ips.some(i => ipPrivado(i.address))) throw Object.assign(new Error("Esse endereço não é público."), { status: 400 });
  return u;
}
// Busca a página seguindo até 4 redirecionamentos, validando cada destino
async function baixar(urlTexto) {
  let atual = urlTexto;
  for (let i = 0; i < 5; i++) {
    const u = await validar(atual);
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 15000);
    let r;
    try { r = await fetch(u, { redirect: "manual", signal: ctrl.signal, headers: { "user-agent": "Mozilla/5.0 (pregao-em-dia)", accept: "text/html,application/pdf,*/*" } }); }
    finally { clearTimeout(t); }
    if (r.status >= 300 && r.status < 400 && r.headers.get("location")) { atual = new URL(r.headers.get("location"), u).toString(); continue; }
    if (!r.ok) throw Object.assign(new Error("O site respondeu com erro " + r.status + ". Ele pode exigir login."), { status: 502 });
    const tipo = r.headers.get("content-type") || "";
    const max = 12 * 1024 * 1024;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > max) throw Object.assign(new Error("Arquivo grande demais (mais de 12 MB)."), { status: 413 });
    return { url: u.toString(), tipo, buf };
  }
  throw Object.assign(new Error("Redirecionamentos demais nesse link."), { status: 502 });
}
// Lê um ZIP (como os editais que o Compras.gov.br publica no PNCP) e devolve os PDFs de dentro
function pdfsDoZip(buf) {
  let fim = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (buf.readUInt32LE(i) === 0x06054b50) { fim = i; break; }
  if (fim < 0) return [];
  const total = buf.readUInt16LE(fim + 10); let p = buf.readUInt32LE(fim + 16);
  const saida = [];
  for (let n = 0; n < total && p + 46 <= buf.length && buf.readUInt32LE(p) === 0x02014b50; n++) {
    const metodo = buf.readUInt16LE(p + 10), comp = buf.readUInt32LE(p + 20), tam = buf.readUInt32LE(p + 24);
    const lnome = buf.readUInt16LE(p + 28), lextra = buf.readUInt16LE(p + 30), lcom = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const nome = buf.slice(p + 46, p + 46 + lnome).toString("utf8");
    p += 46 + lnome + lextra + lcom;
    if (!/\.pdf$/i.test(nome) || tam > 15 * 1024 * 1024) continue;
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const dados = buf.slice(ini, ini + comp);
    try { saida.push({ nome, buf: metodo === 0 ? dados : metodo === 8 ? zlib.inflateRawSync(dados) : null }); } catch (e) { /* entrada corrompida */ }
  }
  return saida.filter(x => x.buf);
}
function textoDoHtml(html) {
  const titulo = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  const texto = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td|th|section|article)>/gi, "\n").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
  return { titulo: titulo.replace(/\s+/g, " ").trim(), texto: texto.slice(0, 120000) };
}

// Busca no PNCP com novas tentativas (o PNCP às vezes responde 503 por alguns segundos)
async function buscaPncp(q, pg) {
  for (let i = 0; i < 3; i++) {
    try { return await getJson(PNCP + "/api/search/?q=" + encodeURIComponent(q) + "&tipos_documento=edital&pagina=" + pg + "&tam_pagina=100", 12000); }
    catch (e) { await new Promise(r => setTimeout(r, 800 * (i + 1))); }
  }
  return null;
}

// Compras.gov.br: "compra=93205905900862026" = UASG 932059 + modalidade 05 + número 90086 + ano 2026
async function comprasGov(codigo, link) {
  const uasg = codigo.slice(0, 6), mod = codigo.slice(6, 8), num = String(parseInt(codigo.slice(8, 13), 10)), ano = codigo.slice(13, 17);
  const parcial = { tipo: "dados", numero: (mod === "05" ? "PE " : mod === "06" ? "DE " : mod === "03" ? "CE " : "") + num + "/" + ano, modalidade: mod === "05" ? "Pregão eletrônico" : mod === "06" ? "Dispensa eletrônica" : mod === "03" ? "Concorrência eletrônica" : "", uasg, portal: "Compras.gov.br", link };
  for (const [q, pg] of [[uasg, 1], [num + "/" + ano, 1], [uasg, 2], [uasg, 3], [num + "/" + ano, 2], [uasg, 4], [uasg, 5]]) {
    const j = await buscaPncp(q, pg);
    const itens = (j && j.items) || [];
    const achado = itens.find(it => String(it.unidade_codigo) === uasg && new RegExp("\\b" + num + "\\b").test(String(it.title) + " " + String(it.description) + " " + String(it.numero)));
    if (achado) {
      const m = String(achado.item_url || "").match(/(\d{14})\/(\d{4})\/(\d+)/);
      const d = m ? await dadosPncp(m[1], m[2], m[3]) : null;
      if (d) return Object.assign({ tipo: "dados" }, d, { link, portal: "Compras.gov.br", uasg, numero: parcial.numero || d.numero });
    }
  }
  return Object.assign(parcial, { aviso: "Achei o pregão " + parcial.numero + " (UASG " + uasg + "), mas ele ainda não está no PNCP: complete órgão, objeto e datas." });
}

// e-compras.AM: dados do cabeçalho + lista pública + data da sessão pela mensagem de abertura no chat
async function eCompras(ident) {
  const p = await pregaoPorIdent(ident);
  if (!p) return null;
  const numAno = (p.edital.match(/(\d+)\/(\d{2,4})/) || []);
  const lista = numAno[1] ? await buscarPregao(numAno[1] + "/" + numAno[2]).catch(() => null) : null;
  let sessao = "";
  try {
    const msgs = await lerChat(ident);
    const ab = msgs.filter(m => /abertura da sess[ãa]o|sess[ãa]o p[úu]blica aberta|in[íi]cio da disputa/i.test(m.texto)).pop();
    const m = ab && ab.hora.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
    if (m) sessao = m[3] + "-" + m[2] + "-" + m[1] + "T" + m[4] + ":" + m[5];
  } catch (e) { /* sem chat */ }
  const ano = numAno[2] && numAno[2].length === 2 ? "20" + numAno[2] : numAno[2];
  return {
    tipo: "dados", numero: numAno[1] ? "PE " + numAno[1] + "/" + ano : p.edital, modalidade: "Pregão eletrônico",
    orgao: (lista && lista.orgao) || p.orgao, municipio: "Manaus", uf: "AM", objeto: p.objeto, sessao, limiteProposta: sessao,
    portal: "e-compras AM", processo: (lista && lista.processo) || "", link: p.link, situacao: p.status, chatAutomatico: true,
    aviso: sessao ? "" : "A data da sessão não aparece na página pública do e-compras: confira no edital."
  };
}

module.exports = async (req, res) => {
  if (!(await exigirLogin(req, res))) return;
  const url = String((req.query && req.query.url) || "").trim();
  if (!url) { res.status(400).json({ erro: "Cole o link do edital ou do pregão." }); return; }
  try {
    let m;
    if ((m = url.match(/pncp\.gov\.br\/.*?(\d{14})\/(\d{4})\/(\d{1,7})/))) {
      const d = await dadosPncp(m[1], m[2], m[3]);
      if (!d) { res.status(404).json({ erro: "Não encontrei esse edital no PNCP." }); return; }
      res.status(200).json(Object.assign({ tipo: "dados" }, d)); return;
    }
    if ((m = url.match(/[?&]compra=(\d{17})\b/))) { res.status(200).json(await comprasGov(m[1], url)); return; }
    if (/e-compras\.am\.gov\.br/i.test(url)) {
      const id = (url.match(/ident=(\d+)/i) || [])[1];
      if (!id) { res.status(400).json({ erro: "Esse link do e-compras.AM está sem o número do pregão (ident=…)." }); return; }
      const d = await eCompras(id);
      if (!d) { res.status(404).json({ erro: "Não encontrei esse pregão no e-compras.AM." }); return; }
      res.status(200).json(d); return;
    }
    // Qualquer outra página ou arquivo
    const b = await baixar(url);
    const host = new URL(b.url).hostname;
    if (b.buf.slice(0, 4).toString("binary") === "PK\u0003\u0004") {
      const pdfs = pdfsDoZip(b.buf);
      if (!pdfs.length) { res.status(422).json({ erro: "O arquivo é um ZIP sem PDF dentro. Baixe e envie o edital pela Análise de edital." }); return; }
      const pdf = pdfs.find(x => /edital/i.test(x.nome)) || pdfs.sort((a, c) => c.buf.length - a.buf.length)[0];
      res.status(200).json({ tipo: "pdf", nome: pdf.nome, base64: pdf.buf.toString("base64"), portal: portalDo(host), link: url, outros: pdfs.map(x => x.nome) }); return;
    }
    if (/pdf/i.test(b.tipo) || b.buf.slice(0, 5).toString() === "%PDF-") {
      res.status(200).json({ tipo: "pdf", nome: decodeURIComponent(b.url.split("/").pop() || "edital.pdf"), base64: b.buf.toString("base64"), portal: portalDo(host), link: url }); return;
    }
    if (!/html|text/i.test(b.tipo)) { res.status(415).json({ erro: "Esse link não é uma página nem um PDF (tipo " + b.tipo + ")." }); return; }
    const { titulo, texto } = textoDoHtml(b.buf.toString("utf8"));
    if (texto.replace(/\s/g, "").length < 300) { res.status(422).json({ erro: "Essa página não mostra o edital sem login (ou carrega o conteúdo só no navegador). Tente o link do PNCP, o link do PDF do edital ou cole o texto na Análise de edital.", portal: portalDo(host) }); return; }
    res.status(200).json({ tipo: "texto", titulo, texto, portal: portalDo(host), link: url });
  } catch (e) {
    res.status(e.status || 502).json({ erro: e.status ? e.message : "Não consegui abrir esse link agora: " + (e.name === "AbortError" ? "o site demorou demais." : "o site não respondeu.") });
  }
};
