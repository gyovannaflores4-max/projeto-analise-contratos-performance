/**
 * Revezo Plantões: recebe os formulários do site e grava numa Planilha Google.
 *
 * COMO INSTALAR (uma vez, uns 10 minutos):
 *  1. Crie uma Planilha Google NOVA só para os cadastros (ex.: "Revezo - Cadastros").
 *     IMPORTANTE: não use a mesma planilha dos links dos grupos. A planilha de grupos é
 *     publicada na internet; esta aqui NUNCA deve ser publicada nem compartilhada por link.
 *  2. Menu Extensões > Apps Script. Apague o que estiver lá e cole TODO este arquivo. Salve.
 *  3. (Opcional) Em AVISAR_EMAIL, coloque seu e-mail para receber um aviso a cada cadastro.
 *  4. Clique em Implantar > Nova implantação > tipo "App da Web".
 *       - Executar como: Eu
 *       - Quem pode acessar: Qualquer pessoa
 *     Clique em Implantar, autorize com sua conta Google e copie o "URL do app da Web"
 *     (termina em /exec).
 *  5. Cole esse endereço em formEndpoint, no arquivo site/dados.js.
 *
 * "Qualquer pessoa" significa que qualquer um pode ENVIAR um cadastro (como num formulário).
 * Ninguém consegue LER a planilha por esse endereço: o script só grava, nunca devolve dados.
 *
 * Proteções:
 *  - Aceita só os tipos de formulário do site e confere os campos obrigatórios aqui no servidor.
 *  - Ignora robôs (campo escondido "site" preenchido) e cadastros repetidos em 10 minutos.
 *  - Limita o volume por minuto, para uma enxurrada de envios não encher a planilha.
 *  - Limita o tamanho de cada campo e impede que um texto vire fórmula na planilha.
 *  - Grava uma linha por vez (trava), sem misturar envios que chegam juntos.
 *
 * Ao alterar este código depois: Implantar > Gerenciar implantações > editar > Versão: nova.
 * O endereço /exec continua o mesmo.
 */

var AVISAR_EMAIL = '';            // ex.: 'voce@empresa.com.br' (vazio = não envia e-mail)
var MAX_CAMPO = 1000;             // tamanho máximo de cada campo
var MAX_POR_MINUTO = 300;         // acima disso, novos envios são descartados naquele minuto
var MAX_CAMPOS = 40;              // quantidade máxima de campos por envio

var ABAS = {
  entrada_grupo: 'Médicos',
  cadastro_contratante: 'Contratantes',
  vaga: 'Vagas',
  teste_carga: 'Teste de carga'
};

// campos que precisam existir em cada tipo (o resto é opcional)
var OBRIGATORIOS = {
  entrada_grupo: ['nome', 'crm', 'crm_uf', 'whatsapp', 'uf', 'grupo', 'consentimento_lgpd'],
  cadastro_contratante: ['nome', 'instituicao', 'cnpj', 'email', 'whatsapp', 'declaracao'],
  vaga: ['vaga', 'uf', 'cidade', 'valor', 'data', 'cnpj', 'contato'],
  teste_carga: ['perfil', 'whatsapp']
};

// campo usado para reconhecer um envio repetido
var CHAVE_REPETIDO = {
  entrada_grupo: 'whatsapp',
  cadastro_contratante: 'cnpj',
  vaga: null,
  teste_carga: 'whatsapp'
};

function doPost(e) {
  var lock = LockService.getScriptLock();
  var travou = false;
  try {
    var p = (e && e.parameter) ? e.parameter : {};
    if (p.site) return resposta_('ok');                         // robô: ignora sem avisar
    var tipo = String(p.tipo || '');
    if (!ABAS[tipo]) return resposta_('ignorado');              // tipo desconhecido
    if (Object.keys(p).length > MAX_CAMPOS) return resposta_('ignorado');
    var faltando = OBRIGATORIOS[tipo].filter(function (c) { return !String(p[c] || '').trim(); });
    if (faltando.length) return resposta_('ignorado');

    var cache = CacheService.getScriptCache();
    if (excedeuLimite_(cache)) return resposta_('limite');
    if (repetido_(cache, tipo, p)) return resposta_('ok');      // já recebido há pouco

    lock.waitLock(25000);                                       // grava uma linha por vez
    travou = true;
    var aba = obterAba_(ABAS[tipo]);
    var dados = { recebido_em: new Date() };
    Object.keys(p).forEach(function (k) {
      if (k === 'site') return;
      dados[limparChave_(k)] = limparValor_(p[k]);
    });
    var cab = cabecalho_(aba, Object.keys(dados));
    var linha = cab.map(function (c) { return dados.hasOwnProperty(c) ? dados[c] : ''; });
    aba.appendRow(linha);
    SpreadsheetApp.flush();
    lock.releaseLock();
    travou = false;

    if (AVISAR_EMAIL && tipo !== 'teste_carga') {
      MailApp.sendEmail(AVISAR_EMAIL, 'Revezo: novo cadastro (' + ABAS[tipo] + ')',
        cab.map(function (c, i) { return c + ': ' + linha[i]; }).join('\n'));
    }
    return resposta_('ok');
  } catch (err) {
    console.error(err);
    return resposta_('erro');
  } finally {
    if (travou) { try { lock.releaseLock(); } catch (x) {} }
  }
}

function doGet() {
  return resposta_('Revezo: endereço ativo. Use este endereço em formEndpoint no site.');
}

function excedeuLimite_(cache) {
  var chave = 'min_' + Math.floor(Date.now() / 60000);
  var n = Number(cache.get(chave) || 0) + 1;
  cache.put(chave, String(n), 120);
  return n > MAX_POR_MINUTO;
}

function repetido_(cache, tipo, p) {
  var campo = CHAVE_REPETIDO[tipo];
  if (!campo || !p[campo]) return false;
  var valor = String(p[campo]).replace(/\D/g, '') || String(p[campo]);
  var chave = 'rep_' + tipo + '_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, valor + '|' + (p.uf || '') + '|' + (p.grupo || '')));
  if (cache.get(chave)) return true;
  cache.put(chave, '1', 600);
  return false;
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
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;                     // impede que o texto vire fórmula
  return s;
}

function resposta_(texto) {
  return ContentService.createTextOutput(texto).setMimeType(ContentService.MimeType.TEXT);
}
