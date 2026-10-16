/**
 * Alerta de pregões (e-compras.AM) e resenhas do CSC/AM — versão Google Apps Script.
 *
 * Roda na sua conta Google, a cada 1 minuto:
 *  - lê o chat público de cada pregão no e-compras.AM e manda e-mail a cada
 *    mensagem nova (todos os pregões com movimentação num e-mail só) e quando
 *    a situação do pregão muda;
 *  - quando o pregoeiro informa a data e a hora em que a sessão volta, cria um
 *    evento no seu Google Agenda nesse horário, com lembretes antes;
 *  - a cada 5 minutos, olha a página de resenhas do CSC e avisa quando sai uma
 *    resenha que cita os processos (ex.: "Convocação para Nova Sessão Pública").
 *
 * Como instalar: veja o README.md desta pasta. Em resumo: cole este código em
 * https://script.google.com, ajuste o CONFIG abaixo e rode a função `instalar`.
 */

const CONFIG = {
  // Pregões monitorados (número/ano).
  PROCESSOS: ['328/26', '400/26', '408/26'],
  // Quem recebe os e-mails, separados por vírgula. Vazio = o dono deste script.
  EMAILS: '',
  // Cria evento no Google Agenda quando o pregoeiro informa a data/hora de retomada.
  CRIAR_EVENTO_AGENDA: true,
  // Lembretes do evento (minutos antes). Aparecem no celular pelo app Google Agenda.
  LEMBRETES_MIN: [60, 15],
  // Seg a sex, nesse horário de Manaus, o chat é lido a cada 1 minuto.
  // Fora dele, a cada 15 minutos (a conta grátis do Google tem 90 min de execução por dia).
  HORARIO_COMERCIAL: { inicio: 8, fim: 18 },
};

const BASE = 'https://www.e-compras.am.gov.br/publico/';
const PAGINA_RESENHAS = 'https://www.csc.am.gov.br/site/resenhas';
const COLUNAS = ['null', 'edital', 'cod_ug', 'objeto', 'status', 'processo', 'rp',
  'tipo_edital', 'id_edital', 'id_modalidade', 'id_status', 'modalidade'];
const IMPORTANTE = new RegExp(
  'retom|reabert|reinici|prosseguimento|suspen|adia|prorrog|nova data|remarc' +
  '|a partir das|\\d{1,2} ?h ?\\d{0,2}|\\d{1,2}:\\d{2}|\\d{2}/\\d{2}/\\d{4}' +
  '|sessao do chat aberta|recurso|contrarraz|habilit|vencedor|adjudic|homolog' +
  '|convoca|desclassific|diligencia|fracass|desert|revog|anula|cancel|prazo');
const RETOMADA = /retom|reabert|reinici|prosseguimento|continuidade|adiad|remarcad|nova data/;

// ---------------------------------------------------------------- instalação

/** Rode uma vez: cria o gatilho de 1 em 1 minuto e marca o histórico atual como lido. */
function instalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'verificar') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('verificar').timeBased().everyMinutes(1).create();

  const props = PropertiesService.getScriptProperties();
  const linhas = ['O alerta de pregões está instalado e confere o chat a cada 1 minuto.', ''];
  CONFIG.PROCESSOS.forEach(function (processo) {
    const pregao = buscarPregao(processo);
    if (!pregao) {
      linhas.push(processo + ': não encontrado no e-compras.AM.');
      return;
    }
    salvarPregao(props, processo, pregao);
    const mensagens = lerChat(pregao.id, 0);
    props.setProperty('chat_' + pregao.id, JSON.stringify(mensagens.map(function (m) { return m.chave; })));
    linhas.push(pregao.edital + ' - ' + pregao.objeto);
    linhas.push('  Situação: ' + pregao.status);
    // Se o pregoeiro já marcou uma retomada futura, já põe na agenda.
    const proxima = proximaRetomada(mensagens);
    if (proxima) {
      linhas.push('  Próxima sessão informada no chat: ' + proxima.rotulo);
      const evento = criarEvento(pregao, proxima, proxima.mensagem);
      if (evento) linhas.push('  ' + evento);
    }
    linhas.push('');
  });
  props.setProperty('resenhas_vistas', JSON.stringify(lerResenhas().map(function (r) { return r.chave; })));
  linhas.push('Também olho a página de resenhas do CSC a cada 5 minutos.');
  enviar('[Alerta e-compras] Alerta instalado', linhas.join('\n'));
}

/** Para tudo (apaga o gatilho). */
function desinstalar() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

// ---------------------------------------------------------------- verificação

/** Chamado pelo gatilho a cada minuto. */
function verificar() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return; // a rodada anterior ainda está trabalhando
  try {
    const agora = new Date();
    const partes = Utilities.formatDate(agora, 'America/Manaus', 'u H m').split(' ').map(Number);
    const diaUtil = partes[0] <= 5;
    const comercial = diaUtil && partes[1] >= CONFIG.HORARIO_COMERCIAL.inicio && partes[1] < CONFIG.HORARIO_COMERCIAL.fim;
    if (!comercial && partes[2] % 15 !== 0) return;
    verificarChat(partes[2] % 30 === 0); // a situação do pregão é conferida a cada 30 min
    if (partes[2] % 5 === 0) verificarResenhas();
  } finally {
    lock.releaseLock();
  }
}

function verificarChat(atualizarSituacao) {
  const props = PropertiesService.getScriptProperties();
  const movimentos = [];
  const parados = [];
  const salvar = [];

  CONFIG.PROCESSOS.forEach(function (processo) {
    try {
      let pregao = JSON.parse(props.getProperty('pregao_' + processo) || 'null');
      let statusAntes = pregao ? pregao.status : null;
      if (!pregao || atualizarSituacao) {
        const atual = buscarPregao(processo);
        if (atual) pregao = atual;
      }
      if (!pregao) return;
      if (statusAntes === null) statusAntes = pregao.status;

      const mensagens = lerChat(pregao.id);
      const salvas = props.getProperty('chat_' + pregao.id);
      const vistas = salvas ? JSON.parse(salvas) : mensagens.map(function (m) { return m.chave; });
      const novas = mensagens.filter(function (m) { return vistas.indexOf(m.chave) < 0; });
      const chaves = mensagens.map(function (m) { return m.chave; });

      if (novas.length || statusAntes !== pregao.status) {
        movimentos.push({ processo: processo, pregao: pregao, novas: novas, statusAntes: statusAntes, chaves: chaves });
      } else {
        parados.push(pregao);
        salvar.push([processo, pregao, chaves]);
      }
    } catch (erro) {
      console.log(processo + ': e-compras.AM indisponível agora (' + erro + ')');
    }
  });

  if (movimentos.length) {
    const alerta = montarAlerta(movimentos, parados);
    try {
      enviar(alerta.assunto, alerta.corpo);
      movimentos.forEach(function (m) { salvar.push([m.processo, m.pregao, m.chaves]); });
    } catch (erro) {
      console.log('Falha ao enviar e-mail: ' + erro); // não marca como visto: tenta de novo
    }
  }
  salvar.forEach(function (s) {
    salvarPregao(props, s[0], s[1]);
    props.setProperty('chat_' + s[1].id, JSON.stringify(s[2]));
  });
}

function verificarResenhas() {
  const props = PropertiesService.getScriptProperties();
  let resenhas;
  try {
    resenhas = lerResenhas();
  } catch (erro) {
    console.log('Site do CSC indisponível agora (' + erro + ')');
    return;
  }
  if (!resenhas.length) return;
  const salvas = props.getProperty('resenhas_vistas');
  const vistas = salvas ? JSON.parse(salvas) : resenhas.map(function (r) { return r.chave; });
  const novas = resenhas.filter(function (r) { return vistas.indexOf(r.chave) < 0; });

  novas.reverse().forEach(function (r) {
    const citados = CONFIG.PROCESSOS.filter(function (p) { return regraProcesso(p).test(r.titulo + ' ' + r.resumo); });
    if (citados.length) {
      enviar('[Alerta CSC] ' + r.titulo + ' cita ' + citados.join(', '), [
        'Nova resenha publicada pelo CSC/AM citando: ' + citados.join(', '),
        '',
        'Resenha: ' + r.titulo,
        'Data: ' + r.data,
        'PDF: ' + r.pdf,
        '',
        'Processos da resenha:',
        r.resumo,
        '',
        'Abra o PDF para ver o que diz sobre cada processo (ex.: "Convocação para Nova Sessão Pública" com data e hora).',
      ].join('\n'));
    }
  });
  props.setProperty('resenhas_vistas', JSON.stringify(resenhas.map(function (r) { return r.chave; }).slice(0, 400)));
}

// ---------------------------------------------------------------- e-compras.AM

function buscar(url, payload) {
  const opcoes = { muteHttpExceptions: true, followRedirects: true };
  if (payload) {
    opcoes.method = 'post';
    opcoes.payload = payload;
  }
  let ultimoErro;
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const resposta = UrlFetchApp.fetch(url, opcoes);
      if (resposta.getResponseCode() === 200) return resposta.getContentText('windows-1252');
      ultimoErro = 'HTTP ' + resposta.getResponseCode();
    } catch (erro) {
      ultimoErro = erro; // o e-compras derruba conexões com frequência
    }
    Utilities.sleep(1000);
  }
  throw new Error(String(ultimoErro));
}

function buscarPregao(processo) {
  const partes = processo.trim().split('/');
  const numero = parseInt(partes[0], 10);
  const ano = partes[1].slice(-2);
  const dados = {
    'periodo': '20' + ano, 'draw': '1', 'start': '0', 'length': '50',
    'order[0][column]': '1', 'order[0][dir]': 'desc',
    'search[value]': numero + '/' + ano, 'search[regex]': 'false',
  };
  COLUNAS.forEach(function (coluna, i) {
    dados['columns[' + i + '][data]'] = coluna;
    dados['columns[' + i + '][searchable]'] = 'true';
  });
  const resposta = JSON.parse(buscar(BASE + 'qry/qry_licitacoes_todas.asp', dados));
  const regra = new RegExp('^PE\\s+0*' + numero + '/(20)?' + ano + '$');
  const linha = (resposta.data || []).filter(function (l) { return regra.test(String(l.edital || '').trim()); })[0];
  if (!linha) return null;
  return {
    id: String(linha.id_edital),
    edital: String(linha.edital).trim(),
    status: String(linha.status || '').trim(),
    objeto: String(linha.objeto || '').trim(),
  };
}

function salvarPregao(props, processo, pregao) {
  props.setProperty('pregao_' + processo, JSON.stringify(pregao));
}

/** limite = quantas mensagens recentes ler (0 = o histórico todo). */
function lerChat(ident, limite) {
  if (limite === undefined) limite = 30;
  return lerChatHtml(buscar(BASE + 'qry/qry_acompanhamento_mensagem_chat.asp?ident=' + ident + '&limite=' + limite));
}

/** Mensagens do chat, da mais nova para a mais antiga. */
function lerChatHtml(pagina) {
  const mensagens = [];
  const vistas = {};
  (pagina.match(/<tr[\s\S]*?<\/tr>/gi) || []).forEach(function (linha) {
    const celulas = (linha.match(/<td[\s\S]*?<\/td>/gi) || []).map(limparHtml);
    if (celulas.length < 2) return;
    const cab = celulas[0].match(/^(\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2})\s*-\s*(.*?)\s*:?$/);
    if (!cab) return;
    const chave = hash(cab[1] + '|' + cab[2] + '|' + celulas[1]);
    if (vistas[chave]) return; // o e-compras às vezes repete a linha no mesmo segundo
    vistas[chave] = true;
    mensagens.push({ hora: cab[1], autor: cab[2], texto: celulas[1], chave: chave });
  });
  return mensagens;
}

// ---------------------------------------------------------------- resenhas do CSC

function lerResenhas() {
  const resposta = UrlFetchApp.fetch(PAGINA_RESENHAS, { muteHttpExceptions: true });
  if (resposta.getResponseCode() !== 200) throw new Error('HTTP ' + resposta.getResponseCode());
  return lerResenhasHtml(resposta.getContentText('UTF-8'));
}

function lerResenhasHtml(pagina) {
  const resenhas = [];
  pagina.split('<h3').slice(1).forEach(function (bloco) {
    const titulo = bloco.match(/>([\s\S]*?)<\/h3>/);
    if (!titulo || titulo[1].toLowerCase().indexOf('resenha') < 0) return;
    const data = bloco.match(/<span[^>]*>([\s\S]*?)<\/span>/);
    const resumo = bloco.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const pdf = bloco.match(/href="([^"]+\.pdf)"/i);
    const url = pdf ? 'https://www.csc.am.gov.br' + pdf[1].replace(/^https?:\/\/[^/]+/, '') : '';
    resenhas.push({
      titulo: limparHtml(titulo[1]),
      data: data ? limparHtml(data[1]) : '',
      resumo: resumo ? limparHtml(resumo[1]) : '',
      pdf: url,
      chave: hash(url || limparHtml(titulo[1])),
    });
  });
  return resenhas;
}

function regraProcesso(processo) {
  const partes = processo.trim().split('/');
  return new RegExp('(?<![\\d.,/])0*' + parseInt(partes[0], 10) + '\\s*/\\s*(?:20)?' + partes[1].slice(-2) + '(?!\\d)');
}

// ---------------------------------------------------------------- retomada e agenda

function ehImportante(msg) {
  const texto = semAcento(msg.texto);
  return texto !== 'sessao do chat fechada' && IMPORTANTE.test(texto);
}

/**
 * "será retomada a partir das 14h30min (horário de Brasília), do dia 15/10/2026"
 * -> { inicio: Date, rotulo: '15/10/2026 às 14h30, horário de Brasília' }.
 * Só devolve algo quando a mensagem traz data (ou "hoje"/"amanhã") e hora.
 */
function extrairRetomada(textoOriginal, referencia) {
  const texto = semAcento(textoOriginal);
  if (!RETOMADA.test(texto)) return null;
  const hora = texto.match(/\b(\d{1,2})(?:h(\d{2})?(?:min)?\b|:(\d{2}))/);
  if (!hora) return null;
  const hh = parseInt(hora[1], 10);
  const mm = parseInt(hora[2] || hora[3] || '0', 10);
  if (hh > 23 || mm > 59) return null;

  const depois = texto.slice(hora.index, hora.index + 40);
  const tz = /manaus/.test(depois) ? 'America/Manaus' : 'America/Sao_Paulo';
  const cidade = tz === 'America/Manaus' ? 'Manaus' : 'Brasília';

  let dia, mes, ano;
  const data = texto.match(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?(?![\d/])/);
  const hojeTz = Utilities.formatDate(referencia, tz, 'dd/MM/yyyy').split('/').map(Number);
  if (data) {
    dia = parseInt(data[1], 10);
    mes = parseInt(data[2], 10);
    ano = data[3] ? parseInt(data[3], 10) : hojeTz[2];
  } else if (/\bamanha\b/.test(texto) || /\bhoje\b/.test(texto)) {
    const base = new Date(referencia.getTime() + (/\bamanha\b/.test(texto) ? 86400000 : 0));
    const d = Utilities.formatDate(base, tz, 'dd/MM/yyyy').split('/').map(Number);
    dia = d[0]; mes = d[1]; ano = d[2];
  } else {
    return null;
  }
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;

  const pad = function (n) { return (n < 10 ? '0' : '') + n; };
  const inicio = Utilities.parseDate(ano + '-' + pad(mes) + '-' + pad(dia) + ' ' + pad(hh) + ':' + pad(mm), tz, 'yyyy-MM-dd HH:mm');
  return {
    inicio: inicio,
    rotulo: pad(dia) + '/' + pad(mes) + '/' + ano + ' às ' + pad(hh) + 'h' + pad(mm) + ', horário de ' + cidade,
  };
}

/** A retomada futura mais recente anunciada no chat (pregoeiro ou sistema). */
function proximaRetomada(mensagens) {
  const agora = new Date();
  for (let i = 0; i < mensagens.length; i++) {
    const m = mensagens[i];
    if (!/^(pregoeiro|sistema)$/i.test(m.autor)) continue;
    const r = extrairRetomada(m.texto, dataDaMensagem(m.hora));
    if (r) {
      if (r.inicio > agora) { r.mensagem = m; return r; }
      return null; // a última retomada anunciada já passou
    }
  }
  return null;
}

function dataDaMensagem(hora) {
  return Utilities.parseDate(hora, 'America/Manaus', 'dd/MM/yyyy HH:mm:ss');
}

/** Cria o evento na agenda (se ainda não existir) e devolve uma frase para o e-mail. */
function criarEvento(pregao, retomada, mensagem) {
  if (!CONFIG.CRIAR_EVENTO_AGENDA || retomada.inicio <= new Date()) return '';
  const agenda = CalendarApp.getDefaultCalendar();
  const titulo = pregao.edital + ': retomada da sessão (e-compras)';
  const janelaIni = new Date(retomada.inicio.getTime() - 60000);
  const janelaFim = new Date(retomada.inicio.getTime() + 60000);
  const existentes = agenda.getEvents(janelaIni, janelaFim).filter(function (e) {
    return e.getTitle().indexOf(pregao.edital) >= 0;
  });
  if (existentes.length) return 'Já estava na sua agenda: ' + retomada.rotulo + '.';
  const evento = agenda.createEvent(titulo, retomada.inicio, new Date(retomada.inicio.getTime() + 3600000), {
    description: [
      pregao.edital + ' - ' + pregao.objeto,
      '',
      'Mensagem no chat (' + mensagem.hora + ' - ' + mensagem.autor + '):',
      mensagem.texto,
      '',
      'Acompanhamento: ' + BASE + 'licitacoes_acompanhamento.asp?ident=' + pregao.id,
    ].join('\n'),
  });
  evento.removeAllReminders();
  CONFIG.LEMBRETES_MIN.forEach(function (min) { evento.addPopupReminder(min); });
  return 'Evento criado na sua agenda: ' + retomada.rotulo + ', com lembretes ' +
    CONFIG.LEMBRETES_MIN.join(' e ') + ' minutos antes.';
}

// ---------------------------------------------------------------- e-mail

function montarAlerta(movimentos, parados) {
  const resumo = [];
  const texto = [
    'Movimentação no chat dos pregões monitorados no e-compras.AM.',
    'Mensagens da mais recente para a mais antiga, no horário do e-compras.',
    'As marcadas com >> são as mais importantes (retomada, suspensão, prazos, resultado...).',
    '',
  ];
  movimentos.forEach(function (mov) {
    const pregao = mov.pregao;
    const eventos = [];
    const agenda = [];
    if (mov.statusAntes !== pregao.status) eventos.push('situação mudou para ' + pregao.status);
    if (mov.novas.some(function (m) { return semAcento(m.texto) === 'sessao do chat aberta'; })) eventos.push('sessão reaberta');
    for (let i = 0; i < mov.novas.length; i++) {
      const m = mov.novas[i];
      if (!/^(pregoeiro|sistema)$/i.test(m.autor)) continue;
      const r = extrairRetomada(m.texto, dataDaMensagem(m.hora));
      if (r) {
        eventos.push('retomada ' + r.rotulo);
        try {
          const frase = criarEvento(pregao, r, m);
          if (frase) agenda.push(frase);
        } catch (erro) {
          agenda.push('Não consegui criar o evento na agenda (' + erro + ').');
        }
        break;
      }
    }
    if (!eventos.length) eventos.push(mov.novas.length + (mov.novas.length === 1 ? ' mensagem nova' : ' mensagens novas'));
    resumo.push(pregao.edital + ' (' + eventos.join('; ') + ')');

    texto.push('======================================================================');
    texto.push(pregao.edital + ' - ' + pregao.objeto);
    texto.push('Situação: ' + pregao.status + (mov.statusAntes !== pregao.status ? ' (antes: ' + mov.statusAntes + ')' : ''));
    texto.push('Acompanhamento: ' + BASE + 'licitacoes_acompanhamento.asp?ident=' + pregao.id);
    agenda.forEach(function (a) { texto.push('AGENDA: ' + a); });
    texto.push('');
    if (!mov.novas.length) texto.push('Sem mensagens novas no chat.');
    mov.novas.forEach(function (m) {
      texto.push((ehImportante(m) ? '>> ' : '   ') + m.hora + ' - ' + m.autor + ': ' + m.texto);
    });
    texto.push('');
  });
  if (parados.length) {
    texto.push('======================================================================');
    texto.push('Sem movimentação desde o último aviso:');
    parados.forEach(function (p) { texto.push('- ' + p.edital + ': ' + p.status); });
  }
  return {
    assunto: '[Alerta e-compras] Movimentação no chat: ' + resumo.join(', '),
    corpo: texto.join('\n'),
  };
}

function enviar(assunto, corpo) {
  const destino = CONFIG.EMAILS.trim() || Session.getEffectiveUser().getEmail();
  MailApp.sendEmail({ to: destino, subject: assunto, body: corpo });
}

// ---------------------------------------------------------------- utilidades

function limparHtml(trecho) {
  return trecho
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); })
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function semAcento(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function hash(texto) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_1, texto, Utilities.Charset.UTF_8);
  return bytes.slice(0, 6).map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}

/** Teste: manda um e-mail com as últimas mensagens de todos os pregões (não altera nada). */
function testar() {
  const movimentos = [];
  CONFIG.PROCESSOS.forEach(function (processo) {
    const pregao = buscarPregao(processo);
    if (pregao) movimentos.push({ pregao: pregao, novas: lerChat(pregao.id).slice(0, 10), statusAntes: pregao.status });
  });
  const salvo = CONFIG.CRIAR_EVENTO_AGENDA;
  CONFIG.CRIAR_EVENTO_AGENDA = false; // o teste não mexe na agenda
  const alerta = montarAlerta(movimentos, []);
  CONFIG.CRIAR_EVENTO_AGENDA = salvo;
  enviar('[TESTE] ' + alerta.assunto, alerta.corpo);
}
