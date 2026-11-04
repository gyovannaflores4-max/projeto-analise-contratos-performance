// Confere se quem chama a API está logado no portal (sessão do Supabase).
// Arquivos começando com "_" não viram rota na Vercel.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://lxoqazjoyejumjtuujlm.supabase.co";
const SUPABASE_CHAVE = process.env.SUPABASE_CHAVE || "sb_publishable_4Nj1IxhtNT4uwYHNv8UGKw_yHQLmsiE";
const validos = new Map(); // token -> validade (evita consultar o Supabase a cada leitura)

function cabecalhosCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, x-chave-robo");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
}

async function exigirLogin(req, res) {
  cabecalhosCors(res);
  if (req.method === "OPTIONS") { res.status(204).json({}); return false; }
  if (!SUPABASE_URL) return true;
  // Robô do GitHub: a mesma chave do resumo diário (Ajustes → Resumo diário por e-mail)
  const robo = String((req.headers && (req.headers["x-chave-robo"] || req.headers["X-Chave-Robo"])) || "").trim();
  if (robo) return chaveRoboValida(robo, res);
  const cab = (req.headers && (req.headers.authorization || req.headers.Authorization)) || "";
  const token = String(cab).replace(/^Bearer\s+/i, "").trim();
  if (!token) { res.status(401).json({ erro: "Entre no portal para usar esta função." }); return false; }
  if ((validos.get(token) || 0) > Date.now()) return true;
  try {
    const r = await fetch(SUPABASE_URL + "/auth/v1/user", { headers: { apikey: SUPABASE_CHAVE, authorization: "Bearer " + token } });
    if (!r.ok) { res.status(401).json({ erro: "Sua sessão expirou. Entre de novo no portal." }); return false; }
  } catch (e) {
    res.status(503).json({ erro: "Não consegui confirmar o login agora. Tente de novo em instantes." }); return false;
  }
  if (validos.size > 500) validos.clear();
  validos.set(token, Date.now() + 5 * 60000);
  return true;
}

async function chaveRoboValida(chave, res) {
  if ((validos.get("robo:" + chave) || 0) > Date.now()) return true;
  try {
    const r = await fetch(SUPABASE_URL + "/rest/v1/rpc/portal_chave_robo_valida", {
      method: "POST", headers: { apikey: SUPABASE_CHAVE, authorization: "Bearer " + SUPABASE_CHAVE, "content-type": "application/json" },
      body: JSON.stringify({ chave })
    });
    if (!r.ok || (await r.json()) !== true) { res.status(401).json({ erro: "Chave do robô não aceita." }); return false; }
  } catch (e) {
    res.status(503).json({ erro: "Não consegui confirmar a chave do robô agora." }); return false;
  }
  validos.set("robo:" + chave, Date.now() + 10 * 60000);
  return true;
}

module.exports = { exigirLogin };
