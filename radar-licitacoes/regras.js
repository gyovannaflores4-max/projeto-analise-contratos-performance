// Regras da Gestão de Prazos: datas, dias úteis, alertas, leitura de planilhas, mensagens dos portais e lances.
// O mesmo arquivo roda na página (gestao.html, como window.Regras) e no servidor (require("../regras.js")).
// Todas as datas são do horário de Brasília. Datas simples usam "AAAA-MM-DD"; data e hora usam "AAAA-MM-DDTHH:MM".
(function (raiz, fabrica) {
  if (typeof module === "object" && module.exports) module.exports = fabrica();
  else raiz.Regras = fabrica();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DIA = 86400000, HORA = 3600000, FUSO = -3 * HORA;

  /* ---------- Datas ---------- */
  const pad = n => String(n).padStart(2, "0");
  const ehData = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const ehDataHora = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s);

  function agoraBrasilia(ms = Date.now()) { return new Date(ms + FUSO).toISOString().slice(0, 16); }
  function hojeBrasilia(ms = Date.now()) { return agoraBrasilia(ms).slice(0, 10); }
  function utc(data) { const [a, m, d] = data.slice(0, 10).split("-").map(Number); return Date.UTC(a, m - 1, d); }
  function iso(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function somaDias(data, n) { return iso(utc(data) + n * DIA); }
  function diffDias(de, ate) { return Math.round((utc(ate) - utc(de)) / DIA); }
  function somaMeses(data, n) {
    const [a, m, d] = data.split("-").map(Number);
    const alvo = new Date(Date.UTC(a, m - 1 + n, 1));
    const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
    alvo.setUTCDate(Math.min(d, ultimo));
    return iso(alvo.getTime());
  }
  // "AAAA-MM-DDTHH:MM" de Brasília -> milissegundos
  function msBrasilia(dataHora) {
    if (ehData(dataHora)) dataHora += "T23:59";
    const [d, h] = dataHora.split("T");
    const [hh, mm] = h.split(":").map(Number);
    return utc(d) + hh * HORA + mm * 60000 - FUSO;
  }
  function formatarData(s) {
    if (!s) return "";
    const [a, m, d] = s.slice(0, 10).split("-");
    return d + "/" + m + "/" + a + (ehDataHora(s) ? " às " + s.slice(11, 16) : "");
  }
  const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  function diaSemana(data) { return SEMANA[new Date(utc(data)).getUTCDay()]; }

  // Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher)
  function pascoa(ano) {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return ano + "-" + pad(mes) + "-" + pad(dia);
  }
  // Feriados nacionais. Pontos facultativos (Carnaval, Corpus Christi) e feriados locais não entram:
  // assim o prazo calculado é o mais curto possível, nunca depois do prazo real.
  const cacheFeriados = {};
  function feriadosNacionais(ano) {
    if (cacheFeriados[ano]) return cacheFeriados[ano];
    const fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];
    if (ano >= 2024) fixos.push("11-20");
    const lista = fixos.map(f => ano + "-" + f);
    lista.push(somaDias(pascoa(ano), -2)); // Sexta-feira Santa
    return (cacheFeriados[ano] = new Set(lista));
  }
  function ehDiaUtil(data, extras) {
    const dow = new Date(utc(data)).getUTCDay();
    if (dow === 0 || dow === 6) return false;
    if (feriadosNacionais(Number(data.slice(0, 4))).has(data)) return false;
    return !(extras && extras.includes(data));
  }
  // Conta n dias úteis depois da data (exclui o dia do começo e inclui o do vencimento, como no art. 183 da Lei 14.133).
  function somaDiasUteis(data, n, extras) {
    let d = data.slice(0, 10), passo = n >= 0 ? 1 : -1, faltam = Math.abs(n);
    while (faltam > 0) { d = somaDias(d, passo); if (ehDiaUtil(d, extras)) faltam--; }
    return d;
  }

  /* ---------- Catálogos ---------- */
  const AVISOS_PADRAO = {
    vencimento: [120, 90, 60, 30, 15, 7, 0],
    renovacao: [30, 15, 7, 3, 1, 0],
    reajuste: [60, 30, 15, 7, 0],
    documento: [30, 15, 7, 0],
    sessao: [3, 1, 0],
    prazoHoras: [72, 24, 4, 1]
  };

  // Validade e antecedência típicas. A validade real é a que está impressa em cada certidão.
  const TIPOS_DOCUMENTO = [
    { id: "cnd_federal", nome: "CND Federal (Receita/PGFN)", validadeDias: 180, avisos: [30, 15, 7, 0] },
    { id: "crf_fgts", nome: "CRF do FGTS", validadeDias: 30, avisos: [7, 3, 1, 0] },
    { id: "cndt", nome: "CNDT (Justiça do Trabalho)", validadeDias: 180, avisos: [30, 15, 7, 0] },
    { id: "estadual", nome: "Certidão estadual", validadeDias: 90, avisos: [20, 10, 5, 0] },
    { id: "municipal", nome: "Certidão municipal", validadeDias: 90, avisos: [20, 10, 5, 0] },
    { id: "falencia", nome: "Certidão de falência e recuperação judicial", validadeDias: 90, avisos: [15, 7, 3, 0] },
    { id: "sicaf", nome: "SICAF (cadastro)", validadeDias: 365, avisos: [30, 15, 7, 0] },
    { id: "alvara", nome: "Alvará de funcionamento", validadeDias: 365, avisos: [90, 60, 30, 15, 0] },
    { id: "sanitaria", nome: "Licença sanitária", validadeDias: 365, avisos: [90, 60, 30, 15, 0] },
    { id: "conselho", nome: "Registro no conselho (CRM/CRF/COREN)", validadeDias: 365, avisos: [60, 30, 15, 0] },
    { id: "balanco", nome: "Balanço patrimonial", validadeDias: 365, avisos: [60, 30, 15, 0] },
    { id: "garantia", nome: "Garantia contratual / seguro", validadeDias: 365, avisos: [60, 30, 15, 7, 0] },
    { id: "atestado", nome: "Atestado de capacidade técnica", validadeDias: null, avisos: [30, 0] },
    { id: "outro", nome: "Outro documento", validadeDias: null, avisos: [30, 15, 7, 0] }
  ];
  const tipoDocumento = id => TIPOS_DOCUMENTO.find(t => t.id === id) || TIPOS_DOCUMENTO[TIPOS_DOCUMENTO.length - 1];

  // Prazos de licitação (Lei 14.133/2021). "dias" positivos contam depois do ato; negativos contam antes da sessão.
  const TIPOS_PRAZO = [
    { id: "intencao", nome: "Intenção de recurso", regra: "Manifestar no sistema logo após a decisão, no prazo aberto pelo pregoeiro (art. 165, §1º)." },
    { id: "recurso", nome: "Razões do recurso", diasUteis: 3, regra: "3 dias úteis da intimação ou da lavratura da ata (art. 165, I)." },
    { id: "contrarrazoes", nome: "Contrarrazões", diasUteis: 3, regra: "3 dias úteis da intimação ou da divulgação do recurso (art. 165, §4º)." },
    { id: "impugnacao", nome: "Impugnação do edital", diasUteisAntes: 3, regra: "Até 3 dias úteis antes da abertura (art. 164)." },
    { id: "esclarecimento", nome: "Pedido de esclarecimento", diasUteisAntes: 3, regra: "Até 3 dias úteis antes da abertura (art. 164)." },
    { id: "proposta", nome: "Envio da proposta", regra: "Até a abertura da sessão, pelo portal." },
    { id: "proposta_ajustada", nome: "Proposta ajustada / anexos", regra: "No prazo que o pregoeiro fixar no chat (costuma ser de 2 horas)." },
    { id: "habilitacao", nome: "Documentos de habilitação / diligência", regra: "No prazo que o pregoeiro fixar no chat." },
    { id: "amostra", nome: "Amostra / prova de conceito", regra: "No prazo do edital." },
    { id: "assinatura", nome: "Assinatura do contrato ou ata", regra: "No prazo da convocação (edital)." },
    { id: "garantia", nome: "Garantia contratual", regra: "No prazo do edital ou do contrato." },
    { id: "outro", nome: "Outro prazo", regra: "" }
  ];
  const tipoPrazo = id => TIPOS_PRAZO.find(t => t.id === id) || TIPOS_PRAZO[TIPOS_PRAZO.length - 1];

  const STATUS_LICITACAO = [
    { id: "analise", nome: "Em análise", ativa: true },
    { id: "proposta", nome: "Proposta enviada", ativa: true },
    { id: "disputa", nome: "Em disputa (lances)", ativa: true },
    { id: "julgamento", nome: "Aceitação / julgamento", ativa: true },
    { id: "habilitacao", nome: "Habilitação", ativa: true },
    { id: "recurso", nome: "Fase recursal", ativa: true },
    { id: "adjudicada", nome: "Adjudicada", ativa: true },
    { id: "homologada", nome: "Homologada", ativa: true },
    { id: "assinatura", nome: "Contrato / ata a assinar", ativa: true },
    { id: "suspensa", nome: "Suspensa", ativa: true },
    { id: "ganha", nome: "Ganha (contrato assinado)", ativa: false },
    { id: "perdida", nome: "Perdida", ativa: false },
    { id: "fracassada", nome: "Fracassada / deserta", ativa: false },
    { id: "revogada", nome: "Revogada / anulada", ativa: false },
    { id: "desistencia", nome: "Não participamos", ativa: false }
  ];
  const statusLicitacao = id => STATUS_LICITACAO.find(s => s.id === id) || STATUS_LICITACAO[0];

  const PORTAIS = ["Compras.gov.br", "BLL", "BNC", "Licitações-e", "Portal de Compras Públicas", "Licitanet", "Licitar Digital", "Compras AM", "Outro"];

  /* ---------- Leitura de valores de planilhas ---------- */
  // Aceita "15/01/2027", "15-01-27", "2027-01-15", objetos Date e números de série do Excel.
  function lerData(v, comHora) {
    if (v === null || v === undefined || v === "") return "";
    if (v instanceof Date && !isNaN(v)) {
      const s = new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString();
      return comHora ? s.slice(0, 16) : s.slice(0, 10);
    }
    if (typeof v === "number" && v > 20000 && v < 80000) {
      const ms = Math.round((v - 25569) * DIA);
      const s = new Date(ms).toISOString();
      return comHora && v % 1 ? s.slice(0, 16) : s.slice(0, 10);
    }
    const t = String(v).trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (m) return m[1] + "-" + m[2] + "-" + m[3] + (comHora && m[4] ? "T" + m[4] + ":" + m[5] : "");
    m = t.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})(?:\D+(\d{1,2})[:h](\d{2})?)?/);
    if (m) {
      let a = Number(m[3]); if (a < 100) a += 2000;
      const d = Number(m[1]), mes = Number(m[2]);
      if (mes < 1 || mes > 12 || d < 1 || d > 31) return "";
      const data = a + "-" + pad(mes) + "-" + pad(d);
      return comHora && m[4] ? data + "T" + pad(m[4]) + ":" + pad(m[5] || 0) : data;
    }
    return "";
  }
  // "R$ 1.234.567,89" -> 1234567.89 ; "1234.5" -> 1234.5
  function lerNumero(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    let t = String(v ?? "").replace(/[^\d,.-]/g, "");
    if (!t) return null;
    if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, ""); // "950.000" é novecentos e cinquenta mil
    const n = Number(t);
    return isFinite(n) ? n : null;
  }
  // "120, 90, 30" -> [120, 90, 30] (ordem decrescente, sem repetição)
  function lerAvisos(v, padrao) {
    const lista = Array.isArray(v) ? v : String(v ?? "").split(/[^\d]+/);
    const nums = [...new Set(lista.map(x => parseInt(x, 10)).filter(n => n >= 0 && n <= 3650))].sort((a, b) => b - a);
    return nums.length ? nums : (padrao || []).slice();
  }
  const lerEmails = v => String(v || "").split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(s => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s));

  // CSV com ; ou , e aspas
  function lerCSV(texto) {
    texto = String(texto).replace(/^\uFEFF/, "");
    const primeira = texto.split(/\r?\n/)[0] || "";
    const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ";" : ",";
    const linhas = []; let campo = "", linha = [], aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (aspas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
        else if (c === '"') aspas = false;
        else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === sep) { linha.push(campo); campo = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && texto[i + 1] === "\n") i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = "";
      } else campo += c;
    }
    if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
    const cab = (linhas.shift() || []).map(s => s.trim());
    return linhas.filter(l => l.some(c => String(c).trim())).map(l => Object.fromEntries(cab.map((h, i) => [h, (l[i] ?? "").trim()])));
  }
  function gerarCSV(linhas, colunas) {
    const esc = v => { const s = v === null || v === undefined ? "" : String(v); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return "\uFEFF" + [colunas.map(c => esc(c[1])).join(";")].concat(linhas.map(l => colunas.map(c => esc(typeof c[0] === "function" ? c[0](l) : l[c[0]])).join(";"))).join("\r\n");
  }

  // Nomes de coluna aceitos na importação de planilhas (sem acento, minúsculas).
  const COLUNAS = {
    contratos: {
      numero: ["contrato", "numero", "n contrato", "numero do contrato", "n do contrato", "no contrato"],
      cliente: ["cliente", "orgao", "contratante", "orgao contratante", "tomador"],
      objeto: ["objeto", "descricao", "servico", "servicos"],
      inicio: ["inicio", "inicio vigencia", "inicio da vigencia", "data inicio", "assinatura"],
      fim: ["fim", "vencimento", "fim vigencia", "fim da vigencia", "termino", "data fim", "validade", "vigencia ate"],
      valor: ["valor", "valor total", "valor global", "valor do contrato", "valor anual"],
      responsavel: ["responsavel", "gestor", "fiscal"],
      emails: ["email", "emails", "e-mail", "e-mails"],
      renovacaoDiasAntes: ["dias para renovacao", "antecedencia renovacao", "renovacao dias", "prazo renovacao dias", "dias renovacao"],
      renovacaoData: ["prazo renovacao", "data renovacao", "solicitar renovacao ate", "pedido de renovacao"],
      reajusteDataBase: ["data base", "data-base", "data base reajuste", "database", "aniversario", "data do orcamento"],
      reajusteData: ["prazo reajuste", "data reajuste", "solicitar reajuste ate", "pedido de reajuste"],
      reajusteIndice: ["indice", "indice reajuste", "indice de reajuste"],
      obs: ["observacao", "observacoes", "obs"]
    },
    documentos: {
      nome: ["documento", "nome", "certidao", "descricao"],
      tipo: ["tipo"],
      emissor: ["emissor", "orgao emissor", "orgao"],
      numero: ["numero", "n", "codigo", "codigo de controle"],
      emissao: ["emissao", "data emissao", "emitida em", "data de emissao"],
      validade: ["validade", "vencimento", "valida ate", "data validade", "data de validade", "vence em"],
      responsavel: ["responsavel"],
      emails: ["email", "emails", "e-mail"],
      avisos: ["avisos", "antecedencia", "dias de aviso"],
      link: ["link", "site", "onde emitir"],
      obs: ["observacao", "observacoes", "obs"]
    },
    licitacoes: {
      orgao: ["orgao", "cliente", "entidade", "orgao licitante"],
      numero: ["numero", "pregao", "edital", "n pregao", "licitacao", "n edital", "numero do pregao"],
      processo: ["processo", "n processo"],
      portal: ["portal", "plataforma", "sistema"],
      link: ["link", "url"],
      objeto: ["objeto", "descricao"],
      valorEstimado: ["valor", "valor estimado", "valor de referencia"],
      sessao: ["sessao", "data sessao", "abertura", "data abertura", "data da sessao", "data"],
      status: ["status", "situacao", "fase"],
      uasg: ["uasg"],
      responsavel: ["responsavel"],
      obs: ["observacao", "observacoes", "obs"]
    }
  };
  const semAcento = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const chaveColuna = s => semAcento(s).replace(/[º°ª.#:()_]/g, " ").replace(/[^a-z0-9-]+/g, " ").replace(/\s+/g, " ").trim();
  function mapearColunas(cabecalhos, colecao) {
    const mapa = {}, tabela = COLUNAS[colecao] || {};
    for (const h of cabecalhos) {
      const k = chaveColuna(h);
      for (const [campo, nomes] of Object.entries(tabela)) if (!mapa[campo] && nomes.includes(k)) { mapa[campo] = h; break; }
    }
    return mapa;
  }
  function statusPorTexto(t) {
    const s = semAcento(t);
    if (!s) return "analise";
    const achado = STATUS_LICITACAO.find(x => semAcento(x.nome) === s || x.id === s);
    if (achado) return achado.id;
    if (/ganh|vencemos|venceu|assinad/.test(s)) return "ganha";
    if (/perd|nao venc/.test(s)) return "perdida";
    if (/desert|fracass/.test(s)) return "fracassada";
    if (/revog|anula|cancel/.test(s)) return "revogada";
    if (/suspen/.test(s)) return "suspensa";
    if (/recurso|contrarraz/.test(s)) return "recurso";
    if (/homolog/.test(s)) return "homologada";
    if (/adjudic/.test(s)) return "adjudicada";
    if (/habilit/.test(s)) return "habilitacao";
    if (/disput|lance/.test(s)) return "disputa";
    if (/propost|enviad|cadastrad/.test(s)) return "proposta";
    if (/nao particip|desist|declin/.test(s)) return "desistencia";
    return "analise";
  }
  function tipoDocumentoPorTexto(t) {
    const s = semAcento(t);
    if (/fgts|crf/.test(s)) return "crf_fgts";
    if (/trabalhist|cndt/.test(s)) return "cndt";
    if (/federal|receita|pgfn|uniao/.test(s)) return "cnd_federal";
    if (/estadual|sefaz|icms/.test(s)) return "estadual";
    if (/municipal|iss|prefeitura/.test(s)) return "municipal";
    if (/falenc|recupera/.test(s)) return "falencia";
    if (/sicaf/.test(s)) return "sicaf";
    if (/sanitari|vigilancia|visa/.test(s)) return "sanitaria";
    if (/alvara|funcionamento/.test(s)) return "alvara";
    if (/crm|coren|conselho|crf-|cremesp/.test(s)) return "conselho";
    if (/balanc/.test(s)) return "balanco";
    if (/garantia|seguro|caucao/.test(s)) return "garantia";
    if (/atestado/.test(s)) return "atestado";
    return "outro";
  }
  // Converte uma linha da planilha em registro da coleção.
  function linhaParaRegistro(linha, colecao, mapa) {
    const v = campo => (mapa[campo] ? linha[mapa[campo]] : undefined);
    const r = {};
    for (const campo of Object.keys(COLUNAS[colecao])) {
      const bruto = v(campo);
      if (bruto === undefined || bruto === "") continue;
      if (/^(inicio|fim|renovacaoData|reajusteDataBase|reajusteData|emissao|validade)$/.test(campo)) r[campo] = lerData(bruto);
      else if (campo === "sessao") r[campo] = lerData(bruto, true);
      else if (/^(valor|valorEstimado|renovacaoDiasAntes)$/.test(campo)) r[campo] = lerNumero(bruto);
      else r[campo] = String(bruto).trim();
    }
    if (colecao === "documentos") {
      r.tipo = TIPOS_DOCUMENTO.some(t => t.id === r.tipo) ? r.tipo : tipoDocumentoPorTexto((r.tipo || "") + " " + (r.nome || ""));
      if (!r.nome) r.nome = tipoDocumento(r.tipo).nome;
    }
    if (colecao === "licitacoes") {
      r.status = statusPorTexto(r.status);
      if (r.portal) r.portal = PORTAIS.find(p => semAcento(r.portal).includes(semAcento(p).split(/[ .]/)[0])) || r.portal;
    }
    return r;
  }

  /* ---------- Prazos de contratos, documentos e licitações ---------- */
  function avisosDe(cfg, chave) { return lerAvisos(cfg && cfg.avisos && cfg.avisos[chave], AVISOS_PADRAO[chave]); }

  function prazoRenovacao(c) {
    if (c.naoRenovavel || !c.fim) return null;
    if (c.renovacaoData) return c.renovacaoData;
    const n = Number(c.renovacaoDiasAntes);
    return c.renovacaoDiasAntes !== "" && c.renovacaoDiasAntes !== null && c.renovacaoDiasAntes !== undefined && isFinite(n) ? somaDias(c.fim, -n) : null;
  }
  // Próximo prazo para pedir reajuste: aniversário da data-base + dias de tolerância.
  // Mostra o ciclo atual até 30 dias depois de vencido; depois passa para o ciclo seguinte.
  function prazoReajuste(c, hoje) {
    if (c.reajusteData) return c.reajusteSolicitadoPara === c.reajusteData ? null : { prazo: c.reajusteData, aniversario: c.reajusteData };
    if (!c.reajusteDataBase) return null;
    const p = Math.max(1, Number(c.reajustePeriodicidade) || 12), apos = Number(c.reajusteDiasApos) || 0;
    for (let k = 1; k < 200; k++) {
      const aniversario = somaMeses(c.reajusteDataBase, k * p), prazo = somaDias(aniversario, apos);
      if (c.reajusteSolicitadoPara === aniversario) continue;
      if (diffDias(hoje, prazo) >= -30) return { prazo, aniversario };
    }
    return null;
  }

  const rotuloContrato = c => "Contrato " + (c.numero || "sem número") + (c.cliente ? " · " + c.cliente : "");
  const rotuloLicitacao = l => (l.numero ? l.numero : "Licitação") + (l.orgao ? " · " + l.orgao : "");

  // Lista todos os prazos acompanhados. Cada evento tem a data, as antecedências de aviso e a unidade (dias ou horas).
  function eventos(dados, hoje) {
    const cfg = dados.config || {}, lista = [];
    for (const c of dados.contratos || []) {
      if (c.situacao === "encerrado") continue;
      const base = { grupo: "contrato", refId: c.id, titulo: rotuloContrato(c), responsavel: c.responsavel || "", emails: lerEmails(c.emails), unidade: "dias" };
      if (c.fim) lista.push({ ...base, chave: "c:" + c.id + ":venc", tipo: "vencimento", descricao: "Vencimento do contrato", data: c.fim, avisos: lerAvisos(c.avisosVencimento, avisosDe(cfg, "vencimento")) });
      const ren = prazoRenovacao(c);
      if (ren && c.renovacaoSolicitadaPara !== c.fim) lista.push({ ...base, chave: "c:" + c.id + ":renov", tipo: "renovacao", descricao: "Prazo para pedir a renovação", data: ren, avisos: lerAvisos(c.avisosRenovacao, avisosDe(cfg, "renovacao")), nota: "Vencimento em " + formatarData(c.fim) });
      const rea = prazoReajuste(c, hoje);
      if (rea) lista.push({ ...base, chave: "c:" + c.id + ":reaj", tipo: "reajuste", descricao: "Prazo para pedir o reajuste" + (c.reajusteIndice ? " (" + c.reajusteIndice + ")" : ""), data: rea.prazo, aniversario: rea.aniversario, avisos: lerAvisos(c.avisosReajuste, avisosDe(cfg, "reajuste")), nota: rea.aniversario !== rea.prazo ? "Data-base anual em " + formatarData(rea.aniversario) : "" });
    }
    for (const d of dados.documentos || []) {
      if (d.situacao === "substituido" || !d.validade) continue;
      const t = tipoDocumento(d.tipo);
      lista.push({ grupo: "documento", refId: d.id, chave: "d:" + d.id, tipo: "documento", titulo: d.nome || t.nome, descricao: "Vencimento de " + (d.nome || t.nome), data: d.validade, unidade: "dias", avisos: lerAvisos(d.avisos, t.avisos || avisosDe(cfg, "documento")), responsavel: d.responsavel || "", emails: lerEmails(d.emails), link: d.link || "" });
    }
    for (const l of dados.licitacoes || []) {
      if (!statusLicitacao(l.status).ativa) continue;
      const base = { grupo: "licitacao", refId: l.id, titulo: rotuloLicitacao(l), responsavel: l.responsavel || "", emails: lerEmails(l.emails), link: l.link || "" };
      if (l.sessao && ["analise", "proposta"].includes(l.status || "analise"))
        lista.push({ ...base, chave: "l:" + l.id + ":sessao", tipo: "sessao", descricao: "Sessão pública" + (l.portal ? " no " + l.portal : ""), data: l.sessao.slice(0, 10), hora: ehDataHora(l.sessao) ? l.sessao.slice(11, 16) : "", unidade: "dias", avisos: avisosDe(cfg, "sessao") });
      for (const p of l.prazos || []) {
        if (p.feito || !p.limite) continue;
        lista.push({ ...base, chave: "l:" + l.id + ":p:" + p.id, tipo: "prazo", descricao: (p.descricao || tipoPrazo(p.tipo).nome), data: ehDataHora(p.limite) ? p.limite.slice(0, 16) : p.limite + "T23:59", unidade: "horas", avisos: avisosDe(cfg, "prazoHoras") });
      }
    }
    return lista;
  }

  // Situação de um evento agora: quanto falta, a antecedência alcançada e a chave usada para não repetir o aviso.
  function avaliar(ev, agoraMs) {
    const hoje = hojeBrasilia(agoraMs);
    let falta, vencido, chave, marco = null;
    if (ev.unidade === "horas") {
      const h = (msBrasilia(ev.data) - agoraMs) / HORA;
      falta = h; vencido = h < 0;
      if (vencido) { if (h > -48) chave = ev.chave + "|" + ev.data + "|v"; }
      else {
        for (const m of ev.avisos) if (h <= m) marco = m;
        if (marco !== null) chave = ev.chave + "|" + ev.data + "|" + marco + "h";
      }
    } else {
      falta = diffDias(hoje, ev.data); vencido = falta < 0;
      if (vencido) chave = ev.chave + "|" + ev.data + "|v" + Math.floor((-falta - 1) / 7); // lembra uma vez por semana
      else {
        for (const m of ev.avisos) if (falta <= m) marco = m;
        if (marco !== null) chave = ev.chave + "|" + ev.data + "|" + marco;
      }
    }
    const dias = ev.unidade === "horas" ? falta / 24 : falta;
    const nivel = vencido ? "vencido" : dias <= (ev.unidade === "horas" ? 1 : 7) ? "urgente" : dias <= 30 ? "atencao" : "ok";
    return { falta, vencido, marco, chave: chave || null, nivel };
  }

  function textoFalta(ev, a) {
    if (ev.unidade === "horas") {
      const h = a.falta;
      if (h < 0) return "venceu há " + duracao(-h);
      return "faltam " + duracao(h);
    }
    if (a.falta < 0) return "venceu há " + -a.falta + (a.falta === -1 ? " dia" : " dias");
    if (a.falta === 0) return "vence hoje";
    if (a.falta === 1) return "vence amanhã";
    return "faltam " + a.falta + " dias";
  }
  function duracao(h) {
    if (h < 1) return Math.max(1, Math.round(h * 60)) + " min";
    if (h < 48) return Math.round(h) + (Math.round(h) === 1 ? " hora" : " horas");
    return Math.round(h / 24) + " dias";
  }
  function dataDoEvento(ev) { return ev.unidade === "horas" ? formatarData(ev.data) : formatarData(ev.data) + (ev.hora ? " às " + ev.hora : ""); }
  function textoAlerta(ev, a) {
    return ev.titulo + " — " + ev.descricao + ": " + dataDoEvento(ev) + " (" + textoFalta(ev, a) + ")" + (ev.nota ? ". " + ev.nota : "");
  }

  // Avisos que ainda não foram enviados (enviados: objeto ou Set com as chaves já avisadas).
  function pendentes(dados, agoraMs, enviados) {
    const ja = enviados instanceof Set ? k => enviados.has(k) : k => !!(enviados && enviados[k]);
    return eventos(dados, hojeBrasilia(agoraMs))
      .map(ev => ({ ev, a: avaliar(ev, agoraMs) }))
      .filter(x => x.a.chave && !ja(x.a.chave))
      .sort((x, y) => ordemNivel(x.a.nivel) - ordemNivel(y.a.nivel) || x.ev.data.localeCompare(y.ev.data));
  }
  const ordemNivel = n => ({ vencido: 0, urgente: 1, atencao: 2, ok: 3 })[n];

  /* ---------- Agenda (.ics) ---------- */
  function gerarICS(lista, agoraMs = Date.now()) {
    const esc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
    const carimbo = new Date(agoraMs).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
    const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gestao de Prazos//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Prazos de contratos e licitações"];
    for (const ev of lista) {
      linhas.push("BEGIN:VEVENT", "UID:" + ev.chave.replace(/[^\w:-]/g, "") + "-" + ev.data.replace(/\D/g, "") + "@gestao-prazos", "DTSTAMP:" + carimbo);
      const comHora = ev.unidade === "horas" || ev.hora;
      if (comHora) {
        const ms = msBrasilia(ev.unidade === "horas" ? ev.data : ev.data + "T" + ev.hora);
        const z = t => new Date(t).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
        linhas.push("DTSTART:" + z(ms - 30 * 60000), "DTEND:" + z(ms));
      } else {
        linhas.push("DTSTART;VALUE=DATE:" + ev.data.replace(/-/g, ""), "DTEND;VALUE=DATE:" + somaDias(ev.data, 1).replace(/-/g, ""));
      }
      linhas.push("SUMMARY:" + esc(ev.descricao + " — " + ev.titulo), "DESCRIPTION:" + esc([ev.nota, ev.responsavel && "Responsável: " + ev.responsavel, ev.link].filter(Boolean).join("\n")));
      const avisos = ev.unidade === "horas" ? ev.avisos.slice(-2).map(h => "-PT" + h + "H") : ev.avisos.filter(d => d > 0).slice(-3).map(d => "-P" + d + "D");
      if (!comHora) avisos.push("PT9H"); // no próprio dia, às 9h
      for (const t of avisos) linhas.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + esc(ev.descricao), "TRIGGER:" + t, "END:VALARM");
      linhas.push("END:VEVENT");
    }
    linhas.push("END:VCALENDAR");
    return linhas.map(l => l.length > 74 ? l.match(/.{1,73}/g).join("\r\n ") : l).join("\r\n") + "\r\n";
  }

  /* ---------- Mensagens dos portais ---------- */
  const CLASSES_MENSAGEM = [
    { id: "recurso", nome: "Recurso", urgente: true, re: /inten[cç][aã]o de recurso|recurso|contrarraz|raz[oõ]es recursais/ },
    { id: "convocacao", nome: "Convocação / envio de anexo", urgente: true, re: /convoca|anexo|encaminh|envi(e|ar|o)|apresent(e|ar)|diligenc|prazo de|no prazo|ajust/ },
    { id: "retorno", nome: "Retorno de fase / reabertura", urgente: true, re: /retorn|reabert|reabr|reinici|voltou|desfeit|anulad[oa] o ato|nova sess/ },
    { id: "suspensao", nome: "Suspensão / adiamento", urgente: true, re: /suspens|suspend|adiad|adiament|remarcad|nova data/ },
    { id: "lances", nome: "Etapa de lances", urgente: true, re: /lance|disputa|iminente|encerramento aleat|fechamento/ },
    { id: "resultado", nome: "Resultado / julgamento", urgente: false, re: /aceit|recusad|habilitad|inabilitad|desclassific|classificad|adjudic|homolog|vencedor|arrematante|resultado/ },
    { id: "geral", nome: "Mensagem", urgente: false, re: /./ }
  ];
  function classificarMensagem(texto) {
    const t = semAcento(texto);
    const c = CLASSES_MENSAGEM.find(x => x.re.test(t));
    return { classe: c.id, nome: c.nome, urgente: c.urgente, datas: datasNoTexto(texto) };
  }
  // Datas e prazos citados no texto: "até 16/10/2026 às 14h", "prazo de 2 horas"
  function datasNoTexto(texto, baseMs) {
    const achadas = [];
    const re = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[^\d\n]{0,8}(\d{1,2})\s*(?:h|:)\s*(\d{2})?)?/g;
    let m;
    while ((m = re.exec(String(texto)))) { const d = lerData(m[0], true); if (d) achadas.push(d); }
    const rel = String(texto).match(/prazo (?:de|m[aá]ximo de)\s*(\d{1,3})\s*(minutos?|horas?|dias? [uú]teis|dias?)/i);
    if (rel && baseMs) {
      const n = Number(rel[1]), u = semAcento(rel[2]);
      if (/minuto/.test(u)) achadas.push(agoraBrasilia(baseMs + n * 60000));
      else if (/hora/.test(u)) achadas.push(agoraBrasilia(baseMs + n * HORA));
      else if (/uteis/.test(u)) achadas.push(somaDiasUteis(hojeBrasilia(baseMs), n) + "T23:59");
      else achadas.push(somaDias(hojeBrasilia(baseMs), n) + "T23:59");
    }
    return [...new Set(achadas)];
  }
  // Números que identificam a licitação nos e-mails e mensagens dos portais.
  function chavesLicitacao(l) {
    const chaves = [];
    const digitos = s => String(s || "").replace(/\D/g, "");
    if (l.compraId && digitos(l.compraId).length >= 8) chaves.push(digitos(l.compraId));
    if (l.numero) {
      const m = String(l.numero).match(/(\d{1,6})\s*\/\s*(\d{4})/);
      if (m) chaves.push(m[1] + "/" + m[2], Number(m[1]) + "/" + m[2]);
    }
    if (l.processo && digitos(l.processo).length >= 8) chaves.push(digitos(l.processo));
    for (const s of String(l.identificadores || "").split(/[;\n]+/)) if (s.trim().length >= 4) chaves.push(s.trim());
    return [...new Set(chaves)];
  }
  const escRe = s => s.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&");
  // Procura a licitação citada no texto. A UASG sozinha não basta (a mesma unidade tem várias compras), só desempata.
  function encontrarLicitacao(licitacoes, texto) {
    const t = semAcento(texto).replace(/\s*\/\s*/g, "/");
    const digitos = t.replace(/(\d)[.\-\/](?=\d)/g, "$1"), compacto = t.replace(/\s+/g, "");
    let melhor = null, pontos = 0;
    for (const l of licitacoes) {
      let p = 0;
      for (const k of chavesLicitacao(l)) {
        const kk = semAcento(k).replace(/\s+/g, "");
        const achou = /^\d+$/.test(kk) ? new RegExp("(^|\\D)" + kk + "(\\D|$)").test(digitos)
          : /^\d+\/\d{4}$/.test(kk) ? new RegExp("(^|[^\\d\\/])" + escRe(kk) + "(\\D|$)").test(t)
          : compacto.includes(kk);
        if (achou) p += kk.length;
      }
      if (p && l.uasg && new RegExp("(^|\\D)" + l.uasg + "(\\D|$)").test(t)) p += 6;
      if (p > pontos) { pontos = p; melhor = l; }
    }
    return melhor;
  }

  /* ---------- Lances ---------- */
  // Sugere o próximo lance (critério menor preço) dentro dos limites definidos para o item.
  function sugerirLance(o) {
    const melhor = lerNumero(o.melhorLance), meu = lerNumero(o.meuLance), minimo = lerNumero(o.minimo);
    const dec = lerNumero(o.decremento) || 0, decMax = lerNumero(o.decrementoMax);
    const emValor = (x, base) => o.decrementoTipo === "pct" ? base * x / 100 : x;
    const cent = v => Math.round(v * 100) / 100;
    if (melhor === null || melhor <= 0) return { acao: "aguardar", motivo: "Informe o melhor lance da disputa." };
    if (minimo === null) return { acao: "aguardar", motivo: "Defina o valor mínimo aceitável do item antes da disputa." };
    if (meu !== null && meu <= melhor) return { acao: "manter", valor: meu, motivo: "Seu lance é o melhor da disputa. Aguarde." };
    if (minimo >= melhor) return { acao: "parar", valor: minimo, motivo: "O melhor lance (" + moeda(melhor) + ") já está abaixo do seu mínimo (" + moeda(minimo) + "). Não cubra." };
    const passo = Math.max(0.01, emValor(dec, melhor));
    let alvo = Math.floor((melhor - passo) * 100) / 100;
    let aviso = "";
    if (decMax !== null && decMax > 0 && meu !== null) {
      const limite = cent(meu - emValor(decMax, meu));
      if (alvo < limite) { alvo = Math.max(limite, alvo); aviso = " Limitado pela redução máxima por lance; pode ser preciso mais de um lance."; }
    }
    if (alvo < minimo) { alvo = minimo; aviso = " É o seu valor mínimo: último lance possível neste item."; }
    alvo = cent(alvo);
    if (alvo >= melhor) return { acao: "intermediario", valor: alvo, motivo: "A redução máxima por lance não deixa cobrir o melhor lance de uma vez. Lance intermediário de " + moeda(alvo) + " e repita." };
    return { acao: "cobrir", valor: alvo, desconto: o.valorEstimado ? 1 - alvo / lerNumero(o.valorEstimado) : null, motivo: "Lance sugerido para ficar em 1º lugar." + aviso };
  }
  // Modo aberto (IN SEGES/ME 73/2022): 10 minutos, prorrogados por 2 minutos a cada lance nos 2 minutos finais.
  function fimEtapaAberta(inicioMs, lancesMs) {
    let fim = inicioMs + 10 * 60000;
    for (const t of [...lancesMs].sort((a, b) => a - b)) if (t <= fim && fim - t <= 2 * 60000) fim = t + 2 * 60000;
    return fim;
  }
  function moeda(v) {
    const n = Number(v);
    if (!isFinite(n)) return "";
    return "R$ " + n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  function novoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  return {
    DIA, HORA, pad, ehData, ehDataHora, agoraBrasilia, hojeBrasilia, somaDias, diffDias, somaMeses, msBrasilia, formatarData, diaSemana,
    pascoa, feriadosNacionais, ehDiaUtil, somaDiasUteis,
    AVISOS_PADRAO, TIPOS_DOCUMENTO, tipoDocumento, TIPOS_PRAZO, tipoPrazo, STATUS_LICITACAO, statusLicitacao, PORTAIS,
    lerData, lerNumero, lerAvisos, lerEmails, lerCSV, gerarCSV, COLUNAS, mapearColunas, linhaParaRegistro, semAcento, statusPorTexto, tipoDocumentoPorTexto,
    prazoRenovacao, prazoReajuste, eventos, avaliar, textoFalta, textoAlerta, dataDoEvento, pendentes, gerarICS, rotuloContrato, rotuloLicitacao,
    CLASSES_MENSAGEM, classificarMensagem, datasNoTexto, chavesLicitacao, encontrarLicitacao,
    sugerirLance, fimEtapaAberta, moeda, novoId
  };
});
