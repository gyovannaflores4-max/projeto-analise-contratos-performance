// Controle de acesso: a equipe entra com a senha do painel; robôs (cron da Vercel, GitHub Actions e
// o script do Gmail) usam o CRON_SECRET no cabeçalho Authorization: Bearer.
const crypto = require("crypto");

function igual(a, b) {
  const x = crypto.createHash("sha256").update(String(a)).digest();
  const y = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}
const senhaOk = req => !!process.env.SENHA_PAINEL && igual(req.headers["x-senha"] || "", process.env.SENHA_PAINEL);
const roboOk = req => !!process.env.CRON_SECRET && igual(req.headers.authorization || "", "Bearer " + process.env.CRON_SECRET);

// Devolve true quando pode seguir; senão já responde o erro.
function exigir(req, res, { robo = false } = {}) {
  res.setHeader("Cache-Control", "no-store");
  if (senhaOk(req) || (robo && roboOk(req))) return true;
  if (!process.env.SENHA_PAINEL) res.status(503).json({ erro: "Defina a variável SENHA_PAINEL na Vercel para liberar o painel.", configurar: true });
  else res.status(401).json({ erro: "Senha incorreta." });
  return false;
}

function corpo(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

// Endereço público do site, para os links dos avisos
function urlBase(req, config) {
  if (config && /^https:\/\//.test(config.urlPainel || "")) return config.urlPainel.replace(/\/gestao\.html.*$/, "").replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return host ? "https://" + host : "";
}

module.exports = { exigir, senhaOk, roboOk, corpo, urlBase };
