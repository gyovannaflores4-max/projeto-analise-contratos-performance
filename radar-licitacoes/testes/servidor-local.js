// Servidor local para testar o site sem a Vercel: serve os arquivos e as funções da pasta api/.
// Uso: SENHA_PAINEL=teste node testes/servidor-local.js   (abre em http://localhost:3000/gestao.html)
// Sem as variáveis do Upstash, os dados ficam na memória e somem ao parar o servidor.
const http = require("http");
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const PORTA = Number(process.env.PORT) || 3000;
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".css": "text/css", ".md": "text/markdown; charset=utf-8" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const m = url.pathname.match(/^\/api\/([a-z-]+)$/);
  if (m && fs.existsSync(path.join(RAIZ, "api", m[1] + ".js"))) {
    let corpo = "";
    for await (const parte of req) corpo += parte;
    req.query = Object.fromEntries(url.searchParams);
    try { req.body = corpo ? JSON.parse(corpo) : {}; } catch { req.body = corpo; }
    res.status = c => { res.statusCode = c; return res; };
    res.json = obj => { res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(obj)); return res; };
    return require(path.join(RAIZ, "api", m[1] + ".js"))(req, res);
  }
  const arquivo = path.join(RAIZ, decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname));
  if (!arquivo.startsWith(RAIZ) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) { res.statusCode = 404; return res.end("Não encontrado"); }
  res.setHeader("content-type", TIPOS[path.extname(arquivo)] || "application/octet-stream");
  fs.createReadStream(arquivo).pipe(res);
}).listen(PORTA, () => console.log("Abra http://localhost:" + PORTA + "/gestao.html"));
