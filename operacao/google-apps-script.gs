/**
 * Revezo Plantões: recebe os formulários do site e grava numa Planilha Google.
 *
 * COMO INSTALAR (uma vez, uns 10 minutos):
 *  1. Crie uma Planilha Google nova (ex.: "Revezo - Cadastros").
 *  2. Menu Extensões > Apps Script. Apague o que estiver lá e cole TODO este arquivo. Salve.
 *  3. (Opcional) Em AVISAR_EMAIL, coloque seu e-mail para receber um aviso a cada cadastro.
 *  4. Clique em Implantar > Nova implantação > tipo "App da Web".
 *       - Executar como: Eu
 *       - Quem pode acessar: Qualquer pessoa
 *     Clique em Implantar, autorize com sua conta Google e copie o "URL do app da Web"
 *     (termina em /exec).
 *  5. Cole esse endereço em formEndpoint, no arquivo site/dados.js.
 *
 * O que ele faz:
 *  - Cria sozinho as abas "Médicos", "Contratantes" e "Vagas" (e "Outros" para o resto).
 *  - Cria o cabeçalho na primeira linha e acrescenta colunas novas se o site mudar.
 *  - Ignora envios de robôs (campo escondido "site" preenchido).
 *  - Limita o tamanho de cada campo e impede que um texto vire fórmula na planilha.
 *
 * Ao alterar este código depois: Implantar > Gerenciar implantações > editar > Versão: nova.
 * O endereço /exec continua o mesmo.
 */

var AVISAR_EMAIL = '';            // ex.: 'voce@empresa.com.br' (vazio = não envia e-mail)
var MAX_CAMPO = 1000;             // tamanho máximo de cada campo

var ABAS = {
  entrada_grupo: 'Médicos',
  cadastro_contratante: 'Contratantes',
  vaga: 'Vagas'
};

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    if (p.site) return resposta_('ok');                 // robô: ignora sem avisar

    lock.waitLock(20000);                               // evita duas gravações ao mesmo tempo
    var aba = obterAba_(ABAS[p.tipo] || 'Outros');
    var dados = { recebido_em: new Date() };
    Object.keys(p).forEach(function (k) {
      if (k === 'site') return;
      dados[limparChave_(k)] = limparValor_(p[k]);
    });

    var cab = cabecalho_(aba, Object.keys(dados));
    var linha = cab.map(function (c) { return dados.hasOwnProperty(c) ? dados[c] : ''; });
    aba.appendRow(linha);

    if (AVISAR_EMAIL) {
      MailApp.sendEmail(AVISAR_EMAIL, 'Revezo: novo cadastro (' + (ABAS[p.tipo] || p.tipo || 'outro') + ')',
        cab.map(function (c, i) { return c + ': ' + linha[i]; }).join('\n'));
    }
    return resposta_('ok');
  } catch (err) {
    console.error(err);
    return resposta_('erro');
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function doGet() {
  return resposta_('Revezo: endereço ativo. Use este endereço em formEndpoint no site.');
}

function obterAba_(nome) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(nome) || ss.insertSheet(nome);
}

function cabecalho_(aba, chaves) {
  var ultimaCol = aba.getLastColumn();
  var cab = ultimaCol ? aba.getRange(1, 1, 1, ultimaCol).getValues()[0].filter(String) : [];
  var novas = chaves.filter(function (k) { return cab.indexOf(k) === -1; });
  if (novas.length) {
    aba.getRange(1, cab.length + 1, 1, novas.length).setValues([novas]);
    cab = cab.concat(novas);
    aba.setFrozenRows(1);
  }
  return cab;
}

function limparChave_(k) {
  return String(k).replace(/[^\w\-]/g, '_').slice(0, 60);
}

function limparValor_(v) {
  var s = String(v == null ? '' : v).slice(0, MAX_CAMPO);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;             // impede que o texto vire fórmula
  return s;
}

function resposta_(texto) {
  return ContentService.createTextOutput(texto).setMimeType(ContentService.MimeType.TEXT);
}
