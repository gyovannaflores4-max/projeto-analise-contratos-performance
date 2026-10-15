/**
 * Gestão de Prazos — leitura dos e-mails dos portais de compras (Google Apps Script).
 *
 * Os portais (Compras.gov.br, BLL, BNC, Licitanet, Portal de Compras Públicas…) mandam e-mail quando o
 * pregoeiro escreve no chat, convoca anexo, abre prazo de recurso ou muda a fase. Este script lê esses
 * e-mails na caixa da empresa a cada 5 minutos e os envia para o painel, que liga cada um à licitação
 * certa, registra no histórico e avisa a equipe na hora (e-mail e Telegram).
 *
 * Como instalar (uma vez, com a conta Gmail/Google Workspace que recebe os e-mails dos portais):
 * 1. Abra https://script.google.com > Novo projeto. Apague o conteúdo e cole este arquivo.
 * 2. Em Configurações do projeto (engrenagem) > Propriedades do script, adicione:
 *      URL_PAINEL   endereço do site, ex.: https://radar-licitacoes.vercel.app
 *      CRON_SECRET  o mesmo valor da variável CRON_SECRET da Vercel
 *      BUSCA        (opcional) a busca do Gmail que acha os e-mails dos portais; o padrão está abaixo
 * 3. Volte ao editor, escolha a função "instalar" e clique em Executar. Autorize o acesso ao Gmail.
 * 4. Para testar na hora, execute "verificarPortais" e veja o registro de execução.
 *
 * Confira os remetentes reais dos e-mails que vocês recebem e ajuste a BUSCA se algum portal ficar de fora.
 */
var BUSCA_PADRAO =
  "from:(compras.gov.br OR comprasnet.gov.br OR serpro.gov.br OR bll.org.br OR bnc.org.br OR licitanet.com.br " +
  "OR portaldecompraspublicas.com.br OR licitacoes-e.com.br OR licitardigital.com.br OR compras.am.gov.br)";

function verificarPortais() {
  var props = PropertiesService.getScriptProperties();
  var url = (props.getProperty("URL_PAINEL") || "").replace(/\/$/, "");
  var segredo = props.getProperty("CRON_SECRET");
  if (!url || !segredo) throw new Error("Defina URL_PAINEL e CRON_SECRET nas propriedades do script.");

  // Só e-mails novos desde a última leitura (com 15 minutos de folga; o painel ignora repetidos)
  var ultima = Number(props.getProperty("ULTIMA_LEITURA")) || Date.now() - 2 * 86400000;
  var desde = ultima - 15 * 60000;
  var busca = (props.getProperty("BUSCA") || BUSCA_PADRAO) + " after:" + Math.floor(desde / 1000);
  var mensagens = [], maisNova = ultima;

  GmailApp.search(busca, 0, 50).forEach(function (conversa) {
    conversa.getMessages().forEach(function (m) {
      var quando = m.getDate().getTime();
      if (quando < desde) return;
      if (quando > maisNova) maisNova = quando;
      mensagens.push({
        id: m.getId(),
        de: m.getFrom(),
        assunto: m.getSubject(),
        texto: m.getPlainBody().slice(0, 8000),
        data: m.getDate().toISOString(),
        fonte: "e-mail"
      });
    });
  });
  if (!mensagens.length) return;

  var r = UrlFetchApp.fetch(url + "/api/mensagens", {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + segredo },
    payload: JSON.stringify({ mensagens: mensagens }),
    muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) throw new Error("O painel respondeu " + r.getResponseCode() + ": " + r.getContentText().slice(0, 300));
  props.setProperty("ULTIMA_LEITURA", String(maisNova));
  Logger.log(r.getContentText());
}

// Cria o agendamento de 5 em 5 minutos (rode uma vez)
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "verificarPortais") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("verificarPortais").timeBased().everyMinutes(5).create();
  verificarPortais();
}
