// Roda o portal no seu computador, com as APIs funcionando, sem precisar da Vercel.
// Uso:  node servidor-local.js      (depois abra http://localhost:3000)
// Precisa do Node.js 18 ou mais novo (https://nodejs.org).

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORTA = Number(process.env.PORT) || 3000;
const RAIZ = __dirname;
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const api = url.pathname.match(/^\/api\/(chat|pncp|municipio|importar|suspensos|resultados|concorrentes)$/);
  if (api) {
    const resposta = {
      setHeader: (k, v) => res.setHeader(k, v),
      status(c) { res.statusCode = c; return this; },
      json(j) { res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(j)); }
    };
    return require("./api/" + api[1] + ".js")({ method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams) }, resposta);
  }
  const arquivo = path.normalize(path.join(RAIZ, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname)));
  if (!arquivo.startsWith(RAIZ) || arquivo.includes(`${path.sep}api${path.sep}`)) { res.statusCode = 403; return res.end(); }
  fs.readFile(arquivo, (erro, dados) => {
    if (erro) { res.statusCode = 404; return res.end("Não encontrado"); }
    res.setHeader("content-type", TIPOS[path.extname(arquivo)] || "application/octet-stream");
    res.end(dados);
  });
}).listen(PORTA, () => console.log("Equipe Comercial rodando em http://localhost:" + PORTA));
