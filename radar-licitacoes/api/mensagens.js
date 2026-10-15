// Função da Vercel: recebe mensagens dos portais de compras e avisa a equipe na hora.
// Quem chama é o script do Gmail (integracoes/gmail-portais.gs), com Authorization: Bearer <CRON_SECRET>.
// POST /api/mensagens { mensagens: [{ id, de, assunto, texto, data }] }
const acesso = require("./_lib/acesso.js");
const avisos = require("./_lib/avisos.js");
const { receber } = require("./_lib/mensagens.js");

module.exports = async (req, res) => {
  if (!acesso.exigir(req, res, { robo: true })) return;
  if (req.method !== "POST") return res.status(405).json({ erro: "Use POST." });
  const b = acesso.corpo(req);
  if (!Array.isArray(b.mensagens)) return res.status(400).json({ erro: "Envie { mensagens: [...] }." });
  try {
    const r = await receber(b.mensagens, Date.now());
    let envios = [];
    if (r.avisos.length && b.notificar !== false) {
      const urgentes = r.avisos.filter(a => a.nivel === "urgente").length;
      const base = acesso.urlBase(req, r.config);
      const titulo = "Portais: " + r.avisos.length + (r.avisos.length === 1 ? " mensagem nova" : " mensagens novas") + (urgentes ? " (" + urgentes + " urgente" + (urgentes > 1 ? "s" : "") + ")" : "");
      envios = await avisos.notificar(r.config, titulo, r.avisos, base ? base + "/gestao.html#licitacoes" : "");
    }
    res.status(200).json({ recebidas: r.recebidas, duplicadas: r.duplicadas, ligadas: r.ligadas.length, semLicitacao: r.caixa, envios });
  } catch (e) {
    res.status(500).json({ erro: e.message || "Erro ao registrar as mensagens." });
  }
};
