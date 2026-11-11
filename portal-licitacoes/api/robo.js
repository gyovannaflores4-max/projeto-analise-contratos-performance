// Função da Vercel: entrega ao portal o arquivo do robô (alerta-csc/chats.json).
// GET /api/robo -> o mesmo JSON que o robô grava no GitHub ({ atualizado_em, pregoes: {...} })
//
// Com o repositório privado, o link raw.githubusercontent.com deixa de abrir no navegador.
// Esta função lê o arquivo pela API do GitHub com um token de leitura guardado na Vercel:
//   GITHUB_TOKEN_ROBO  token "fine-grained" só com Contents: Read-only no repositório das ferramentas
//   ROBO_REPO          opcional (padrão gyovannaflores4-max/ferramentas-licitacoes)
//   ROBO_ARQUIVO       opcional (padrão alerta-csc/chats.json)
// Só quem está logado no portal consegue ler.

const { exigirLogin } = require("./_auth.js");

const REPOS = [
  process.env.ROBO_REPO,
  "gyovannaflores4-max/ferramentas-licitacoes",
  "gyovannaflores4-max/projeto-analise-contratos-performance" // nome antigo, enquanto a troca não acontece
].filter(Boolean);
const ARQUIVO = process.env.ROBO_ARQUIVO || "alerta-csc/chats.json";

let cache = { em: 0, dados: null };

module.exports = async (req, res) => {
  if (!(await exigirLogin(req, res))) return;
  res.setHeader("Cache-Control", "no-store");
  if (cache.dados && Date.now() - cache.em < 60000) return res.status(200).json(cache.dados);

  const token = (process.env.GITHUB_TOKEN_ROBO || "").trim();
  const cab = { accept: "application/vnd.github.raw+json", "user-agent": "equipe-comercial", "x-github-api-version": "2022-11-28" };
  if (token) cab.authorization = "Bearer " + token;

  let ultimoErro = "";
  for (const repo of REPOS) {
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const r = await fetch(`https://api.github.com/repos/${repo}/contents/${ARQUIVO}?ref=main`, { headers: cab, signal: ctrl.signal });
      if (r.status === 404) { ultimoErro = "não encontrado em " + repo; continue; }
      if (!r.ok) { ultimoErro = "GitHub respondeu " + r.status; continue; }
      const dados = JSON.parse(await r.text());
      if (!dados || !dados.pregoes) { ultimoErro = "arquivo sem pregões"; continue; }
      cache = { em: Date.now(), dados };
      return res.status(200).json(dados);
    } catch (e) {
      ultimoErro = e.name === "AbortError" ? "o GitHub demorou para responder" : e.message;
    } finally { clearTimeout(t); }
  }
  res.status(502).json({
    erro: "Não consegui ler o arquivo do robô (" + ultimoErro + ")." +
      (token ? "" : " Falta o token GITHUB_TOKEN_ROBO nas variáveis do projeto na Vercel.")
  });
};
