// Envio dos avisos por e-mail (Resend) e Telegram. Os dois são opcionais: o que não estiver configurado é pulado.
const R = require("../../regras.js");

const ICONE = { vencido: "⛔", urgente: "🔴", atencao: "🟠", ok: "🔵", novidade: "📣" };
const TITULO = { vencido: "Vencidos", urgente: "Urgentes", atencao: "Atenção", ok: "Programados", novidade: "Novidades das licitações" };
const ORDEM = ["vencido", "urgente", "novidade", "atencao", "ok"];
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const canais = () => ({ email: !!process.env.RESEND_API_KEY, telegram: !!process.env.TELEGRAM_BOT_TOKEN });

async function enviarEmail(para, assunto, texto, html) {
  if (!process.env.RESEND_API_KEY) return { canal: "email", ok: false, pulado: "RESEND_API_KEY não configurada" };
  if (!para.length) return { canal: "email", ok: false, pulado: "nenhum e-mail cadastrado" };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: "Bearer " + process.env.RESEND_API_KEY, "content-type": "application/json" },
    body: JSON.stringify({ from: process.env.EMAIL_REMETENTE || "Gestão de Prazos <onboarding@resend.dev>", to: para, subject: assunto, text: texto, html })
  });
  if (!r.ok) return { canal: "email", ok: false, para, erro: "Resend HTTP " + r.status + " " + (await r.text()).slice(0, 200) };
  return { canal: "email", ok: true, para };
}

async function enviarTelegram(chatId, texto) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { canal: "telegram", ok: false, pulado: "TELEGRAM_BOT_TOKEN não configurado" };
  if (!chatId) return { canal: "telegram", ok: false, pulado: "chat do Telegram não cadastrado" };
  // O Telegram aceita até 4096 caracteres por mensagem
  const partes = [];
  let atual = "";
  for (const linha of texto.split("\n")) {
    if ((atual + "\n" + linha).length > 3900) { partes.push(atual); atual = ""; }
    atual += (atual ? "\n" : "") + linha.slice(0, 3900);
  }
  if (atual) partes.push(atual);
  for (const p of partes) {
    const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: p, disable_web_page_preview: true })
    });
    if (!r.ok) return { canal: "telegram", ok: false, erro: "Telegram HTTP " + r.status + " " + (await r.text()).slice(0, 200) };
  }
  return { canal: "telegram", ok: true };
}

// itens: [{ nivel, texto, link?, emails? }]
function montar(titulo, itens, linkPainel) {
  const grupos = ORDEM.map(n => [n, itens.filter(i => i.nivel === n)]).filter(([, l]) => l.length);
  const texto = [titulo, ""].concat(grupos.flatMap(([n, l]) => [ICONE[n] + " " + TITULO[n] + " (" + l.length + ")", ...l.map(i => "• " + i.texto + (i.link ? "\n  " + i.link : "")), ""]))
    .concat(linkPainel ? ["Abrir o painel: " + linkPainel] : []).join("\n").trim();
  const html = '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#101A2B;max-width:640px">' +
    "<h2 style=\"font-size:18px;margin:0 0 12px\">" + esc(titulo) + "</h2>" +
    grupos.map(([n, l]) => "<h3 style=\"font-size:15px;margin:16px 0 6px\">" + ICONE[n] + " " + TITULO[n] + " (" + l.length + ")</h3><ul style=\"margin:0;padding-left:20px\">" +
      l.map(i => "<li style=\"margin:4px 0\">" + esc(i.texto) + (i.link ? ' <a href="' + esc(i.link) + '">abrir</a>' : "") + "</li>").join("") + "</ul>").join("") +
    (linkPainel ? '<p style="margin-top:20px"><a href="' + esc(linkPainel) + '" style="background:#1C5FD4;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none">Abrir o painel</a></p>' : "") +
    '<p style="color:#738197;font-size:12.5px;margin-top:20px">Aviso automático da Gestão de Prazos. Confira sempre as datas no contrato, na certidão e no portal.</p></div>';
  return { texto, html };
}

// Envia para a lista geral (e-mail e Telegram) e, em separado, para os e-mails cadastrados em cada registro.
async function notificar(config, titulo, itens, linkPainel) {
  if (!itens.length) return [];
  const geral = R.lerEmails(config.emails);
  const { texto, html } = montar(titulo, itens, linkPainel);
  const tarefas = [enviarEmail(geral, titulo, texto, html), enviarTelegram(config.telegramChatId, texto)];
  const extras = new Map();
  for (const i of itens) for (const e of i.emails || []) if (!geral.includes(e)) { if (!extras.has(e)) extras.set(e, []); extras.get(e).push(i); }
  for (const [email, lista] of extras) {
    const m = montar(titulo, lista, linkPainel);
    tarefas.push(enviarEmail([email], titulo, m.texto, m.html));
  }
  const out = await Promise.allSettled(tarefas);
  return out.map(o => (o.status === "fulfilled" ? o.value : { ok: false, erro: String(o.reason && o.reason.message || o.reason) }));
}

module.exports = { canais, enviarEmail, enviarTelegram, montar, notificar, ICONE };
