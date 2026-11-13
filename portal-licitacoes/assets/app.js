/* Equipe Comercial | aplicação
   Telas: painel, editais (quadro/lista), propostas, chats dos pregões, análise de edital,
   recursos e contrarrazões, documentos, portais, central de alertas e ajustes.
   Os dados ficam no navegador (localStorage). Com o portal publicado na Vercel, /api/chat lê o
   chat do e-compras.AM e /api/pncp importa editais do PNCP. */
(function () {
  "use strict";
  const U = window.U, A = window.Analise, D = window.DadosExemplo;
  const CHAVE = "pregao-em-dia:v1";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const h = U.h;
  const ic = n => '<svg class="i" aria-hidden="true"><use href="#i-' + n + '"/></svg>';

  /* =================================================================
     Constantes
     ================================================================= */
  const ETAPAS = [
    { id: "triagem", nome: "Triagem", cls: "neutral" },
    { id: "analise", nome: "Em análise", cls: "info" },
    { id: "proposta", nome: "Proposta em elaboração", curto: "Proposta", cls: "warn" },
    { id: "cadastrada", nome: "Proposta cadastrada", curto: "Cadastrada", cls: "brand" },
    { id: "disputa", nome: "Em disputa", cls: "pop" },
    { id: "habilitacao", nome: "Aceitação e habilitação", curto: "Habilitação", cls: "info" },
    { id: "recurso", nome: "Fase recursal", curto: "Recurso", cls: "warn" },
    { id: "ganho", nome: "Ganho", cls: "ok", final: true },
    { id: "perdido", nome: "Perdido", cls: "crit", final: true },
    { id: "descartado", nome: "Não vamos participar", curto: "Descartado", cls: "neutral", final: true }
  ];
  const ETAPA = id => ETAPAS.find(e => e.id === id) || ETAPAS[0];
  const PROP_STATUS = [["nao_iniciada", "Não iniciada"], ["elaborando", "Em elaboração"], ["revisao", "Em revisão"], ["cadastrada", "Cadastrada no portal"]];
  const PROP_NOME = id => (PROP_STATUS.find(p => p[0] === id) || PROP_STATUS[0])[1];
  const PORTAIS = ["Compras.gov.br", "BLL", "BNC", "Licitações-e", "Portal de Compras Públicas", "Licitanet", "Licitar Digital", "e-compras AM", "PNCP", "Outro"];
  const CORES_PORTAL = [["compras.gov", "#1F5FBF"], ["sicaf", "#1F5FBF"], ["bll", "#D24E22"], ["bnc", "#6E48C2"], ["licitações-e", "#A67700"], ["licitacoes-e", "#A67700"], ["compras públicas", "#0B7F5B"], ["licitanet", "#B5366F"], ["licitar", "#2A7FA6"], ["e-compras", "#0D6E6A"], ["pncp", "#3D5A80"]];
  const corPortal = nome => { const n = String(nome || "").toLowerCase(); const c = CORES_PORTAL.find(([k]) => n.includes(k)); return c ? c[1] : "#5B7275"; };
  const CHECK_PROPOSTA = ["Planilha de custos e formação de preços", "Proposta comercial assinada", "Declarações exigidas no edital", "Documentos de habilitação anexados", "Conferência de valor, lote e marca/modelo"];
  const STATUS_REC = [["intencao", "Intenção registrada"], ["razoes", "Razões protocoladas"], ["contrarrazoes", "Contrarrazões protocoladas"], ["julgamento", "Em julgamento"], ["provido", "Provido"], ["parcial", "Parcialmente provido"], ["improvido", "Não provido"], ["desistencia", "Desistência"]];
  const REC_FINAL = ["provido", "parcial", "improvido", "desistencia"];
  const PAPEIS = [["recorrente", "Nós recorremos"], ["recorrida", "Fomos recorridos"], ["terceiro", "Acompanhando terceiros"]];
  const TIPOS_DOC = A.HABILITACAO.filter(x => x.chave !== "declaracoes").map(x => [x.chave, x.nome]).concat([["certificado", "Certificado digital"], ["outro", "Outro documento"]]);
  const GRUPO_DOC = tipo => (A.HABILITACAO.find(x => x.chave === tipo) || {}).grupo || (tipo === "certificado" ? "Acesso aos portais" : "Outros");
  const nomeLista = (lista, id) => (lista.find(x => x[0] === id) || [id, id])[1];

  /* =================================================================
     Estado
     ================================================================= */
  const CFG = window.PORTAL_CONFIG || {};
  // Login e dados na nuvem (Supabase). Sem configuração, o portal funciona só com o navegador.
  const nuvem = { cliente: null, usuario: null, bloqueado: false, pendente: false, enviando: false, timer: null, status: "", erro: "", salvoEm: 0, remotoEm: null, ultimoEnviado: "" };
  let S = carregar();
  let termos = [];
  let cacheMsg = new WeakMap();
  const ui = {
    editaisVista: lerPref("vista", "quadro"), fEd: { busca: "", etapa: "", portal: "" },
    chatSel: null, chatFiltro: "todas", chatBusca: "", alertaFiltro: "todos", docFiltro: "todos",
    analiseTexto: "", analise: null, detalhe: null, abrirApos: null, apiFalhouEm: 0, lendo: {},
    calc: { data: U.hojeISO(), regime: "14133", tipo: "recurso" }
  };

  function lerPref(k, padrao) { try { return localStorage.getItem("ped:" + k) || padrao; } catch (e) { return padrao; } }
  function gravarPref(k, v) { try { localStorage.setItem("ped:" + k, v); } catch (e) { /* sem armazenamento */ } }
  function normalizar(d) {
    const base = D.vazio();
    return Object.assign(base, d, { empresa: Object.assign(base.empresa, d.empresa), ajustes: Object.assign(base.ajustes, d.ajustes) });
  }
  function carregar() {
    const s = U.ler(CHAVE, null);
    return s && s.versao ? normalizar(s) : D.criar();
  }
  function aplicarConfig() {
    U.config.pontosFacultativos = !!S.ajustes.pontosFacultativos;
    U.config.feriadosLocais = U.lerFeriadosLocais(S.ajustes.feriadosLocais);
    U.limparCacheFeriados();
    termos = A.termosEmpresa(S.empresa);
    cacheMsg = new WeakMap();
  }
  const chaveLocal = () => (nuvem.usuario ? CHAVE + ":" + nuvem.usuario.id : CHAVE);
  function salvar() { U.gravar(chaveLocal(), S); if (nuvem.usuario) agendarNuvem(); }
  function atualizar() { salvar(); aplicarConfig(); render(); }
  function registrar(texto, rota) { S.atividade.unshift({ quando: U.agoraISO(), texto, rota }); S.atividade = S.atividade.slice(0, 80); }
  const apelido = () => S.empresa.apelido || S.empresa.nome || "empresa";

  /* =================================================================
     Regras de negócio
     ================================================================= */
  const edital = id => S.editais.find(e => e.id === id);
  const limiteDe = e => e.limiteProposta || e.sessao;
  const ativo = e => !ETAPA(e.etapa).final;
  const precisaProposta = e => ativo(e) && ["triagem", "analise", "proposta"].includes(e.etapa) && e.propostaStatus !== "cadastrada";
  const chatDoEdital = id => S.chats.find(c => c.editalId === id);
  const progresso = e => { const c = e.checklist || {}; return CHECK_PROPOSTA.filter(k => c[k]).length; };

  function prazosRecurso(r) {
    if (!r.dataIntencao) return {};
    if (r.regime === "10520") {
      const razoes = U.somarDiasCorridos(r.dataIntencao, 3);
      return { razoes, contrarrazoes: U.somarDiasCorridos(r.dataContrarrazoes || razoes, 3), reconsideracao: null, decisao: null, regra: "3 dias corridos (Lei 10.520/2002)" };
    }
    const razoes = U.somarDiasUteis(r.dataIntencao, 3);
    const contrarrazoes = U.somarDiasUteis(r.dataContrarrazoes || razoes, 3);
    const reconsideracao = U.somarDiasUteis(contrarrazoes, 3);
    return { razoes, contrarrazoes, reconsideracao, decisao: U.somarDiasUteis(reconsideracao, 10), regra: "3 dias úteis (Lei 14.133/2021, art. 165)" };
  }
  function prazoNosso(r) {
    if (REC_FINAL.includes(r.status)) return null;
    const p = prazosRecurso(r);
    if (r.papel === "recorrente" && r.status === "intencao") return { tipo: "razoes", data: p.razoes, titulo: "Protocolar as razões do recurso" };
    if (r.papel === "recorrida" && ["intencao", "razoes"].includes(r.status)) return { tipo: "contrarrazoes", data: p.contrarrazoes, titulo: "Apresentar contrarrazões" };
    if (r.papel === "terceiro" && ["intencao", "razoes"].includes(r.status)) return { tipo: "acompanhar", data: p.contrarrazoes, titulo: "Fim do prazo de contrarrazões" };
    return p.decisao ? { tipo: "decisao", data: p.decisao, titulo: "Decisão do recurso (estimativa)" } : null;
  }

  function limitesDoc() {
    const L = String(S.ajustes.diasDoc || "30,15,7").split(/[^\d]+/).map(Number).filter(n => n > 0).sort((a, b) => b - a);
    return { maior: L[0] || 30, menor: L[L.length - 1] || 7 };
  }
  function situacao(validade, maior, menor) {
    if (!validade) return { cls: "neutral", rotulo: "Sem validade", dias: null, ordem: 9 };
    const dias = U.diasAte(validade);
    if (dias < 0) return { cls: "crit", rotulo: "Vencido há " + U.plural(-dias, "dia", "dias"), dias, ordem: 0 };
    if (dias === 0) return { cls: "crit", rotulo: "Vence hoje", dias, ordem: 1 };
    if (dias <= menor) return { cls: "crit", rotulo: "Vence em " + U.plural(dias, "dia", "dias"), dias, ordem: 1 };
    if (dias <= maior) return { cls: "warn", rotulo: "Vence em " + dias + " dias", dias, ordem: 2 };
    return { cls: "ok", rotulo: "Vigente", dias, ordem: 3 };
  }
  const situacaoDoc = d => { const l = limitesDoc(); return situacao(d.validade, l.maior, l.menor); };
  const situacaoPortal = v => situacao(v, +S.ajustes.diasPortal || 30, 7);
  // Primeira sessão marcada que acontece depois do vencimento do documento
  function sessaoAfetada(validade) {
    if (!validade) return null;
    return S.editais.filter(e => ativo(e) && e.sessao && !U.passou(e.sessao) && U.soData(e.sessao) > validade)
      .sort((a, b) => a.sessao.localeCompare(b.sessao))[0] || null;
  }

  const infoMsg = m => { let i = cacheMsg.get(m); if (!i) { i = A.classificar(m, termos); cacheMsg.set(m, i); } return i; };
  const naoLidas = c => c.mensagens.filter(m => !m.lida);
  const ultimaMsg = c => c.mensagens[c.mensagens.length - 1] || null;
  function retomadaPrevista(c) {
    for (let i = c.mensagens.length - 1; i >= 0; i--) {
      const r = infoMsg(c.mensagens[i]).retomada;
      if (r) { const dt = /(\d{2})\/(\d{2})\/(\d{4})/.exec(r); if (!dt || dt[3] + "-" + dt[2] + "-" + dt[1] >= U.hojeISO()) return r; return ""; }
    }
    return "";
  }

  function contCls(s) {
    if (!s) return "";
    const n = U.diasAte(s);
    if (n < 0 || U.passou(s) || n <= 1) return "crit";
    return n <= 3 ? "warn" : "";
  }
  const chip = s => s ? '<span class="cont ' + contCls(s) + '">' + h(U.contagem(s)) + "</span>" : "";
  const chipSessao = s => !s ? "" : U.passou(s) ? '<span class="cont">' + U.fmtDataCurta(s) + "</span>" : chip(s);

  /* ---------- Alertas ---------- */
  function resolvido(id) {
    const r = S.resolvidos[id];
    if (!r) return false;
    return r === "sempre" || U.hojeISO() < r;
  }
  function gerarAlertas(incluirResolvidos) {
    const out = [];
    const add = a => { if (incluirResolvidos || !resolvido(a.id)) out.push(a); };
    const nivelPorDias = (s, critico, atencao) => { const n = U.diasAte(s); return n < 0 || U.passou(s) || n <= critico ? "critico" : n <= atencao ? "atencao" : "info"; };
    const aj = S.ajustes;

    S.editais.filter(ativo).forEach(e => {
      const lim = limiteDe(e);
      if (precisaProposta(e) && lim && U.diasAte(lim) <= Math.max(7, +aj.diasProposta || 3)) {
        const passou = U.passou(lim);
        add({ id: "prop:" + e.id + ":" + lim, tipo: "proposta", icone: "propostas", nivel: nivelPorDias(lim, 1, +aj.diasProposta || 3), quando: lim,
          titulo: (passou ? "Prazo da proposta encerrado: " : "Cadastrar proposta: ") + e.numero,
          detalhe: e.orgao + " · " + e.portal + " · limite " + U.fmtDataHora(lim) + " · " + PROP_NOME(e.propostaStatus), rota: "propostas", ref: e.id });
      }
      if (e.sessao && !U.passou(e.sessao) && U.diasAte(e.sessao) <= 1 && !precisaProposta(e)) {
        add({ id: "sessao:" + e.id + ":" + e.sessao, tipo: "sessao", icone: "relogio", nivel: U.diasAte(e.sessao) === 0 ? "critico" : "atencao", quando: e.sessao,
          titulo: "Sessão " + (U.diasAte(e.sessao) === 0 ? "hoje" : "amanhã") + " às " + U.fmtHora(e.sessao) + ": " + e.numero,
          detalhe: e.orgao + " · " + e.portal, rota: "editais", ref: e.id });
      }
      if (e.nossoValor && e.valorEstimado && e.nossoValor < e.valorEstimado / 2 && ["proposta", "cadastrada", "disputa"].includes(e.etapa)) {
        add({ id: "inex:" + e.id + ":" + e.nossoValor, tipo: "proposta", icone: "aviso", nivel: "atencao", quando: e.sessao || U.hojeISO(),
          titulo: "Proposta abaixo de 50% do estimado: " + e.numero, detalhe: U.moeda(e.nossoValor) + " de " + U.moeda(e.valorEstimado) + ". Tenha a planilha de custos pronta para a diligência de exequibilidade.", rota: "precos", ref: e.id });
      }
      if (["triagem", "analise", "proposta"].includes(e.etapa) && e.sessao) {
        const imp = U.subtrairDiasUteis(e.sessao, 3), n = U.diasAte(imp);
        if (n >= 0 && n <= 3) add({ id: "imp:" + e.id + ":" + imp, tipo: "impugnacao", icone: "recursos", nivel: n === 0 ? "atencao" : "info", quando: imp,
          titulo: "Último dia para impugnar ou pedir esclarecimento: " + e.numero, detalhe: "Até " + U.fmtData(imp) + " (3 dias úteis antes da sessão)", rota: "editais", ref: e.id });
      }
    });

    // Pregão suspenso que voltou (ou ganhou nova data) nos últimos 7 dias
    (S.suspensos || []).forEach(it => {
      const d = it.dados || {}, quando = it.voltouEm || (d.novaData && it.novaDataEm);
      if (!quando || U.diasAte(U.soData(quando)) < -7) return;
      add({ id: "susp:" + it.id + ":" + quando, tipo: "suspenso", icone: "pausa", nivel: "critico", quando: U.soData(quando),
        titulo: (it.voltouEm ? "Pregão voltou: " : "Nova data no pregão suspenso: ") + (d.numero || it.obs || "pregão"),
        detalhe: (d.orgao || "") + (d.situacao ? " · " + d.situacao : "") + (d.sessao && d.sessao > U.agoraISO() ? " · sessão " + U.fmtDataHora(d.sessao) : d.novaData ? " · " + U.fmtDataHora(d.novaData.data) : ""), rota: "suspensos" });
    });

    S.recursos.forEach(r => {
      const p = prazoNosso(r);
      if (!p || !p.data) return;
      if (p.tipo === "decisao" && U.diasAte(p.data) > 5) return;
      if (U.diasAte(p.data) < -5) return;
      add({ id: "rec:" + r.id + ":" + p.tipo + ":" + p.data, tipo: "recurso", icone: "recursos", quando: p.data,
        nivel: p.tipo === "decisao" || p.tipo === "acompanhar" ? "info" : nivelPorDias(p.data, 1, 3),
        titulo: p.titulo + ": " + r.pregao, detalhe: "Até " + U.fmtData(p.data) + " · " + (r.contraparte ? "outra parte: " + r.contraparte : nomeLista(PAPEIS, r.papel)), rota: "recursos", ref: r.id });
    });

    const L = limitesDoc();
    docsAtivos().forEach(d => {
      const s = situacaoDoc(d);
      if (s.cls !== "crit" && s.cls !== "warn") return;
      const afeta = sessaoAfetada(d.validade);
      add({ id: "doc:" + d.id + ":" + d.validade, tipo: "documento", icone: "documentos", quando: d.validade,
        nivel: s.dias < 0 || s.dias <= L.menor ? "critico" : s.dias <= Math.round(L.maior / 2) ? "atencao" : "info",
        titulo: (s.dias < 0 ? "Documento vencido: " : "Renovar documento: ") + d.nome + (d.empresa ? " (" + empresaCurta(d.empresa) + ")" : ""),
        detalhe: s.rotulo + (afeta ? " · antes da sessão do " + afeta.numero : ""), rota: "documentos", ref: d.id });
    });
    // Habilitação: edital com sessão nos próximos 10 dias e documento faltando ou vencendo antes dela
    S.editais.filter(e => ativo(e) && e.etapa !== "triagem" && e.sessao && !U.passou(e.sessao) && U.diasAte(e.sessao) <= 10).forEach(e => {
      const pk = pacoteHabilitacao(e);
      if (!pk.problemas.length || !pk.empresa) return;
      add({ id: "hab:" + e.id + ":" + pk.problemas.map(x => x.ref.chave + x.st).join(","), tipo: "documento", icone: "documentos", quando: U.soData(e.sessao), nivel: "atencao",
        titulo: "Habilitação do " + e.numero + ": " + U.plural(pk.problemas.length, "pendência", "pendências"), detalhe: pk.problemas.map(x => x.ref.nome + " (" + HAB_ST[x.st][1].toLowerCase() + ")").join(", ") + " · " + empresaCurta(pk.empresa), rota: "editais", ref: e.id });
    });
    // Contratos: prorrogação (120 dias antes do fim), reajuste (45 dias antes do aniversário) e garantia (30 dias)
    contratosVigentes().forEach(c => marcosContrato(c).forEach(m => {
      if (m.dias < -5 || m.dias > ALERTA_MARCO[m.tipo]) return;
      add({ id: "ctr:" + c.id + ":" + m.tipo + ":" + m.data, tipo: "contrato", icone: "documentos", quando: m.data, nivel: m.dias <= 30 ? "critico" : "atencao",
        titulo: m.acao + ": contrato " + c.numero, detalhe: U.corta(c.orgao, 50) + " · " + m.rot.toLowerCase() + " em " + U.fmtData(m.data), rota: "contratos", ref: c.id });
    }));
    // Cadastro e plano dos portais: só informativo (não entra em prioridades, alertas críticos nem resumo)
    S.portais.forEach(p => {
      [["validadeCadastro", "Cadastro"], ["validadePlano", "Plano/mensalidade"]].forEach(([campo, rot]) => {
        const s = situacaoPortal(p[campo]);
        if (s.cls !== "crit" && s.cls !== "warn") return;
        add({ id: "portal:" + p.id + ":" + campo + ":" + p[campo], tipo: "portal", icone: "portais", quando: p[campo],
          nivel: "info", titulo: rot + " no " + p.nome + (p.empresa ? " (" + empresaCurta(p.empresa) + ")" : "") + (s.dias < 0 ? " vencido" : " vencendo"), detalhe: s.rotulo + (p.responsavel ? " · responsável: " + p.responsavel : ""), rota: "portais", ref: p.id });
      });
    });

    S.chats.forEach(c => {
      const nl = naoLidas(c);
      if (!nl.length) return;
      const cit = nl.filter(m => infoMsg(m).citaEmpresa), imp = nl.filter(m => infoMsg(m).importante);
      const ult = nl[nl.length - 1];
      add({ id: "chat:" + c.id + ":" + A.chaveMensagem(ult), tipo: "chat", icone: "chats", quando: U.soData(ult.hora),
        nivel: cit.length ? "critico" : imp.length ? "atencao" : "info",
        titulo: cit.length ? c.titulo + ": o pregoeiro citou a " + apelido() : c.titulo + ": " + U.plural(nl.length, "mensagem nova", "mensagens novas") + " no chat",
        detalhe: U.corta((cit[0] || imp[0] || ult).texto, 120), rota: "chats", ref: c.id, semData: true });
    });

    const ordem = { critico: 0, atencao: 1, info: 2 };
    return out.sort((a, b) => ordem[a.nivel] - ordem[b.nivel] || String(a.quando).localeCompare(String(b.quando)));
  }

  /* ---------- Agenda ---------- */
  function eventosAgenda(dias) {
    const ev = [], hoje = U.hojeISO(), fim = U.addDias(hoje, dias);
    const dentro = s => s && U.soData(s) >= hoje && U.soData(s) <= fim;
    S.editais.filter(ativo).forEach(e => {
      const lim = limiteDe(e);
      if (precisaProposta(e) && dentro(lim)) ev.push({ data: lim, tipo: "proposta", titulo: "Limite da proposta · " + e.numero, sub: e.orgao, rota: "propostas", ref: e.id });
      if (dentro(e.sessao) && !(precisaProposta(e) && U.soData(lim) === U.soData(e.sessao))) ev.push({ data: e.sessao, tipo: "sessao", titulo: "Sessão pública · " + e.numero, sub: e.orgao + " · " + e.portal, rota: "editais", ref: e.id });
      if (e.nossoValor && e.valorEstimado && e.nossoValor < e.valorEstimado / 2 && ["proposta", "cadastrada", "disputa"].includes(e.etapa)) {
        add({ id: "inex:" + e.id + ":" + e.nossoValor, tipo: "proposta", icone: "aviso", nivel: "atencao", quando: e.sessao || U.hojeISO(),
          titulo: "Proposta abaixo de 50% do estimado: " + e.numero, detalhe: U.moeda(e.nossoValor) + " de " + U.moeda(e.valorEstimado) + ". Tenha a planilha de custos pronta para a diligência de exequibilidade.", rota: "precos", ref: e.id });
      }
      if (["triagem", "analise", "proposta"].includes(e.etapa) && e.sessao) {
        const imp = U.subtrairDiasUteis(e.sessao, 3);
        if (dentro(imp)) ev.push({ data: imp, tipo: "impugnacao", titulo: "Último dia para impugnar · " + e.numero, sub: e.orgao, rota: "editais", ref: e.id });
      }
    });
    S.recursos.filter(r => !REC_FINAL.includes(r.status)).forEach(r => {
      const p = prazosRecurso(r), nosso = prazoNosso(r) || {};
      if (dentro(p.razoes) && r.status === "intencao") ev.push({ data: p.razoes, tipo: "recurso", titulo: "Fim do prazo das razões · " + r.pregao, sub: nosso.tipo === "razoes" ? "Prazo nosso" : "Prazo da recorrente", rota: "recursos", ref: r.id });
      if (dentro(p.contrarrazoes) && ["intencao", "razoes"].includes(r.status)) ev.push({ data: p.contrarrazoes, tipo: "recurso", titulo: "Fim do prazo das contrarrazões · " + r.pregao, sub: nosso.tipo === "contrarrazoes" ? "Prazo nosso" : "Acompanhar", rota: "recursos", ref: r.id });
    });
    docsAtivos().forEach(d => { if (dentro(d.validade)) ev.push({ data: d.validade, tipo: "documento", titulo: "Vence: " + d.nome, sub: d.emissor || "Documento", rota: "documentos", ref: d.id }); });
    S.portais.forEach(p => {
      if (dentro(p.validadeCadastro)) ev.push({ data: p.validadeCadastro, tipo: "portal", titulo: "Cadastro vence · " + p.nome, sub: p.cadastro || "Portal", rota: "portais", ref: p.id });
      if (dentro(p.validadePlano)) ev.push({ data: p.validadePlano, tipo: "portal", titulo: "Plano vence · " + p.nome, sub: "Renovar assinatura", rota: "portais", ref: p.id });
    });
    return ev.sort((a, b) => String(a.data).localeCompare(String(b.data)));
  }

  /* =================================================================
     Componentes: modal, formulários, toasts, confirmação
     ================================================================= */
  let focoAnterior = null;
  function abrirModal(o) {
    const raiz = $("#modal");
    if (raiz.hidden) focoAnterior = document.activeElement;
    raiz.className = "modal-raiz" + (o.lateral ? " lateral" : "");
    raiz.innerHTML = '<div class="modal-fundo" data-acao="fecharModal"></div>' +
      '<div class="modal ' + (o.tamanho || "") + '" role="dialog" aria-modal="true" aria-labelledby="modal-t">' +
      '<header><h2 id="modal-t">' + o.titulo + '</h2><button class="icon-btn" data-acao="fecharModal" aria-label="Fechar">' + ic("x") + "</button></header>" +
      '<div class="modal-corpo">' + o.corpo + "</div>" + (o.rodape ? "<footer>" + o.rodape + "</footer>" : "") + "</div>";
    raiz.hidden = false;
    if (o.aoAbrir) o.aoAbrir(raiz);
    if (!o.manterFoco) { const f = $("input:not([type=checkbox]),select,textarea", $(".modal-corpo", raiz)) || $(".modal header button", raiz); if (f) f.focus(); }
  }
  function fecharModal() {
    const raiz = $("#modal");
    raiz.hidden = true; raiz.innerHTML = ""; ui.detalhe = null;
    if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus();
  }

  function campoHTML(f, v) {
    if (f.secao) return '<div class="secao-form">' + h(f.secao) + "</div>";
    const id = "f-" + f.nome, val = v === undefined || v === null ? "" : v;
    if (f.tipo === "check") return '<label class="campo-check span-2"><input type="checkbox" id="' + id + '" name="' + f.nome + '"' + (val ? " checked" : "") + "><span>" + f.rotulo + "</span></label>";
    let inp;
    if (f.tipo === "textarea") inp = '<textarea id="' + id + '" name="' + f.nome + '" rows="' + (f.linhas || 3) + '" placeholder="' + h(f.ph || "") + '">' + h(val) + "</textarea>";
    else if (f.tipo === "select") inp = '<select id="' + id + '" name="' + f.nome + '">' + f.opcoes.map(o => { const [ov, ol] = Array.isArray(o) ? o : [o, o]; return '<option value="' + h(ov) + '"' + (String(ov) === String(val) ? " selected" : "") + ">" + h(ol) + "</option>"; }).join("") + "</select>";
    else if (f.tipo === "money") inp = '<input id="' + id + '" name="' + f.nome + '" inputmode="decimal" placeholder="0,00" value="' + (val === "" ? "" : h(Number(val).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }))) + '">';
    else inp = '<input id="' + id + '" name="' + f.nome + '" type="' + ({ datetime: "datetime-local", date: "date", url: "url", number: "number", password: "password" }[f.tipo] || "text") + '" value="' + h(val) + '" placeholder="' + h(f.ph || "") + '"' + (f.tipo === "number" ? ' min="0" step="1"' : "") + ">";
    return '<div class="campo' + (f.span === 2 ? " span-2" : "") + '"><label for="' + id + '">' + f.rotulo + (f.req ? ' <b class="req">*</b>' : "") + "</label>" + inp + (f.dica ? "<small>" + f.dica + "</small>" : "") + "</div>";
  }
  function lerForm(form, campos) {
    const v = {};
    campos.filter(f => f.nome).forEach(f => {
      const el = form.elements[f.nome];
      if (!el) return;
      if (f.tipo === "check") v[f.nome] = el.checked;
      else if (f.tipo === "money") v[f.nome] = U.lerMoeda(el.value);
      else if (f.tipo === "number") v[f.nome] = el.value === "" ? null : Number(el.value);
      else v[f.nome] = el.value.trim();
    });
    return v;
  }
  function abrirForm(o) {
    abrirModal({
      titulo: o.titulo, tamanho: o.tamanho || "",
      corpo: '<form id="form-modal" class="form-grid" novalidate>' + (o.topo || "") + o.campos.map(f => campoHTML(f, (o.valores || {})[f.nome])).join("") + "</form>",
      rodape: '<button class="btn ghost" type="button" data-acao="fecharModal">Cancelar</button><button class="btn primario" type="submit" form="form-modal">' + (o.botao || "Salvar") + "</button>",
      aoAbrir: () => {
        const form = $("#form-modal");
        form.addEventListener("submit", ev => {
          ev.preventDefault();
          const vals = lerForm(form, o.campos);
          $$(".campo.erro", form).forEach(x => x.classList.remove("erro"));
          const faltando = o.campos.filter(f => f.req && (vals[f.nome] === "" || vals[f.nome] === null || vals[f.nome] === undefined));
          if (faltando.length) {
            faltando.forEach(f => { const c = form.elements[f.nome]; if (c) c.closest(".campo").classList.add("erro"); });
            form.elements[faltando[0].nome].focus();
            toast("Preencha os campos obrigatórios", faltando.map(f => f.rotulo).join(", "), "crit");
            return;
          }
          const erro = o.validar && o.validar(vals);
          if (erro) { toast(erro, "", "crit"); return; }
          fecharModal();
          o.salvar(vals);
        });
        if (o.aoAbrir) o.aoAbrir(form);
      }
    });
  }
  function confirmar(titulo, texto, rotulo, fn, perigo) {
    abrirModal({
      titulo, tamanho: "estreito", corpo: "<p>" + texto + "</p>",
      rodape: '<button class="btn ghost" data-acao="fecharModal">Cancelar</button><button class="btn ' + (perigo === false ? "primario" : "perigo") + '" id="btn-confirmar">' + rotulo + "</button>",
      aoAbrir: () => { $("#btn-confirmar").addEventListener("click", () => { fecharModal(); fn(); }); }
    });
  }
  function toast(titulo, corpo, tipo, acao) {
    const t = document.createElement("div");
    t.className = "toast " + (tipo || "");
    t.setAttribute("role", "status");
    t.innerHTML = "<div><b>" + h(titulo) + "</b>" + (corpo ? "<span>" + h(corpo) + "</span>" : "") + "</div>" +
      (acao ? '<a class="btn peq" href="#' + acao.rota + '" data-acao="ir" data-rota="' + acao.rota + '" data-ref="' + h(acao.ref || "") + '">' + h(acao.rotulo) + "</a>" : "");
    $("#toasts").appendChild(t);
    setTimeout(() => { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(() => t.remove(), 320); }, acao ? 9000 : 4200);
  }
  function bip() {
    if (!S.ajustes.som) return;
    try {
      const ctx = bip.ctx || (bip.ctx = new (window.AudioContext || window.webkitAudioContext)());
      [0, .16].forEach((atraso, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain(), t0 = ctx.currentTime + atraso;
        o.type = "sine"; o.frequency.value = i ? 1046 : 784;
        g.gain.setValueAtTime(.0001, t0); g.gain.exponentialRampToValueAtTime(.12, t0 + .02); g.gain.exponentialRampToValueAtTime(.0001, t0 + .3);
        o.connect(g); g.connect(ctx.destination); o.start(t0); o.stop(t0 + .32);
      });
    } catch (e) { /* som indisponível */ }
  }
  function notificar(titulo, corpo, tipo, acao) {
    toast(titulo, corpo, tipo, acao);
    bip();
    if (S.ajustes.notificacoes && "Notification" in window && Notification.permission === "granted") {
      try { new Notification(titulo, { body: corpo, tag: titulo }); } catch (e) { /* bloqueado */ }
    }
  }

  /* =================================================================
     API (funções da Vercel)
     ================================================================= */
  async function api(caminho, ms) {
    if (!/^https?:$/.test(location.protocol) && !S.ajustes.apiBase) throw new Error("Abra o portal pelo endereço publicado na Vercel para usar a leitura automática.");
    const cab = { accept: "application/json" };
    if (nuvem.cliente) { const { data } = await nuvem.cliente.auth.getSession(); if (data && data.session) cab.authorization = "Bearer " + data.session.access_token; }
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), ms || 30000);
    try {
      const r = await fetch((S.ajustes.apiBase || "").replace(/\/+$/, "") + caminho, { signal: ctrl.signal, headers: cab });
      if (!(r.headers.get("content-type") || "").includes("json")) throw new Error("A API do portal não respondeu neste endereço. Confira o endereço em Ajustes → Integrações.");
      const j = await r.json();
      if (!r.ok) throw new Error(j.erro || "Erro " + r.status);
      return j;
    } catch (e) {
      if (e.name === "AbortError") throw new Error("O portal de compras demorou demais para responder.");
      if (e instanceof TypeError) throw new Error("Sem conexão com a API do portal neste endereço.");
      throw e;
    } finally { clearTimeout(t); }
  }

  /* ---------- Disputa no e-compras.AM: fase, ranking e posição da empresa ----------
     A página pública de acompanhamento lista, por lote, as empresas em ordem de valor, com os sinais
     de melhor lance, habilitada e vencedora. O portal acha a empresa do grupo nessa lista, mostra a
     posição, avisa quando ela muda e avança a etapa do edital sozinho (sem voltar etapa). */
  const FASES = [
    [/recurs/i, "Fase recursal", "recurso"],
    [/inscri[çc][ãa]o de propostas|recebimento de propostas|publicad|aberto para propostas|agendad/i, "Recebendo propostas", "cadastrada"],
    [/disputa|lances|sess[ãa]o (?:aberta|em andamento)|em andamento|negocia/i, "Em disputa", "disputa"],
    [/classifica|aceita|an[áa]lise|julgamento|habilita|dilig/i, "Análise das propostas e habilitação", "habilitacao"],
    [/aguardando homologa|adjudica/i, "Aguardando homologação", null],
    [/homologad/i, "Homologado", "fim"],
    [/fracassad|desert/i, "Fracassada / deserta", null],
    [/anulad|revogad|cancelad/i, "Anulada / revogada", null],
    [/suspens/i, "Suspensa", null]
  ];
  const faseDe = st => { const f = FASES.find(([re]) => re.test(st || "")); return f ? { nome: f[1], etapa: f[2] } : st ? { nome: st, etapa: null } : null; };
  // Nomes da empresa e do grupo como aparecem nos portais (Ajustes → Empresa)
  function termosGrupo() {
    const t = termos.filter(x => !/^\d+$/.test(x));
    String(S.empresa.grupo || "").split(/\n|;/).map(x => U.semAcento(x).toLowerCase().replace(/\s+/g, " ").trim()).filter(x => x.length >= 3).forEach(x => t.push(x));
    return [...new Set(t)];
  }
  const ehNossa = nome => { const n = U.semAcento(nome || "").toLowerCase(); return termosGrupo().some(x => new RegExp("(^|[^a-z0-9])" + x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^a-z0-9]|$)").test(n)); };
  function posicaoDisputa(c) {
    const d = c && c.disputa;
    if (!d || !d.lotes) return [];
    return d.lotes.map(l => {
      const ps = (l.participantes || []).slice().sort((a, b) => ((a.negociado || a.valor || 9e15) - (b.negociado || b.valor || 9e15)));
      const i = ps.findIndex(p => ehNossa(p.nome)), nossa = i >= 0 ? ps[i] : null;
      const aFrente = i > 0 ? ps.slice(0, i) : [];
      const nomeLote = String(l.nome || "Lote " + l.numero).split(",")[0].replace(/\s+/g, " ").trim();
      return { lote: nomeLote.length > 70 ? nomeLote.slice(0, 68) + "…" : nomeLote, situacao: l.situacao || "", ps, total: ps.length, pos: i >= 0 ? i + 1 : null, nossa,
        melhor: ps.find(p => p.melhor) || ps[0] || null, venc: ps.find(p => p.vencedor) || null, vencemos: !!(nossa && nossa.vencedor),
        foraAFrente: aFrente.filter(p => p.habilitado === false || p.exame2 === false).length, semLances: !!l.semLances };
    });
  }
  const resumoPosicao = c => posicaoDisputa(c).filter(x => x.pos).map(x => x.lote + ": " + x.pos + "º de " + x.total + (x.nossa.melhor ? ", melhor lance" : "") + (x.nossa.habilitado === true ? ", habilitada" : x.nossa.habilitado === false ? ", inabilitada" : "") + (x.vencemos ? ", vencedora" : x.venc ? ", vencedora: " + x.venc.nome : "")).join(" · ");
  function atualizarDisputa(c, d) {
    const antes = c.disputa ? resumoPosicao(c) : null;
    c.disputa = d; c.disputaEm = new Date().toISOString();
    const depois = resumoPosicao(c);
    if (antes !== null && depois && depois !== antes) {
      registrar(c.titulo + ": posição na disputa — " + depois + ".", "chats");
      notificar(c.titulo + ": a posição na disputa mudou", depois, posicaoDisputa(c).some(x => x.vencemos) ? "pop" : "", { rotulo: "Ver disputa", rota: "chats", ref: c.id });
    }
  }
  const ORDEM_ETAPAS = ["triagem", "analise", "proposta", "cadastrada", "disputa", "habilitacao", "recurso", "ganho", "perdido"];
  function avancarEtapa(c) {
    const e = c.editalId && edital(c.editalId);
    if (!e || ETAPA(e.etapa).final) return;
    const f = faseDe(c.status), pos = posicaoDisputa(c);
    const participamos = pos.some(x => x.pos);
    let alvo = f && f.etapa;
    if (alvo === "fim") alvo = pos.some(x => x.vencemos) ? "ganho" : pos.some(x => x.venc) && participamos ? "perdido" : null;
    if (!alvo) return;
    if (e.propostaStatus !== "cadastrada" && !participamos) return; // só segue o pregão se a proposta é nossa
    if (participamos && e.propostaStatus !== "cadastrada") e.propostaStatus = "cadastrada";
    if (ORDEM_ETAPAS.indexOf(alvo) <= ORDEM_ETAPAS.indexOf(e.etapa)) return; // nunca volta etapa
    const de = ETAPA(e.etapa).nome;
    e.etapa = alvo;
    if (alvo === "ganho" && !e.nossoValor) { const v = pos.filter(x => x.vencemos).reduce((t, x) => t + (Number(x.nossa.negociado || x.nossa.valor) || 0), 0); if (v) e.nossoValor = v; }
    (e.historico = e.historico || []).unshift({ data: U.hojeISO(), texto: "Etapa atualizada sozinha pelo e-compras.AM: " + de + " → " + ETAPA(alvo).nome + " (" + c.status + ")." });
    registrar(e.numero + " passou para \"" + ETAPA(alvo).nome + "\" (situação no portal: " + c.status + ").", "editais");
    notificar(e.numero + ": " + ETAPA(alvo).nome, "A etapa foi atualizada pela situação no e-compras.AM (" + c.status + ").", alvo === "ganho" ? "pop" : "", { rotulo: "Ver edital", rota: "editais", ref: e.id });
  }
  // Começa a acompanhar sozinho todo pregão ativo do e-compras.AM
  const ehEcompras = e => /e-compras/i.test(e.portal || "") || /e-compras\.am\.gov\.br/i.test(e.link || "");
  function garantirMonitoramento() {
    const novos = [];
    // todo edital ativo do e-compras.AM: se a empresa aparecer no ranking, a proposta é marcada como cadastrada sozinha
    S.editais.filter(e => ativo(e) && ehEcompras(e)).forEach(e => {
      let c = chatDoEdital(e.id);
      const link = /ident=\d+/.test(e.link || "") ? e.link : "";
      if (!c) {
        c = { id: U.uid(), editalId: e.id, titulo: e.numero, orgao: e.orgao, portal: "e-compras AM", processo: link || e.numero, link, auto: true, status: "", mensagens: [] };
        S.chats.push(c); novos.push(c);
        registrar("Acompanhamento automático do " + e.numero + " no e-compras.AM iniciado.", "chats");
      } else if (!c.auto) {
        c.auto = true;
        c.processo = /^\d+$/.test(c.ident || "") ? "https://www.e-compras.am.gov.br/publico/licitacoes_acompanhamento.asp?ident=" + c.ident : link || c.processo || e.numero;
        novos.push(c);
      }
    });
    if (novos.length) { salvar(); novos.forEach(c => { c.consultadoEm = null; }); setTimeout(() => verificarChats(), 400); }
    return novos.length;
  }
  function disputaHTML(c, compacto) {
    if (!c || (!c.status && !c.disputa)) return "";
    const f = faseDe(c.status), pos = posicaoDisputa(c);
    const sinal = (v, sim, nao) => v === true && sim ? '<span class="pill ok sem-ponto">' + sim + "</span>" : v === false && nao ? '<span class="pill crit sem-ponto">' + nao + "</span>" : "";
    const cabLote = x => '<div class="lote-cab"><b>' + h(x.lote) + "</b>" + (x.situacao ? '<span class="pill neutral sem-ponto">' + h(x.situacao) + "</span>" : "") + "</div>";
    const pct = (a, b) => (a && b ? ((a / b - 1) * 100).toFixed(1).replace(".", ",") + "%" : "");
    const lotes = pos.map(x => {
      if (x.semLances || !x.total) return '<div class="lote-disp">' + cabLote(x) + '<p class="muted">A lista de participantes aparece quando a sessão abrir.</p></div>';
      const n = x.nossa;
      const linhaNossa = n ? "<p class=\"pos-nossa\"><b>" + x.pos + "º de " + x.total + "</b> por valor · " + U.moeda(n.negociado || n.valor) + " " + sinal(n.melhor, "Melhor lance agora", "") + sinal(n.habilitado, "Habilitada", "Inabilitada") + (n.exame2 === false ? '<span class="pill crit sem-ponto">Desclassificada</span>' : "") + (x.vencemos ? '<span class="pill pop sem-ponto">🏆 Vencedora</span>' : "") + "</p>"
        : '<p class="muted">A empresa não aparece entre as ' + x.total + " participantes. Se ela usa outro nome no portal, informe em Ajustes → Empresa → Empresas do grupo.</p>";
      const ref = x.melhor && n && x.melhor !== n && !x.vencemos ? "<p class=\"muted\">Melhor lance: " + h(x.melhor.nome) + " · " + U.moeda(x.melhor.negociado || x.melhor.valor) + " (o nosso está " + pct(n.negociado || n.valor, x.melhor.negociado || x.melhor.valor) + " acima)" + (x.foraAFrente ? " · " + U.plural(x.foraAFrente, "empresa à frente já está inabilitada ou desclassificada", "empresas à frente já estão inabilitadas ou desclassificadas") : "") + "</p>" : "";
      const venc = x.venc && !x.vencemos ? '<p class="muted">Vencedora: <b>' + h(x.venc.nome) + "</b> · " + U.moeda(x.venc.negociado || x.venc.valor) + "</p>" : "";
      const tabela = compacto ? "" : '<details><summary class="link-btn">Ver as ' + x.total + ' empresas</summary><div class="tabela-wrap" style="margin-top:8px"><table class="tabela tabela-disp"><thead><tr><th>#</th><th>Empresa</th><th style="text-align:right">Valor</th><th>Situação</th></tr></thead><tbody>' +
        x.ps.map((p, i) => '<tr class="' + (ehNossa(p.nome) ? "nossa" : "") + '"><td class="num">' + (i + 1) + "</td><td>" + h(p.nome) + (p.vencedor ? " 🏆" : "") + '</td><td class="num" style="text-align:right">' + U.moeda(p.negociado || p.valor) + "</td><td>" + [p.melhor ? "melhor lance" : "", p.habilitado === true ? "habilitada" : p.habilitado === false ? "inabilitada" : "", p.exame2 === false ? "desclassificada" : ""].filter(Boolean).join(", ") + "</td></tr>").join("") + "</tbody></table></div></details>";
      return '<div class="lote-disp">' + cabLote(x) + linhaNossa + ref + venc + tabela + "</div>";
    }).join("");
    return '<div class="disputa' + (compacto ? " compacto" : "") + '"><div class="disputa-h"><span class="eyebrow">Fase no portal</span><b>' + h(f ? f.nome : "—") + "</b>" + (f && f.nome !== c.status && c.status ? ' <span class="muted">(' + h(c.status) + ")</span>" : "") +
      (c.disputaEm ? '<span class="muted" style="margin-left:auto;font-size:12.5px">atualizado ' + U.desde(U.isoDataHora(new Date(c.disputaEm))) + "</span>" : "") + "</div>" + (lotes || "") + "</div>";
  }

  async function verificarChats(soEste) {
    const lista = S.chats.filter(c => c.auto && c.processo && (!soEste || c.id === soEste));
    if (!lista.length) return;
    if (!soEste) { if (ui.lendoChats) return; ui.lendoChats = true; } // uma leitura geral por vez
    try { await lerChatsDaLista(lista, soEste); } finally { if (!soEste) ui.lendoChats = false; }
  }
  async function lerChatsDaLista(lista, soEste) {
    if (!soEste && Date.now() - ui.apiFalhouEm < 10 * 60000) return;
    const intervalo = Math.max(2, +S.ajustes.intervaloChat || 5) * 60000;
    let mudou = false;
    for (const c of lista) {
      if (!soEste && c.consultadoEm && Date.now() - new Date(c.consultadoEm).getTime() < intervalo) continue;
      ui.lendo[c.id] = true;
      if (soEste) render();
      try {
        mesclarChat(c, await api("/api/chat?" + consultaDoChat(c)));
        c.erro = "";
      } catch (e) {
        c.erro = e.message;
        if (!soEste) ui.apiFalhouEm = Date.now();
        else toast("Não consegui ler o chat do " + c.titulo, e.message, "crit");
      }
      c.consultadoEm = new Date().toISOString();
      delete ui.lendo[c.id];
      mudou = true;
    }
    if (mudou) { salvar(); if (soEste || ["chats", "painel", "alertas"].includes(rotaAtual())) renderSeLivre(); else atualizarNav(); }
  }
  /* ---------- Robô do GitHub (alerta-csc/chats.json) ----------
     O robô lê o e-compras.AM a cada 5 minutos, manda o e-mail e grava as mensagens nesse arquivo.
     O portal junta essas mensagens nos chats, então o que chega por e-mail aparece aqui também. */
  const numAno = t => { const m = String(t || "").match(/(\d+)\s*\/\s*(?:20)?(\d{2})\b/); return m ? (+m[1]) + "/" + m[2] : ""; };
  function aplicarRobo(dados, origem) {
    if (!dados || !dados.pregoes) return 0;
    let novos = 0;
    Object.keys(dados.pregoes).forEach(ident => {
      const p = dados.pregoes[ident];
      let c = S.chats.find(x => x.ident === ident || new RegExp("ident=" + ident + "\\b").test((x.processo || "") + " " + (x.link || "")))
        || S.chats.find(x => (x.portal === "e-compras AM" || x.robo || p.fonte === "PNCP") && numAno(x.titulo) && numAno(x.titulo) === numAno(p.edital));
      if (!c) {
        c = { id: "robo-" + ident, titulo: p.edital, orgao: "", portal: p.fonte === "PNCP" ? "PNCP" : "e-compras AM", status: "", processo: p.fonte === "PNCP" ? "" : p.link, link: p.link, auto: false, mensagens: [] };
        S.chats.push(c);
        registrar("Chat do " + p.edital + " trazido do robô do GitHub.", "chats");
        novos++;
      }
      if (!c.editalId) { // liga ao edital de mesmo número/ano, se houver
        const ed = S.editais.find(e => numAno(e.numero) && numAno(e.numero) === numAno(p.edital));
        if (ed && !S.chats.some(x => x !== c && x.editalId === ed.id && x.mensagens.length)) { c.editalId = ed.id; c.orgao = c.orgao || ed.orgao; }
      }
      c.ident = ident; c.robo = true; c.roboEm = dados.atualizado_em || null; c.roboOrigem = origem;
      if (p.disputa && (!c.disputaEm || (dados.atualizado_em && dados.atualizado_em > c.disputaEm))) atualizarDisputa(c, p.disputa);
      mesclarChat(c, { pregao: { status: p.status, objeto: p.objeto, link: p.link }, mensagens: p.mensagens || [] });
    });
    return novos;
  }
  async function sincronizarRobo(forcar) {
    const url = (S.ajustes.arquivoRobo || "").trim();
    if (!url && !window.ROBO_FOTO) return;
    const intervalo = Math.max(2, +S.ajustes.intervaloChat || 5) * 60000;
    if (!forcar && ui.roboLidoEm && Date.now() - ui.roboLidoEm < intervalo) return;
    ui.roboLidoEm = Date.now();
    let dados = null, origem = "ao vivo";
    try {
      if (!url) throw new Error("sem endereço");
      // Repositório privado: o link raw do GitHub não abre mais no navegador. A função /api/robo da
      // Vercel lê o arquivo com um token de leitura. Tenta ela primeiro; se não der, segue para o link.
      if (/raw\.githubusercontent\.com\/gyovannaflores4-max\//.test(url) || url === "/api/robo") {
        try { const j = await api("/api/robo", 20000); if (j && j.pregoes) { dados = j; origem = "ao vivo"; } }
        catch (e) { if (url === "/api/robo") throw e; }
      }
      if (dados) throw { pronto: true };
      // O repositório das ferramentas mudou de nome (projeto-analise-contratos-performance -> ferramentas-licitacoes).
      // Tenta primeiro o endereço novo e, se falhar, o que está salvo nos Ajustes.
      const ANTIGO = "/projeto-analise-contratos-performance/", NOVO = "/ferramentas-licitacoes/";
      const enderecos = url.includes(ANTIGO) ? [url.replace(ANTIGO, NOVO), url] : [url];
      let r = null;
      for (const e of enderecos) {
        const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 20000);
        try { r = await fetch(e + (e.includes("?") ? "&" : "?") + "t=" + Math.floor(Date.now() / 60000), { signal: ctrl.signal, cache: "no-store" }); }
        finally { clearTimeout(t); }
        if (r.ok) { try { dados = await r.json(); } catch (_) { dados = null; } }
        if (dados && dados.pregoes) break;
        dados = null;
      }
      if (!dados) throw new Error("O arquivo do robô respondeu com erro " + (r ? r.status : "") + ".");
      ui.roboErro = "";
    } catch (e) {
      if (e && e.pronto) { ui.roboErro = ""; } else {
      ui.roboErro = e.name === "AbortError" ? "O GitHub demorou para responder." : e.message === "sem endereço" ? "" : "Não consegui ler o arquivo do robô neste endereço.";
      // Versão publicada no Claude: o navegador bloqueia acesso externo; usa a cópia embutida na publicação.
      if (window.ROBO_FOTO && !ui.fotoAplicada) { dados = window.ROBO_FOTO; origem = "cópia de " + U.fmtDataHora(U.isoDataHora(new Date(dados.atualizado_em))); ui.fotoAplicada = true; }
      }
    }
    if (dados) {
      const novos = aplicarRobo(dados, origem);
      salvar();
      if (forcar) toast("Chats sincronizados com o robô", novos ? U.plural(novos, "pregão novo", "pregões novos") + " na lista." : "Mensagens atualizadas.");
      if (["chats", "painel", "alertas"].includes(rotaAtual())) renderSeLivre(); else atualizarNav();
    } else if (forcar) toast("Não consegui ler o arquivo do robô", ui.roboErro || "Confira o endereço em Ajustes → Integrações.", "crit");
  }

  // "408/26" -> processo=408/26; link de acompanhamento ou número interno -> ident=256066
  // Pelo número (ex.: DLE 061/26) o mesmo número existe em vários órgãos: manda órgão e objeto para achar o certo
  function consultaDoChat(c) {
    const q = consultaChat(c.processo);
    if (!/^processo=/.test(q)) return q;
    const e = c.editalId && edital(c.editalId);
    return q + "&orgao=" + encodeURIComponent((e && e.orgao) || c.orgao || "") + "&objeto=" + encodeURIComponent(U.corta((e && e.objeto) || "", 160));
  }
  function consultaChat(ref) {
    ref = String(ref || "").trim();
    const ident = (ref.match(/ident=(\d+)/i) || [])[1] || (/^\d{5,}$/.test(ref) ? ref : "");
    return ident ? "ident=" + ident : /ident=/i.test(ref) ? "url=" + encodeURIComponent(ref) : "processo=" + encodeURIComponent(ref);
  }
  function validarRefChat(ref) {
    ref = String(ref || "").trim();
    if (/ident=(?!\d)/i.test(ref)) return "Esse link está sem o número do pregão (ident=" + (ref.match(/ident=([^&#]*)/i) || [])[1] + "). Abra o pregão de novo no e-compras.AM e copie o link da barra de endereço, ou informe o número/ano (ex.: 408/26).";
    if (/ident=\d+/i.test(ref) || /^\d{5,}$/.test(ref) || /^\d{1,5}\/\d{2,4}$/.test(ref)) return "";
    return "Informe o número/ano (ex.: 408/26) ou cole o link de acompanhamento do e-compras.AM.";
  }
  function mesclarChat(c, j) {
    const primeira = !c.mensagens.length;
    const conhecidas = new Set(c.mensagens.map(A.chaveMensagem));
    const novas = [];
    (j.mensagens || []).forEach(m => {
      const msg = { hora: A.horaISO(m.hora) || m.hora, autor: m.autor || "Sistema", texto: m.texto || "", lida: primeira };
      const k = A.chaveMensagem(msg);
      if (!conhecidas.has(k)) { conhecidas.add(k); novas.push(msg); }
    });
    c.mensagens = c.mensagens.concat(novas).sort((a, b) => (a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : 0));
    if (j.pregao) {
      const st = j.pregao.status;
      if (st && c.status && st !== c.status && !primeira) {
        registrar(c.titulo + ": situação mudou de \"" + c.status + "\" para \"" + st + "\".", "chats");
        notificar(c.titulo + ": " + st, "A situação do pregão mudou (antes: " + c.status + ").", "pop", { rotulo: "Ver chat", rota: "chats", ref: c.id });
      }
      if (st) c.status = st;
      if (!c.orgao && (j.pregao.orgao || j.pregao.objeto)) c.orgao = U.corta(j.pregao.orgao || j.pregao.objeto, 90);
      if (j.pregao.link && /ident=\d+/.test(j.pregao.link) && (!c.link || /ident=(?!\d)/i.test(c.link))) c.link = j.pregao.link;
      if (j.pregao.id && /^\d+$/.test(String(j.pregao.id))) {
        c.ident = String(j.pregao.id);
        if (c.processo && !/ident=\d+/.test(c.processo) && j.pregao.link) c.processo = j.pregao.link; // fixa o pregão achado
      }
      if (j.pregao.disputa) atualizarDisputa(c, j.pregao.disputa);
    }
    avancarEtapa(c);
    if (novas.length && !primeira) avisarNovas(c, novas);
  }
  function avisarNovas(c, novas) {
    const cit = novas.filter(m => infoMsg(m).citaEmpresa), imp = novas.filter(m => infoMsg(m).importante);
    const ret = novas.map(m => infoMsg(m).retomada).find(Boolean);
    const titulo = cit.length ? c.titulo + ": o pregoeiro citou a " + apelido() : c.titulo + ": " + U.plural(novas.length, "mensagem nova", "mensagens novas");
    registrar(titulo + (ret ? " · retomada " + ret : ""), "chats");
    notificar(titulo, U.corta((cit[0] || imp[0] || novas[novas.length - 1]).texto, 150) + (ret ? " · Retomada " + ret : ""), cit.length ? "crit" : imp.length ? "pop" : "", { rotulo: "Abrir chat", rota: "chats", ref: c.id });
  }

  /* =================================================================
     Telas
     ================================================================= */
  function faixaExemplo() {
    if (!S.exemplo) return "";
    return '<div class="faixa"><span><b>Dados de exemplo.</b> Órgãos, empresas e mensagens são fictícios, para você explorar o portal à vontade.</span>' +
      '<div class="cab-acoes"><button class="btn peq ghost" data-acao="manterExemplo">Continuar explorando</button><button class="btn peq pop" data-acao="zerar">Começar com meus dados</button></div></div>';
  }
  function alertaHTML(a, comAcoes) {
    return '<div class="alerta ' + a.nivel + '"><span class="ico">' + ic(a.icone) + '</span><div class="tx"><b>' + h(a.titulo) + "</b><span>" + h(a.detalhe) + "</span></div>" +
      '<div class="lado">' + (a.semData ? "" : chip(a.quando)) + '<a class="btn peq ghost" href="#' + a.rota + '" data-acao="ir" data-rota="' + a.rota + '" data-ref="' + h(a.ref || "") + '">Abrir</a></div>' +
      (comAcoes ? '<div class="alerta-acoes"><button class="link-btn" data-acao="resolverAlerta" data-id="' + h(a.id) + '">Marcar como resolvido</button><span class="muted">·</span><button class="link-btn" data-acao="adiarAlerta" data-id="' + h(a.id) + '">Lembrar amanhã</button></div>' : "") + "</div>";
  }
  function vazio(icone, texto, botao) { return '<div class="vazio">' + ic(icone) + "<p>" + texto + "</p>" + (botao || "") + "</div>"; }

  /* ---------- Painel ---------- */
  function pgPainel() {
    const al = gerarAlertas();
    const ativos = S.editais.filter(ativo);
    const sessoes7 = ativos.filter(e => e.sessao && !U.passou(e.sessao) && U.diasAte(e.sessao) <= 7);
    const sessoesHoje = sessoes7.filter(e => U.diasAte(e.sessao) === 0);
    const propPend = S.editais.filter(e => precisaProposta(e) && limiteDe(e) && !U.passou(limiteDe(e)) && U.diasAte(limiteDe(e)) <= 7);
    const recAbertos = S.recursos.map(r => ({ r, p: prazoNosso(r) })).filter(x => x.p && ["razoes", "contrarrazoes"].includes(x.p.tipo) && !U.passou(x.p.data)).sort((a, b) => a.p.data.localeCompare(b.p.data));
    const docsRisco = S.documentos.filter(d => ["crit", "warn"].includes(situacaoDoc(d).cls));
    const docsVencidos = S.documentos.filter(d => d.validade && U.diasAte(d.validade) < 0);
    const msgsNovas = S.chats.reduce((s, c) => s + naoLidas(c).length, 0);
    const hora = new Date().getHours();
    const ola = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

    const partes = [];
    if (sessoesHoje.length) partes.push(U.plural(sessoesHoje.length, "sessão pública", "sessões públicas") + " hoje");
    if (propPend.length) partes.push(U.plural(propPend.length, "proposta", "propostas") + " para cadastrar na semana");
    if (recAbertos.length) partes.push(U.plural(recAbertos.length, "prazo recursal correndo", "prazos recursais correndo"));
    if (msgsNovas) partes.push(U.plural(msgsNovas, "mensagem nova", "mensagens novas") + " nos chats");
    const frase = partes.length ? "Hoje tem " + partes.slice(0, -1).join(", ") + (partes.length > 1 ? " e " : "") + partes[partes.length - 1] + "."
      : "Dia tranquilo por aqui. Bom momento para garimpar editais novos.";

    // Prioridade da equipe: propostas para cadastrar e recursos/contrarrazões para responder (o resto fica na Central de alertas)
    const ehPrioridade = a => ((a.tipo === "proposta" && a.id.startsWith("prop:") && !/encerrado/.test(a.titulo)) || (a.tipo === "recurso" && /:(razoes|contrarrazoes):/.test(a.id))) && !(U.diasAte(a.quando) < 0);
    const prioridades = al.filter(ehPrioridade).sort((x, y) => String(x.quando).localeCompare(String(y.quando))).slice(0, 8);
    const agenda = eventosAgenda(7);
    const porDia = {};
    agenda.forEach(ev => { (porDia[U.soData(ev.data)] = porDia[U.soData(ev.data)] || []).push(ev); });

    const contagem = {};
    S.editais.forEach(e => { contagem[e.etapa] = (contagem[e.etapa] || 0) + 1; });
    const funil = ETAPAS.filter(e => !e.final);
    const maxF = Math.max(1, ...funil.map(e => contagem[e.id] || 0));
    const ganhos = S.editais.filter(e => e.etapa === "ganho"), perdidos = S.editais.filter(e => e.etapa === "perdido");
    const taxa = ganhos.length + perdidos.length ? Math.round(100 * ganhos.length / (ganhos.length + perdidos.length)) : null;
    const valorGanho = ganhos.reduce((s, e) => s + (Number(e.nossoValor) || 0), 0);
    const circ = 2 * Math.PI * 26;

    const chats = S.chats.slice().sort((a, b) => (naoLidas(b).length - naoLidas(a).length) || String((ultimaMsg(b) || {}).hora).localeCompare(String((ultimaMsg(a) || {}).hora))).slice(0, 4);

    return faixaExemplo() +
      '<section class="saudacao"><div><span class="eyebrow">' + h(U.dataPorExtenso(U.hojeISO())) + "</span><h1>" + ola + ', <em>' + h(S.empresa.equipe || "equipe") + "</em>!</h1><p>" + h(frase) + "</p></div>" +
      '<div class="cab-acoes"><button class="btn ghost" data-acao="copiarResumo">' + ic("copiar") + 'Copiar resumo do dia</button><a class="btn primario" href="#alertas">' + ic("alertas") + "Ver todos os alertas</a></div></section>" +

      '<section class="kpis" aria-label="Indicadores">' +
      '<a class="kpi destaque" href="#editais"><span class="rot">Editais em andamento</span><span class="val">' + ativos.length + '</span><span class="sub">' + U.moedaCurta(ativos.reduce((s, e) => s + (Number(e.valorEstimado) || 0), 0)) + " em disputa</span></a>" +
      '<a class="kpi ' + (propPend.length ? "kpi-atencao" : "") + '" href="#propostas"><span class="rot">Propostas para cadastrar</span><span class="val">' + propPend.length + '</span><span class="sub">nos próximos 7 dias</span></a>' +
      '<a class="kpi" href="#editais"><span class="rot">Sessões na semana</span><span class="val">' + sessoes7.length + '</span><span class="sub">' + U.plural(sessoesHoje.length, "hoje", "hoje") + "</span></a>" +
      '<a class="kpi ' + (recAbertos.length ? "kpi-atencao" : "") + '" href="#recursos"><span class="rot">Prazos recursais</span><span class="val">' + recAbertos.length + '</span><span class="sub">' + (recAbertos[0] ? "próximo: " + U.fmtDataCurta(recAbertos[0].p.data) : "nenhum correndo") + "</span></a>" +
      '<a class="kpi ' + (docsVencidos.length ? "kpi-crit" : docsRisco.length ? "kpi-atencao" : "") + '" href="#documentos"><span class="rot">Documentos a renovar</span><span class="val">' + docsRisco.length + '</span><span class="sub">' + (docsVencidos.length ? U.plural(docsVencidos.length, "vencido", "vencidos") : "nenhum vencido") + "</span></a>" +
      "</section>" +

      '<div class="grade-2"><div class="pilha">' +
      '<section class="card"><div class="card-h"><h2>Prioridades de agora</h2><a class="link-btn" href="#alertas">' + U.plural(al.length, "alerta ativo", "alertas ativos") + "</a></div>" +
      '<p class="muted" style="font-size:13px;margin:-4px 0 10px">Propostas para cadastrar e recursos e contrarrazões para responder.</p>' +
      (prioridades.length ? '<div class="alertas">' + prioridades.map(a => alertaHTML(a)).join("") + "</div>" : vazio("check", "Nenhuma proposta para cadastrar nem recurso para responder agora.")) + "</section>" +
      '<section class="card"><div class="card-h"><h2>Agenda dos próximos 7 dias</h2><button class="link-btn" data-acao="exportarAgenda">Levar para minha agenda</button></div>' +
      (agenda.length ? '<div class="agenda">' + Object.keys(porDia).map(dia => {
        const d = U.parse(dia);
        return '<div class="agenda-dia"><div class="agenda-data' + (dia === U.hojeISO() ? " hoje" : "") + '"><b>' + d.getDate() + "</b><span>" + U.semana(dia) + '</span></div><div class="agenda-itens">' +
          porDia[dia].map(ev => '<a class="ev ev-' + ev.tipo + '" href="#' + ev.rota + '" data-acao="ir" data-rota="' + ev.rota + '" data-ref="' + h(ev.ref) + '"><span class="hr">' + (U.fmtHora(ev.data) || "dia") + '</span><span class="marca-tipo"></span><span class="t"><b>' + h(ev.titulo) + "</b> <span>· " + h(U.corta(ev.sub, 60)) + "</span></span></a>").join("") + "</div></div>";
      }).join("") + "</div>" : vazio("calendario", "Nenhum compromisso nos próximos 7 dias.")) + "</section>" +
      "</div>" +

      '<div class="pilha">' +
      '<section class="card"><div class="card-h"><h2>Funil de editais</h2><a class="link-btn" href="#editais">Ver quadro</a></div><div class="barras">' +
      funil.map(e => '<a class="barra" href="#editais" data-acao="filtrarEtapa" data-etapa="' + e.id + '"><span>' + h(e.curto || e.nome) + '</span><span class="trilho"><span class="enchimento" style="width:' + Math.round(100 * (contagem[e.id] || 0) / maxF) + '%"></span></span><span class="n">' + (contagem[e.id] || 0) + "</span></a>").join("") + "</div>" +
      '<div class="taxa"><svg class="anel" viewBox="0 0 64 64" role="img" aria-label="Taxa de sucesso"><circle class="fundo" cx="32" cy="32" r="26"/>' +
      (taxa !== null ? '<circle class="valor" cx="32" cy="32" r="26" stroke-dasharray="' + (circ * taxa / 100).toFixed(1) + " " + circ.toFixed(1) + '"/>' : "") +
      '<text x="32" y="37" text-anchor="middle">' + (taxa === null ? "–" : taxa + "%") + "</text></svg>" +
      "<div><b>Taxa de sucesso</b><div class=\"muted\" style=\"font-size:13px\">" + ganhos.length + " ganhos e " + perdidos.length + " perdidos · " + U.moedaCurta(valorGanho) + " em propostas vencedoras</div></div></div></section>" +
      '<section class="card"><div class="card-h"><h2>Chats dos pregões</h2><a class="link-btn" href="#chats">Abrir chats</a></div>' +
      (chats.length ? chats.map(c => { const u = ultimaMsg(c), nl = naoLidas(c).length; return '<a class="mini-chat" href="#chats" data-acao="ir" data-rota="chats" data-ref="' + c.id + '"><span class="av">' + h(c.titulo.replace(/\D+/g, " ").trim().split(" ")[0] || "PE") + '</span><span class="tx"><b>' + h(c.titulo) + "</b> " + (nl ? '<span class="badge">' + nl + "</span>" : "") + "<p>" + (u ? "<b>" + h(u.autor) + ":</b> " + h(u.texto) : "Sem mensagens ainda.") + '</p></span><span class="muted" style="font-size:12px;white-space:nowrap">' + (u ? U.desde(u.hora) : "") + "</span></a>"; }).join("") : vazio("chats", "Nenhum pregão monitorado ainda.")) + "</section>" +
      '<section class="card atividade"><div class="card-h"><h2>Movimentações recentes</h2></div>' +
      (S.atividade.length ? "<ul>" + S.atividade.slice(0, 6).map(a => '<li><span class="q">' + h(U.desde(a.quando)) + "</span><span>" + h(a.texto) + "</span></li>").join("") + "</ul>" : vazio("relogio", "As movimentações aparecem aqui.")) + "</section>" +
      "</div></div>";
  }

  /* ---------- Editais ---------- */
  function filtrarEditais() {
    const b = U.semAcento(ui.fEd.busca).toLowerCase().trim();
    return S.editais.filter(e => (!ui.fEd.etapa || e.etapa === ui.fEd.etapa) && (!ui.fEd.portal || e.portal === ui.fEd.portal) &&
      (!b || U.semAcento([e.numero, e.orgao, e.objeto, e.municipio, e.uf, e.processo, e.responsavel].join(" ")).toLowerCase().includes(b)))
      .sort((a, b2) => String(a.sessao || "9").localeCompare(String(b2.sessao || "9")));
  }
  function kcard(e) {
    const nl = (chatDoEdital(e.id) && naoLidas(chatDoEdital(e.id)).length) || 0;
    const lim = limiteDe(e);
    const extras = [];
    if (precisaProposta(e) && lim && !U.passou(lim) && U.diasAte(lim) <= 3) extras.push('<span class="pill pop">Cadastrar proposta</span>');
    if (nl) extras.push('<span class="pill warn">' + U.plural(nl, "nova no chat", "novas no chat") + "</span>");
    return '<div role="button" tabindex="0" class="kcard' + (e.prioridade === "alta" ? " prioridade-alta" : "") + '" draggable="true" data-id="' + e.id + '" data-acao="abrirEdital" aria-label="' + h(e.numero + ", " + e.orgao) + '">' +
      '<span class="l1"><span class="num-ed">' + h(e.numero) + "</span>" + chipSessao(e.sessao) + "</span>" +
      '<span class="org">' + h(e.orgao) + "</span>" +
      (extras.length ? '<span class="chips">' + extras.join("") + "</span>" : "") +
      '<span class="l3"><span class="tag-portal" style="--cor:' + corPortal(e.portal) + '">' + h(e.portal || "—") + '</span><span class="num">' + U.moedaCurta(e.valorEstimado) + "</span></span></div>";
  }
  function quadroHTML(lista) {
    const colunas = ETAPAS.filter(e => !e.final);
    const finais = ETAPAS.filter(e => e.final);
    return '<div class="quadro-wrap"><div class="quadro">' + colunas.map(et => {
      const itens = lista.filter(e => e.etapa === et.id);
      return '<section class="coluna" data-coluna="' + et.id + '" aria-label="' + h(et.nome) + '"><div class="coluna-h"><b>' + h(et.curto || et.nome) + "</b><span>" + itens.length + (itens.length ? " · " + U.moedaCurta(itens.reduce((s, e) => s + (Number(e.valorEstimado) || 0), 0)) : "") + "</span></div>" +
        itens.map(kcard).join("") + "</section>";
    }).join("") + "</div></div>" +
      '<div class="ferramentas"><span class="muted" style="font-size:13px">Encerrados (arraste um cartão para cá):</span>' + finais.map(et => {
        const n = lista.filter(e => e.etapa === et.id).length;
        return '<button class="chip" data-coluna="' + et.id + '" data-acao="filtrarEtapa" data-etapa="' + et.id + '"><span class="pill ' + et.cls + ' sem-ponto">' + h(et.curto || et.nome) + '</span><span class="n">' + n + "</span></button>";
      }).join("") + "</div>";
  }
  function listaHTML(lista) {
    if (!lista.length) return vazio("editais", "Nenhum edital com esses filtros.", '<button class="btn primario" data-acao="novoEdital">' + ic("mais") + "Cadastrar edital</button>");
    return '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Edital</th><th>Órgão e objeto</th><th>Portal</th><th>Sessão</th><th>Etapa</th><th style="text-align:right">Valor estimado</th></tr></thead><tbody>' +
      lista.map(e => { const et = ETAPA(e.etapa); return '<tr class="clicavel" data-acao="abrirEdital" data-id="' + e.id + '" tabindex="0"><td class="forte">' + h(e.numero) + (e.uf ? '<span class="sub">' + h(e.municipio ? e.municipio + "/" + e.uf : e.uf) + "</span>" : "") + "</td><td>" + h(e.orgao) + '<span class="sub">' + h(e.objeto || "") + '</span></td><td><span class="tag-portal" style="--cor:' + corPortal(e.portal) + '">' + h(e.portal || "—") + '</span></td><td class="num">' + (e.sessao ? U.fmtDataHora(e.sessao) + " " + chipSessao(e.sessao) : "—") + '</td><td><span class="pill ' + et.cls + '">' + h(et.curto || et.nome) + '</span></td><td class="num" style="text-align:right">' + U.moeda(e.valorEstimado) + "</td></tr>"; }).join("") +
      "</tbody></table></div>";
  }
  function pgEditais() {
    return '<div class="cab"><div><span class="eyebrow">Operação</span><h1>Editais em acompanhamento</h1><p>Do garimpo à homologação. No quadro, arraste os cartões entre as colunas para mudar a etapa.</p></div>' +
      '<div class="cab-acoes"><a class="btn ghost" href="#analise">' + ic("analise") + 'Analisar um edital</a><button class="btn primario" data-acao="novoEdital">' + ic("mais") + "Novo edital</button></div></div>" +
      '<div class="ferramentas"><label class="campo-busca"><span class="sr">Buscar editais</span>' + ic("busca") + '<input type="search" id="f-busca-ed" data-digitar="buscaEd" value="' + h(ui.fEd.busca) + '" placeholder="Número, órgão, objeto, UF…"></label>' +
      '<select id="f-etapa" data-mudar="filtroEtapa" aria-label="Filtrar por etapa"><option value="">Todas as etapas</option>' + ETAPAS.map(e => '<option value="' + e.id + '"' + (ui.fEd.etapa === e.id ? " selected" : "") + ">" + h(e.nome) + "</option>").join("") + "</select>" +
      '<select id="filtro-portal-editais" data-mudar="filtroPortal" aria-label="Filtrar por portal"><option value="">Todos os portais</option>' + PORTAIS.map(p => '<option' + (ui.fEd.portal === p ? " selected" : "") + ">" + h(p) + "</option>").join("") + "</select>" +
      '<div class="segmento" role="group" aria-label="Visualização"><button data-acao="vista" data-v="quadro" aria-pressed="' + (ui.editaisVista === "quadro") + '">Quadro</button><button data-acao="vista" data-v="lista" aria-pressed="' + (ui.editaisVista === "lista") + '">Lista</button></div></div>' +
      '<div id="ed-resultado">' + resultadoEditais() + "</div>";
  }
  const resultadoEditais = () => { const l = filtrarEditais(); return ui.editaisVista === "quadro" ? quadroHTML(l) : listaHTML(l); };
  function ligarArraste() {
    $$(".kcard[draggable]").forEach(c => {
      c.addEventListener("dragstart", ev => { ev.dataTransfer.setData("text/plain", c.dataset.id); ev.dataTransfer.effectAllowed = "move"; c.classList.add("arrastando"); });
      c.addEventListener("dragend", () => c.classList.remove("arrastando"));
    });
    $$("[data-coluna]").forEach(col => {
      col.addEventListener("dragover", ev => { ev.preventDefault(); col.classList.add("sobre"); });
      col.addEventListener("dragleave", () => col.classList.remove("sobre"));
      col.addEventListener("drop", ev => { ev.preventDefault(); col.classList.remove("sobre"); const id = ev.dataTransfer.getData("text/plain"); if (id) moverEtapa(id, col.dataset.coluna); });
    });
  }
  function moverEtapa(id, etapa) {
    const e = edital(id);
    if (!e || e.etapa === etapa) return;
    e.etapa = etapa;
    if (etapa === "cadastrada") e.propostaStatus = "cadastrada";
    const nome = ETAPA(etapa).nome;
    (e.historico = e.historico || []).unshift({ data: U.hojeISO(), texto: "Etapa alterada para " + nome + "." });
    registrar(e.numero + " passou para " + nome + ".", "editais");
    atualizar();
    toast(e.numero + " → " + nome, etapa === "recurso" ? "Registre o recurso para acompanhar os prazos." : "", etapa === "ganho" ? "pop" : "", etapa === "recurso" ? { rotulo: "Registrar recurso", rota: "recursos", ref: "novo:" + e.id } : null);
  }

  /* Detalhe do edital (gaveta lateral) */
  function abrirEdital(id, manter) {
    const e = edital(id);
    if (!e) return;
    ui.detalhe = id;
    const scroll = manter && $(".modal-corpo") ? $(".modal-corpo").scrollTop : 0;
    const et = ETAPA(e.etapa), lim = limiteDe(e), chat = chatDoEdital(e.id);
    const imp = e.sessao ? U.subtrairDiasUteis(e.sessao, 3) : null;
    const corpo =
      '<div class="det-topo"><div class="chips"><span class="pill ' + et.cls + '">' + h(et.nome) + '</span><span class="tag-portal" style="--cor:' + corPortal(e.portal) + '">' + h(e.portal || "Portal não informado") + "</span>" +
      (e.prioridade === "alta" ? '<span class="pill pop sem-ponto">Prioridade alta</span>' : "") + "</div>" +
      '<h3 style="font-size:18px">' + h(e.orgao) + "</h3>" + (e.municipio || e.uf ? '<span class="org">' + h([e.municipio, e.uf].filter(Boolean).join("/")) + (e.uasg ? " · UASG " + h(e.uasg) : "") + (e.processo ? " · Processo " + h(e.processo) : "") + "</span>" : "") +
      (e.objeto ? "<p>" + h(e.objeto) + "</p>" : "") + "</div>" +
      '<dl class="datas" style="margin-top:14px"><div><dt>Sessão pública</dt><dd>' + U.fmtDataHora(e.sessao) + " " + chipSessao(e.sessao) + "</dd></div>" +
      "<div><dt>Limite da proposta</dt><dd>" + U.fmtDataHora(lim) + "</dd></div>" +
      "<div><dt>Impugnar até</dt><dd>" + (imp ? U.fmtData(imp) : "—") + "</dd></div>" +
      "<div><dt>Valor estimado</dt><dd>" + U.moeda(e.valorEstimado) + "</dd></div>" +
      "<div><dt>Nossa proposta</dt><dd>" + U.moeda(e.nossoValor) + (e.valorEstimado && e.nossoValor ? ' <span class="muted">(' + (100 * (1 - e.nossoValor / e.valorEstimado)).toFixed(1).replace(".", ",") + "% abaixo)</span>" : "") + "</dd></div>" +
      "<div><dt>Responsável</dt><dd>" + h(e.responsavel || "—") + "</dd></div></dl>" +

      (e.etapa === "ganho" ? ganhoHTML(e) : "") +
      '<div class="bloco"><h3>Etapa</h3><div class="etapas">' + ETAPAS.map(x => '<button data-acao="definirEtapa" data-id="' + e.id + '" data-etapa="' + x.id + '" aria-pressed="' + (x.id === e.etapa) + '">' + h(x.curto || x.nome) + "</button>").join("") + "</div></div>" +

      '<div class="bloco"><h3>Proposta</h3><div class="ferramentas"><select data-mudar="propStatus" data-id="' + e.id + '" aria-label="Situação da proposta">' + PROP_STATUS.map(p => '<option value="' + p[0] + '"' + (p[0] === e.propostaStatus ? " selected" : "") + ">" + p[1] + "</option>").join("") + "</select>" +
      '<span class="muted" style="font-size:13px">' + progresso(e) + " de " + CHECK_PROPOSTA.length + ' itens prontos</span></div><div class="progresso"><i style="width:' + Math.round(100 * progresso(e) / CHECK_PROPOSTA.length) + '%"></i></div>' + checklistHTML(e) + "</div>" +

      (ativo(e) && e.etapa !== "triagem" ? habilitacaoHTML(e) : "") +
      (chat && (chat.status || chat.disputa) ? '<div class="bloco"><h3>Acompanhamento no portal</h3>' + disputaHTML(chat, true) + "</div>" : "") +
      '<div class="bloco"><h3>Atalhos</h3><div class="linha-acoes">' +
      (e.link ? '<a class="btn peq ghost" href="' + h(e.link) + '" target="_blank" rel="noopener">' + ic("link") + "Abrir no portal</a>" : "") +
      (chat ? '<a class="btn peq ghost" href="#chats" data-acao="ir" data-rota="chats" data-ref="' + chat.id + '">' + ic("chats") + "Ver chat" + (naoLidas(chat).length ? " (" + naoLidas(chat).length + " novas)" : "") + "</a>" : '<button class="btn peq ghost" data-acao="monitorarChat" data-id="' + e.id + '">' + ic("chats") + "Monitorar chat</button>") +
      '<button class="btn peq ghost" data-acao="abrirPreco" data-id="' + e.id + '">' + ic("preco") + "Formação de preço</button>" +
      '<button class="btn peq ghost" data-acao="novoRecurso" data-edital="' + e.id + '">' + ic("recursos") + "Registrar recurso</button>" +
      '<a class="btn peq ghost" href="#analise">' + ic("analise") + "Analisar edital</a></div></div>" +

      '<div class="bloco"><h3><label for="notas-ed">Anotações</label></h3><textarea id="notas-ed" class="notas-area" data-mudar="notasEdital" data-id="' + e.id + '" placeholder="Ex.: pregoeiro costuma abrir com 15 min de atraso; pedir esclarecimento sobre o item 5.4…">' + h(e.notas || "") + "</textarea></div>" +

      '<div class="bloco"><h3>Histórico</h3>' + ((e.historico || []).length ? '<ul class="hist">' + e.historico.slice(0, 12).map(x => "<li><time>" + U.fmtData(x.data) + "</time><span>" + h(x.texto) + "</span></li>").join("") + "</ul>" : '<p class="muted">Sem registros ainda.</p>') + "</div>";
    abrirModal({
      lateral: true, titulo: h(e.numero), corpo, manterFoco: manter,
      rodape: '<button class="btn perigo" data-acao="excluirEdital" data-id="' + e.id + '">' + ic("lixo") + 'Excluir</button><span style="flex:1"></span><button class="btn primario" data-acao="editarEdital" data-id="' + e.id + '">' + ic("editar") + "Editar dados</button>"
    });
    if (scroll) $(".modal-corpo").scrollTop = scroll;
  }
  function checklistHTML(e) {
    const c = e.checklist || {};
    return '<div class="checklist">' + CHECK_PROPOSTA.map((k, i) => '<label class="' + (c[k] ? "feito" : "") + '"><input type="checkbox" data-mudar="checkItem" data-id="' + e.id + '" data-item="' + i + '"' + (c[k] ? " checked" : "") + "><span>" + h(k) + "</span></label>").join("") + "</div>";
  }

  const camposEdital = () => [
    { nome: "numero", rotulo: "Número do edital", req: true, ph: "PE 123/2026" },
    { nome: "modalidade", rotulo: "Modalidade", tipo: "select", opcoes: ["Pregão eletrônico", "Concorrência eletrônica", "Dispensa eletrônica", "Credenciamento", "Outra"] },
    { nome: "orgao", rotulo: "Órgão", req: true, span: 2, ph: "Prefeitura Municipal de…" },
    { nome: "municipio", rotulo: "Município" }, { nome: "uf", rotulo: "UF", ph: "AM" },
    { nome: "objeto", rotulo: "Objeto", tipo: "textarea", span: 2 },
    { secao: "Datas e valores" },
    { nome: "sessao", rotulo: "Sessão pública", tipo: "datetime", req: true },
    { nome: "limiteProposta", rotulo: "Limite para cadastrar a proposta", tipo: "datetime", dica: "Se ficar vazio, vale a data da sessão." },
    { nome: "valorEstimado", rotulo: "Valor estimado (R$)", tipo: "money" },
    { nome: "nossoValor", rotulo: "Nossa proposta (R$)", tipo: "money" },
    { secao: "Acompanhamento" },
    { nome: "portal", rotulo: "Portal", tipo: "select", opcoes: PORTAIS },
    { nome: "etapa", rotulo: "Etapa", tipo: "select", opcoes: ETAPAS.map(e => [e.id, e.nome]) },
    { nome: "propostaStatus", rotulo: "Situação da proposta", tipo: "select", opcoes: PROP_STATUS },
    { nome: "prioridade", rotulo: "Prioridade", tipo: "select", opcoes: [["alta", "Alta"], ["media", "Média"], ["baixa", "Baixa"]] },
    { nome: "responsavel", rotulo: "Responsável" },
    { nome: "processo", rotulo: "Nº do processo" },
    { nome: "link", rotulo: "Link do edital ou da sala de disputa", tipo: "url", span: 2, ph: "https://" },
    { nome: "uasg", rotulo: "UASG / código da unidade" }
  ];
  const TOPO_PNCP = '<div class="importar"><label for="pncp-link">Importar de um link</label><div class="linha"><input id="pncp-link" placeholder="Cole o link do pregão ou do edital"><button type="button" class="btn primario peq" data-acao="importarPncp">Buscar dados</button></div><small>Aceita link do PNCP, do Compras.gov.br (acompanhamento da compra), do e-compras.AM, o link direto do PDF do edital ou a página do edital em outros portais. Confira os dados antes de salvar.</small></div>';
  function formEdital(id, preset) {
    const e = id ? edital(id) : null;
    abrirForm({
      titulo: e ? "Editar " + h(e.numero) : "Novo edital", tamanho: "largo", topo: e ? "" : TOPO_PNCP, campos: camposEdital(),
      valores: e || Object.assign({ modalidade: "Pregão eletrônico", portal: "Compras.gov.br", etapa: "triagem", propostaStatus: "nao_iniciada", prioridade: "media", responsavel: "" }, preset || {}),
      salvar: v => {
        if (e) { Object.assign(e, v); (e.historico = e.historico || []).unshift({ data: U.hojeISO(), texto: "Dados do edital atualizados." }); }
        else {
          const novo = Object.assign({ id: U.uid(), checklist: {}, notas: "", criadoEm: U.hojeISO(), historico: [{ data: U.hojeISO(), texto: "Edital cadastrado no portal." }] }, preset && preset.exigidos && preset.exigidos.length ? { exigidos: preset.exigidos } : {}, v);
          S.editais.push(novo);
          registrar("Novo edital cadastrado: " + novo.numero + ".", "editais");
          const ident = ui.importChat && (ui.importChat.link.match(/ident=(\d+)/) || [])[1];
          const existente = ident && S.chats.find(c => c.ident === ident || (c.link || "").includes("ident=" + ident) || (c.processo || "").includes("ident=" + ident));
          if (existente && !existente.editalId) existente.editalId = novo.id; // liga o chat que já existia ao novo edital
          if (ident && !existente) {
            S.chats.push({ id: U.uid(), editalId: novo.id, titulo: novo.numero, orgao: novo.orgao, portal: "e-compras AM", processo: ui.importChat.link, link: ui.importChat.link, auto: true, status: ui.importChat.situacao, mensagens: [] });
            registrar("Chat do " + novo.numero + " monitorado automaticamente (e-compras.AM).", "chats");
            setTimeout(() => verificarChats(S.chats[S.chats.length - 1].id), 300);
          }
          ui.importChat = null;
        }
        if (v.propostaStatus === "cadastrada" && ["triagem", "analise", "proposta"].includes(v.etapa)) (e || S.editais[S.editais.length - 1]).etapa = "cadastrada";
        atualizar();
        toast(e ? "Edital atualizado" : "Edital cadastrado", v.numero);
      }
    });
  }

  /* ---------- Propostas ---------- */
  function pgPropostas() {
    const pend = S.editais.filter(e => precisaProposta(e) && limiteDe(e)).sort((a, b) => limiteDe(a).localeCompare(limiteDe(b)));
    const abertas = pend.filter(e => !U.passou(limiteDe(e)));
    const vencidas = pend.filter(e => U.passou(limiteDe(e)));
    const semData = S.editais.filter(e => precisaProposta(e) && !limiteDe(e));
    const prontas = S.editais.filter(e => ativo(e) && e.propostaStatus === "cadastrada" && e.sessao && !U.passou(e.sessao)).sort((a, b) => a.sessao.localeCompare(b.sessao));
    return '<div class="cab"><div><span class="eyebrow">Operação</span><h1>Propostas a cadastrar</h1><p>Ordenadas pelo prazo. O cartão fica laranja quando faltam menos de 48 horas.</p></div><div class="cab-acoes"><button class="btn primario" data-acao="novoEdital">' + ic("mais") + "Novo edital</button></div></div>" +
      (abertas.length ? '<div class="propostas">' + abertas.map(propCard).join("") + "</div>" : '<div class="card">' + vazio("check", "Nenhuma proposta pendente. Que tal analisar um edital novo?", '<a class="btn primario" href="#analise">Analisar edital</a>') + "</div>") +
      (vencidas.length ? '<section class="card"><div class="card-h"><h2>Prazo encerrado sem proposta cadastrada</h2><span class="muted">confira se a proposta foi enviada</span></div><div class="alertas">' + vencidas.map(e => '<div class="alerta critico"><span class="ico">' + ic("aviso") + '</span><div class="tx"><b>' + h(e.numero) + " · " + h(e.orgao) + "</b><span>Limite era " + U.fmtDataHora(limiteDe(e)) + '</span></div><div class="lado"><button class="btn peq ghost" data-acao="propCadastrada" data-id="' + e.id + '">Foi cadastrada</button><button class="btn peq ghost" data-acao="definirEtapa" data-id="' + e.id + '" data-etapa="descartado">Não participamos</button></div></div>').join("") + "</div></section>" : "") +
      (semData.length ? '<section class="card"><div class="card-h"><h2>Sem data definida</h2></div>' + semData.map(e => '<div class="alerta info"><span class="ico">' + ic("calendario") + '</span><div class="tx"><b>' + h(e.numero) + "</b><span>" + h(e.orgao) + '</span></div><div class="lado"><button class="btn peq ghost" data-acao="editarEdital" data-id="' + e.id + '">Informar data</button></div></div>').join("") + "</section>" : "") +
      '<section class="card"><div class="card-h"><h2>Já cadastradas, aguardando a sessão</h2><span class="muted">' + prontas.length + "</span></div>" +
      (prontas.length ? '<div class="tabela-wrap" style="border:0"><table class="tabela"><thead><tr><th>Edital</th><th>Órgão</th><th>Portal</th><th>Sessão</th><th style="text-align:right">Nossa proposta</th></tr></thead><tbody>' + prontas.map(e => '<tr class="clicavel" data-acao="abrirEdital" data-id="' + e.id + '" tabindex="0"><td class="forte">' + h(e.numero) + "</td><td>" + h(e.orgao) + '</td><td><span class="tag-portal" style="--cor:' + corPortal(e.portal) + '">' + h(e.portal) + '</span></td><td class="num">' + U.fmtDataHora(e.sessao) + " " + chip(e.sessao) + '</td><td class="num" style="text-align:right">' + U.moeda(e.nossoValor) + "</td></tr>").join("") + "</tbody></table></div>" : vazio("propostas", "Nenhuma proposta cadastrada aguardando sessão.")) + "</section>";
  }
  function propCard(e) {
    const lim = limiteDe(e), horas = U.horasAte(lim), dias = U.diasAte(lim);
    const urgente = horas <= 48;
    const grande = dias === 0 ? Math.max(0, Math.floor(horas)) : dias;
    const unidade = dias === 0 ? (Math.floor(horas) === 1 ? "hora" : "horas") : dias === 1 ? "dia" : "dias";
    const p = progresso(e);
    return '<article class="prop' + (urgente ? " urgente" : "") + '"><div class="relogio"><b>' + grande + "</b><span>" + unidade + "</span><small>" + U.fmtDataCurta(lim) + (U.fmtHora(lim) ? " " + U.fmtHora(lim) : "") + "</small></div>" +
      '<div class="corpo"><div class="linha-acoes" style="justify-content:space-between"><h3>' + h(e.numero) + '</h3><span class="tag-portal" style="--cor:' + corPortal(e.portal) + '">' + h(e.portal) + "</span></div>" +
      '<span class="org">' + h(e.orgao) + " · " + U.moedaCurta(e.valorEstimado) + "</span>" +
      '<div class="linha-acoes"><select data-mudar="propStatus" data-id="' + e.id + '" aria-label="Situação da proposta de ' + h(e.numero) + '">' + PROP_STATUS.map(x => '<option value="' + x[0] + '"' + (x[0] === e.propostaStatus ? " selected" : "") + ">" + x[1] + "</option>").join("") + '</select><span class="muted" style="font-size:12.5px">' + p + "/" + CHECK_PROPOSTA.length + "</span></div>" +
      '<div class="progresso"><i style="width:' + Math.round(100 * p / CHECK_PROPOSTA.length) + '%"></i></div>' + checklistHTML(e) +
      '<div class="linha-acoes"><button class="btn peq primario" data-acao="propCadastrada" data-id="' + e.id + '">' + ic("check") + 'Cadastrada no portal</button><button class="btn peq ghost" data-acao="abrirPreco" data-id="' + e.id + '">' + ic("preco") + 'Preço</button><button class="btn peq ghost" data-acao="abrirEdital" data-id="' + e.id + '">Detalhes</button>' + (e.link ? '<a class="btn peq ghost" href="' + h(e.link) + '" target="_blank" rel="noopener">' + ic("link") + "Portal</a>" : "") + "</div></div></article>";
  }

  /* ---------- Formação de preço ---------- */
  const P = window.Preco;
  const UNIDADES_PRECO = ["Plantão", "Hora", "Mês", "Consulta", "Sessão", "Procedimento", "Exame", "Diária", "Serviço", "Unidade"];
  const REGIMES = {
    presumido: { nome: "Lucro presumido", dica: "PIS 0,65%, COFINS 3%, IRPJ 4,8% e CSLL 2,88% (presunção de 32% para serviços). Ajuste o ISS ao município.", v: { pis: 0.65, cofins: 3, irpj: 4.8, csll: 2.88, iss: 5, outros: 0 } },
    simples: { nome: "Simples Nacional", dica: "Informe em \"Outros tributos\" a alíquota efetiva do DAS da empresa (já inclui ISS, PIS, COFINS, IRPJ e CSLL).", v: { pis: 0, cofins: 0, irpj: 0, csll: 0, iss: 0, outros: 15.5 } },
    real: { nome: "Lucro real", dica: "PIS 1,65% e COFINS 7,6% não cumulativos (sem créditos aqui). IRPJ e CSLL incidem sobre o lucro: deixe zerados ou informe a estimativa sobre o faturamento.", v: { pis: 1.65, cofins: 7.6, irpj: 0, csll: 0, iss: 5, outros: 0 } }
  };
  const pct = (v, casas) => (isFinite(v) ? (v * 100).toFixed(casas === undefined ? 1 : casas).replace(".", ",") + "%" : "—");
  const numCampo = v => (v === null || v === undefined ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v));
  const editaisPreco = () => S.editais.filter(e => ativo(e) || e.precificacao).sort((a, b) => (a.sessao || "9").localeCompare(b.sessao || "9"));
  function editalPreco() {
    const lista = editaisPreco();
    let e = ui.precoSel && edital(ui.precoSel);
    if (!e) e = lista.find(x => x.precificacao && (x.precificacao.itens || []).length) || lista.find(precisaProposta) || lista[0];
    if (e) ui.precoSel = e.id;
    return e;
  }
  function precificacaoDe(e) {
    if (!e.precificacao) e.precificacao = { itens: [], parametros: P.PARAMETROS_PADRAO(), regime: "presumido" };
    e.precificacao.parametros = Object.assign(P.PARAMETROS_PADRAO(), e.precificacao.parametros || {});
    return e.precificacao;
  }
  /* Estimado para comparar: a soma dos estimados dos itens cotados, quando todos têm estimado (a empresa pode
     disputar só parte dos itens); senão, o valor estimado do edital. */
  function estimadoPreco(e) {
    const it = ((e.precificacao || {}).itens || []);
    if (it.length && it.every(x => P.numero(x.estimadoUnit) && P.numero(x.quantidade))) return { valor: it.reduce((t, x) => t + P.numero(x.estimadoUnit) * P.numero(x.quantidade), 0), base: "dos itens cotados" };
    return { valor: +e.valorEstimado || 0, base: "do edital" };
  }

  const textoEstimado = e => { const est = estimadoPreco(e); return "Estimado " + est.base + ": <b>" + U.moeda(est.valor || null) + "</b>" + (e.sessao ? " · sessão " + U.fmtDataHora(e.sessao) : ""); };
  function pgPrecos() {
    const e = editalPreco();
    const cab = '<div class="cab"><div><span class="eyebrow">Operação</span><h1>Formação de preço</h1><p>Monte o custo de cada item, aplique BDI e tributos e veja o preço, a margem, o lance mínimo e o risco de inexequibilidade em relação ao valor estimado.</p></div>' +
      (e ? '<div class="cab-acoes"><button class="btn ghost" data-acao="precoCopiar">' + ic("copiar") + 'Copiar planilha</button><button class="btn primario" data-acao="precoUsar">' + ic("check") + "Usar como nossa proposta</button></div>" : "") + "</div>";
    if (!e) return cab + '<div class="card">' + vazio("propostas", "Cadastre um edital para montar a formação de preço.", '<button class="btn primario" data-acao="novoEdital">' + ic("mais") + "Novo edital</button>") + "</div>";
    const pr = e.precificacao || { itens: [], parametros: P.PARAMETROS_PADRAO(), regime: "presumido" };
    const calc = P.calcular(pr);
    const temAnalise = ui.analise && ui.analise.campos && (ui.analise.campos.itens || []).length;
    return cab +
      '<div class="ferramentas"><label class="sr" for="preco-edital">Edital</label><select id="preco-edital" data-mudar="precoEdital" style="max-width:100%">' +
      editaisPreco().map(x => '<option value="' + x.id + '"' + (x.id === e.id ? " selected" : "") + ">" + h(x.numero + " · " + (x.orgao || "")) + "</option>").join("") + "</select>" +
      '<span class="muted" style="font-size:13px" id="preco-estimado">' + textoEstimado(e) + "</span>" + "</div>" +
      '<div class="preco"><div class="pilha">' +
      '<section class="card"><div class="card-h"><h2>Itens e custos</h2><div class="linha-acoes">' +
      (temAnalise ? '<button class="btn peq ghost" data-acao="precoDaAnalise">' + ic("analise") + "Trazer itens da análise</button>" : "") +
      '<button class="btn peq primario" data-acao="precoItem">' + ic("mais") + "Item</button></div></div>" +
      (pr.itens.length ? '<div class="preco-itens">' + pr.itens.map((it, i) => itemPrecoHTML(it, i, calc.itens[i], e)).join("") + "</div>"
        : vazio("propostas", "Nenhum item ainda. Adicione os itens do edital" + (temAnalise ? " ou traga da última análise de edital" : "") + ".")) + "</section>" +
      parametrosPrecoHTML(pr, calc) + "</div>" +
      '<aside class="pilha preco-lado" id="preco-resultado">' + resultadoPrecoHTML(e, calc) + "</aside></div>";
  }
  function itemPrecoHTML(it, i, c, e) {
    const inp = (campo, rot, extra, larg) => '<div class="campo"' + (larg ? ' style="grid-column:span ' + larg + '"' : "") + '><label for="pi-' + it.id + "-" + campo + '">' + rot + "</label>" +
      '<input id="pi-' + it.id + "-" + campo + '" data-digitar="preco" data-item="' + it.id + '" data-campo="' + campo + '" value="' + h(numCampo(it[campo])) + '"' + (extra || ' inputmode="decimal"') + "></div>";
    return '<article class="preco-item" data-item="' + it.id + '"><div class="preco-item-h"><b>Item ' + (i + 1) + "</b>" +
      '<span class="muted num" id="pr-res-' + it.id + '">' + resumoItemPreco(c, it) + "</span>" +
      '<button class="link-btn" data-acao="precoRemoverItem" data-item="' + it.id + '" aria-label="Remover item ' + (i + 1) + '">' + ic("lixo") + "</button></div>" +
      '<div class="preco-grade">' +
      inp("descricao", "Descrição", ' placeholder="Ex.: plantão médico 12 h, clínico geral"', 4) +
      '<div class="campo"><label for="pi-' + it.id + '-unidade">Unidade</label><select id="pi-' + it.id + '-unidade" data-mudar="precoUnidade" data-item="' + it.id + '">' +
      UNIDADES_PRECO.concat(UNIDADES_PRECO.includes(it.unidade) || !it.unidade ? [] : [it.unidade]).map(u => '<option' + (u === it.unidade ? " selected" : "") + ">" + h(u) + "</option>").join("") + "</select></div>" +
      inp("quantidade", "Quantidade") + inp("estimadoUnit", "Estimado unitário (R$)") + '<div class="campo"><span class="rot-calc">Preço unitário</span><b class="num" id="pr-unit-' + it.id + '">' + U.moeda(c.unitario) + "</b></div>" +
      inp("profissionais", "Profissionais") + inp("horas", "Horas por " + h((it.unidade || "unidade").toLowerCase())) + inp("valorHora", "Valor da hora (R$)") +
      '<div class="campo"><span class="rot-calc">Custo direto</span><b class="num" id="pr-dir-' + it.id + '">' + U.moeda(c.direto) + "</b></div>" +
      "</div>" +
      '<div class="preco-custos">' + (it.custos || []).map((cu, k) =>
        '<div class="preco-custo"><label class="sr" for="pc-' + it.id + "-" + k + '">Outro custo</label><input id="pc-' + it.id + "-" + k + '" data-digitar="precoCusto" data-item="' + it.id + '" data-k="' + k + '" data-campo="descricao" value="' + h(cu.descricao || "") + '" placeholder="Ex.: coordenação médica, insumos, deslocamento">' +
        '<input aria-label="Valor por ' + h((it.unidade || "unidade").toLowerCase()) + '" data-digitar="precoCusto" data-item="' + it.id + '" data-k="' + k + '" data-campo="valor" value="' + h(numCampo(cu.valor)) + '" inputmode="decimal" placeholder="R$ por unidade">' +
        '<label class="campo-check" title="Entra na base dos encargos"><input type="checkbox" data-mudar="precoCustoMO" data-item="' + it.id + '" data-k="' + k + '"' + (cu.maoDeObra ? " checked" : "") + "><span>Mão de obra</span></label>" +
        '<button class="link-btn" data-acao="precoRemoverCusto" data-item="' + it.id + '" data-k="' + k + '" aria-label="Remover custo">' + ic("x") + "</button></div>").join("") +
      '<button class="link-btn" data-acao="precoCusto" data-item="' + it.id + '">' + ic("mais") + " Outro custo por " + h((it.unidade || "unidade").toLowerCase()) + "</button></div></article>";
  }
  function resumoItemPreco(c, it) {
    const est = P.numero(it.estimadoUnit);
    return U.moeda(c.total) + " no total" + (est ? " · " + pct(c.unitario / est, 0) + " do estimado" : "");
  }
  function parametrosPrecoHTML(pr, calc) {
    const par = pr.parametros || P.PARAMETROS_PADRAO();
    const reg = REGIMES[pr.regime] || REGIMES.presumido;
    const campo = (k, dica) => '<div class="campo"><label for="pp-' + k + '">' + P.ROTULOS[k] + " (%)</label><input id=\"pp-" + k + '" data-digitar="precoPar" data-chave="' + k + '" value="' + h(numCampo(par[k])) + '" inputmode="decimal">' + (dica ? "<small>" + dica + "</small>" : "") + "</div>";
    return '<section class="card preco-par-card"><div class="card-h"><h2>BDI e tributos</h2><span class="muted" id="pp-resumo">BDI ' + pct(calc.bdi, 2) + " · tributos " + pct(calc.tributos, 2) + "</span></div>" +
      '<div class="form-grid preco-par">' +
      '<div class="campo span-2"><label for="pp-regime">Regime tributário</label><select id="pp-regime" data-mudar="precoRegime">' + Object.keys(REGIMES).map(k => '<option value="' + k + '"' + (k === (pr.regime || "presumido") ? " selected" : "") + ">" + REGIMES[k].nome + "</option>").join("") + "</select><small>" + h(reg.dica) + "</small></div>" +
      '<div class="secao-form">Tributos sobre o faturamento</div>' +
      campo("iss", "Entre 2% e 5%, conforme o município onde o serviço é prestado.") + campo("pis") + campo("cofins") + campo("irpj") + campo("csll") + campo("outros", "Simples Nacional (alíquota efetiva), adicional de IRPJ etc.") +
      '<div class="secao-form">Despesas indiretas e lucro</div>' +
      campo("ac") + campo("df") + campo("seguro") + campo("risco") + campo("garantia", "Se o edital exigir garantia contratual.") +
      campo("lucro") + campo("lucroMinimo", "Define o lance mínimo da disputa.") +
      campo("encargos", "Médicos PJ: 0%. Contratação CLT: em geral entre 65% e 80% sobre a remuneração.") +
      '</div><p class="muted" style="font-size:12.5px;margin-top:12px">BDI no formato do TCU (Acórdão 2.622/2013): [(1 + AC + S + R + G) × (1 + DF) × (1 + L)] ÷ (1 − tributos) − 1.</p></section>';
  }
  function resultadoPrecoHTML(e, calc) {
    const est = estimadoPreco(e).valor;
    if (!calc.itens.length) return '<section class="card"><h2 style="font-size:16.5px">Resultado</h2><p class="muted" style="margin-top:8px">Adicione os itens para ver o preço, a margem e o lance mínimo.</p></section>';
    const ex = P.exequibilidade(calc.total, est), exMin = P.exequibilidade(calc.totalMinimo, est);
    const linhaEx = (rot, x, valor) => '<div class="alerta ' + ({ crit: "critico", warn: "atencao", ok: "info", info: "info" }[x.nivel]) + '"><span class="ico">' + ic(x.nivel === "ok" ? "check" : "aviso") + '</span><div class="tx"><b>' + rot + ": " + U.moeda(valor) + (x.razao ? " (" + pct(x.razao) + " do estimado)" : "") + "</b><span style=\"white-space:normal\">" + h(x.texto) + "</span></div></div>";
    const lances = P.tabelaLances(calc);
    return '<section class="card preco-total"><span class="rot">Preço global proposto</span><b class="num">' + U.moeda(calc.total) + "</b>" +
      '<dl class="datas" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:12px">' +
      "<div><dt>Custo direto</dt><dd>" + U.moeda(calc.diretoTotal) + "</dd></div><div><dt>BDI</dt><dd>" + pct(calc.bdi, 2) + "</dd></div>" +
      "<div><dt>Lucro líquido</dt><dd>" + U.moeda(calc.lucroTotal) + "</dd></div><div><dt>Margem</dt><dd>" + pct(calc.margem, 2) + "</dd></div>" +
      "<div><dt>Desconto sobre o estimado</dt><dd>" + (est ? pct(1 - calc.total / est) : "—") + "</dd></div><div><dt>Piso de 50% do estimado</dt><dd>" + (est ? U.moeda(est / 2) : "—") + "</dd></div></dl></section>" +
      '<section class="card"><div class="card-h"><h2>Exequibilidade</h2></div><div class="alertas">' + linhaEx("Proposta", ex, calc.total) + linhaEx("Lance mínimo", exMin, calc.totalMinimo) + "</div>" +
      '<p class="muted" style="font-size:12.5px;margin-top:8px">Serviços em geral: indício de inexequibilidade abaixo de 50% do estimado (IN SEGES 73/2022, art. 34). Os 75% do art. 59, § 4º, da Lei 14.133 valem para obras e serviços de engenharia. Em qualquer caso, a empresa pode demonstrar a exequibilidade antes da desclassificação.</p></section>' +
      '<section class="card"><div class="card-h"><h2>Lances</h2><span class="muted">até onde dá para ir</span></div>' +
      '<div class="preco-lance"><label for="preco-lance">Simular lance global (R$)</label><input id="preco-lance" data-digitar="precoLance" inputmode="decimal" placeholder="0,00" value="' + h(ui.precoLance || "") + '"><span id="preco-lance-res" class="muted">' + simulaLance(calc) + "</span></div>" +
      '<div class="tabela-wrap" style="margin-top:10px"><table class="tabela"><thead><tr><th>Degrau</th><th style="text-align:right">Global</th><th style="text-align:right">Margem</th></tr></thead><tbody>' +
      lances.map(l => '<tr class="' + (l.marco ? "marco" : "") + (l.global < calc.totalMinimo - 0.005 ? " abaixo" : "") + '"><td>' + h(l.rotulo) + '</td><td class="num" style="text-align:right">' + U.moeda(l.global) + '</td><td class="num" style="text-align:right">' + pct(l.margem) + "</td></tr>").join("") +
      "</tbody></table></div>" +
      (calc.itens.length > 1 ? '<details style="margin-top:10px"><summary class="link-btn">Mínimo por item (disputa item a item)</summary><div class="tabela-wrap" style="margin-top:8px"><table class="tabela"><thead><tr><th>Item</th><th style="text-align:right">Proposto</th><th style="text-align:right">Mínimo</th></tr></thead><tbody>' +
        calc.itens.map((x, i) => "<tr><td>" + (i + 1) + (x.item.descricao ? ' <span class="sub">' + h(x.item.descricao) + "</span>" : "") + '</td><td class="num" style="text-align:right">' + U.moeda(x.unitario) + '</td><td class="num" style="text-align:right">' + U.moeda(x.minimo) + "</td></tr>").join("") + "</tbody></table></div></details>" : "") +
      "</section>";
  }
  function simulaLance(calc) {
    const v = P.numero(ui.precoLance);
    if (!v) return "Digite um valor para ver o lucro e a margem.";
    const lucro = v * (1 - calc.tributos) - calc.diretoTotal * P.fatorIndireto(calc.par);
    const m = lucro / v;
    return (lucro < 0 ? "Prejuízo de " + U.moeda(-lucro) : "Lucro de " + U.moeda(lucro)) + " · margem " + pct(m, 2) + (v < calc.totalMinimo ? " · abaixo do lance mínimo" : "");
  }
  function recalcPreco() {
    const e = editalPreco();
    if (!e || !e.precificacao) return;
    const calc = P.calcular(e.precificacao);
    calc.itens.forEach(x => {
      const id = x.item.id, set = (s, v) => { const el = $("#" + s + id); if (el) el.textContent = v; };
      set("pr-res-", resumoItemPreco(x, x.item)); set("pr-unit-", U.moeda(x.unitario)); set("pr-dir-", U.moeda(x.direto));
    });
    const es = $("#preco-estimado"); if (es) es.innerHTML = textoEstimado(e);
    const r = $("#pp-resumo"); if (r) r.textContent = "BDI " + pct(calc.bdi, 2) + " · tributos " + pct(calc.tributos, 2);
    const lado = $("#preco-resultado");
    if (lado) {
      const foco = document.activeElement && document.activeElement.id === "preco-lance";
      const aberto = $("details", lado) && $("details", lado).open;
      lado.innerHTML = resultadoPrecoHTML(e, calc);
      if (aberto && $("details", lado)) $("details", lado).open = true;
      if (foco) { const i = $("#preco-lance"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
    }
  }
  let timerPreco = null;
  function salvarPreco() { clearTimeout(timerPreco); timerPreco = setTimeout(() => { const e = editalPreco(); if (e && e.precificacao) e.precificacao.atualizadoEm = U.agoraISO(); salvar(); }, 600); }
  const itemPreco = d => { const e = editalPreco(); return e && precificacaoDe(e).itens.find(x => x.id === d.item); };
  // Horas por plantão a partir da descrição ("plantão de 12 horas", "24h")
  const horasDaDescricao = t => { const m = String(t || "").match(/(\d{1,2})\s*(?:h\b|hs\b|horas?\b)/i); return m && +m[1] <= 24 ? +m[1] : null; };
  function itensDaAnalise() {
    const c = ui.analise.campos;
    return c.itens.map(x => {
      const un = String(x.unidade || "").toLowerCase();
      const unidade = UNIDADES_PRECO.find(u => un.startsWith(u.toLowerCase().slice(0, 4))) || (/h(ora)?s?$/.test(un) ? "Hora" : x.unidade || "Unidade");
      const horas = unidade === "Hora" ? 1 : horasDaDescricao(x.descricao) || (unidade === "Plantão" ? 12 : 0);
      return P.itemNovo({ descricao: x.descricao || "Item " + x.item, unidade, quantidade: x.qtd || 0, estimadoUnit: x.valorUnit || "", horas });
    });
  }

  /* ---------- Análise de edital ---------- */
  function pgAnalise() {
    const r = ui.analise;
    return '<div class="cab"><div><span class="eyebrow">Análise e jurídico</span><h1>Análise de edital</h1><p>Cole o texto ou envie o PDF. O portal lê o edital no seu navegador, separa os dados principais, confere a habilitação com a sua pasta de documentos e aponta exigências que merecem atenção.</p></div></div>' +
      '<div class="analise"><section class="card entrada"><div class="card-h"><h2>Edital</h2><button class="link-btn" data-acao="exemploEdital">Usar edital de exemplo</button></div>' +
      '<label class="soltar" id="soltar">' + ic("upload") + '<span><b>Arraste o edital (PDF ou TXT) aqui</b> ou <span class="link-btn">escolha os arquivos</span><br><small class="muted">Pode enviar o edital e o Termo de Referência juntos. Os arquivos não saem do seu computador.</small></span><input type="file" id="arquivo-edital" accept=".pdf,.txt,application/pdf,text/plain" class="sr" multiple></label>' +
      '<label class="sr" for="texto-edital">Texto do edital</label><textarea id="texto-edital" placeholder="…ou cole aqui o texto do edital (Ctrl+V)">' + h(ui.analiseTexto) + "</textarea>" +
      '<div class="linha-acoes" style="margin-top:12px"><button class="btn primario" data-acao="analisar">' + ic("analise") + 'Analisar edital</button><button class="btn ghost" data-acao="limparAnalise">Limpar</button><span class="muted" id="status-analise" style="font-size:13px"></span></div></section>' +
      '<div class="pilha" id="resultado-analise">' + (r ? resultadoAnalise(r) : '<section class="card">' + vazio("analise", "O resultado aparece aqui: dados do certame, prazos de impugnação, checklist de habilitação e pontos de atenção.") + "</section>") + "</div></div>";
  }
  /* ---------- Resumo para e-mail (formato da equipe) ---------- */
  const PORTAL_RESUMO = { "Compras.gov.br": "COMPRASGOV", "BLL": "BLL", "BNC": "BNC", "Licitações-e": "LICITAÇÕES-E", "Portal de Compras Públicas": "PORTAL DE COMPRAS PÚBLICAS", "Licitanet": "LICITANET", "Licitar Digital": "LICITAR DIGITAL", "e-compras AM": "E-COMPRAS AM" };
  const CAPITAIS = { AC: "Rio Branco", AL: "Maceió", AP: "Macapá", AM: "Manaus", BA: "Salvador", CE: "Fortaleza", DF: "Brasília", ES: "Vitória", GO: "Goiânia", MA: "São Luís", MT: "Cuiabá", MS: "Campo Grande", MG: "Belo Horizonte", PA: "Belém", PB: "João Pessoa", PR: "Curitiba", PE: "Recife", PI: "Teresina", RJ: "Rio de Janeiro", RN: "Natal", RS: "Porto Alegre", RO: "Porto Velho", RR: "Boa Vista", SC: "Florianópolis", SP: "São Paulo", SE: "Aracaju", TO: "Palmas" };
  const falta = t => '<mark style="background:#FFE7A3;color:#5A3D00;padding:0 3px;border-radius:3px">[' + h(t) + "]</mark>";
  // "CONTRATAÇÃO DE EMPRESA..." (tudo em maiúsculas) vira "contratação de empresa..."; senão, só a 1ª letra
  const minusculaInicial = t => {
    if (!t) return t;
    const l = t.replace(/[^A-Za-zÀ-ú]/g, "");
    if (l.length > 12 && l.replace(/[^A-ZÀ-Ú]/g, "").length / l.length > 0.6) return t.toLowerCase();
    // começo em maiúsculas e o resto normal: "CONTRATAÇÃO DE EMPRESA PARA ..., objetivando" -> "contratação de empresa para ..., objetivando"
    const m = t.match(/^([^a-zà-ú]{15,}?)(?=[,;:]?\s+[a-zà-ú])/);
    if (m && m[1] === m[1].toUpperCase()) return m[1].toLowerCase() + t.slice(m[1].length);
    return t.charAt(0).toLowerCase() + t.slice(1);
  };
  function tempoViagem(min) { if (!min) return ""; const r = Math.round(min / 10) * 10, hh = Math.floor(r / 60), mm = r % 60; return hh ? hh + "h" + (mm ? String(mm).padStart(2, "0") : "") : mm + " min"; }
  function resumoEmailHTML(r) {
    const c = r.campos, m = ui.cidade || {};
    const tr = t => c.trSeparado ? falta(t + " – ver Termo de Referência (arquivo separado)") : falta(t);
    const dest = S.ajustes.resumoDestinatario || "Dra. Cláudia";
    const hora = new Date().getHours();
    const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";
    const p = (html, extra) => '<p style="margin:0 0 10px' + (extra || "") + '">' + html + "</p>";
    const lista = itens => '<ol style="margin:0 0 12px;padding-left:22px">' + itens.map(x => '<li style="margin:2px 0">' + x + "</li>").join("") + "</ol>";
    const mod = (c.modalidade || "").toUpperCase();
    const cidade = m.dados ? m.dados.nome : c.municipio;
    const uf = m.dados ? m.dados.uf : c.uf;
    const orgao = c.orgao ? h(c.orgao.toUpperCase().replace(/\s*[–-]\s*[A-Z]{2}$/, "")) + (uf ? " – " + uf : "") : falta("órgão");
    let infoCidade;
    if (m.dados) {
      const d = m.dados;
      infoCidade = [
        "Cidade: " + h(d.nome) + " – " + d.uf + (d.ehCapital ? " (capital do estado)." : " (capital – " + h(d.capital) + ")."),
        d.ehCapital ? "Localização: é a própria capital do estado." : d.distanciaKm ? "Localização: aproximadamente " + tempoViagem(d.tempoMin) + " da capital, cerca de " + d.distanciaKm.toLocaleString("pt-BR") + " km por rodovia." : "Localização: " + falta("distância até a capital"),
        d.populacao ? "População: aproximadamente " + d.populacao.toLocaleString("pt-BR") + " habitantes, conforme estimativa do IBGE para " + d.anoPopulacao + "." : "População: " + falta("população (IBGE)")
      ];
    } else {
      const cap = uf && CAPITAIS[uf];
      const ehCap = cap && cidade && U.semAcento(cap).toLowerCase() === U.semAcento(cidade).toLowerCase();
      infoCidade = ["Cidade: " + (cidade ? h(cidade) + (uf ? " – " + uf : "") : falta("cidade")) + (ehCap ? " (capital do estado)." : " (capital – " + (cap ? h(cap) : falta("capital")) + ")."),
        ehCap ? "Localização: é a própria capital do estado." : "Localização: aproximadamente " + falta("tempo") + " da capital, cerca de " + falta("km") + " por rodovia.",
        "População: aproximadamente " + falta("habitantes") + ", conforme estimativa do IBGE."];
    }
    const horarios = (c.horarios || []).map((x, i) => h((i ? minusculaInicial(x) : x).replace(/\.$/, ""))).join("; ");
    const cid = ui.cidade || {};
    const td = 'style="border:1px solid #9AA9AB;padding:6px 8px;vertical-align:top"';
    const th = 'style="border:1px solid #9AA9AB;padding:6px 8px;background:#E3EEEC;text-align:left;font-weight:700"';
    const itens = c.itens && c.itens.length ? c.itens : [{ item: "1", descricao: null, unidade: null, qtd: null, valorUnit: null }];
    const tabela = '<table style="border-collapse:collapse;margin:0 0 12px;font-size:inherit"><thead><tr><th ' + th + ">ITEM</th><th " + th + ">DESCRIÇÃO / EQUIPE MÍNIMA</th><th " + th + ">UNIDADE</th><th " + th + ">QTDE.</th><th " + th + ">VALOR UNIT</th></tr></thead><tbody>" +
      itens.map(i => "<tr><td " + td + ">" + h(i.item) + "</td><td " + td + ">" + (i.descricao ? h(i.descricao) : tr("descrição")) + "</td><td " + td + ">" + (i.unidade ? h(i.unidade) : falta("unid.")) + "</td><td " + td + ">" + (i.qtd !== null && i.qtd !== undefined ? i.qtd.toLocaleString("pt-BR") : falta("qtde.")) + '</td><td ' + td + ' nowrap>' + (i.valorUnit ? U.moeda(i.valorUnit) : c.orcamentoSigiloso ? "Sigiloso" : falta("valor")) + "</td></tr>").join("") + "</tbody></table>";
    const imp = c.impugnacaoInformada || c.impugnacaoAte;
    const sessao = c.sessao ? U.fmtData(c.sessao) + (U.temHora(c.sessao) ? " " + c.sessao.slice(11, 16) : "") : "";
    const portal = c.plataforma ? PORTAL_RESUMO[c.plataforma] || c.plataforma.toUpperCase() : /presencial/i.test(c.modalidade || "") ? "Presencial" : "";
    const ass = S.ajustes.resumoAssinatura || "";
    return p(h(dest) + ",") + p(saudacao + ",") +
      p("Este processo trata-se da " + (mod ? "<b>" + h(mod) + "</b> " : falta("modalidade") + " ") + (c.objetoCompleto ? h(minusculaInicial(c.objetoCompleto).replace(/[\s,;:]*$/, "").replace(/([^.])$/, "$1.")) : falta("objeto"))) +
      p("<b>Informações sobre " + (/^(?:departamento|fundo|hospital|munic[íi]pio|cons[óo]rcio|tribunal|instituto|governo|centro|minist[ée]rio|servi[çc]o|conselho|comando|ex[ée]rcito|n[úu]cleo)/i.test(c.orgao || "") ? "o " : "a ") + orgao + ":</b>", ";margin-bottom:4px") + lista(infoCidade) +
      p("<b>Execução do Serviço:</b>", ";margin-bottom:4px") + lista(["Local: " + (c.local ? h(c.local.replace(/\.$/, "")) + "." : tr("local de execução")), "Horários: " + (horarios ? horarios + "." : tr("dias e horários"))]) +
      tabela +
      p("<b>Valor Global Estimado:</b> " + (c.valorEstimado ? U.moeda(c.valorEstimado) + "." : c.orcamentoSigiloso ? "sigiloso (o órgão divulga o valor só depois da fase de lances)." : tr("valor"))) +
      p("<b>Data e Hora da Licitação:</b> " + (sessao || falta("data e hora"))) +
      p("<b>Prazo para Impugnação/Esclarecimentos:</b> " + (imp ? U.fmtData(imp) : falta("prazo"))) +
      p("<b>Portal:</b> " + (portal ? h(portal) : falta("portal"))) +
      p("Atenciosamente," + (ass ? "<br>" + h(ass).replace(/\n/g, "<br>") : ""), ";margin-top:16px");
  }
  function resumoCartao(r) {
    const c = r.campos, m = ui.cidade || {};
    const status = m.carregando ? '<span class="muted">Buscando a cidade no IBGE e a rota até a capital…</span>'
      : m.dados ? '<span class="pill ok">Cidade encontrada: ' + h(m.dados.nome + "/" + m.dados.uf) + "</span>"
      : m.erro ? '<span class="pill warn sem-ponto">' + h(m.erro) + "</span>" : "";
    return '<section class="card" id="cartao-resumo"><div class="card-h"><h2>Resumo para e-mail</h2><div class="linha-acoes"><button class="btn peq ghost" data-acao="refazerResumo">' + ic("atualizar") + 'Refazer</button><button class="btn peq primario" data-acao="copiarResumoEmail">' + ic("copiar") + "Copiar resumo</button></div></div>" +
      '<div class="resumo-opcoes"><div class="campo"><label for="resumo-dest">Para</label><input id="resumo-dest" data-mudar="resumoOpcao" data-chave="resumoDestinatario" value="' + h(S.ajustes.resumoDestinatario || "Dra. Cláudia") + '"></div>' +
      '<div class="campo"><label for="resumo-cidade">Cidade do órgão</label><div class="importar-linha"><input id="resumo-cidade" value="' + h((m.dados && m.dados.nome) || c.municipio || "") + '" placeholder="Digite a cidade"><input id="resumo-uf" value="' + h((m.dados && m.dados.uf) || c.uf || "") + '" placeholder="UF" maxlength="2" aria-label="UF"><button class="btn peq ghost" data-acao="buscarCidade">Buscar</button></div></div>' +
      '<div class="campo"><label for="resumo-ass">Assinatura (opcional)</label><input id="resumo-ass" data-mudar="resumoOpcao" data-chave="resumoAssinatura" value="' + h(S.ajustes.resumoAssinatura || "") + '" placeholder="Seu nome"></div></div>' +
      '<div class="linha-acoes" style="margin:4px 0 10px">' + status + "</div>" +
      (c.trSeparado ? '<p class="faixa" style="margin:0 0 10px;font-size:13.5px"><span>Este edital diz que o <b>Termo de Referência está em arquivo separado</b>. É nele que ficam itens, quantidades, valores, local e horários. Envie o edital e o Termo de Referência juntos (pode selecionar os dois arquivos) que o resumo sai completo.</span></p>' : "") +
      '<div class="resumo-email" id="resumo-email" contenteditable="true" spellcheck="true" aria-label="Resumo editável">' + resumoEmailHTML(r) + "</div>" +
      '<p class="nota" style="margin-top:8px">Clique no texto para editar antes de copiar. Os trechos em amarelo não foram encontrados no edital: complete à mão. Ao colar no Outlook ou Gmail, a tabela vai formatada. População: IBGE (estimativa mais recente). Distância: rota de carro até a capital (OpenStreetMap).</p></section>';
  }
  // Tenta as cidades candidatas encontradas no edital, na ordem, até uma existir na lista do IBGE
  async function buscarCidade(nome, uf, candidatas) {
    const lista = (candidatas && candidatas.length ? candidatas : [{ nome, uf }]).filter(c => c && c.nome);
    if (!lista.length) { ui.cidade = { erro: "Cidade não identificada no edital: digite a cidade e a UF e clique em Buscar." }; atualizarResumo(); return; }
    ui.cidade = { carregando: true };
    atualizarResumo();
    let ultimoErro = "";
    for (const c of lista) {
      try {
        const d = await api("/api/municipio?nome=" + encodeURIComponent(c.nome) + "&uf=" + encodeURIComponent(c.uf || uf || ""), 25000);
        ui.cidade = { dados: d }; atualizarResumo(); return;
      } catch (e) {
        ultimoErro = e.message;
        if (!/não encontrei|mais de uma/i.test(e.message)) break; // falha de conexão: não adianta tentar as outras
      }
    }
    ui.cidade = { erro: /não encontrei|mais de uma/i.test(ultimoErro) ? "Não achei a cidade do órgão no edital (" + lista.map(c => c.nome + (c.uf ? "/" + c.uf : "")).join(", ") + "): digite e clique em Buscar." : "Distância e população não carregaram: " + ultimoErro };
    atualizarResumo();
  }
  function atualizarResumo() { const el = $("#cartao-resumo"); if (el && ui.analise) el.outerHTML = resumoCartao(ui.analise); }
  async function copiarResumoEmail() {
    const el = $("#resumo-email");
    if (!el) return;
    const html = '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1F2A2C">' + el.innerHTML + "</div>";
    const texto = el.innerText.replace(/\n{3,}/g, "\n\n");
    try {
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([texto], { type: "text/plain" }) })]);
      toast("Resumo copiado", "Cole no e-mail: a tabela vai formatada."); return;
    } catch (e) { /* tenta do jeito antigo */ }
    const sel = getSelection(), faixa = document.createRange();
    faixa.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(faixa);
    let ok = false; try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    if (ok) { sel.removeAllRanges(); toast("Resumo copiado", "Cole no e-mail."); } else toast("Selecionei o resumo", "Use Ctrl+C para copiar.");
  }

  /* Conferência automática da leitura: aparece antes do resumo, com o que parece errado */
  function conferenciaHTML(r) {
    const lista = (r.conferencia || []).filter(x => x.nivel !== "info"), infos = (r.conferencia || []).filter(x => x.nivel === "info");
    if (!lista.length) return '<section class="card conferencia ok"><div class="card-h"><h2>' + ic("check") + 'Conferência automática</h2></div><p class="muted">Data da sessão, prazo da proposta, itens, valor e portal conferidos: nada fora do lugar.' + (infos.length ? " " + infos.map(x => h(x.texto)).join(" ") : "") + "</p></section>";
    const crit = lista.filter(x => x.nivel === "crit").length;
    return '<section class="card conferencia ' + (crit ? "crit" : "warn") + '"><div class="card-h"><h2>' + ic("aviso") + "Conferência automática</h2><span class=\"pill " + (crit ? "crit" : "warn") + ' sem-ponto">' + (crit ? U.plural(crit, "provável erro", "prováveis erros") : U.plural(lista.length, "ponto a conferir", "pontos a conferir")) + "</span></div>" +
      '<p class="muted" style="margin-bottom:8px">O portal conferiu a própria leitura e achou o que está abaixo. Confira no edital antes de copiar o resumo ou cadastrar.</p><ul class="conf-lista">' +
      lista.concat(infos).map(x => '<li class="' + x.nivel + '"><span class="nivel ' + (x.nivel === "crit" ? "alto" : x.nivel === "warn" ? "medio" : "baixo") + '"></span>' + h(x.texto) + "</li>").join("") + "</ul></section>";
  }
  function resultadoAnalise(r) {
    const c = r.campos, t = r.termometro;
    const niveis = t.nivel === "ok" ? 1 : t.nivel === "medio" ? 2 : 3;
    const dado = (rot, v, largo) => '<div class="' + (largo ? "largo" : "") + '"><dt>' + rot + "</dt><dd" + (v ? "" : ' class="vazio-dd"') + ">" + (v || "não encontrado") + "</dd></div>";
    const sessaoData = c.sessao ? U.soData(c.sessao) : U.hojeISO();
    const exigidos = r.habilitacao.filter(x => x.exigido);
    const pasta = exigidos.map(x => {
      if (x.chave === "declaracoes" || x.chave === "responsavel_tecnico") return Object.assign({ st: "neutral", rot: "Preparar para este edital" }, x);
      const daEmpresa = docsAtivos().filter(d => d.tipo === x.chave);
      const chaveEmp = U.semAcento((S.empresa.apelido || S.empresa.nome || "").split(/\s+/)[0]).toLowerCase();
      const preferidos = daEmpresa.filter(d => chaveEmp && U.semAcento(d.empresa || "").toLowerCase().includes(chaveEmp) && !/filial/i.test(d.empresa || ""));
      const docs = preferidos.length ? preferidos : daEmpresa;
      if (!docs.length) return Object.assign({ st: "warn", rot: "Não está na pasta" }, x);
      const valido = docs.find(d => !d.validade || d.validade >= sessaoData);
      if (valido) return Object.assign({ st: "ok", rot: valido.validade ? "Válido na sessão (até " + U.fmtData(valido.validade) + ")" : "Na pasta" }, x);
      return Object.assign({ st: "crit", rot: "Vence antes da sessão (" + U.fmtData(docs[0].validade) + ")" }, x);
    });
    const okCount = pasta.filter(x => x.st === "ok").length;
    return conferenciaHTML(r) + resumoCartao(r) + '<section class="termometro ' + t.nivel + '"><div class="escala" aria-hidden="true"><i style="height:18px" class="' + (niveis >= 1 ? "on" : "") + '"></i><i style="height:28px" class="' + (niveis >= 2 ? "on" : "") + '"></i><i style="height:38px" class="' + (niveis >= 3 ? "on" : "") + '"></i></div>' +
      "<div><span class=\"eyebrow\" style=\"color:inherit;opacity:.7\">Termômetro do edital</span><h3>" + t.rotulo + "</h3><p>" + t.texto + "</p></div></section>" +
      '<section class="card"><div class="card-h"><h2>Dados do certame</h2><div class="linha-acoes"><button class="btn peq ghost" data-acao="copiarAnalise">' + ic("copiar") + 'Copiar análise</button><button class="btn peq primario" data-acao="criarDaAnalise">' + ic("mais") + "Criar edital</button></div></div>" +
      '<dl class="dados">' + dado("Número", h(c.numero) + (c.numeroPortal ? ' <span class="muted">· no ' + h(c.plataforma || "portal") + ": " + h(c.numeroPortal) + "</span>" : "")) + dado("Modalidade", h(c.modalidade)) + dado("Órgão", h(c.orgao), true) + dado("Objeto", h(c.objeto), true) +
      dado("Sessão pública", c.sessao ? U.fmtDataHora(c.sessao) + " " + chipSessao(c.sessao) : "") + dado("Impugnar / esclarecer até", c.impugnacaoAte ? U.fmtData(c.impugnacaoAte) + " " + chip(c.impugnacaoAte) : "") +
      dado("Critério de julgamento", h(c.criterio)) + dado("Modo de disputa", h(c.modoDisputa)) + dado("Plataforma", h(c.plataforma)) + dado("Valor estimado", c.valorEstimado ? U.moeda(c.valorEstimado) : c.orcamentoSigiloso ? "Sigiloso" : "") +
      dado("Registro de preços", c.srp ? "Sim" : "Não identificado") + dado("Processo", h(c.processo)) + dado("Vigência", h(c.vigencia)) + dado("Validade da proposta", h(c.validadeProposta)) +
      dado("Pagamento", h(c.pagamento)) + dado("Início dos serviços", h(c.inicioServicos)) + "</dl>" +
      '<p class="nota" style="margin-top:10px">Prazo de impugnação calculado como 3 dias úteis antes da sessão (art. 164 da Lei 14.133/2021), descontando fins de semana e feriados. Confira sempre a regra do próprio edital.</p></section>' +
      '<section class="card"><div class="card-h"><h2>Habilitação × nossa pasta</h2><span class="muted">' + okCount + " de " + pasta.length + " em dia</span></div>" +
      (pasta.length ? '<div class="hab">' + pasta.map(x => '<div class="hab-item"><span class="' + (x.st === "ok" ? "ok-i" : "no-i") + '">' + ic(x.st === "ok" ? "check" : "documentos") + "</span><div><b>" + h(x.nome) + "</b><small>" + h(x.grupo) + '</small></div><span class="pill ' + x.st + '">' + h(x.rot) + "</span></div>").join("") + "</div>" : vazio("documentos", "Não encontrei a lista de documentos de habilitação no texto.")) +
      '<div class="linha-acoes" style="margin-top:12px"><a class="btn peq ghost" href="#documentos">Abrir pasta de documentos</a></div></section>' +
      '<section class="card"><div class="card-h"><h2>Pontos de atenção</h2><span class="muted">' + U.plural(r.riscos.length, "ponto", "pontos") + "</span></div>" +
      (r.riscos.length ? '<div class="riscos">' + r.riscos.map((x, i) => '<details class="risco"' + (i < 2 && x.nivel !== "info" ? " open" : "") + '><summary><span class="nivel ' + x.nivel + '"></span><b>' + h(x.titulo) + '</b><span class="pill ' + (x.nivel === "alto" ? "crit" : x.nivel === "medio" ? "warn" : "info") + ' sem-ponto">' + (x.nivel === "alto" ? "Alto" : x.nivel === "medio" ? "Médio" : "Info") + '</span></summary><div class="det">' + (x.detalhe ? "<p>" + h(x.detalhe) + "</p>" : "") + (x.trecho ? "<blockquote>" + h(x.trecho) + "</blockquote>" : "") + "</div></details>").join("") + "</div>" : vazio("check", "Nenhum ponto de atenção encontrado.")) +
      '<p class="nota" style="margin-top:10px">Leitura automática por regras de texto: ajuda a triar, mas não substitui a leitura completa do edital e do termo de referência.</p></section>';
  }
  function analisarAgora() {
    const ta = $("#texto-edital");
    ui.analiseTexto = ta ? ta.value : ui.analiseTexto;
    if (ui.analiseTexto.trim().length < 200) { toast("Texto curto demais", "Cole o edital completo (ou ao menos as seções de objeto, sessão e habilitação).", "crit"); return; }
    ui.analise = A.analisarEdital(ui.analiseTexto, { porte: S.empresa.porte });
    ui.cidade = null;
    $("#resultado-analise").innerHTML = resultadoAnalise(ui.analise);
    buscarCidade(ui.analise.campos.municipio, ui.analise.campos.uf, ui.analise.campos.cidades);
    const errosLeitura = (ui.analise.conferencia || []).filter(x => x.nivel === "crit").length;
    toast("Edital analisado", ui.analise.preenchidos + " de 7 dados principais encontrados · " + U.plural(ui.analise.riscos.length, "ponto de atenção", "pontos de atenção") + (errosLeitura ? " · " + U.plural(errosLeitura, "item da leitura para conferir", "itens da leitura para conferir") : ""), errosLeitura ? "pop" : "");
    if (window.innerWidth < 1180) $("#resultado-analise").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function carregarScript(src) {
    return new Promise((ok, erro) => {
      if ($('script[src="' + src + '"]')) return ok();
      const s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = () => erro(new Error("Não consegui carregar o leitor de PDF."));
      document.head.appendChild(s);
    });
  }
  // Lê um ou vários arquivos (ex.: edital + Termo de Referência) e analisa tudo junto
  async function lerArquivo(lista) {
    const st = $("#status-analise");
    const arquivos = Array.from(lista && lista.length !== undefined ? lista : [lista]).filter(Boolean);
    if (!arquivos.length) return;
    try {
      const partes = [];
      for (const arq of arquivos) {
        st.textContent = "Lendo " + arq.name + "…";
        partes.push(await textoDoArquivo(arq, st));
      }
      $("#texto-edital").value = partes.join("\n\n==========\n\n");
      st.textContent = arquivos.length > 1 ? arquivos.length + " arquivos carregados." : arquivos[0].name + " carregado.";
      analisarAgora();
    } catch (e) { st.textContent = ""; toast("Não consegui ler o arquivo", e.message, "crit"); }
  }
  async function textoDoArquivo(arq, st) {
    {
      if (/\.txt$/i.test(arq.name) || arq.type === "text/plain") return await arq.text();
      {
        st.textContent = "Lendo o PDF…";
        const base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
        await carregarScript(base + "pdf.min.js");
        await carregarScript(base + "pdf.worker.min.js"); // roda o leitor na própria página
        const pdfjs = window.pdfjsLib;
        pdfjs.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.js";
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await arq.arrayBuffer()), isEvalSupported: false }).promise;
        let texto = "";
        for (let i = 1; i <= doc.numPages; i++) {
          st.textContent = "Lendo " + arq.name + ": página " + i + " de " + doc.numPages + "…";
          const conteudo = await (await doc.getPage(i)).getTextContent();
          texto += conteudo.items.map(it => it.str + (it.hasEOL ? "\n" : "")).join("") + "\n\n";
        }
        if (texto.replace(/\s/g, "").length < 100) throw new Error(arq.name + " parece ser uma imagem escaneada (sem texto). Use um PDF pesquisável ou copie o texto.");
        return texto;
      }
    }
  }
  function textoAnalise(r) {
    const c = r.campos;
    const l = ["ANÁLISE DE EDITAL · " + (c.numero || "") + " · " + (c.orgao || ""), "",
      "Objeto: " + (c.objeto || "—"), "Sessão: " + (c.sessao ? U.fmtDataHora(c.sessao) : "—") + " · Plataforma: " + (c.plataforma || "—"),
      "Impugnação/esclarecimento até: " + (c.impugnacaoAte ? U.fmtData(c.impugnacaoAte) : "—"),
      "Critério: " + (c.criterio || "—") + " · Modo: " + (c.modoDisputa || "—") + " · Valor estimado: " + (c.valorEstimado ? U.moeda(c.valorEstimado) : "—"),
      "", "Termômetro: " + r.termometro.rotulo, "", "Pontos de atenção:"];
    r.riscos.forEach(x => l.push("- [" + x.nivel.toUpperCase() + "] " + x.titulo + (x.detalhe ? ": " + x.detalhe : "")));
    l.push("", "Habilitação exigida:");
    r.habilitacao.filter(x => x.exigido).forEach(x => l.push("- " + x.nome));
    return l.join("\n");
  }

  /* ---------- Chats ---------- */
  const CAT_CLS = { retomada: "info", suspensao: "warn", convocacao: "pop", recurso: "warn", habilitacao: "brand", diligencia: "info", resultado: "ok", desclassificacao: "crit" };
  function realcar(texto, extra) {
    const lista = termos.filter(t => !/^\d+$/.test(t)).concat(extra ? [U.semAcento(extra).toLowerCase()] : []).filter(t => t && t.length >= 3);
    if (!lista.length) return h(texto);
    const norm = U.normalizarMesmoTamanho(texto);
    const marcas = [];
    lista.forEach(t => { let i = norm.indexOf(t); while (i >= 0) { marcas.push([i, i + t.length]); i = norm.indexOf(t, i + t.length); } });
    if (!marcas.length) return h(texto);
    marcas.sort((a, b) => a[0] - b[0]);
    let out = "", pos = 0;
    marcas.forEach(([a, b]) => { if (a < pos) return; out += h(texto.slice(pos, a)) + "<mark>" + h(texto.slice(a, b)) + "</mark>"; pos = b; });
    return out + h(texto.slice(pos));
  }
  function filtrarMsgs(c) {
    const b = U.semAcento(ui.chatBusca).toLowerCase().trim();
    return c.mensagens.filter(m => {
      const i = infoMsg(m);
      if (ui.chatFiltro === "importantes" && !i.importante) return false;
      if (ui.chatFiltro === "empresa" && !i.citaEmpresa) return false;
      if (ui.chatFiltro === "pregoeiro" && A.papelAutor(m.autor, termos) !== "pregoeiro") return false;
      if (CAT_CLS[ui.chatFiltro] && !i.tags.includes(ui.chatFiltro)) return false;
      return !b || U.semAcento(m.texto + " " + m.autor).toLowerCase().includes(b);
    });
  }
  function mensagensHTML(c) {
    const lista = filtrarMsgs(c);
    if (!lista.length) return vazio("chats", c.mensagens.length ? "Nenhuma mensagem com esse filtro." : (c.auto ? "Aguardando a primeira leitura do chat." : "Cole as mensagens do chat do portal para começar."), c.mensagens.length ? "" : '<button class="btn primario" data-acao="colarChat" data-id="' + c.id + '">' + ic("colar") + "Colar mensagens</button>");
    let dia = "", out = "", novaMarcada = false;
    lista.forEach(m => {
      const d = U.soData(m.hora);
      if (d !== dia) { dia = d; const n = U.diasAte(d); out += '<div class="dia-sep">' + (n === 0 ? "Hoje" : n === -1 ? "Ontem" : U.semana(d) + ", " + U.fmtDataCurta(d)) + "</div>"; }
      if (!m.lida && !novaMarcada) { novaMarcada = true; out += '<div class="novas-sep" id="primeira-nova">Novas mensagens</div>'; }
      const i = infoMsg(m), papel = A.papelAutor(m.autor, termos);
      const cls = ["msg", papel, i.citaEmpresa ? "cita" : (i.importante && papel !== "sistema" ? "importante" : ""), m.lida ? "" : "nova"].join(" ");
      const tags = papel === "sistema" ? "" : i.tags.map(t => '<span class="pill sem-ponto ' + CAT_CLS[t] + '">' + h(A.CATEGORIAS.find(x => x.id === t).nome) + "</span>").join("") + (i.citaEmpresa ? '<span class="pill pop sem-ponto">Cita a ' + h(apelido()) + "</span>" : "");
      out += '<div class="' + cls + '"><div class="autor">' + h(m.autor) + " <time datetime=\"" + h(m.hora) + "\">" + h(String(m.hora).slice(11, 19)) + '</time></div><div class="texto">' + realcar(m.texto, ui.chatBusca) + "</div>" + (tags ? '<div class="tags">' + tags + "</div>" : "") + "</div>";
    });
    return out;
  }
  function movimentoHTML(c) {
    const dias = [];
    for (let i = 6; i >= 0; i--) { const d = U.addDias(U.hojeISO(), -i); dias.push({ d, n: c.mensagens.filter(m => U.soData(m.hora) === d).length }); }
    const max = Math.max(1, ...dias.map(x => x.n));
    return '<div class="mov-wrap" title="Mensagens por dia nos últimos 7 dias"><div class="mov" aria-hidden="true">' + dias.map(x => '<i style="height:' + Math.max(2, Math.round(34 * x.n / max)) + 'px" title="' + U.fmtDataCurta(x.d) + ": " + x.n + '"></i>').join("") + "</div><span>7 dias</span></div>";
  }
  /* ---------- Pregões suspensos ----------
     Acompanha pregões suspensos pelo PNCP e pelo Portal de Compras Públicas (/api/suspensos): situação,
     desde quando, motivo, nova data quando sair, documentos novos e editais do mesmo órgão com objeto
     parecido publicados depois (possível republicação com outro número). Confere a cada 30 minutos. */
  const INTERVALO_SUSP = 30 * 60000;
  const suspensos = () => (S.suspensos = S.suspensos || []);
  const estaSuspenso = d => d && /suspens/i.test(d.situacao || "");
  function formSuspenso() {
    abrirForm({
      titulo: "Acompanhar pregão suspenso", tamanho: "estreito", botao: "Acompanhar",
      campos: [{ nome: "link", rotulo: "Link do pregão", tipo: "url", req: true, span: 2, ph: "https://", dica: "Compras.gov.br (acompanhamento da compra), PNCP ou Portal de Compras Públicas." },
        { nome: "obs", rotulo: "Observação (opcional)", span: 2, ph: "Ex.: suspenso para análise de impugnação" }],
      validar: v => (/compra=\d{17}|pncp\.gov\.br\/app\/editais\/\d{14}\/\d{4}\/\d+|portaldecompraspublicas\.com\.br\/processos\//i.test(v.link) ? "" : "Esse link não é do Compras.gov.br, do PNCP nem do Portal de Compras Públicas."),
      salvar: v => {
        if (suspensos().some(x => x.link === v.link)) { toast("Esse pregão já está na lista"); return; }
        const it = { id: U.uid(), link: v.link, obs: v.obs, adicionadoEm: U.agoraISO(), dados: null, vistos: { parecidos: [], docs: [] } };
        suspensos().push(it); registrar("Pregão suspenso em acompanhamento: " + v.link + ".", "suspensos");
        salvar(); render(); verificarSuspensos(it.id);
      }
    });
  }
  async function verificarSuspensos(soEste) {
    const lista = suspensos().filter(x => soEste ? x.id === soEste : !x.consultadoEm || Date.now() - new Date(x.consultadoEm).getTime() > INTERVALO_SUSP);
    if (!lista.length || ui.lendoSusp) return;
    ui.lendoSusp = true;
    try {
      for (const it of lista) {
        ui.lendo["s:" + it.id] = true; if (rotaAtual() === "suspensos") renderSeLivre();
        const id = it.dados && it.dados.pncp ? it.dados.pncp.cnpj + "-" + it.dados.pncp.ano + "-" + it.dados.pncp.seq : it.pncp || "";
        const pn = id ? "&pncp=" + id : "";
        try { atualizarSuspenso(it, await api("/api/suspensos?ref=" + encodeURIComponent(it.link) + pn, 65000)); it.erro = ""; }
        catch (e) { it.erro = e.message; if (soEste) toast("Não consegui ler esse pregão agora", e.message, "crit"); }
        it.consultadoEm = new Date().toISOString();
        delete ui.lendo["s:" + it.id];
        salvar(); if (rotaAtual() === "suspensos") renderSeLivre(); else atualizarNav();
      }
    } finally { ui.lendoSusp = false; }
    // pregões incluídos enquanto a leitura estava em andamento entram na próxima rodada
    if (suspensos().some(x => !x.consultadoEm)) setTimeout(() => verificarSuspensos(), 500);
  }
  function atualizarSuspenso(it, d) {
    const antes = it.dados, nome = d.numero + " · " + U.corta(d.orgao, 50);
    const novidades = [];
    it.vistos = it.vistos || { parecidos: [], docs: [] };
    if (antes) {
      if (estaSuspenso(antes) && !estaSuspenso(d)) { novidades.push(["O processo VOLTOU: agora está \"" + d.situacao + "\"" + (d.sessao && d.sessao > U.agoraISO() ? ", sessão em " + U.fmtDataHora(d.sessao) : "") + ".", "pop"]); it.voltouEm = U.agoraISO(); }
      else if (antes.situacao !== d.situacao) novidades.push(["Situação mudou: " + antes.situacao + " → " + d.situacao + ".", ""]);
      const nd = d.novaData && d.novaData.data, na = antes.novaData && antes.novaData.data;
      if (nd && nd !== na) { novidades.push(["Nova data: " + U.fmtDataHora(nd) + ".", "pop"]); it.novaDataEm = U.agoraISO(); }
      (d.documentos || []).filter(x => !it.vistos.docs.includes(x.titulo + "|" + x.data)).forEach(x => novidades.push(["Documento novo: " + x.titulo + ".", ""]));
    }
    (d.parecidos || []).filter(p => !it.vistos.parecidos.includes(p.linkPncp)).forEach(p => {
      novidades.push(["Possível republicação: " + p.numero + " (" + p.semelhanca + "% parecido), publicado em " + U.fmtData(U.soData(p.publicacao)) + ".", "pop"]);
    });
    it.vistos.parecidos = [...new Set(it.vistos.parecidos.concat((d.parecidos || []).map(p => p.linkPncp)))];
    it.vistos.docs = [...new Set(it.vistos.docs.concat((d.documentos || []).map(x => x.titulo + "|" + x.data)))].slice(-200);
    if (estaSuspenso(d)) { it.foiSuspenso = true; if (d.desde) it.suspensoDesde = d.desde; if (!it.sessaoOriginal && d.sessao) it.sessaoOriginal = d.sessao; }
    if (!antes && !estaSuspenso(d) && it.voltouEm === undefined) it.voltouEm = null; // primeira leitura já sem suspensão: não é "voltou"
    it.dados = d;
    if (novidades.length) {
      it.novidade = true;
      it.historico = (it.historico || []).concat(novidades.map(n => ({ quando: U.agoraISO(), texto: n[0] }))).slice(-30);
      novidades.forEach(n => registrar(nome + ": " + n[0], "suspensos"));
      if (antes || novidades.some(n => /republica/.test(n[0]))) notificar(nome, novidades.map(n => n[0]).join(" "), novidades.some(n => n[1] === "pop") ? "pop" : "", { rotulo: "Ver suspensos", rota: "suspensos" });
    }
  }
  // Pregão cujo chat (PNCP) mostra "Suspensa" entra sozinho na lista
  function garantirSuspensos() {
    let novos = 0;
    S.chats.filter(c => /suspens/i.test(c.status || "") && !/recurs/i.test(c.status || "")).forEach(c => {
      const e = c.editalId && edital(c.editalId);
      const link = [e && e.link, c.link].find(l => /compra=\d{17}|pncp\.gov\.br\/app\/editais|portaldecompraspublicas/i.test(l || ""));
      if (!link || (e && !ativo(e)) || suspensos().some(x => x.link === link || (e && x.editalId === e.id))) return;
      suspensos().push({ id: U.uid(), link, editalId: e ? e.id : null, adicionadoEm: U.agoraISO(), dados: null, vistos: { parecidos: [], docs: [] } });
      novos++;
    });
    if (novos) salvar();
  }
  function pgSuspensos() {
    const lista = suspensos().slice().sort((a, b) => (b.voltouEm ? 1 : 0) - (a.voltouEm ? 1 : 0) || (b.novidade ? 1 : 0) - (a.novidade ? 1 : 0) || String((a.dados || {}).desde || "9").localeCompare(String((b.dados || {}).desde || "9")));
    const susp = lista.filter(x => estaSuspenso(x.dados)).length, rep = lista.filter(x => x.dados && (x.dados.parecidos || []).length).length;
    const voltaram = lista.filter(x => x.voltouEm).length;
    const html = '<div class="cab"><div><span class="eyebrow">Operação</span><h1>Pregões suspensos</h1><p>O portal confere a cada 30 minutos a situação, a nova data, os documentos novos e se o órgão publicou outro edital com o mesmo objeto (número diferente).</p></div>' +
      '<div class="cab-acoes"><button class="btn ghost" data-acao="atualizarSuspensos">' + ic("atualizar") + 'Conferir agora</button><button class="btn primario" data-acao="novoSuspenso">' + ic("mais") + "Acompanhar pregão</button></div></div>" +
      '<div class="kpis kpis-3"><div class="kpi"><span class="rot">Suspensos</span><span class="val">' + susp + '</span><span class="sub">sem retomada ainda</span></div>' +
      '<div class="kpi' + (voltaram ? " kpi-volta" : "") + '"><span class="rot">Voltaram</span><span class="val">' + voltaram + '</span><span class="sub">saíram da suspensão</span></div>' +
      '<div class="kpi' + (rep ? " kpi-atencao" : "") + '"><span class="rot">Possível republicação</span><span class="val">' + rep + '</span><span class="sub">mesmo órgão, objeto parecido</span></div></div>' +
      (lista.length ? '<div class="susp-lista">' + lista.map(suspensoHTML).join("") + "</div>" : '<div class="card">' + vazio("aviso", "Nenhum pregão suspenso em acompanhamento.", '<button class="btn primario" data-acao="novoSuspenso">' + ic("mais") + "Acompanhar pregão</button>") + "</div>");
    setTimeout(() => { let mudou = false; suspensos().forEach(x => { if (x.novidade) { x.novidade = false; mudou = true; } }); if (mudou) { salvar(); atualizarNav(); } }, 1500);
    return html;
  }
  function suspensoHTML(it) {
    const d = it.dados, lendo = ui.lendo["s:" + it.id];
    const quando = s => s ? U.fmtDataHora(s) : "—";
    if (!d) return '<article class="card susp"><div class="susp-h"><div><b>' + h(nomeProvisorio(it)) + '</b><span class="org">' + linkCurto(it.link) + "</span></div>" + (lendo ? '<span class="pill info sem-ponto">Lendo…</span>' : "") + "</div>" + (it.erro ? '<p class="nota" style="color:var(--crit)">' + h(it.erro) + "</p>" : '<p class="muted">' + (lendo ? "Buscando situação, datas e documentos (leva uns 15 segundos)…" : "Na fila para a primeira leitura…") + "</p>") + rodapeSusp(it) + "</article>";
    const susp = estaSuspenso(d);
    const desde = d.desde || it.suspensoDesde || "";
    const dias = desde ? -U.diasAte(U.soData(desde)) : null;
    const depois = (d.documentos || []).filter(x => !desde || (x.data || "") >= U.soData(desde)).slice(-4).reverse();
    const ev = (d.eventos || []).filter(x => !desde || x.data >= desde).slice(-3).reverse();
    const faixa = it.voltouEm && !susp ? '<div class="susp-volta">' + ic("check") + "<div><b>O processo voltou!</b> Agora está \"" + h(d.situacao) + "\"" + (d.sessao && d.sessao > U.agoraISO() ? " · sessão em <b>" + quando(d.sessao) + "</b>" : "") + ' <span class="muted">(percebido ' + U.desde(it.voltouEm) + ")</span></div></div>"
      : susp && d.novaData ? '<div class="susp-volta data">' + ic("calendario") + "<div><b>Nova data marcada:</b> " + quando(d.novaData.data) + "</div></div>" : "";
    return '<article class="card susp' + (it.novidade ? " novo" : "") + (it.voltouEm && !susp ? " voltou" : "") + '">' + faixa +
      '<div class="susp-h"><div><b>' + h(d.numero) + "</b>" + (it.novidade ? ' <span class="pill pop sem-ponto">Novidade</span>' : "") + '<span class="org">' + h(d.orgao) + (d.municipio ? " · " + h(d.municipio) + (d.uf ? "/" + h(d.uf) : "") : "") + "</span><span class=\"org\">" + linkCurto(it.link) + '</span></div><div class="chips"><span class="pill ' + (susp ? "crit" : "ok") + '">' + h(d.situacao || "—") + '</span><span class="tag-portal" style="--cor:' + corPortal(d.portal) + '">' + h(d.portal || "") + "</span></div></div>" +
      '<p class="susp-obj">' + h(U.corta(d.objeto, 260)) + "</p>" +
      '<dl class="datas susp-datas"><div><dt>' + (susp ? "Suspenso desde" : "Ficou suspenso desde") + "</dt><dd>" + (desde ? U.fmtData(U.soData(desde)) + (susp ? ' <span class="muted">(há ' + U.plural(dias, "dia", "dias") + ")</span>" : "") : "—") + "</dd></div>" +
      "<div><dt>Volta quando?</dt><dd>" + (d.novaData ? '<b style="color:var(--ok)">' + quando(d.novaData.data) + "</b>" : susp ? '<span class="muted">Sem nova data publicada</span>' : d.sessao && d.sessao > U.agoraISO() ? "Sessão em " + quando(d.sessao) : '<span class="muted">Confira no portal de origem</span>') + "</dd></div>" +
      "<div><dt>Sessão original</dt><dd>" + quando(it.sessaoOriginal || d.sessao) + "</dd></div></dl>" +
      (d.motivo ? '<p class="susp-motivo"><b>Motivo:</b> ' + h(U.corta(d.motivo.replace(/^motivo:\s*/i, ""), 320)) + "</p>" : "") +
      (d.novaData && d.novaData.origem ? '<p class="nota">Nova data tirada de: ' + h(d.novaData.origem) + "</p>" : "") +
      (!susp && !it.editalId && !it.foiSuspenso && /PNCP/.test(d.fonte) && /divulgada/i.test(d.situacao) ? '<p class="nota">No PNCP o pregão aparece como "Divulgada". Se ele está suspenso no portal de origem, a suspensão pode não ter sido lançada no PNCP: confira no Compras.gov.br.</p>' : "") +
      (depois.length || ev.length ? '<div class="susp-bloco"><h4>' + (desde ? "Depois da suspensão" : "Documentos e eventos") + "</h4><ul>" + depois.map(x => "<li><time>" + (x.data ? U.fmtData(U.soData(x.data)) : "") + "</time> " + (x.url ? '<a href="' + h(x.url) + '" target="_blank" rel="noopener">' + h(U.corta(x.titulo, 110)) + "</a>" : h(U.corta(x.titulo, 110))) + "</li>").join("") + ev.map(x => "<li><time>" + U.fmtData(U.soData(x.data)) + "</time> " + h(U.corta(x.texto, 160)) + "</li>").join("") + "</ul></div>" : "") +
      ((d.parecidos || []).length ? '<div class="susp-bloco rep"><h4>' + ic("aviso") + "Possível republicação (mesmo órgão, objeto parecido)</h4>" + d.parecidos.map(p => '<div class="rep-item"><div><b>' + h(p.numero) + "</b> · " + p.semelhanca + '% parecido · publicado em ' + U.fmtData(U.soData(p.publicacao)) + (p.sessao ? " · sessão " + U.fmtDataHora(p.sessao) : "") + ' · <span class="muted">' + h(p.situacao) + '</span><p class="muted">' + h(U.corta(p.objeto, 200)) + '</p></div><div class="linha-acoes"><a class="btn peq ghost" href="' + h(p.link) + '" target="_blank" rel="noopener">' + ic("link") + 'Abrir</a><button class="btn peq primario" data-acao="cadastrarRepublicado" data-id="' + it.id + '" data-link="' + h(p.linkPncp) + '">' + ic("mais") + "Cadastrar edital</button></div></div>").join("") + "</div>" : "") +
      (it.obs ? '<p class="nota">Observação: ' + h(it.obs) + "</p>" : "") + rodapeSusp(it) + "</article>";
  }
  // Nome enquanto a primeira leitura não chega: observação ou o número tirado do link
  function nomeProvisorio(it) {
    if (it.obs) return it.obs;
    const c = (it.link.match(/compra=(\d{17})/) || [])[1];
    if (c) return ({ "05": "Pregão Eletrônico ", "06": "Dispensa ", "03": "Concorrência " }[c.slice(6, 8)] || "Compra ") + parseInt(c.slice(8, 13), 10) + "/" + c.slice(13) + " · UASG " + c.slice(0, 6);
    const p = it.link.match(/processos\/([A-Z]{2})\/([^/]+)\/([A-Z]+)-(\d+)-(\d{4})/i);
    if (p) return p[3].toUpperCase() + " " + p[4] + "/" + p[5] + " · " + p[2].replace(/-\d+$/, "").replace(/-/g, " ");
    return it.link;
  }
  const linkCurto = l => '<a href="' + h(l) + '" target="_blank" rel="noopener">' + ic("link") + " " + h((l.match(/^https?:\/\/(?:www\.)?([^/]+)/) || [])[1] || "link") + (/compra=(\d+)/.test(l) ? " · compra " + l.match(/compra=(\d+)/)[1] : "") + "</a>";
  function rodapeSusp(it) {
    const d = it.dados || {};
    return '<div class="linha-acoes susp-rodape"><a class="btn peq ghost" href="' + h(it.link) + '" target="_blank" rel="noopener">' + ic("link") + "Abrir no portal</a>" +
      (d.linkPncp && d.linkPncp !== it.link ? '<a class="btn peq ghost" href="' + h(d.linkPncp) + '" target="_blank" rel="noopener">Ver no PNCP</a>' : "") +
      '<button class="btn peq ghost" data-acao="lerSuspenso" data-id="' + it.id + '">' + ic("atualizar") + (ui.lendo["s:" + it.id] ? "Lendo…" : "Atualizar") + "</button>" +
      '<button class="btn peq ghost" data-acao="removerSuspenso" data-id="' + it.id + '">' + ic("lixo") + "Remover</button>" +
      '<span class="muted" style="margin-left:auto;font-size:12.5px">' + (it.consultadoEm ? "conferido " + U.desde(U.isoDataHora(new Date(it.consultadoEm))) : "") + "</span></div>";
  }

  /* ---------- Resultados do ano ---------- */
  // Ganhos achados no PNCP (dados abertos do Compras.gov.br) pelo CNPJ da empresa e do grupo.
  // Cada ganho novo entra sozinho nos editais, na etapa "Ganho", com os itens e valores homologados.
  const INTERVALO_RES = 6 * 3600000;
  const CHECK_GANHO = ["Ata ou contrato assinado", "Garantia contratual entregue (se exigida)", "Ordem de serviço / início da execução", "Equipe e escalas montadas", "Primeira nota fiscal emitida"];
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const cnpjsGrupo = () => [...new Set([S.empresa.cnpj].concat(String(S.empresa.grupo || "").match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g) || [])
    .map(x => String(x || "").replace(/\D/g, "")).filter(x => x.length === 14))];
  // Nomes para achar os contratos no PNCP: apelido (ou nome) da empresa e nomes do grupo, sem o CNPJ
  const nomesGrupo = () => [...new Set([S.empresa.apelido || S.empresa.nome].concat(String(S.empresa.grupo || "").split(/\n|;/))
    .map(x => String(x || "").replace(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g, "").replace(/[()\-–:]+\s*$/, "").trim()).filter(x => x.length >= 3))].slice(0, 4);
  const resCache = () => (S.resultadosPncp = S.resultadosPncp || {});
  // Ano do processo: o do resultado (homologação), senão o da sessão
  const dataDoProcesso = e => String((e.resultado && e.resultado.data) || e.sessao || e.criadoEm || "");
  const idGanho = p => "pncp-" + String(p.id).replace(/\W+/g, "-");
  const numeroCurto = s => { const m = String(s || "").match(/(\d+)\s*\/\s*(\d{4})/); return m ? [String(+m[1]), String(+(String(+m[1]).replace(/^9(?=\d{4}$)/, ""))), m[2]] : null; };
  const PALAVRAS_ORGAO = new Set("secretaria estado estadual municipal saude publica publico fundacao fundo hospital governo prefeitura".split(" "));
  const palavrasOrgao = s => new Set(U.semAcento(String(s || "")).toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 5 && !PALAVRAS_ORGAO.has(w)));

  function editalDoGanho(p) {
    const nn = numeroCurto(p.numero);
    return S.editais.find(e => e.pncpId === p.id || e.id === idGanho(p) || (p.compra && String(e.link || "").includes(p.compra))) ||
      S.editais.find(e => {
        const ne = numeroCurto(e.numero);
        if (!nn || !ne || ne[2] !== nn[2] || !(ne[0] === nn[0] || ne[1] === nn[1] || ne[0] === nn[1])) return false;
        if (e.uasg && p.uasg) return String(e.uasg).replace(/\D/g, "") === p.uasg;
        const a = palavrasOrgao(e.orgao), b = palavrasOrgao(p.orgao + " " + p.unidade);
        return e.uf && p.uf ? e.uf === p.uf : [...a].filter(w => b.has(w)).length >= 1; // mesmo número e ano: basta a UF bater
      });
  }
  function resumoResultado(p) {
    return { data: p.dataResultado, valor: p.valorGanho, valorEstimado: p.valorEstimadoGanho, vigente: p.vigente, fonte: "PNCP", conferidoEm: U.agoraISO(),
      itens: (p.itens || []).map(x => ({ numero: x.numero, descricao: x.descricao, quantidade: x.quantidade, unidade: x.unidade, valorUnit: x.valorUnit, valor: x.valor, valorEstimado: x.valorEstimado, data: x.data, fornecedor: x.fornecedor, vigente: x.vigente, atual: x.atual })) };
  }
  const itensTexto = p => (p.itens || []).filter(x => x.vigente).map(x => x.numero).join(", ");
  // Coloca cada ganho do PNCP nos editais (novo ou existente) e devolve o que mudou
  function incorporarGanhos(processos) {
    const mudou = [];
    (processos || []).filter(p => !p.erro && p.numero).forEach(p => {
      const e = editalDoGanho(p), res = resumoResultado(p);
      const quem = ((p.itens || []).find(x => x.vigente) || {}).fornecedor || apelido();
      if (e) {
        const antes = e.resultado;
        e.pncpId = p.id; e.resultado = res;
        if (!e.uasg && p.uasg) e.uasg = p.uasg;
        if (!e.nossoValor && p.valorGanho) e.nossoValor = p.valorGanho;
        if (!e.valorEstimado && p.valorEstimadoCompra) e.valorEstimado = p.valorEstimadoCompra;
        if (!e.link && (p.link || p.linkPncp)) e.link = p.link || p.linkPncp;
        if (p.vigente && e.etapa !== "ganho" && e.etapa !== "descartado") {
          const de = ETAPA(e.etapa).nome;
          e.etapa = "ganho"; e.propostaStatus = "cadastrada";
          (e.historico = e.historico || []).unshift({ data: U.hojeISO(), texto: "Homologado no PNCP para " + quem + " (itens " + itensTexto(p) + ", " + U.moeda(p.valorGanho) + "): " + de + " → Ganho." });
          registrar(e.numero + " foi homologado para " + quem + " (PNCP).", "resultados");
          mudou.push({ e, tipo: "ganho" });
        } else if (antes && antes.vigente && !p.vigente) {
          (e.historico = e.historico || []).unshift({ data: U.hojeISO(), texto: "No PNCP saiu outro resultado para os itens que tínhamos ganhado. Confira no portal." });
          mudou.push({ e, tipo: "substituido" });
        }
        return;
      }
      if (!p.vigente || (S.apagados || []).includes(idGanho(p))) return;
      const novo = {
        id: idGanho(p), pncpId: p.id, origem: "pncp", numero: p.numero, modalidade: /^PE /.test(p.numero) ? "Pregão eletrônico" : /^DE /.test(p.numero) ? "Dispensa eletrônica" : /^CE /.test(p.numero) ? "Concorrência eletrônica" : "Outra",
        orgao: p.orgao || p.unidade, municipio: p.municipio, uf: p.uf, objeto: p.objeto, sessao: p.sessao, valorEstimado: p.valorEstimadoCompra || null, nossoValor: p.valorGanho,
        portal: p.compra ? "Compras.gov.br" : "PNCP", etapa: "ganho", propostaStatus: "cadastrada", prioridade: "media", responsavel: "", processo: p.processo, link: p.link || p.linkPncp, uasg: p.uasg,
        resultado: res, checklist: {}, posGanho: {}, notas: "", criadoEm: U.hojeISO(),
        historico: [{ data: U.hojeISO(), texto: "Ganho encontrado no PNCP: itens " + itensTexto(p) + " homologados para " + quem + " em " + U.fmtData(p.dataResultado) + " (" + U.moeda(p.valorGanho) + ")." }]
      };
      S.editais.push(novo);
      registrar("Ganho do PNCP entrou no acompanhamento: " + novo.numero + " · " + U.corta(novo.orgao, 50) + ".", "resultados");
      mudou.push({ e: novo, tipo: "novo" });
    });
    return mudou;
  }
  async function buscarResultados(ano, forcar) {
    ano = String(ano || new Date().getFullYear());
    const cnpjs = cnpjsGrupo(), c = resCache()[ano];
    if (!cnpjs.length) { if (forcar) toast("Falta o CNPJ da empresa", "Preencha em Ajustes → Empresa.", "crit"); return; }
    const espera = c && c.erro ? 30 * 60000 : INTERVALO_RES;
    if (ui.lendoRes || (!forcar && c && Date.now() - new Date(c.tentadoEm || c.consultadoEm || 0).getTime() < espera)) return;
    ui.lendoRes = true; if (rotaAtual() === "resultados") renderSeLivre();
    try {
      const d = await api("/api/resultados?cnpj=" + cnpjs.join(",") + "&ano=" + ano + "&nome=" + encodeURIComponent(nomesGrupo().join(",")), 90000);
      const falhos = (d.processos || []).filter(p => p.erro).length; // ex.: PNCP limitou as consultas (429): tenta de novo em 30 min
      resCache()[ano] = { consultadoEm: d.consultadoEm, tentadoEm: U.agoraISO(), processos: d.processos, erro: falhos ? U.plural(falhos, "processo não carregou", "processos não carregaram") + " no PNCP; tento de novo em 30 minutos" : "" };
      const mud = incorporarGanhos(d.processos);
      const novos = mud.filter(m => m.tipo !== "substituido"), subst = mud.filter(m => m.tipo === "substituido");
      if (novos.length) notificar(U.plural(novos.length, "ganho novo", "ganhos novos") + " no PNCP", novos.map(m => m.e.numero + " · " + U.corta(m.e.orgao, 40)).join("; ") + ". Já estão nos editais, na etapa Ganho.", "pop", { rotulo: "Ver resultados", rota: "resultados" });
      if (subst.length) notificar("Resultado mudou no PNCP", subst.map(m => m.e.numero).join("; ") + ": saiu outro resultado para itens que estavam com a empresa.", "crit", { rotulo: "Ver resultados", rota: "resultados" });
      if (forcar && !mud.length) toast("Resultados conferidos", U.plural((d.processos || []).length, "processo ganho", "processos ganhos") + " no PNCP em " + ano + ". Nada novo.");
    } catch (e) {
      resCache()[ano] = Object.assign({}, c || {}, { erro: e.message, tentadoEm: U.agoraISO() });
      if (forcar) toast("Não consegui buscar os resultados", e.message, "crit");
    } finally {
      ui.lendoRes = false; salvar();
      if (rotaAtual() === "resultados") renderSeLivre(); else atualizarNav();
    }
  }
  const pctRes = v => (v === null || v === undefined || isNaN(v)) ? "—" : (Math.round(v * 10) / 10).toString().replace(".", ",") + "%";
  function posicaoTexto(e) {
    const ps = posicaoDisputa(chatDoEdital(e.id)).filter(x => x.pos);
    return ps.length ? ps.slice(0, 2).map(x => x.pos + "º de " + x.total).join(", ") + (ps.length > 2 ? "…" : "") : "";
  }
  const valorGanhoDe = e => Number(e.resultado && e.resultado.vigente !== false ? e.resultado.valor : e.nossoValor) || 0;
  const estimadoGanhoDe = e => Number(e.resultado && e.resultado.valorEstimado) || Number(e.valorEstimado) || 0;
  function dadosAno(ano) {
    const eds = S.editais.filter(e => dataDoProcesso(e).slice(0, 4) === ano);
    const disputados = eds.filter(e => e.etapa !== "descartado" && e.etapa !== "triagem");
    const ganhos = disputados.filter(e => e.etapa === "ganho"), perdidos = disputados.filter(e => e.etapa === "perdido");
    const andamento = disputados.filter(e => !ETAPA(e.etapa).final);
    return { eds, disputados, ganhos, perdidos, andamento, descartados: eds.filter(e => e.etapa === "descartado"), triagem: eds.filter(e => e.etapa === "triagem") };
  }
  function pgResultados() {
    const anoAtual = new Date().getFullYear(), ano = String(ui.resAno || anoAtual);
    const d = dadosAno(ano), cache = resCache()[ano] || {}, cnpjs = cnpjsGrupo();
    const valorGanho = d.ganhos.reduce((s, e) => s + valorGanhoDe(e), 0);
    const comEst = d.ganhos.filter(e => estimadoGanhoDe(e) && valorGanhoDe(e));
    const est = comEst.reduce((s, e) => s + estimadoGanhoDe(e), 0), val = comEst.reduce((s, e) => s + valorGanhoDe(e), 0);
    const desconto = est ? 100 * (1 - val / est) : null;
    const taxa = d.ganhos.length + d.perdidos.length ? 100 * d.ganhos.length / (d.ganhos.length + d.perdidos.length) : null;
    const emDisputa = d.andamento.reduce((s, e) => s + (Number(e.valorEstimado) || 0), 0);

    // Por mês (data do resultado ou da sessão)
    const meses = MESES.map(() => ({ ganho: 0, perdido: 0, andamento: 0 }));
    d.disputados.forEach(e => { const m = +dataDoProcesso(e).slice(5, 7) - 1; if (m >= 0 && m < 12) meses[m][e.etapa === "ganho" ? "ganho" : e.etapa === "perdido" ? "perdido" : "andamento"]++; });
    const maxM = Math.max(1, ...meses.map(m => m.ganho + m.perdido + m.andamento));
    const SERIES = [["ganho", "Ganhos", "ok"], ["perdido", "Perdidos", "crit"], ["andamento", "Em andamento", "brand"]];
    const grafico = '<div class="res-legenda">' + SERIES.map(s => '<span><i class="res-cor ' + s[2] + '"></i>' + s[1] + "</span>").join("") + "</div>" +
      '<div class="res-meses" role="img" aria-label="Processos por mês em ' + ano + '">' + meses.map((m, i) => {
        const tot = m.ganho + m.perdido + m.andamento;
        const dica = MESES[i] + "/" + ano + ": " + (tot ? SERIES.filter(s => m[s[0]]).map(s => m[s[0]] + " " + s[1].toLowerCase()).join(", ") : "nenhum processo");
        return '<div class="res-mes" title="' + h(dica) + '"><span class="res-n">' + (tot || "") + '</span><span class="res-pilha" style="height:' + Math.round(100 * tot / maxM) + '%">' +
          SERIES.filter(s => m[s[0]]).map(s => '<i class="' + s[2] + '" style="flex:' + m[s[0]] + '"></i>').join("") + '</span><span class="res-rot">' + MESES[i] + "</span></div>";
      }).join("") + "</div>";

    // Por órgão e por portal
    const porOrgao = {};
    d.disputados.forEach(e => { const k = (e.orgao || "—").trim(); const o = porOrgao[k] = porOrgao[k] || { orgao: k, uf: e.uf, n: 0, ganhos: 0, valor: 0 }; o.n++; if (e.etapa === "ganho") { o.ganhos++; o.valor += valorGanhoDe(e); } });
    const orgaos = Object.values(porOrgao).sort((a, b) => b.valor - a.valor || b.n - a.n).slice(0, 8);
    const porPortal = {};
    d.disputados.forEach(e => { const k = e.portal || "Não informado"; const o = porPortal[k] = porPortal[k] || { n: 0, ganhos: 0 }; o.n++; if (e.etapa === "ganho") o.ganhos++; });
    const portais = Object.entries(porPortal).sort((a, b) => b[1].n - a[1].n), maxP = Math.max(1, ...portais.map(p => p[1].n));

    const lista = d.disputados.slice().sort((a, b) => dataDoProcesso(b).localeCompare(dataDoProcesso(a)));
    const linha = e => {
      const et = ETAPA(e.etapa), v = e.etapa === "ganho" ? valorGanhoDe(e) : Number(e.nossoValor) || 0, es = e.etapa === "ganho" ? estimadoGanhoDe(e) : Number(e.valorEstimado) || 0;
      return '<tr class="clicavel" data-acao="abrirEdital" data-id="' + e.id + '" tabindex="0"><td class="forte">' + h(e.numero) + '<span class="sub">' + U.fmtData(U.soData(dataDoProcesso(e))) + (e.resultado ? " · homologado" : "") + "</span></td>" +
        "<td>" + h(U.corta(e.orgao, 70)) + (e.uf ? " <span class=\"muted\">(" + h(e.uf) + ")</span>" : "") + '<span class="sub">' + h(U.corta(e.objeto || "", 110)) + "</span></td>" +
        '<td><span class="tag-portal" style="--cor:' + corPortal(e.portal) + '">' + h(e.portal || "—") + "</span></td>" +
        '<td><span class="pill ' + et.cls + '">' + h(et.curto || et.nome) + "</span>" + (posicaoTexto(e) ? '<span class="sub">' + h(posicaoTexto(e)) + "</span>" : "") + "</td>" +
        '<td class="num" style="text-align:right">' + (v ? "<b>" + U.moeda(v) + "</b>" : U.moeda(es || null)) + (v && es ? '<span class="sub">estimado ' + U.moedaCurta(es) + " · " + pctRes(100 * (1 - v / es)) + " abaixo</span>" : v ? "" : es ? '<span class="sub">estimado</span>' : "") + "</td></tr>";
    };

    const pncp = (cache.processos || []).filter(p => !p.erro);
    const ganhoPncp = p => '<article class="res-ganho' + (p.vigente ? "" : " fora") + '"><div class="res-ganho-h"><div><b>' + h(p.numero) + "</b> · " + h(U.corta(p.orgao, 70)) + (p.uf ? " (" + h(p.municipio ? p.municipio + "/" + p.uf : p.uf) + ")" : "") +
      '<p class="muted">' + h(U.corta(p.objeto, 220)) + '</p></div><div class="res-valor"><b>' + U.moeda(p.valorGanho) + '</b><span class="muted">homologado em ' + U.fmtData(p.dataResultado) + "</span></div></div>" +
      '<div class="tabela-wrap"><table class="tabela res-itens"><thead><tr><th>Item</th><th>Descrição</th><th style="text-align:right">Qtd.</th><th style="text-align:right">Estimado (un.)</th><th style="text-align:right">Homologado (un.)</th><th style="text-align:right">Total</th><th>Situação</th></tr></thead><tbody>' +
      (p.itens || []).map(x => "<tr><td>" + x.numero + "</td><td>" + h(U.corta(x.descricao, 70)) + '<span class="sub">' + h(x.fornecedor || "") + '</span></td><td class="num" style="text-align:right">' + (x.quantidade || "—").toLocaleString("pt-BR") + " " + h(String(x.unidade || "").toLowerCase()) +
        '</td><td class="num" style="text-align:right">' + U.moeda(x.valorUnitEstimado) + '</td><td class="num" style="text-align:right">' + U.moeda(x.valorUnit) + '</td><td class="num" style="text-align:right">' + U.moeda(x.valor) + "</td><td>" +
        (x.vigente ? '<span class="pill ok">Com a empresa</span>' : '<span class="pill crit">Substituído</span><span class="sub">' + h(x.atual ? x.atual.fornecedor + " · " + U.fmtData(x.atual.data) : "") + "</span>") + "</td></tr>").join("") + "</tbody></table></div>" +
      '<div class="linha-acoes">' + (p.link ? '<a class="btn peq ghost" href="' + h(p.link) + '" target="_blank" rel="noopener">' + ic("link") + "Compras.gov.br</a>" : "") + '<a class="btn peq ghost" href="' + h(p.linkPncp) + '" target="_blank" rel="noopener">' + ic("link") + "Ver no PNCP</a>" +
      (editalDoGanho(p) ? '<button class="btn peq ghost" data-acao="abrirEdital" data-id="' + editalDoGanho(p).id + '">' + ic("editais") + "Abrir no acompanhamento</button>" : "") + "</div></article>";

    const status = !cnpjs.length ? '<p class="nota">Informe o CNPJ da empresa em <a href="#ajustes">Ajustes → Empresa</a> para o portal buscar os ganhos no PNCP.</p>'
      : '<p class="muted res-status">' + (ui.lendoRes ? "Buscando os ganhos no PNCP (leva uns 30 segundos)…" : cache.consultadoEm ? "Conferido " + U.desde(U.isoDataHora(new Date(cache.consultadoEm))) + " · CNPJ " + cnpjs.map(c => c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")).join(", ") : "Ainda não conferido.") +
        (cache.erro ? ' · <span style="color:var(--crit)">última tentativa falhou: ' + h(cache.erro) + "</span>" : "") + "</p>";

    return '<div class="cab"><div><span class="eyebrow">Análise e jurídico</span><h1>Resultados de ' + ano + '</h1><p>Todos os processos do ano: ganhos, perdidos e em andamento. Os ganhos homologados no PNCP (Compras.gov.br) entram sozinhos no acompanhamento, com os itens e valores.</p></div>' +
      '<div class="cab-acoes"><select data-mudar="resAno" aria-label="Ano">' + [anoAtual, anoAtual - 1].map(a => "<option" + (String(a) === ano ? " selected" : "") + ">" + a + "</option>").join("") + "</select>" +
      '<button class="btn ghost" data-acao="exportarResultados">' + ic("download") + 'Exportar planilha</button><button class="btn primario" data-acao="buscarResultados"' + (ui.lendoRes ? " disabled" : "") + ">" + ic("atualizar") + (ui.lendoRes ? "Buscando…" : "Buscar ganhos no PNCP") + "</button></div></div>" + status +
      '<section class="kpis" aria-label="Indicadores do ano">' +
      '<div class="kpi destaque"><span class="rot">Processos disputados</span><span class="val">' + d.disputados.length + '</span><span class="sub">' + U.plural(d.descartados.length, "descartado", "descartados") + " na triagem</span></div>" +
      '<div class="kpi"><span class="rot">Ganhos</span><span class="val">' + d.ganhos.length + '</span><span class="sub">' + U.moedaCurta(valorGanho) + " homologados</span></div>" +
      '<div class="kpi"><span class="rot">Taxa de sucesso</span><span class="val">' + (taxa === null ? "–" : Math.round(taxa) + "%") + '</span><span class="sub">' + d.ganhos.length + " ganhos × " + d.perdidos.length + " perdidos</span></div>" +
      '<div class="kpi"><span class="rot">Em andamento</span><span class="val">' + d.andamento.length + '</span><span class="sub">' + U.moedaCurta(emDisputa) + " estimados</span></div>" +
      '<div class="kpi"><span class="rot">Desconto médio</span><span class="val">' + (desconto === null ? "–" : pctRes(desconto)) + '</span><span class="sub">ganho × estimado dos itens</span></div></section>' +
      '<div class="grade-2"><section class="card"><div class="card-h"><h2>Processos por mês</h2><span class="muted">pela data do resultado ou da sessão</span></div>' + (d.disputados.length ? grafico : vazio("editais", "Nenhum processo em " + ano + " ainda.")) + "</section>" +
      '<section class="card"><div class="card-h"><h2>Por portal</h2></div>' + (portais.length ? '<div class="barras res-portais">' + portais.map(([p, o]) => '<div class="barra"><span>' + h(p) + '</span><span class="trilho"><span class="enchimento" style="width:' + Math.round(100 * o.n / maxP) + '%"></span></span><span class="n">' + o.n + (o.ganhos ? ' <span class="muted">· ' + o.ganhos + " ganho" + (o.ganhos > 1 ? "s" : "") + "</span>" : "") + "</span></div>").join("") + "</div>" : vazio("portais", "Sem processos.")) + "</section></div>" +
      '<section class="card"><div class="card-h"><h2>Por órgão</h2><span class="muted">os que mais renderam primeiro</span></div>' + (orgaos.length ? '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Órgão</th><th style="text-align:right">Processos</th><th style="text-align:right">Ganhos</th><th style="text-align:right">Valor ganho</th></tr></thead><tbody>' +
        orgaos.map(o => "<tr><td>" + h(U.corta(o.orgao, 90)) + (o.uf ? ' <span class="muted">(' + h(o.uf) + ")</span>" : "") + '</td><td class="num" style="text-align:right">' + o.n + '</td><td class="num" style="text-align:right">' + o.ganhos + '</td><td class="num" style="text-align:right">' + U.moeda(o.valor || null) + "</td></tr>").join("") + "</tbody></table></div>" : vazio("editais", "Sem processos.")) + "</section>" +
      '<section class="card"><div class="card-h"><h2>Todos os processos de ' + ano + '</h2><span class="muted">' + U.plural(lista.length, "processo", "processos") + "</span></div>" +
      (lista.length ? '<div class="tabela-wrap"><table class="tabela res-tabela"><thead><tr><th>Edital</th><th>Órgão e objeto</th><th>Portal</th><th>Resultado</th><th style="text-align:right">Valor</th></tr></thead><tbody>' + lista.map(linha).join("") + "</tbody></table></div>" : vazio("editais", "Nenhum processo em " + ano + ".")) + "</section>" +
      '<section class="card"><div class="card-h"><h2>Ganhos homologados no PNCP</h2><span class="muted">' + U.plural(pncp.length, "processo", "processos") + " · " + U.moedaCurta(pncp.reduce((s, p) => s + (p.valorGanho || 0), 0)) + "</span></div>" +
      (pncp.length ? '<div class="res-ganhos">' + pncp.map(ganhoPncp).join("") + "</div>" : vazio("check", ui.lendoRes ? "Buscando…" : "Nenhum ganho homologado no PNCP em " + ano + " ainda.")) +
      '<p class="nota">Fonte: dados abertos do Compras.gov.br (resultados por CNPJ do fornecedor) e contratos do PNCP com o nome da empresa, que trazem também filiais e compras de portais estaduais e municipais que os dados abertos não mostram. Processos do e-compras.AM e de portais fora do PNCP seguem pelo ranking da disputa. Para incluir outras empresas do grupo, coloque o CNPJ junto do nome em Ajustes → Empresa → Empresas do grupo.</p></section>';
  }
  function exportarResultados() {
    const ano = String(ui.resAno || new Date().getFullYear()), d = dadosAno(ano);
    const cel = v => '"' + String(v === null || v === undefined ? "" : v).replace(/"/g, '""') + '"';
    const num = v => v ? String(Math.round(v * 100) / 100).replace(".", ",") : "";
    const linhas = [["Edital", "Órgão", "UF", "Objeto", "Portal", "Data", "Resultado", "Posição", "Valor estimado", "Valor ganho / proposta", "Desconto %", "Itens ganhos", "Link"]];
    d.disputados.sort((a, b) => dataDoProcesso(a).localeCompare(dataDoProcesso(b))).forEach(e => {
      const g = e.etapa === "ganho", v = g ? valorGanhoDe(e) : Number(e.nossoValor) || 0, es = g ? estimadoGanhoDe(e) : Number(e.valorEstimado) || 0;
      linhas.push([e.numero, e.orgao, e.uf, e.objeto, e.portal, U.fmtData(U.soData(dataDoProcesso(e))), ETAPA(e.etapa).nome, posicaoTexto(e), num(es), num(v), es && v ? num(100 * (1 - v / es)) : "",
        e.resultado ? (e.resultado.itens || []).filter(x => x.vigente).map(x => x.numero).join(", ") : "", e.link]);
    });
    U.baixar("resultados-" + ano + ".csv", "﻿" + linhas.map(l => l.map(cel).join(";")).join("\r\n"), "text/csv;charset=utf-8");
    toast("Planilha gerada", "resultados-" + ano + ".csv (abre no Excel)");
  }
  function ganhoHTML(e) {
    const r = e.resultado, c = e.posGanho || {};
    return '<div class="bloco"><h3>Depois do ganho</h3>' +
      (r ? '<p class="muted" style="font-size:13px">Homologado em ' + U.fmtData(r.data) + " · " + U.moeda(r.valor) + " · itens " + h((r.itens || []).filter(x => x.vigente).map(x => x.numero).join(", ")) + (r.vigente === false ? ' · <b style="color:var(--crit)">resultado substituído no PNCP</b>' : "") + "</p>" : "") +
      '<div class="checklist">' + CHECK_GANHO.map((k, i) => '<label class="' + (c[k] ? "feito" : "") + '"><input type="checkbox" data-mudar="checkGanho" data-id="' + e.id + '" data-item="' + i + '"' + (c[k] ? " checked" : "") + "><span>" + h(k) + "</span></label>").join("") + "</div></div>";
  }

  /* ---------- Pacote de habilitação do edital ---------- */
  // Cruza os documentos exigidos (da análise do edital, ou a lista padrão) com a pasta da empresa
  // que vai participar (matriz ou filial) e mostra o que falta ou vence antes da sessão.
  const HAB_PADRAO = ["contrato_social", "cnd_federal", "fgts", "cndt", "estadual", "municipal", "falencia", "balanco", "conselho", "atestado", "declaracoes"];
  const HAB_FORA_PASTA = ["balanco", "atestado", "declaracoes", "responsavel_tecnico"]; // costumam ser montados para cada edital
  const empresasDocs = () => [...new Set(docsAtivos().map(d => d.empresa).filter(Boolean))].sort();
  // Empresa sugerida: filial da mesma UF/cidade do órgão, senão a matriz da empresa principal
  function empresaSugerida(e) {
    const lista = empresasDocs(), ap = U.semAcento(S.empresa.apelido || S.empresa.nome || "").toLowerCase().split(/\s+/)[0] || "";
    const norm = x => U.semAcento(x).toLowerCase();
    const minhas = lista.filter(x => !ap || norm(x).includes(ap));
    const base = minhas.length ? minhas : lista;
    const cidade = norm(e.municipio || ""), uf = norm(e.uf || "");
    return (cidade && base.find(x => norm(x).includes("filial") && norm(x).includes(cidade))) ||
      (uf && base.find(x => new RegExp("filial\\s+" + uf + "\\b").test(norm(x)))) ||
      base.find(x => /matriz/.test(norm(x))) || base[0] || "";
  }
  function pacoteHabilitacao(e) {
    const empresa = e.empresaHab || empresaSugerida(e);
    const limite = U.soData(e.sessao || limiteDe(e) || "") || U.hojeISO();
    const docs = docsAtivos().filter(d => d.empresa === empresa);
    const exigidos = (e.exigidos && e.exigidos.length ? e.exigidos : HAB_PADRAO).filter(k => k !== "declaracoes" || true);
    const itens = exigidos.map(k => {
      const ref = A.HABILITACAO.find(x => x.chave === k) || { chave: k, nome: k, grupo: "Outros" };
      const cands = docs.filter(d => d.tipo === k).sort((a, b) => (b.validade ? b.validade : "9999").localeCompare(a.validade ? a.validade : "9999"));
      const marcado = (e.habOk || {})[k];
      if (!cands.length) return { ref, st: marcado ? "ok" : HAB_FORA_PASTA.includes(k) ? "manual" : "falta", docs: [] };
      // Vários documentos do mesmo tipo (ex.: estadual: ICMS e dívida ativa): vale o pior
      const pior = cands.reduce((p, d) => (d.validade && (!p.validade || d.validade < p.validade) ? d : p), cands[0]);
      const st = !pior.validade || pior.validade >= limite ? "ok" : pior.validade < U.hojeISO() ? "vencido" : "antes";
      return { ref, st, docs: cands, pior };
    });
    if (/compras\.gov/i.test(e.portal || "")) {
      const sicaf = docs.find(d => /sicaf/i.test(d.nome));
      itens.push({ ref: { chave: "sicaf", nome: "SICAF", grupo: "Cadastro" }, st: !sicaf ? "falta" : !sicaf.validade || sicaf.validade >= limite ? "ok" : sicaf.validade < U.hojeISO() ? "vencido" : "antes", docs: sicaf ? [sicaf] : [], pior: sicaf });
    }
    const problemas = itens.filter(x => ["falta", "vencido", "antes"].includes(x.st));
    return { empresa, limite, itens, problemas, padrao: !(e.exigidos && e.exigidos.length) };
  }
  const HAB_ST = { ok: ["ok", "Em dia"], antes: ["warn", "Vence antes da sessão"], vencido: ["crit", "Vencido"], falta: ["crit", "Não está na pasta"], manual: ["info", "Montar para o edital"] };
  function habilitacaoHTML(e) {
    const p = pacoteHabilitacao(e), lista = empresasDocs();
    return '<div class="bloco"><h3>Habilitação</h3>' +
      '<div class="ferramentas"><select data-mudar="empresaHab" data-id="' + e.id + '" aria-label="Empresa que participa">' + (lista.length ? lista.map(x => '<option' + (x === p.empresa ? " selected" : "") + ">" + h(x) + "</option>").join("") : "<option>Nenhuma empresa na pasta de documentos</option>") + "</select>" +
      '<span class="muted" style="font-size:13px">' + (p.problemas.length ? '<b style="color:var(--crit)">' + U.plural(p.problemas.length, "pendência", "pendências") + "</b>" : "tudo em dia") + " para " + U.fmtData(p.limite) + "</span></div>" +
      (p.padrao ? '<p class="nota">Lista padrão. Analise o edital (Análise de edital → Criar edital) para usar os documentos exigidos nele.</p>' : "") +
      '<ul class="hab-lista">' + p.itens.map(x => {
        const [cls, rot] = HAB_ST[x.st];
        const det = x.pior ? (x.docs.length > 1 ? x.docs.map(d => d.nome + " (" + (d.validade ? U.fmtData(d.validade) : "IND") + ")").join(" · ") : x.pior.nome + " · " + (x.pior.validade ? "vence " + U.fmtData(x.pior.validade) : "validade indeterminada")) : "";
        return '<li><span class="pill ' + cls + '">' + rot + "</span><div><b>" + h(x.ref.nome) + "</b>" + (det ? '<small class="muted">' + h(det) + "</small>" : "") + "</div>" +
          (x.st === "manual" || x.st === "falta" && HAB_FORA_PASTA.includes(x.ref.chave) || (e.habOk || {})[x.ref.chave] ? '<label class="hab-ok"><input type="checkbox" data-mudar="habOk" data-id="' + e.id + '" data-chave="' + x.ref.chave + '"' + ((e.habOk || {})[x.ref.chave] ? " checked" : "") + "> pronto</label>" : "") + "</li>";
      }).join("") + "</ul>" +
      '<div class="linha-acoes"><button class="btn peq ghost" data-acao="copiarHab" data-id="' + e.id + '">' + ic("copiar") + 'Copiar lista</button><a class="btn peq ghost" href="#documentos">' + ic("documentos") + "Abrir documentos</a></div></div>";
  }
  function textoHab(e) {
    const p = pacoteHabilitacao(e);
    return ["Habilitação · " + e.numero + " · " + e.orgao, "Empresa: " + p.empresa + " · documentos válidos até " + U.fmtData(p.limite), ""]
      .concat(p.itens.map(x => (x.st === "ok" ? "[ok] " : "[  ] ") + x.ref.nome + " — " + HAB_ST[x.st][1] + (x.pior && x.pior.validade ? " (vence " + U.fmtData(x.pior.validade) + ")" : ""))).join("\n");
  }

  /* ---------- Concorrência ---------- */
  // Quem disputa e ganha os pregões em que participamos: resultados do PNCP (Compras.gov.br) e
  // ranking da disputa do e-compras.AM. Mostra os concorrentes mais frequentes e onde perdemos.
  const ETAPAS_COM_RESULTADO = ["habilitacao", "recurso", "ganho", "perdido"];
  const refCompra = e => e.pncpId || ((String(e.link || "").match(/compra=\d{17}|pncp\.gov\.br\/app\/editais\/\d{14}\/\d{4}\/\d+/) || [])[0] ? e.link : "");
  const nomeConc = s => U.semAcento(String(s || "")).toUpperCase().replace(/[.,]/g, " ").replace(/\b(LTDA|EIRELI|ME|EPP|S\s?A|SS|SOCIEDADE SIMPLES|LIMITADA)\b/g, " ").replace(/\s+/g, " ").trim();
  const ehDoGrupo = (nome, cnpj) => ehNossa(nome) || (cnpj && cnpjsGrupo().some(c => c.slice(0, 8) === String(cnpj).replace(/\D/g, "").slice(0, 8)));
  async function verificarConcorrencia(forcar) {
    if (ui.lendoConc) return;
    const prazo = e => (ETAPA(e.etapa).final ? 7 : 1) * 86400000;
    const lista = S.editais.filter(e => ETAPAS_COM_RESULTADO.includes(e.etapa) && refCompra(e) && (forcar || !e.concorrencia || Date.now() - new Date(e.concorrencia.lidoEm).getTime() > prazo(e)));
    if (!lista.length) { if (forcar) toast("Nada para atualizar", "Os pregões do Compras.gov.br/PNCP já estão lidos."); return; }
    ui.lendoConc = true; if (rotaAtual() === "concorrencia") renderSeLivre();
    let erros = 0;
    try {
      for (const e of lista) {
        try {
          const d = await api("/api/concorrentes?ref=" + encodeURIComponent(refCompra(e)) + "&sessao=" + encodeURIComponent(e.sessao || ""), 65000);
          e.concorrencia = { lidoEm: d.lidoEm, linkPncp: d.linkPncp, itens: d.itens };
          if (!e.pncpId && d.pncp) e.pncpId = d.pncp.cnpj + "-1-" + String(d.pncp.seq).padStart(6, "0") + "/" + d.pncp.ano;
        } catch (er) { erros++; e.concorrencia = Object.assign({}, e.concorrencia || {}, { lidoEm: new Date().toISOString(), erro: er.message }); }
        salvar(); if (rotaAtual() === "concorrencia") renderSeLivre();
      }
    } finally { ui.lendoConc = false; if (rotaAtual() === "concorrencia") renderSeLivre(); }
    if (forcar) toast("Concorrência atualizada", U.plural(lista.length, "pregão lido", "pregões lidos") + (erros ? " · " + erros + " com erro" : ""));
  }
  // Uma linha por disputa (item do PNCP ou lote do e-compras) com os participantes conhecidos
  function disputasConhecidas() {
    const out = [];
    S.editais.forEach(e => {
      ((e.concorrencia && e.concorrencia.itens) || []).forEach(it => {
        if (!it.vencedor) return;
        out.push({ e, fonte: "PNCP", nome: "Item " + it.numero + " · " + U.corta(it.descricao, 60), estimado: it.valorEstimado,
          participantes: [{ nome: it.vencedor.nome, cnpj: it.vencedor.cnpj, valor: it.vencedor.valor, vencedor: true }].concat((it.anteriores || []).map(a => ({ nome: a.nome, cnpj: a.cnpj, valor: a.valor, desclassificado: !!a.cancelado }))) });
      });
      const c = chatDoEdital(e.id);
      posicaoDisputa(c).forEach(l => {
        if (!l.ps.length) return;
        out.push({ e, fonte: "e-compras.AM", nome: l.lote, estimado: null,
          participantes: l.ps.map(p => ({ nome: p.nome, valor: p.negociado || p.valor, vencedor: !!p.vencedor, desclassificado: p.exame2 === false || p.habilitado === false })) });
      });
    });
    return out;
  }
  function mapaConcorrentes() {
    const mapa = new Map();
    disputasConhecidas().forEach(dp => {
      const nos = dp.participantes.find(p => ehDoGrupo(p.nome, p.cnpj)), vistos = new Set();
      dp.participantes.slice().sort((x, y) => (y.vencedor ? 1 : 0) - (x.vencedor ? 1 : 0)).forEach(p => {
        if (ehDoGrupo(p.nome, p.cnpj)) return;
        const k = nomeConc(p.nome); if (!k || vistos.has(k)) return; // a mesma empresa conta uma vez por disputa
        vistos.add(k);
        const c = mapa.get(k) || { nome: p.nome, cnpj: p.cnpj || "", processos: new Set(), orgaos: new Set(), disputas: 0, vitorias: 0, valor: 0, descontos: [], contraNos: 0, ganhouDeNos: 0, desclass: 0 };
        if (!c.cnpj && p.cnpj) c.cnpj = p.cnpj;
        c.processos.add(dp.e.id); c.orgaos.add(empresaCurta(dp.e.orgao)); c.disputas++;
        if (p.desclassificado) c.desclass++;
        if (p.vencedor) { c.vitorias++; c.valor += Number(p.valor) || 0; if (dp.estimado && p.valor) c.descontos.push(1 - p.valor / dp.estimado); }
        if (nos) { c.contraNos++; if (p.vencedor) c.ganhouDeNos++; }
        mapa.set(k, c);
      });
    });
    return [...mapa.values()].map(c => Object.assign(c, { nProc: c.processos.size, desconto: c.descontos.length ? c.descontos.reduce((a, b) => a + b, 0) / c.descontos.length : null }))
      .sort((a, b) => b.vitorias - a.vitorias || b.nProc - a.nProc || b.valor - a.valor);
  }
  // Onde perdemos: vencedor e distância para o nosso preço
  function ondePerdemos() {
    const out = [];
    disputasConhecidas().forEach(dp => {
      const venc = dp.participantes.find(p => p.vencedor);
      if (!venc || ehDoGrupo(venc.nome, venc.cnpj)) return;
      const nos = dp.participantes.find(p => ehDoGrupo(p.nome, p.cnpj));
      // PNCP só mostra o vencedor: nosso valor vem do edital quando a compra tem um item só
      const nossoValor = nos ? nos.valor : dp.fonte === "PNCP" && dp.e.etapa === "perdido" ? ((dp.e.concorrencia.itens || []).length === 1 && Number(dp.e.nossoValor)) || null : undefined;
      if (nossoValor === undefined) return; // não participamos dessa disputa
      out.push({ e: dp.e, disputa: dp.nome, fonte: dp.fonte, vencedor: venc, nosso: nossoValor, estimado: dp.estimado,
        dif: nossoValor && venc.valor ? 100 * (nossoValor / venc.valor - 1) : null });
    });
    return out.sort((a, b) => String(b.e.sessao || "").localeCompare(String(a.e.sessao || "")));
  }
  function pgConcorrencia() {
    const conc = mapaConcorrentes(), perdas = ondePerdemos(), disputas = disputasConhecidas();
    const pend = S.editais.filter(e => ETAPAS_COM_RESULTADO.includes(e.etapa) && refCompra(e) && !e.concorrencia).length;
    const top = conc.filter(c => c.ganhouDeNos).sort((a, b) => b.ganhouDeNos - a.ganhouDeNos)[0];
    const difs = perdas.filter(p => p.dif !== null).map(p => p.dif);
    return '<div class="cab"><div><span class="eyebrow">Análise e jurídico</span><h1>Concorrência</h1><p>Quem disputa com a ' + h(apelido()) + ', quem ganha e por quanto. Junta o ranking da disputa do e-compras.AM e os resultados publicados no PNCP (Compras.gov.br).</p></div>' +
      '<div class="cab-acoes"><button class="btn primario" data-acao="atualizarConcorrencia"' + (ui.lendoConc ? " disabled" : "") + ">" + ic("atualizar") + (ui.lendoConc ? "Lendo resultados…" : "Atualizar resultados") + "</button></div></div>" +
      (pend ? '<p class="muted res-status">' + U.plural(pend, "pregão ainda não lido", "pregões ainda não lidos") + " no PNCP." + (ui.lendoConc ? " Lendo agora…" : "") + "</p>" : "") +
      '<section class="kpis" aria-label="Indicadores"><div class="kpi destaque"><span class="rot">Concorrentes mapeados</span><span class="val">' + conc.length + '</span><span class="sub">em ' + U.plural(new Set(disputas.map(d => d.e.id)).size, "pregão", "pregões") + "</span></div>" +
      '<div class="kpi"><span class="rot">Disputas perdidas</span><span class="val">' + perdas.length + '</span><span class="sub">itens ou lotes com vencedor de fora</span></div>' +
      '<div class="kpi"><span class="rot">Distância média</span><span class="val">' + (difs.length ? pctRes(difs.reduce((a, b) => a + b, 0) / difs.length) : "–") + '</span><span class="sub">nosso preço acima do vencedor</span></div>' +
      '<div class="kpi"><span class="rot">Quem mais ganhou de nós</span><span class="val" style="font-size:18px;line-height:1.3">' + (top ? h(U.corta(top.nome, 34)) : "–") + '</span><span class="sub">' + (top ? U.plural(top.ganhouDeNos, "vez", "vezes") : "sem dados ainda") + "</span></div></section>" +
      '<section class="card"><div class="card-h"><h2>Concorrentes</h2><span class="muted">mais vitórias primeiro</span></div>' +
      (conc.length ? '<div class="tabela-wrap"><table class="tabela res-tabela"><thead><tr><th>Empresa</th><th style="text-align:right">Pregões</th><th style="text-align:right">Contra nós</th><th style="text-align:right">Vitórias</th><th style="text-align:right">Valor ganho</th><th style="text-align:right">Desconto médio</th></tr></thead><tbody>' +
        conc.slice(0, 40).map(c => "<tr><td><b>" + h(c.nome) + "</b>" + '<span class="sub">' + h([c.cnpj ? c.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : "", [...c.orgaos].slice(0, 2).map(o => U.corta(o, 40)).join(" · ")].filter(Boolean).join(" · ")) + (c.desclass ? " · " + U.plural(c.desclass, "desclassificação", "desclassificações") : "") + "</span></td>" +
          '<td class="num" style="text-align:right">' + c.nProc + '</td><td class="num" style="text-align:right">' + c.contraNos + (c.ganhouDeNos ? '<span class="sub">ganhou ' + c.ganhouDeNos + "</span>" : "") + '</td><td class="num" style="text-align:right">' + c.vitorias + '</td><td class="num" style="text-align:right">' + U.moeda(c.valor || null) + '</td><td class="num" style="text-align:right">' + (c.desconto === null ? "—" : pctRes(100 * c.desconto)) + "</td></tr>").join("") + "</tbody></table></div>"
        : vazio("analise", "Ainda sem dados de concorrência. Os pregões do e-compras.AM com chat e os do Compras.gov.br/PNCP com resultado aparecem aqui.")) + "</section>" +
      '<section class="card"><div class="card-h"><h2>Onde perdemos</h2><span class="muted">vencedor e distância para o nosso preço</span></div>' +
      (perdas.length ? '<div class="tabela-wrap"><table class="tabela res-tabela"><thead><tr><th>Pregão</th><th>Disputa</th><th>Vencedor</th><th style="text-align:right">Valor vencedor</th><th style="text-align:right">Nosso valor</th></tr></thead><tbody>' +
        perdas.slice(0, 60).map(p => '<tr class="clicavel" data-acao="abrirEdital" data-id="' + p.e.id + '"><td class="forte">' + h(p.e.numero) + '<span class="sub">' + h(U.corta(empresaCurta(p.e.orgao), 40)) + " · " + p.fonte + "</span></td><td>" + h(p.disputa) + "</td><td>" + h(U.corta(p.vencedor.nome, 50)) + '</td><td class="num" style="text-align:right">' + U.moeda(p.vencedor.valor) + (p.estimado ? '<span class="sub">' + pctRes(100 * (1 - p.vencedor.valor / p.estimado)) + " abaixo do estimado</span>" : "") +
          '</td><td class="num" style="text-align:right">' + U.moeda(p.nosso) + (p.dif !== null ? '<span class="sub">' + (p.dif >= 0 ? pctRes(p.dif) + " acima" : pctRes(-p.dif) + " abaixo") + "</span>" : "") + "</td></tr>").join("") + "</tbody></table></div>"
        : vazio("check", "Nenhuma disputa perdida com dados.")) +
      '<p class="nota">Fontes: ranking do e-compras.AM (chats monitorados) e resultados dos itens no PNCP. No PNCP aparecem só o vencedor e os que foram desclassificados antes dele; o valor da nossa proposta vem do campo "Nossa proposta" do edital quando a disputa é do Compras.gov.br.</p></section>';
  }

  /* ---------- Garimpo ---------- */
  // Editais com proposta aberta achados todo dia pelo robô no PNCP (tabela portal_garimpo no Supabase).
  async function carregarGarimpo(forcar) {
    const aoVivo = ((ui.garimpo || {}).itens || []).filter(x => x.aoVivo); // o que a busca agora achou não some ao recarregar
    if (!nuvem.cliente || !nuvem.usuario) { if (!(ui.garimpo || {}).erro) ui.garimpo = { erro: "Entre no portal (login) para ver a lista do robô.", itens: aoVivo }; return; }
    if (ui.garimpo && ui.garimpo.carregando) return;
    if (!forcar && ui.garimpo && ui.garimpo.lidoEm && Date.now() - ui.garimpo.lidoEm < 10 * 60000) return;
    ui.garimpo = Object.assign({}, ui.garimpo, { carregando: true });
    try {
      const { data, error } = await nuvem.cliente.from("portal_garimpo").select("id,dados,nota,achado_em").order("nota", { ascending: false }).limit(1500);
      if (error) throw error;
      const ids = new Set((data || []).map(x => x.id));
      ui.garimpo = { itens: (data || []).concat(aoVivo.filter(x => !ids.has(x.id))), lidoEm: Date.now() };
    } catch (e) { ui.garimpo = { erro: "Não consegui ler o garimpo agora (" + (e.message || e) + ").", itens: aoVivo }; }
    if (rotaAtual() === "garimpo") renderSeLivre();
  }
  const perfilGarimpo = () => (S.ajustes.garimpo = S.ajustes.garimpo || {});
  function garimpoVisiveis() {
    const g = ui.garimpo || {}, f = ui.fGar || (ui.fGar = { uf: "", busca: "", min: 4 });
    const ja = new Set(S.editais.map(e => e.pncpId).concat(S.editais.map(e => e.link)).filter(Boolean));
    const b = U.semAcento(f.busca).toLowerCase();
    return (g.itens || []).filter(x => {
      const d = x.dados || {};
      if (ja.has(x.id) || ja.has(d.link) || ja.has(d.linkPncp) || (S.apagados || []).includes("gar:" + x.id)) return false;
      if (d.encerramento && d.encerramento.slice(0, 10) < U.hojeISO()) return false;
      return (!f.uf || d.uf === f.uf) && x.nota >= f.min && (!b || U.semAcento([d.numero, d.orgao, d.objeto, d.municipio].join(" ")).toLowerCase().includes(b));
    }).sort((a, b2) => b2.nota - a.nota || String(a.dados.encerramento).localeCompare(String(b2.dados.encerramento)));
  }
  function pgGarimpo() {
    carregarGarimpo();
    const g = ui.garimpo || {}, f = ui.fGar || (ui.fGar = { uf: "", busca: "", min: 4 }), pf = perfilGarimpo();
    const lista = garimpoVisiveis(), ufs = [...new Set((g.itens || []).map(x => x.dados.uf).filter(Boolean))].sort();
    const novos = lista.filter(x => Date.now() - new Date(x.achado_em).getTime() < 86400000 * 1.2).length;
    const card = x => {
      const d = x.dados, dias = d.encerramento ? U.diasAte(d.encerramento.slice(0, 10)) : null;
      return '<article class="card gar"><div class="susp-h"><div><b>' + h(d.numero) + "</b> " + (x.aoVivo ? '<span class="pill info sem-ponto">Busca agora</span>' : Date.now() - new Date(x.achado_em).getTime() < 86400000 * 1.2 ? '<span class="pill pop sem-ponto">Novo</span>' : "") +
        '<span class="org">' + h(d.orgao || "") + (d.municipio ? " · " + h(d.municipio) + "/" + h(d.uf || "") : "") + "</span></div>" +
        '<div class="chips"><span class="pill ' + (x.nota >= 8 ? "ok" : x.nota >= 6 ? "info" : "neutral") + ' sem-ponto">Aderência ' + x.nota + "</span><span class=\"pill neutral sem-ponto\">" + h(d.modalidade || "") + "</span></div></div>" +
        '<p class="susp-obj">' + h(U.corta(d.objeto, 300)) + "</p>" +
        '<dl class="datas susp-datas"><div><dt>Propostas até</dt><dd>' + (d.encerramento ? U.fmtDataHora(d.encerramento) + (dias !== null ? ' <span class="muted">(' + (dias <= 0 ? "hoje" : "em " + U.plural(dias, "dia", "dias")) + ")</span>" : "") : "—") + "</dd></div>" +
        "<div><dt>Valor estimado</dt><dd>" + U.moeda(d.valorEstimado || null) + "</dd></div><div><dt>Termos</dt><dd>" + h((d.termos || []).join(", ") || "—") + "</dd></div></dl>" +
        '<div class="linha-acoes susp-rodape"><button class="btn peq primario" data-acao="garimpoTriagem" data-id="' + h(x.id) + '">' + ic("mais") + 'Levar para a triagem</button>' +
        '<a class="btn peq ghost" href="' + h(d.linkPncp) + '" target="_blank" rel="noopener">' + ic("link") + "PNCP</a>" + (d.link ? '<a class="btn peq ghost" href="' + h(d.link) + '" target="_blank" rel="noopener">' + ic("link") + "Portal de origem</a>" : "") +
        '<button class="btn peq ghost" data-acao="garimpoDescartar" data-id="' + h(x.id) + '">' + ic("lixo") + "Descartar</button></div></article>";
    };
    return '<div class="cab"><div><span class="eyebrow">Operação</span><h1>Garimpo de editais</h1><p>Todo dia de madrugada o robô lê no PNCP as licitações com proposta aberta nas UFs do perfil e separa as que têm a ver com a equipe, com uma nota de aderência.</p></div>' +
      '<div class="cab-acoes"><button class="btn ghost" data-acao="recarregarGarimpo">' + ic("atualizar") + "Recarregar</button></div></div>" +
      buscaAgoraHTML(pf) +
      '<section class="card"><div class="card-h"><h2>Perfil da busca</h2><span class="muted">o robô usa na próxima rodada</span></div><div class="grade-form">' +
      '<div class="campo"><label for="gar-termos">Termos que interessam</label><input id="gar-termos" data-mudar="garimpoPerfil" data-campo="termos" value="' + h(pf.termos || "") + '" placeholder="serviços médicos, plantão, UTI, hemodiálise"><small>Vazio: serviços médicos, plantões, UTI, hemodiálise, anestesia, pediatria e afins.</small></div>' +
      '<div class="campo"><label for="gar-excluir">Termos que tiram o edital</label><input id="gar-excluir" data-mudar="garimpoPerfil" data-campo="excluir" value="' + h(pf.excluir || "") + '" placeholder="aquisição, medicamentos, manutenção"><small>Vazio: compras de material, medicamentos, obras, manutenção…</small></div></div>' + ufsGarimpoHTML(pf) + "</section>" +
      '<div class="ferramentas"><label class="campo-busca"><span class="sr">Buscar</span>' + ic("busca") + '<input type="search" data-digitar="garBusca" value="' + h(f.busca) + '" placeholder="Órgão, objeto, cidade…"></label>' +
      '<select data-mudar="garUf" aria-label="UF"><option value="">Todas as UFs</option>' + UFS_BR.map(([u]) => "<option" + (f.uf === u ? " selected" : "") + (ufs.includes(u) ? "" : ' class="sem-edital"') + ">" + u + "</option>").join("") + "</select>" +
      '<select data-mudar="garMin" aria-label="Aderência mínima">' + [[4, "Aderência 4+"], [6, "Aderência 6+"], [8, "Aderência 8+"]].map(([v, r]) => '<option value="' + v + '"' + (+f.min === v ? " selected" : "") + ">" + r + "</option>").join("") + "</select>" +
      '<span class="muted" style="font-size:13px">' + U.plural(lista.length, "edital", "editais") + (novos ? " · " + U.plural(novos, "novo", "novos") + " hoje" : "") + "</span></div>" +
      (g.erro && !(g.itens || []).length ? '<div class="card">' + vazio("aviso", h(g.erro)) + "</div>" : !g.itens ? '<div class="card">' + vazio("relogio", "Carregando…") + "</div>" :
        lista.length ? '<div class="susp-lista" id="gar-lista">' + lista.slice(0, 80).map(card).join("") + "</div>" + (lista.length > 80 ? '<p class="nota">Mostrando os 80 mais aderentes. Use a busca ou os filtros para ver os outros.</p>' : "")
          : '<div class="card">' + vazio("check", (g.itens.length ? "Nenhum edital com esses filtros." : "O robô ainda não rodou ou não achou nada com o perfil. Ele roda todo dia de madrugada (começa às 3h23 e leva 1 a 2 horas para ler o Brasil inteiro).")) + "</div>");
  }
  // Estados do perfil do garimpo: sem escolha = Brasil inteiro
  const UFS_BR = [["AC", "Norte"], ["AP", "Norte"], ["AM", "Norte"], ["PA", "Norte"], ["RO", "Norte"], ["RR", "Norte"], ["TO", "Norte"],
    ["AL", "Nordeste"], ["BA", "Nordeste"], ["CE", "Nordeste"], ["MA", "Nordeste"], ["PB", "Nordeste"], ["PE", "Nordeste"], ["PI", "Nordeste"], ["RN", "Nordeste"], ["SE", "Nordeste"],
    ["DF", "Centro-Oeste"], ["GO", "Centro-Oeste"], ["MT", "Centro-Oeste"], ["MS", "Centro-Oeste"],
    ["ES", "Sudeste"], ["MG", "Sudeste"], ["RJ", "Sudeste"], ["SP", "Sudeste"], ["PR", "Sul"], ["RS", "Sul"], ["SC", "Sul"]];
  const ufsEscolhidas = pf => { const l = String(pf.ufs || "").toUpperCase().split(/[^A-Z]+/).filter(u => UFS_BR.some(x => x[0] === u)); return l.length ? l : UFS_BR.map(x => x[0]); };
  function ufsGarimpoHTML(pf) {
    const sel = new Set(ufsEscolhidas(pf)), todas = sel.size === UFS_BR.length;
    const regioes = [...new Set(UFS_BR.map(x => x[1]))];
    return '<div class="gar-ufs"><div class="gar-ufs-h"><b>Estados</b><span class="muted">' + (todas ? "Brasil inteiro (27 estados)" : U.plural(sel.size, "estado marcado", "estados marcados")) + '</span><span style="flex:1"></span>' +
      '<button class="link-btn" data-acao="garUfsTodas">Marcar todos</button><button class="link-btn" data-acao="garUfsLimpar">Desmarcar todos</button></div>' +
      regioes.map(r => '<div class="gar-regiao"><span class="gar-regiao-nome">' + r + "</span>" + UFS_BR.filter(x => x[1] === r).map(([u]) =>
        '<label class="gar-uf"><input type="checkbox" id="gar-uf-' + u + '" data-mudar="garUf1" data-uf="' + u + '"' + (sel.has(u) ? " checked" : "") + "><span>" + u + "</span></label>").join("") + "</div>").join("") + "</div>";
  }
  // Procurar agora, num estado: o portal lê o PNCP página por página (50 licitações cada) e mostra as boas
  const MODS_GAR = [[6, "Pregão"], [4, "Concorrência"], [8, "Dispensa"]];
  function buscaAgoraHTML(pf) {
    const b = ui.buscaGar || {}, f = ui.fBuscaGar || (ui.fBuscaGar = { uf: ufsEscolhidas(pf).length === UFS_BR.length ? "RJ" : ufsEscolhidas(pf)[0], mods: [6, 8] });
    const pct = b.total ? Math.round(100 * b.feitas / b.total) : 0;
    return '<section class="card busca-gar"><div class="card-h"><h2>Procurar editais agora</h2><span class="muted">sem esperar o robô da madrugada</span></div>' +
      '<div class="busca-gar-linha"><div class="campo"><label for="busca-gar-uf">Estado</label><select id="busca-gar-uf" data-mudar="buscaGarUf"' + (b.rodando ? " disabled" : "") + ">" +
      [...new Set(UFS_BR.map(x => x[1]))].map(r => '<optgroup label="' + r + '">' + UFS_BR.filter(x => x[1] === r).map(([u]) => '<option value="' + u + '"' + (f.uf === u ? " selected" : "") + ">" + u + " · " + NOME_UF[u] + "</option>").join("") + "</optgroup>").join("") + "</select></div>" +
      '<div class="campo"><span class="rotulo-campo">Modalidades</span><div class="busca-gar-mods">' + MODS_GAR.map(([m, r]) => '<label class="gar-uf"><input type="checkbox" id="busca-gar-mod-' + m + '" data-mudar="buscaGarMod" data-mod="' + m + '"' + (f.mods.includes(m) ? " checked" : "") + (b.rodando ? " disabled" : "") + "><span>" + r + "</span></label>").join("") + "</div></div>" +
      '<div class="busca-gar-acao">' + (b.rodando ? '<button class="btn ghost" data-acao="pararBuscaGar">Parar</button>' : '<button class="btn primario" data-acao="procurarGarimpo">' + ic("busca") + "Procurar editais</button>") + "</div></div>" +
      (b.rodando || b.fim ? '<div class="busca-gar-status"><div class="progresso"><i style="width:' + (b.rodando ? pct : 100) + '%"></i></div><span class="muted">' +
        (b.rodando ? "Lendo " + b.uf + (b.atual ? " · " + b.atual : "") + ": " + b.feitas + " de " + (b.total || "?") + " páginas · " + U.plural(b.lidas, "licitação lida", "licitações lidas") + " · " + U.plural(b.achados, "com o perfil", "com o perfil")
          : (b.erro ? '<span style="color:var(--crit)">' + h(b.erro) + "</span> · " : "") + b.uf + ": " + U.plural(b.lidas, "licitação aberta lida", "licitações abertas lidas") + ", " + U.plural(b.achados, "com o perfil", "com o perfil") + (b.achados ? ". Estão na lista abaixo." : ". Nenhuma com o perfil agora.")) + "</span></div>" : "") +
      '<p class="nota">Cada página do PNCP traz 50 licitações e leva uns 10 segundos. Estados grandes (SP, MG, RJ) levam alguns minutos.</p></section>';
  }
  const NOME_UF = { AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
    MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
    RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins" };
  async function procurarGarimpo() {
    const f = ui.fBuscaGar, pf = perfilGarimpo();
    if (!f.mods.length) { toast("Marque pelo menos uma modalidade"); return; }
    const b = ui.buscaGar = { uf: f.uf, rodando: true, feitas: 0, total: 0, lidas: 0, achados: 0, atual: "", fim: false, erro: "" };
    if (!ui.garimpo || !ui.garimpo.itens) ui.garimpo = { itens: [], lidoEm: Date.now() };
    const extra = (pf.termos ? "&termos=" + encodeURIComponent(pf.termos) : "") + (pf.excluir ? "&excluir=" + encodeURIComponent(pf.excluir) : "");
    const juntar = d => {
      b.feitas++; b.lidas += d.lidas || 0;
      if (!ui.garimpo || !ui.garimpo.itens) ui.garimpo = Object.assign({}, ui.garimpo, { itens: [] });
      (d.itens || []).forEach(x => { const i = ui.garimpo.itens.findIndex(y => y.id === x.id); if (i < 0) { ui.garimpo.itens.push(Object.assign(x, { aoVivo: true })); b.achados++; } });
      if (rotaAtual() === "garimpo") renderSeLivre();
    };
    const pagina = (m, p) => api("/api/garimpo?uf=" + b.uf + "&mod=" + m + "&pagina=" + p + extra, 60000);
    try {
      for (const m of f.mods) {
        if (b.cancelar) break;
        b.atual = (MODS_GAR.find(x => x[0] === m) || [0, ""])[1].toLowerCase();
        const d1 = await pagina(m, 1);
        b.total += Math.max(1, d1.totalPaginas || 1); juntar(d1);
        const fila = Array.from({ length: Math.max(0, (d1.totalPaginas || 1) - 1) }, (_, k) => k + 2);
        await Promise.all([0, 1].map(async () => { // duas páginas por vez, para o PNCP não bloquear
          while (fila.length && !b.cancelar) { const p = fila.shift(); try { juntar(await pagina(m, p)); } catch (e) { b.feitas++; b.erro = "Algumas páginas não vieram do PNCP"; } }
        }));
      }
    } catch (e) { b.erro = e.message; }
    b.rodando = false; b.fim = true;
    if (b.achados) { ui.fGar.uf = b.uf; ui.fGar.min = 4; }
    if (rotaAtual() === "garimpo") renderSeLivre();
    toast(b.cancelar ? "Busca parada" : "Busca em " + b.uf + " concluída", U.plural(b.achados, "edital com o perfil", "editais com o perfil") + " em " + U.plural(b.lidas, "licitação aberta", "licitações abertas") + ".");
  }
  function garimpoParaTriagem(id) {
    const x = ((ui.garimpo || {}).itens || []).find(i => i.id === id); if (!x) return;
    const d = x.dados;
    const novo = { id: U.uid(), pncpId: x.id, numero: d.numero, modalidade: d.modalidade, orgao: d.orgao, municipio: d.municipio, uf: d.uf, objeto: d.objeto,
      sessao: d.encerramento || d.abertura || "", valorEstimado: d.valorEstimado || null, portal: /cnetmobile|comprasnet|compras\.gov/i.test(d.link) ? "Compras.gov.br" : /portaldecompraspublicas/i.test(d.link) ? "Portal de Compras Públicas" : /bll/i.test(d.link) ? "BLL" : /licitanet/i.test(d.link) ? "Licitanet" : "PNCP",
      etapa: "triagem", propostaStatus: "nao_iniciada", prioridade: x.nota >= 8 ? "alta" : "media", responsavel: "", link: d.link || d.linkPncp, uasg: d.uasg, checklist: {}, notas: "", criadoEm: U.hojeISO(),
      historico: [{ data: U.hojeISO(), texto: "Veio do garimpo (aderência " + x.nota + ")." }] };
    S.editais.push(novo); registrar("Edital do garimpo levado para a triagem: " + novo.numero + ".", "editais");
    atualizar(); toast("Edital na triagem", novo.numero, "", { rotulo: "Ver edital", rota: "editais", ref: novo.id });
  }

  /* ---------- Contratos ---------- */
  // Contratos da empresa no PNCP (matriz e filiais) + o que a equipe controla: data-base do
  // reajuste, garantia contratual, gestor. Avisa prorrogação, reajuste e garantia vencendo.
  const INTERVALO_CTR = 12 * 3600000;
  const ctrCache = () => (S.contratosPncp = S.contratosPncp || {});
  const ctrInfo = id => ((S.contratosInfo = S.contratosInfo || {})[id] = S.contratosInfo[id] || {});
  const contratosVigentes = () => (ctrCache().lista || []).filter(c => c.vigente);
  async function buscarContratos(forcar) {
    const cnpjs = cnpjsGrupo(), nomes = nomesGrupo(), c = ctrCache();
    if (!cnpjs.length || !nomes.length) { if (forcar) toast("Falta o CNPJ ou o nome da empresa", "Preencha em Ajustes → Empresa.", "crit"); return; }
    if (ui.lendoCtr || (!forcar && c.tentadoEm && Date.now() - new Date(c.tentadoEm).getTime() < (c.erro ? 30 * 60000 : INTERVALO_CTR))) return;
    ui.lendoCtr = true; if (rotaAtual() === "contratos") renderSeLivre();
    try {
      const d = await api("/api/contratos?cnpj=" + cnpjs.join(",") + "&nome=" + encodeURIComponent(nomes.join(",")), 65000);
      const antes = new Set((c.lista || []).map(x => x.id));
      S.contratosPncp = { consultadoEm: d.consultadoEm, tentadoEm: U.agoraISO(), lista: d.contratos, erro: "" };
      const novos = c.lista ? d.contratos.filter(x => !antes.has(x.id)) : [];
      // liga o contrato ao edital ganho da mesma compra
      d.contratos.forEach(ct => { const e = ct.compra && S.editais.find(x => x.pncpId === ct.compra); if (e && !e.contratoId) e.contratoId = ct.id; });
      if (novos.length) notificar(U.plural(novos.length, "contrato novo", "contratos novos") + " no PNCP", novos.map(x => x.numero + " · " + U.corta(x.orgao, 40)).join("; "), "pop", { rotulo: "Ver contratos", rota: "contratos" });
      else if (forcar) toast("Contratos conferidos", U.plural(d.contratos.filter(x => x.vigente).length, "contrato vigente", "contratos vigentes"));
    } catch (e) {
      S.contratosPncp = Object.assign({}, c, { erro: e.message, tentadoEm: U.agoraISO() });
      if (forcar) toast("Não consegui ler os contratos", e.message, "crit");
    } finally { ui.lendoCtr = false; salvar(); if (rotaAtual() === "contratos") renderSeLivre(); else atualizarNav(); }
  }
  // Próximos marcos de um contrato: fim da vigência (prorrogação), aniversário do reajuste, garantia
  function marcosContrato(c) {
    const inf = ctrInfo(c.id), out = [];
    const up = c.ultimaProrrogacao;
    if (c.fim) {
      const n = U.diasAte(c.fim), curta = up && up.meses && up.meses < 12;
      out.push({ tipo: "prorrogacao", data: c.fim, dias: n, rot: n < 0 ? "Vigência encerrada" : "Fim da vigência",
        acao: curta ? "Prorrogação curta (" + up.meses + " meses): acompanhar a nova licitação do órgão" : "Negociar a prorrogação (aditivo) com o órgão" });
    }
    // Reajuste anual: conta do último reajuste feito em aditivo; sem ele, da data-base informada ou da assinatura
    const base = inf.dataBase || c.ultimoReajuste || c.assinatura || c.inicio;
    if (base) {
      let ani = base;
      while (ani <= U.hojeISO()) ani = (+ani.slice(0, 4) + 1) + ani.slice(4);
      if (!c.fim || ani <= c.fim) out.push({ tipo: "reajuste", data: ani, dias: U.diasAte(ani), rot: "Aniversário do reajuste",
        acao: "Pedir reajuste/repactuação" + (inf.dataBase ? "" : c.ultimoReajuste ? " (um ano do último reajuste, de " + U.fmtData(c.ultimoReajuste) + ")" : " (data-base estimada pela assinatura)") });
    }
    if (inf.garantiaVence) out.push({ tipo: "garantia", data: inf.garantiaVence, dias: U.diasAte(inf.garantiaVence), rot: "Vencimento da garantia", acao: "Renovar a apólice/caução da garantia contratual" });
    return out.sort((a, b) => a.data.localeCompare(b.data));
  }
  const ALERTA_MARCO = { prorrogacao: 120, reajuste: 45, garantia: 30 };
  const dataCurta = d => d ? d.slice(8, 10) + "/" + d.slice(5, 7) + "/" + d.slice(2, 4) : "—";
  function pgContratos() {
    const c = ctrCache(), vig = contratosVigentes(), enc = (c.lista || []).filter(x => !x.vigente);
    const carteira = vig.reduce((s, x) => s + (Number(x.valorGlobal) || 0), 0);
    const marcos = vig.flatMap(x => marcosContrato(x).filter(m => m.dias >= -5 && m.dias <= ALERTA_MARCO[m.tipo]).map(m => Object.assign({ c: x }, m))).sort((a, b) => a.data.localeCompare(b.data));
    const ganhosSem = S.editais.filter(e => e.etapa === "ganho" && e.pncpId && !(c.lista || []).some(x => x.compra === e.pncpId));
    const linha = x => {
      const inf = ctrInfo(x.id), tot = x.inicio && x.fim ? Math.max(1, (new Date(x.fim) - new Date(x.inicio)) / 86400000) : null;
      const pct = tot ? Math.min(100, Math.max(0, 100 * (Date.now() - new Date(x.inicio)) / 86400000 / tot)) : null;
      const prox = marcosContrato(x).find(m => m.dias >= 0);
      const e = S.editais.find(ed => ed.pncpId && ed.pncpId === x.compra);
      return '<tr class="clicavel" data-acao="abrirContrato" data-id="' + h(x.id) + '" tabindex="0"><td class="forte">' + h(x.numero) + (e ? '<span class="sub"><a href="#editais" data-acao="ir" data-rota="editais" data-ref="' + e.id + '">' + h(e.numero) + "</a></span>" : "") +
        ((x.termos || []).length ? '<span class="sub" title="' + h(x.termos.map(t => t.numero + " · " + t.tipo + " · " + U.fmtData(t.assinatura) + " · " + t.objeto).join("\n")) + '">' + U.plural(x.termos.length, "termo", "termos") + (x.ultimoReajuste ? " · reajuste " + dataCurta(x.ultimoReajuste) : "") + "</span>" : "") +
        (x.rescindido ? '<span class="sub" style="color:var(--crit)">rescindido</span>' : "") + "</td>" +
        "<td>" + h(U.corta(x.orgao, 60)) + (x.uf ? ' <span class="muted">(' + h(x.uf) + ")</span>" : "") + '<span class="sub">' + h(U.corta(x.objeto, 80)) + "</span></td>" +
        '<td class="num" style="white-space:nowrap">' + dataCurta(x.inicio) + " → " + dataCurta(x.fim) + (pct !== null ? '<span class="ctr-barra"><i style="width:' + pct.toFixed(0) + '%"></i></span>' : "") + "</td>" +
        '<td class="num" style="text-align:right">' + U.moeda(x.valorGlobal) + (x.valorParcela >= 100 && x.valorParcela < x.valorGlobal ? '<span class="sub">' + U.moeda(x.valorParcela) + "/mês</span>" : "") + "</td>" +
        "<td>" + (prox ? '<span class="pill ' + (prox.dias <= 30 ? "crit" : prox.dias <= ALERTA_MARCO[prox.tipo] ? "warn" : "neutral") + ' sem-ponto" title="' + h(prox.rot + " em " + U.fmtData(prox.data)) + '">' + ({ prorrogacao: "Vigência", reajuste: "Reajuste", garantia: "Garantia" }[prox.tipo]) + "</span>" + '<span class="sub">em ' + U.plural(prox.dias, "dia", "dias") + "</span>" : "—") +
        (inf.gestor ? '<span class="sub">Gestor: ' + h(inf.gestor) + "</span>" : "") + "</td>" +
        '<td style="white-space:nowrap"><button class="btn-icone" data-acao="editarContrato" data-id="' + h(x.id) + '" title="Controle do contrato (reajuste, garantia, gestor)" aria-label="Controle do contrato">' + ic("editar") + '</button><a class="btn-icone" data-acao="externo" href="' + h(x.linkPncp) + '" target="_blank" rel="noopener" title="Ver no PNCP" aria-label="Ver no PNCP">' + ic("link") + "</a></td></tr>";
    };
    return '<div class="cab"><div><span class="eyebrow">Operação</span><h1>Contratos</h1><p>Contratos da ' + h(apelido()) + ' (matriz e filiais) publicados no PNCP, com os prazos de prorrogação, reajuste e garantia.</p></div>' +
      '<div class="cab-acoes"><button class="btn primario" data-acao="buscarContratos"' + (ui.lendoCtr ? " disabled" : "") + ">" + ic("atualizar") + (ui.lendoCtr ? "Buscando…" : "Buscar no PNCP") + "</button></div></div>" +
      '<p class="muted res-status">' + (c.consultadoEm ? "Conferido " + U.desde(U.isoDataHora(new Date(c.consultadoEm))) : ui.lendoCtr ? "Buscando os contratos…" : "Ainda não conferido.") + (c.erro ? ' · <span style="color:var(--crit)">última tentativa falhou: ' + h(c.erro) + "</span>" : "") + "</p>" +
      '<section class="kpis" aria-label="Indicadores"><div class="kpi destaque"><span class="rot">Contratos vigentes</span><span class="val">' + vig.length + '</span><span class="sub">' + U.plural(enc.length, "encerrado", "encerrados") + " recentes</span></div>" +
      '<div class="kpi"><span class="rot">Valor em carteira</span><span class="val">' + U.moedaCurta(carteira) + '</span><span class="sub">soma do valor global</span></div>' +
      '<div class="kpi' + (marcos.length ? " kpi-atencao" : "") + '"><span class="rot">Prazos próximos</span><span class="val">' + marcos.length + '</span><span class="sub">prorrogação, reajuste e garantia</span></div>' +
      '<div class="kpi' + (ganhosSem.length ? " kpi-atencao" : "") + '"><span class="rot">Ganhos sem contrato</span><span class="val">' + ganhosSem.length + '</span><span class="sub">homologados, contrato não publicado</span></div></section>' +
      (marcos.length ? '<section class="card"><div class="card-h"><h2>O que fazer agora</h2></div><div class="alertas">' + gerarAlertas().filter(al => al.tipo === "contrato").map(al => alertaHTML(al)).join("") + "</div></section>" : "") +
      (ganhosSem.length ? '<section class="card"><div class="card-h"><h2>Ganhos ainda sem contrato no PNCP</h2></div><ul class="hab-lista">' + ganhosSem.map(e => '<li><span class="pill warn">Assinar contrato</span><div><b>' + h(e.numero) + " · " + h(U.corta(e.orgao, 60)) + "</b><small class=\"muted\">Homologado" + (e.resultado ? " em " + U.fmtData(e.resultado.data) + " · " + U.moeda(e.resultado.valor) : "") + '</small></div><button class="btn peq ghost" data-acao="abrirEdital" data-id="' + e.id + '">Abrir</button></li>').join("") + "</ul></section>" : "") +
      '<section class="card"><div class="card-h"><h2>Contratos vigentes</h2><span class="muted">os que acabam primeiro no topo</span></div>' +
      (vig.length ? '<div class="tabela-wrap"><table class="tabela res-tabela"><thead><tr><th>Contrato</th><th>Órgão e objeto</th><th>Vigência</th><th style="text-align:right">Valor global</th><th>Próximo prazo</th><th></th></tr></thead><tbody>' + vig.map(linha).join("") + "</tbody></table></div>"
        : vazio("documentos", ui.lendoCtr ? "Buscando…" : "Nenhum contrato vigente encontrado no PNCP.")) + "</section>" +
      (enc.length ? '<section class="card"><div class="card-h"><h2>Encerrados nos últimos 6 meses</h2></div><div class="tabela-wrap"><table class="tabela res-tabela"><thead><tr><th>Contrato</th><th>Órgão e objeto</th><th>Vigência</th><th style="text-align:right">Valor global</th><th>Próximo prazo</th><th></th></tr></thead><tbody>' + enc.map(linha).join("") + "</tbody></table></div></section>" : "") +
      '<p class="nota">Fonte: contratos publicados no PNCP com o nome da empresa e CNPJ da mesma raiz (matriz e filiais). A data-base do reajuste, quando não informada, é estimada pela assinatura; confirme no contrato (o índice e a data-base costumam estar na cláusula de reajuste).</p>';
  }
  // Gaveta com o contrato: dados, prazos, termos aditivos e controle da equipe
  function abrirContrato(id) {
    const x = (ctrCache().lista || []).find(c => c.id === id);
    if (!x) { toast("Contrato não encontrado", "Clique em Buscar no PNCP para atualizar a lista.", "crit"); return; }
    const inf = ctrInfo(id), e = S.editais.find(ed => ed.pncpId && ed.pncpId === x.compra);
    const marcos = marcosContrato(x);
    const corpo = '<div class="det-topo"><div class="chips"><span class="pill ' + (x.vigente ? "ok" : "neutral") + '">' + (x.rescindido ? "Rescindido" : x.vigente ? "Vigente" : "Encerrado") + "</span>" + (x.uf ? '<span class="pill neutral sem-ponto">' + h(x.uf) + "</span>" : "") + "</div>" +
      '<h3 style="font-size:18px">' + h(x.unidade || x.orgao) + "</h3>" + '<span class="org">' + h([x.orgao !== x.unidade ? x.orgao : "", x.municipio, x.processo ? "Processo " + x.processo : ""].filter(Boolean).join(" · ")) + "</span>" +
      (x.objeto ? "<p>" + h(x.objeto) + "</p>" : "") + "</div>" +
      '<dl class="datas" style="margin-top:14px"><div><dt>Assinatura</dt><dd>' + U.fmtData(x.assinatura) + "</dd></div><div><dt>Vigência</dt><dd>" + U.fmtData(x.inicio) + " a " + U.fmtData(x.fim) + "</dd></div>" +
      "<div><dt>Valor global</dt><dd>" + U.moeda(x.valorGlobal) + "</dd></div>" + (x.valorParcela >= 100 && x.valorParcela < x.valorGlobal ? "<div><dt>Parcela mensal</dt><dd>" + U.moeda(x.valorParcela) + "</dd></div>" : "") +
      "<div><dt>Último reajuste</dt><dd>" + (x.ultimoReajuste ? U.fmtData(x.ultimoReajuste) : "—") + "</dd></div><div><dt>Gestor no órgão</dt><dd>" + h(inf.gestor || "—") + "</dd></div></dl>" +
      '<div class="bloco"><h3>Próximos prazos</h3>' + (marcos.length ? '<ul class="hab-lista">' + marcos.map(m => '<li><span class="pill ' + (m.dias < 0 ? "neutral" : m.dias <= 30 ? "crit" : m.dias <= ALERTA_MARCO[m.tipo] ? "warn" : "ok") + '">' + h(m.rot) + "</span><div><b>" + U.fmtData(m.data) + (m.dias >= 0 ? " · em " + U.plural(m.dias, "dia", "dias") : "") + '</b><small class="muted">' + h(m.acao) + "</small></div></li>").join("") + "</ul>" : '<p class="muted">Sem prazos.</p>') + "</div>" +
      '<div class="bloco"><h3>Termos do contrato no PNCP</h3>' + ((x.termos || []).length ? '<ul class="hist">' + x.termos.slice().reverse().map(t => "<li><time>" + U.fmtData(t.assinatura) + "</time><span><b>" + h(t.numero + " · " + t.tipo) + "</b> " + h(U.corta(t.objeto, 220)) + (t.fim ? " · vigência até " + U.fmtData(t.fim) : "") + "</span></li>").join("") + "</ul>" : '<p class="muted">Nenhum termo aditivo publicado.</p>') + "</div>" +
      (inf.indice || inf.dataBase || inf.garantiaValor || inf.obs ? '<div class="bloco"><h3>Controle da equipe</h3><p class="muted">' + h([inf.dataBase ? "Data-base " + U.fmtData(inf.dataBase) : "", inf.indice ? "Índice " + inf.indice : "", inf.garantiaValor ? "Garantia " + U.moeda(inf.garantiaValor) + (inf.garantiaVence ? " até " + U.fmtData(inf.garantiaVence) : "") : "", inf.obs || ""].filter(Boolean).join(" · ")) + "</p></div>" : "");
    abrirModal({ lateral: true, titulo: "Contrato " + h(x.numero), corpo,
      rodape: '<a class="btn ghost" href="' + h(x.linkPncp) + '" target="_blank" rel="noopener">' + ic("link") + "Ver no PNCP</a>" + (e ? '<button class="btn ghost" data-acao="ir" data-rota="editais" data-ref="' + e.id + '">' + ic("editais") + h(e.numero) + "</button>" : "") +
        '<span style="flex:1"></span><button class="btn primario" data-acao="editarContrato" data-id="' + h(x.id) + '">' + ic("editar") + "Controle</button>" });
  }
  function formContrato(id) {
    const x = (ctrCache().lista || []).find(c => c.id === id); if (!x) return;
    const inf = ctrInfo(id);
    abrirForm({
      titulo: "Controle do contrato " + h(x.numero), tamanho: "estreito",
      campos: [{ nome: "gestor", rotulo: "Gestor/fiscal do contrato no órgão", span: 2 },
        { nome: "dataBase", rotulo: "Data-base do reajuste", tipo: "date", dica: "Data do orçamento estimado ou a indicada no contrato." },
        { nome: "indice", rotulo: "Índice", ph: "IPCA, IST, CCT…" },
        { nome: "garantiaValor", rotulo: "Garantia contratual (R$)", tipo: "money" },
        { nome: "garantiaVence", rotulo: "Garantia vence em", tipo: "date" },
        { nome: "obs", rotulo: "Observações", tipo: "textarea", span: 2 }],
      valores: inf,
      salvar: v => { Object.assign(ctrInfo(id), v); atualizar(); toast("Controle do contrato salvo", x.numero); }
    });
  }

  function pgChats() {
    const cab = '<div class="cab"><div><span class="eyebrow">Operação</span><h1>Chats dos pregões</h1><p>Acompanhe o que o pregoeiro escreve. Mensagens de retomada, suspensão, convocação e recurso ficam destacadas, e qualquer menção à ' + h(apelido()) + ' acende o alerta.</p></div><div class="cab-acoes">' +
      (S.exemplo || S._exploracao ? '<button class="btn ghost" data-acao="simularMsg">' + ic("raio") + "Simular mensagem</button>" : "") + '<button class="btn primario" data-acao="novoChat">' + ic("mais") + "Monitorar pregão</button></div></div>";
    if (!S.chats.length) return cab + '<div class="card">' + vazio("chats", "Nenhum pregão monitorado. Adicione os pregões em que a empresa está participando.", '<button class="btn primario" data-acao="novoChat">Monitorar pregão</button>') + "</div>";
    if (!S.chats.find(c => c.id === ui.chatSel)) {
      const comNovas = S.chats.find(c => naoLidas(c).length);
      ui.chatSel = (comNovas || S.chats[0]).id;
    }
    const c = S.chats.find(x => x.id === ui.chatSel);
    const ordenados = S.chats.slice().sort((a, b) => String((ultimaMsg(b) || {}).hora || "").localeCompare(String((ultimaMsg(a) || {}).hora || "")));
    const ret = retomadaPrevista(c);
    const filtros = [["todas", "Todas"], ["importantes", "Importantes"], ["empresa", "Citam a " + apelido()], ["pregoeiro", "Só pregoeiro"]].concat(A.CATEGORIAS.filter(k => c.mensagens.some(m => infoMsg(m).tags.includes(k.id))).map(k => [k.id, k.nome]));
    const lendo = ui.lendo[c.id];
    return cab + '<div class="chat-app"><aside class="chat-lista" aria-label="Pregões monitorados"><div class="chat-lista-h"><b>' + U.plural(S.chats.length, "pregão", "pregões") + "</b>" +
      '<button class="icon-btn" data-acao="lerTodos" aria-label="Atualizar todos os chats">' + ic("atualizar") + "</button>" + '</div><div class="chat-itens">' +
      ordenados.map(x => { const u = ultimaMsg(x), nl = naoLidas(x).length, cit = naoLidas(x).some(m => infoMsg(m).citaEmpresa); return '<button class="chat-item" data-acao="selChat" data-id="' + x.id + '" aria-current="' + (x.id === c.id) + '"><b>' + h(x.titulo) + '</b><span class="q">' + (u ? U.desde(u.hora) : "") + '</span><span class="o">' + h(x.orgao || "") + '</span><span class="st">' + (x.status ? '<span class="pill neutral sem-ponto">' + h(x.status) + "</span>" : "") + (nl ? '<span class="badge">' + nl + "</span>" : "") + (cit ? '<span class="pill pop sem-ponto">Citou a ' + h(apelido()) + "</span>" : "") + (x.auto ? '<span class="pill ok sem-ponto">Automático</span>' : x.robo ? '<span class="pill ok sem-ponto">Robô</span>' : "") + "</span></button>"; }).join("") + "</div></aside>" +
      '<section class="conversa" aria-label="Conversa"><div class="conversa-h"><div class="tit"><h2>' + h(c.titulo) + "</h2><p>" + h([c.orgao, c.portal].filter(Boolean).join(" · ")) + (c.status ? ' · <span class="pill info sem-ponto">' + h(c.status) + "</span>" : "") + "</p></div>" + movimentoHTML(c) +
      '<div class="linha-acoes">' + (c.auto ? '<button class="btn peq ghost" data-acao="lerChat" data-id="' + c.id + '"' + (lendo ? " disabled" : "") + ">" + ic("atualizar") + (lendo ? "Lendo…" : "Atualizar") + "</button>" : "") +
      '<button class="btn peq ghost" data-acao="colarChat" data-id="' + c.id + '">' + ic("colar") + 'Colar mensagens</button><button class="btn peq ghost" data-acao="lerTudo" data-id="' + c.id + '">' + ic("check") + "Marcar como lidas</button>" +
      (c.link ? '<a class="icon-btn" href="' + h(c.link) + '" target="_blank" rel="noopener" aria-label="Abrir no portal">' + ic("link") + "</a>" : "") +
      '<button class="icon-btn" data-acao="editarChat" data-id="' + c.id + '" aria-label="Editar">' + ic("editar") + '</button><button class="icon-btn" data-acao="excluirChat" data-id="' + c.id + '" aria-label="Parar de monitorar">' + ic("lixo") + "</button></div></div>" +
      (ret ? '<div class="retomada-box">' + ic("relogio") + "Retomada informada pelo pregoeiro: " + h(ret) + "</div>" : "") +
      (c.erro ? '<div class="retomada-box" style="background:var(--crit-soft);color:var(--crit)">' + ic("aviso") + h(c.erro) + "</div>" : "") +
      '<div class="conversa-f"><div class="chips" role="group" aria-label="Filtrar mensagens">' + filtros.map(([id, nome]) => '<button class="chip" data-acao="filtroChat" data-f="' + id + '" aria-pressed="' + (ui.chatFiltro === id) + '">' + h(nome) + "</button>").join("") + '</div><label class="sr" for="busca-chat">Buscar no chat</label><input type="search" id="busca-chat" data-digitar="buscaChat" placeholder="Buscar no chat…" value="' + h(ui.chatBusca) + '"></div>' +
      disputaHTML(c) +
      '<div class="mensagens" id="msgs" aria-live="polite">' + mensagensHTML(c) + "</div>" +
      (c.robo && !c.auto ? '<div class="conversa-f" style="border-top:1px solid var(--line);border-bottom:0;font-size:12.5px;color:var(--ink-3)">' + (/^pncp-/.test(c.ident || "") ? "Movimentações oficiais do PNCP (situação, documentos e resultado), lidas pelo robô do GitHub. As mensagens do pregoeiro no Compras.gov.br entram por Colar mensagens" : "Mensagens do robô do GitHub (as mesmas dos e-mails)") + (c.roboEm ? " · robô atualizou " + U.desde(U.isoDataHora(new Date(c.roboEm))) : "") + (c.roboOrigem && c.roboOrigem !== "ao vivo" ? " · " + h(c.roboOrigem) : " · o portal confere a cada " + (S.ajustes.intervaloChat || 5) + " min") + ' · <button class="link-btn" data-acao="sincRobo">sincronizar agora</button></div>' : "") +
      (c.auto ? '<div class="conversa-f" style="border-top:1px solid var(--line);border-bottom:0;font-size:12.5px;color:var(--ink-3)">Leitura automática do e-compras.AM a cada ' + (S.ajustes.intervaloChat || 5) + " min enquanto o portal estiver aberto" + (c.consultadoEm ? " · última leitura " + U.desde(U.isoDataHora(new Date(c.consultadoEm))) : "") + "</div>" : "") +
      "</section></div>";
  }
  function depoisChats() {
    const box = $("#msgs");
    if (!box) return;
    const nova = $("#primeira-nova");
    if (nova) box.scrollTop += nova.getBoundingClientRect().top - box.getBoundingClientRect().top - 40; else box.scrollTop = box.scrollHeight;
    const c = S.chats.find(x => x.id === ui.chatSel);
    if (c && naoLidas(c).length) {
      clearTimeout(depoisChats.t);
      depoisChats.t = setTimeout(() => {
        if (rotaAtual() !== "chats" || ui.chatSel !== c.id) return;
        c.mensagens.forEach(m => { m.lida = true; });
        salvar(); atualizarNav();
        $$(".chat-item[aria-current=true] .badge").forEach(b => b.remove());
      }, 3500);
    }
  }
  const camposChat = () => [
    { nome: "titulo", rotulo: "Pregão", req: true, ph: "PE 408/2026" },
    { nome: "editalId", rotulo: "Edital vinculado", tipo: "select", opcoes: [["", "— Sem vínculo —"]].concat(S.editais.filter(ativo).map(e => [e.id, e.numero + " · " + U.corta(e.orgao, 38)])) },
    { nome: "orgao", rotulo: "Órgão", span: 2 },
    { nome: "portal", rotulo: "Portal", tipo: "select", opcoes: PORTAIS },
    { nome: "status", rotulo: "Situação atual", ph: "Em disputa, Suspenso, Em habilitação…" },
    { nome: "auto", rotulo: "Ler o chat automaticamente (e-compras.AM, com o portal publicado na Vercel)", tipo: "check" },
    { nome: "processo", rotulo: "Número/ano ou link de acompanhamento", ph: "408/26 ou https://www.e-compras.am.gov.br/publico/licitacoes_acompanhamento.asp?ident=256066", span: 2, dica: "Para a leitura automática do e-compras.AM. O link precisa ter o número no final (ident=256066)." },
    { nome: "link", rotulo: "Link da sala de disputa", tipo: "url", ph: "https://" }
  ];
  function formChat(id, preset) {
    const c = id ? S.chats.find(x => x.id === id) : null;
    abrirForm({
      titulo: c ? "Editar monitoramento" : "Monitorar pregão", campos: camposChat(), valores: c || Object.assign({ portal: "Compras.gov.br" }, preset || {}),
      validar: v => {
        if (v.link && /e-compras\.am/i.test(v.link) && /ident=(?!\d)/i.test(v.link)) return validarRefChat(v.link);
        if (v.auto && !v.processo && /ident=\d+/i.test(v.link)) v.processo = v.link;
        if (v.auto && v.portal !== "e-compras AM") return "A leitura automática funciona para pregões do e-compras.AM. Mude o portal ou desmarque a opção.";
        return v.auto ? validarRefChat(v.processo) : "";
      },
      salvar: v => {
        let alvo = c;
        if (c) Object.assign(c, v);
        else { alvo = Object.assign({ id: U.uid(), mensagens: [] }, v); S.chats.push(alvo); registrar("Monitorando o chat do " + v.titulo + ".", "chats"); }
        ui.chatSel = alvo.id;
        atualizar();
        if (alvo.auto) verificarChats(alvo.id);
        if (location.hash !== "#chats") location.hash = "#chats";
      }
    });
  }
  function colarChat(id) {
    const c = S.chats.find(x => x.id === id);
    abrirModal({
      titulo: "Colar mensagens · " + h(c.titulo), tamanho: "largo",
      corpo: '<div class="form-grid"><div class="campo span-2"><label for="colar-txt">Mensagens copiadas do chat do portal</label><textarea id="colar-txt" rows="12" placeholder="15/10/2026 10:21:33 - Pregoeiro: Bom dia, senhores licitantes…&#10;Pregoeiro 15/10/2026 10:25:10 A sessão será suspensa…"></textarea><small>Funciona com o texto copiado do Compras.gov.br, BLL, BNC, Licitações-e e outros: cada mensagem precisa ter data e hora. Mensagens repetidas são ignoradas.</small></div>' +
        '<div class="campo"><label for="colar-status">Situação do pregão (opcional)</label><input id="colar-status" value="' + h(c.status || "") + '"></div><div class="campo"><label>Prévia</label><p id="colar-previa" class="muted" style="padding:9px 0">Nenhuma mensagem reconhecida ainda.</p></div></div>',
      rodape: '<button class="btn ghost" data-acao="fecharModal">Cancelar</button><button class="btn primario" id="colar-ok">Adicionar mensagens</button>',
      aoAbrir: () => {
        const ta = $("#colar-txt");
        ta.addEventListener("input", () => { const n = A.lerChatColado(ta.value).length; $("#colar-previa").textContent = n ? U.plural(n, "mensagem reconhecida", "mensagens reconhecidas") : "Nenhuma mensagem reconhecida ainda."; });
        $("#colar-ok").addEventListener("click", () => {
          const lidas = A.lerChatColado(ta.value);
          const st = $("#colar-status").value.trim();
          if (!lidas.length && st === (c.status || "")) { toast("Nenhuma mensagem reconhecida", "Cada mensagem precisa começar com data e hora (dd/mm/aaaa hh:mm).", "crit"); return; }
          const conhecidas = new Set(c.mensagens.map(A.chaveMensagem));
          const novas = lidas.filter(m => !conhecidas.has(A.chaveMensagem(m))).map(m => Object.assign(m, { lida: false }));
          c.mensagens = c.mensagens.concat(novas).sort((a, b) => (a.hora < b.hora ? -1 : 1));
          if (st && st !== c.status) { registrar(c.titulo + ": situação atualizada para \"" + st + "\".", "chats"); c.status = st; }
          fecharModal();
          if (novas.length) avisarNovas(c, novas);
          atualizar();
          toast(U.plural(novas.length, "mensagem adicionada", "mensagens adicionadas"), lidas.length - novas.length ? (lidas.length - novas.length) + " já estavam no histórico." : "");
        });
      }
    });
  }
  const SIMULADAS = [
    ["Pregoeiro", "Senhores licitantes, a sessão será suspensa para almoço e retomada hoje às 14h00."],
    ["Pregoeiro", "Convoco a empresa {EMP} a enviar os documentos de habilitação complementares no prazo de 2 (duas) horas."],
    ["Sistema", "O item 1 teve a aceitação da proposta registrada."],
    ["Pregoeiro", "Foi aberto o prazo de 10 minutos para manifestação de intenção de recurso."],
    ["Pregoeiro", "Realizaremos diligência junto ao órgão emissor do atestado de capacidade técnica apresentado."],
    ["Pregoeiro", "A empresa {EMP} foi declarada vencedora do item 1. Parabéns!"]
  ];
  function simularMsg() {
    const c = S.chats.find(x => x.id === ui.chatSel) || S.chats[0];
    if (!c) return;
    simularMsg.i = ((simularMsg.i || 0) + 1) % SIMULADAS.length;
    const [autor, txt] = SIMULADAS[simularMsg.i];
    const m = { hora: U.isoDataHora(new Date()) + ":" + U.pad(new Date().getSeconds()), autor, texto: txt.replace("{EMP}", (S.empresa.nome || "EMPRESA").toUpperCase()), lida: false };
    c.mensagens.push(m);
    avisarNovas(c, [m]);
    ui.chatSel = c.id;
    atualizar();
  }

  /* ---------- Recursos ---------- */
  function pgRecursos() {
    const ativos = S.recursos.filter(r => !REC_FINAL.includes(r.status)).sort((a, b) => String((prazoNosso(a) || {}).data || "9").localeCompare(String((prazoNosso(b) || {}).data || "9")));
    const finais = S.recursos.filter(r => REC_FINAL.includes(r.status));
    return '<div class="cab"><div><span class="eyebrow">Análise e jurídico</span><h1>Recursos e contrarrazões</h1><p>Prazos contados automaticamente em dias úteis, descontando feriados. Informe a data de início e o portal mostra cada etapa até a decisão.</p></div><div class="cab-acoes"><button class="btn primario" data-acao="novoRecurso">' + ic("mais") + "Registrar recurso</button></div></div>" +
      '<div class="grade-2"><div class="recursos">' + (ativos.length ? ativos.map(recCard).join("") : '<div class="card">' + vazio("recursos", "Nenhum recurso em andamento.") + "</div>") +
      (finais.length ? '<section class="card"><div class="card-h"><h2>Encerrados</h2><span class="muted">' + finais.length + '</span></div><div class="alertas">' + finais.map(r => '<div class="alerta info"><span class="ico">' + ic("recursos") + '</span><div class="tx"><b>' + h(r.pregao) + " · " + h(nomeLista(PAPEIS, r.papel)) + "</b><span>" + h(nomeLista(STATUS_REC, r.status)) + (r.contraparte ? " · " + h(r.contraparte) : "") + '</span></div><div class="lado"><button class="btn peq ghost" data-acao="editarRecurso" data-id="' + r.id + '">Ver</button></div></div>').join("") + "</div></section>" : "") + "</div>" +
      '<div class="pilha"><section class="card"><div class="card-h"><h2>Calculadora de prazos</h2></div><div class="calc">' +
      '<div class="campo"><label for="calc-tipo">Prazo de</label><select id="calc-tipo" data-mudar="calc"><option value="recurso"' + (ui.calc.tipo === "recurso" ? " selected" : "") + '>Recurso (a partir da intimação)</option><option value="impugnacao"' + (ui.calc.tipo === "impugnacao" ? " selected" : "") + '>Impugnação (a partir da sessão)</option></select></div>' +
      '<div class="campo"><label for="calc-data">' + (ui.calc.tipo === "recurso" ? "Data da intimação / ata" : "Data da sessão") + '</label><input type="date" id="calc-data" data-mudar="calc" value="' + ui.calc.data + '"></div>' +
      '<div class="campo span-2" style="grid-column:1/-1"><label for="calc-regime">Lei</label><select id="calc-regime" data-mudar="calc"><option value="14133"' + (ui.calc.regime === "14133" ? " selected" : "") + '>Lei 14.133/2021 (dias úteis)</option><option value="10520"' + (ui.calc.regime === "10520" ? " selected" : "") + ">Lei 10.520/2002 (dias corridos)</option></select></div></div>" +
      '<div class="calc-res" id="calc-res">' + calcHTML() + "</div></section>" +
      '<section class="card"><div class="card-h"><h3>Como os prazos são contados</h3></div><p class="nota">Lei 14.133/2021: intenção de recurso imediata; razões em 3 dias úteis da intimação ou da ata; contrarrazões em 3 dias úteis a partir do fim do prazo da recorrente; o agente pode reconsiderar em 3 dias úteis e a autoridade decide em até 10 dias úteis (art. 165). A contagem exclui o dia do começo e inclui o do vencimento (art. 183). Feriados nacionais já estão no calendário; feriados locais você cadastra em Ajustes. Sempre confira a regra do edital e o horário de expediente do órgão.</p></section></div></div>';
  }
  function calcHTML() {
    const d = ui.calc.data;
    if (!d) return '<p class="muted">Informe uma data.</p>';
    const linha = (rot, v, extra) => "<div><span>" + rot + "</span><b>" + (v ? U.fmtData(v) + " (" + U.semana(v) + ")" : "—") + (extra || "") + "</b></div>";
    const fer = U.nomeFeriado(d) ? '<p class="nota">A data informada é feriado (' + h(U.nomeFeriado(d)) + ").</p>" : "";
    if (ui.calc.tipo === "impugnacao") {
      const imp = U.subtrairDiasUteis(d, 3);
      return linha("Impugnar ou pedir esclarecimento até", imp) + linha("Resposta do órgão até (3 dias úteis)", U.somarDiasUteis(imp, 3)) + fer;
    }
    const p = prazosRecurso({ dataIntencao: d, regime: ui.calc.regime });
    return linha("Razões do recurso até", p.razoes) + linha("Contrarrazões até", p.contrarrazoes) + (p.reconsideracao ? linha("Reconsideração do agente até", p.reconsideracao) + linha("Decisão da autoridade até", p.decisao) : "") + fer;
  }
  function recCard(r) {
    const p = prazosRecurso(r), nosso = prazoNosso(r);
    const e = r.editalId ? edital(r.editalId) : null;
    const passos = [["Intenção / intimação", r.dataIntencao], ["Razões", p.razoes], ["Contrarrazões", p.contrarrazoes], ["Reconsideração", p.reconsideracao], ["Decisão", p.decisao]].filter(x => x[1] !== null);
    const ordemStatus = { intencao: 1, razoes: 2, contrarrazoes: 3, julgamento: 3 };
    const feitoPorStatus = ordemStatus[r.status] || 0;
    let atualMarcado = false;
    const trilha = passos.map(([rot, data], i) => {
      let cls = "";
      if (i < feitoPorStatus || (data && U.diasAte(data) < 0)) cls = "feito";
      else if (!atualMarcado) { cls = "agora"; atualMarcado = true; }
      return '<div class="passo ' + cls + '"><b>' + rot + "</b><span>" + (data ? (i ? "até " : "") + U.fmtData(data) : "—") + "</span></div>";
    }).join("");
    const papelCls = r.papel === "recorrente" ? "brand" : r.papel === "recorrida" ? "pop" : "neutral";
    return '<article class="rec"><div class="rec-h"><h3>' + h(r.pregao) + '</h3><span class="pill ' + papelCls + '">' + h(nomeLista(PAPEIS, r.papel)) + "</span>" +
      '<div class="lado"><label class="sr" for="st-' + r.id + '">Situação</label><select id="st-' + r.id + '" data-mudar="statusRec" data-id="' + r.id + '">' + STATUS_REC.map(s => '<option value="' + s[0] + '"' + (s[0] === r.status ? " selected" : "") + ">" + s[1] + "</option>").join("") + "</select>" +
      '<button class="icon-btn" data-acao="editarRecurso" data-id="' + r.id + '" aria-label="Editar">' + ic("editar") + '</button><button class="icon-btn" data-acao="excluirRecurso" data-id="' + r.id + '" aria-label="Excluir">' + ic("lixo") + "</button></div></div>" +
      '<p class="muted" style="font-size:13.5px;margin-top:-6px">' + h([e ? e.orgao : "", r.contraparte ? "Outra parte: " + r.contraparte : "", p.regra].filter(Boolean).join(" · ")) + "</p>" +
      '<div class="trilha">' + trilha + "</div>" +
      (nosso && nosso.data && nosso.tipo !== "decisao" ? '<div class="linha-acoes"><span class="pill ' + (contCls(nosso.data) === "crit" ? "crit" : contCls(nosso.data) === "warn" ? "warn" : "info") + '">' + h(nosso.titulo) + " até " + U.fmtData(nosso.data) + "</span>" + chip(nosso.data) + (U.passou(nosso.data) ? "" : '<span class="muted" style="font-size:13px">' + U.plural(U.diasUteisAte(nosso.data), "dia útil", "dias úteis") + " restantes</span>") + "</div>" : "") +
      (r.tese ? '<div class="tese"><b>Tese:</b> ' + h(r.tese) + "</div>" : "") + "</article>";
  }
  const camposRecurso = () => [
    { nome: "editalId", rotulo: "Edital", tipo: "select", span: 2, opcoes: [["", "— Outro (digite abaixo) —"]].concat(S.editais.map(e => [e.id, e.numero + " · " + U.corta(e.orgao, 48)])) },
    { nome: "pregao", rotulo: "Identificação, se não estiver na lista", span: 2, ph: "PE 45/2026 · Prefeitura de…" },
    { nome: "papel", rotulo: "Nosso papel", tipo: "select", opcoes: PAPEIS },
    { nome: "contraparte", rotulo: "Empresa da outra parte" },
    { nome: "regime", rotulo: "Lei aplicável", tipo: "select", opcoes: [["14133", "Lei 14.133/2021 (dias úteis)"], ["10520", "Lei 10.520/2002 (dias corridos)"]] },
    { nome: "status", rotulo: "Situação", tipo: "select", opcoes: STATUS_REC },
    { nome: "dataIntencao", rotulo: "Início do prazo das razões", tipo: "date", req: true, dica: "Data da intimação ou da ata. A contagem começa no dia útil seguinte." },
    { nome: "dataContrarrazoes", rotulo: "Início do prazo das contrarrazões", tipo: "date", dica: "Se ficar vazio, vale o fim do prazo das razões." },
    { nome: "tese", rotulo: "Tese principal", tipo: "textarea", span: 2 },
    { nome: "link", rotulo: "Link do recurso no portal", tipo: "url", span: 2, ph: "https://" },
    { nome: "notas", rotulo: "Observações", tipo: "textarea", span: 2, linhas: 2 }
  ];
  function formRecurso(id, editalId) {
    const r = id ? S.recursos.find(x => x.id === id) : null;
    abrirForm({
      titulo: r ? "Editar recurso" : "Registrar recurso", tamanho: "largo", campos: camposRecurso(),
      valores: r || { editalId: editalId || "", papel: "recorrente", regime: "14133", status: "intencao", dataIntencao: U.hojeISO() },
      validar: v => (!v.editalId && !v.pregao ? "Escolha o edital ou digite a identificação do pregão." : ""),
      salvar: v => {
        const e = v.editalId ? edital(v.editalId) : null;
        v.pregao = e ? e.numero : v.pregao;
        if (r) Object.assign(r, v);
        else {
          S.recursos.push(Object.assign({ id: U.uid() }, v));
          registrar("Recurso registrado no " + v.pregao + " (" + nomeLista(PAPEIS, v.papel).toLowerCase() + ").", "recursos");
          if (e && ativo(e) && e.etapa !== "recurso") { e.etapa = "recurso"; (e.historico = e.historico || []).unshift({ data: U.hojeISO(), texto: "Fase recursal aberta." }); }
        }
        atualizar();
        const p = prazoNosso(Object.assign({}, r || {}, v));
        toast(r ? "Recurso atualizado" : "Recurso registrado", p && p.data ? p.titulo + " até " + U.fmtData(p.data) : "");
        if (location.hash !== "#recursos") location.hash = "#recursos";
      }
    });
  }

  /* ---------- Documentos ---------- */
  // Documentos ativos (os arquivados, por exemplo de filiais encerradas, não geram alerta)
  const docsAtivos = () => S.documentos.filter(d => !d.arquivado);
  function pgDocumentos() {
    const L = limitesDoc();
    const f = ui.fDoc || (ui.fDoc = { empresa: "", busca: "", arquivados: false });
    const empresas = [...new Set(S.documentos.map(d => d.empresa || ""))].sort();
    const base = S.documentos.filter(d => (f.arquivados ? d.arquivado : !d.arquivado) && (!f.empresa || (d.empresa || "") === f.empresa));
    const docs = base.map(d => ({ d, s: situacaoDoc(d) }));
    const grupos = {
      vencidos: docs.filter(x => x.s.dias !== null && x.s.dias < 0),
      curto: docs.filter(x => x.s.dias !== null && x.s.dias >= 0 && x.s.dias <= L.menor),
      medio: docs.filter(x => x.s.dias !== null && x.s.dias > L.menor && x.s.dias <= L.maior),
      ok: docs.filter(x => x.s.dias === null || x.s.dias > L.maior)
    };
    const nArq = S.documentos.filter(d => d.arquivado).length;
    const tile = (id, cls, n, rot) => '<button class="' + cls + '" data-acao="filtroDoc" data-f="' + (ui.docFiltro === id ? "todos" : id) + '" aria-pressed="' + (ui.docFiltro === id) + '"><b>' + n + "</b><span>" + rot + "</span></button>";
    return '<div class="cab"><div><span class="eyebrow">Cadastro da empresa</span><h1>Documentos e certidões</h1><p>A pasta de habilitação de cada empresa e filial sempre em dia. Alertas em ' + L.maior + " e " + L.menor + ' dias antes do vencimento, e aviso quando algo vence antes de uma sessão marcada.</p></div>' +
      '<div class="cab-acoes"><label class="btn ghost" for="imp-docs">' + ic("upload") + 'Importar planilha<input type="file" id="imp-docs" accept=".xlsx,.xlsm,.xls" class="sr" data-mudar="importarDocs"></label><button class="btn primario" data-acao="novoDoc">' + ic("mais") + "Novo documento</button></div></div>" +
      '<div class="resumo-docs">' + tile("vencidos", "crit", grupos.vencidos.length, "vencidos") + tile("curto", "crit", grupos.curto.length, "vencem em até " + L.menor + " dias") + tile("medio", "warn", grupos.medio.length, "vencem em até " + L.maior + " dias") + tile("ok", "ok", grupos.ok.length, "em dia") + "</div>" +
      (S.documentos.length ? '<div class="ferramentas"><label class="campo-busca"><span class="sr">Buscar documento</span>' + ic("busca") + '<input type="search" id="f-busca-doc" data-digitar="buscaDoc" value="' + h(f.busca) + '" placeholder="Documento, setor ou empresa…"></label>' +
        (empresas.length > 1 ? '<select id="f-empresa-doc" data-mudar="filtroDocEmpresa" aria-label="Empresa"><option value="">Todas as empresas</option>' + empresas.map(e => '<option value="' + h(e) + '"' + (f.empresa === e ? " selected" : "") + ">" + h(e || "Sem empresa") + " (" + S.documentos.filter(d => (d.empresa || "") === e && (f.arquivados ? d.arquivado : !d.arquivado)).length + ")</option>").join("") + "</select>" : "") +
        (nArq ? '<button class="chip" data-acao="docArquivados" aria-pressed="' + f.arquivados + '">Arquivados <span class="n">' + nArq + "</span></button>" : "") + "</div>" : "") +
      '<div id="lista-docs">' + listaDocsHTML(docs, grupos) + "</div>" +
      '<p class="nota">Dica: o campo "tipo" liga cada documento às exigências encontradas na análise de edital. Assim o portal diz se a certidão estará válida no dia da sessão.</p>';
  }
  function listaDocsHTML(docs, grupos) {
    const f = ui.fDoc;
    const b = U.semAcento(f.busca).toLowerCase().trim();
    const lista = (ui.docFiltro === "todos" ? docs : grupos[ui.docFiltro] || docs)
      .filter(({ d }) => !b || U.semAcento([d.nome, d.setor, d.empresa, d.emissor, d.obs].join(" ")).toLowerCase().includes(b))
      .sort((a, c) => a.s.ordem - c.s.ordem || (a.s.dias === null ? 1e6 : a.s.dias) - (c.s.dias === null ? 1e6 : c.s.dias));
    if (!lista.length) return '<div class="card">' + vazio("documentos", S.documentos.length ? "Nenhum documento com esse filtro." : "Nenhum documento cadastrado. Importe a planilha de controle de documentação ou cadastre um por um.", S.documentos.length ? "" : '<label class="btn primario" for="imp-docs2">' + ic("upload") + 'Importar planilha<input type="file" id="imp-docs2" accept=".xlsx,.xlsm,.xls" class="sr" data-mudar="importarDocs"></label>') + "</div>";
    const multi = new Set(S.documentos.map(d => d.empresa || "")).size > 1;
    return '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Documento</th>' + (multi ? "<th>Empresa</th>" : "") + "<th>Setor</th><th>Emissão</th><th>Validade</th><th>Situação</th><th style=\"text-align:right\">Ações</th></tr></thead><tbody>" + lista.map(({ d, s }) => {
      const afeta = s.dias !== null && !d.arquivado ? sessaoAfetada(d.validade) : null;
      return '<tr><td class="forte">' + h(d.nome) + '<span class="sub">' + h(nomeLista(TIPOS_DOC, d.tipo)) + (d.obs ? " · " + h(d.obs) : "") + "</span></td>" + (multi ? "<td>" + h(empresaCurta(d.empresa)) + "</td>" : "") + "<td>" + h(d.setor || d.emissor || "—") + '</td><td class="num">' + (d.emissao ? U.fmtData(d.emissao) : "—") + '</td><td class="num">' + (d.validade ? U.fmtData(d.validade) : "—") + '</td><td><span class="pill ' + s.cls + '">' + h(s.rotulo) + "</span>" + (afeta ? '<span class="sub" style="color:var(--crit)">antes da sessão do ' + h(afeta.numero) + "</span>" : "") + "</td>" +
        '<td><div class="acoes">' + (d.validade ? '<button class="btn peq ghost" data-acao="renovarDoc" data-id="' + d.id + '">' + ic("atualizar") + "Renovar</button>" : "") + (d.link ? '<a class="icon-btn" href="' + h(d.link) + '" target="_blank" rel="noopener" aria-label="Emitir no site oficial">' + ic("link") + "</a>" : "") + '<button class="icon-btn" data-acao="editarDoc" data-id="' + d.id + '" aria-label="Editar">' + ic("editar") + '</button><button class="icon-btn" data-acao="excluirDoc" data-id="' + d.id + '" aria-label="Excluir">' + ic("lixo") + "</button></div></td></tr>";
    }).join("") + "</tbody></table></div>";
  }
  /* Importa a planilha "Controle de Certidões": uma aba por empresa/filial, cabeçalho
     Tipo | UF | Município | CNPJ | I.E | I.M | Ref. Bancárias | Setor Responsável | Certidão | Emissão | Validade | Status | Previsão | Vencimento.
     Inscrições e referências bancárias NÃO são lidas. */
  function tipoDoDocumento(nome) {
    const n = U.semAcento(nome).toLowerCase();
    if (/ilicitos trabalhistas|^inscricao (?:estadual|municipal)/.test(n)) return "outro";
    if (/tributos federa|receita federal|pgfn|divida ativa da uniao|cnd federal|conjunta/.test(n)) return "cnd_federal";
    if (/fgts|\bcrf\b/.test(n)) return "fgts";
    if (/debitos trabalhistas|cndt/.test(n)) return "cndt";
    if (/estadua|icms|divida ativa do estado/.test(n)) return "estadual";
    if (/municip|issqn|\biss\b|mobiliari/.test(n)) return "municipal";
    if (/falen|falenc|concordat|recuperacao judicial/.test(n)) return "falencia";
    if (/balanco|demonstrac/.test(n)) return "balanco";
    if (/alteracao contratual|aletracao contratual|contrato social|ato constitutivo|jucerja|junta comercial/.test(n)) return "contrato_social";
    if (/\bcrm\b|cremerj|coren|crtr|\bcra\b|conselho regional/.test(n)) return "conselho";
    if (/cnes/.test(n)) return "cnes";
    if (/sanitari|vigilancia|\bvisa\b/.test(n)) return "licenca_sanitaria";
    if (/certificado digital|e-?cnpj/.test(n)) return "certificado";
    if (/atestado/.test(n)) return "atestado";
    return "outro";
  }
  async function lerPlanilhaDocs(arq) {
    await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
    const X = window.XLSX;
    const wb = X.read(await arq.arrayBuffer(), { type: "array" });
    const dataExcel = n => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000); return d.getUTCFullYear() + "-" + U.pad(d.getUTCMonth() + 1) + "-" + U.pad(d.getUTCDate()); };
    const lidos = [];
    wb.SheetNames.forEach(aba => {
      const ws = wb.Sheets[aba];
      if (!ws["!ref"]) return;
      const r0 = X.utils.decode_range(ws["!ref"]);
      r0.e.c = Math.min(r0.e.c, 20); r0.e.r = Math.min(r0.e.r, 1500); // a planilha tem milhares de colunas vazias
      const linhas = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, range: r0 });
      const hi = linhas.findIndex((r, i) => i < 25 && r && r.some(c => String(c || "").trim() === "Tipo") && r.some(c => /certid/i.test(String(c || ""))));
      if (hi < 0) return;
      const cab = linhas[hi].map(c => String(c || "").trim().toLowerCase());
      const ix = k => cab.findIndex(c => k.test(c));
      const col = { tipo: ix(/^tipo$/), cnpj: ix(/^cnpj$/), setor: ix(/^setor/), nome: ix(/^certid/), emissao: ix(/^emiss/), validade: ix(/^validade/), status: ix(/^status/), previsao: ix(/^previs/), venc: ix(/^vencimento/) };
      const cnpjs = {};
      const linhasDados = linhas.slice(hi + 1).filter(r => r && col.nome >= 0 && r[col.nome] && String(r[col.nome]).trim() && !/^x+$/i.test(String(r[col.nome]).trim()));
      linhasDados.forEach(r => { const c = col.cnpj >= 0 ? String(r[col.cnpj] || "").trim() : ""; if (c) cnpjs[c] = (cnpjs[c] || 0) + 1; });
      const cnpj = Object.keys(cnpjs).sort((a, b) => cnpjs[b] - cnpjs[a])[0] || "";
      const matriz = linhasDados.some(r => col.tipo >= 0 && /matriz/i.test(String(r[col.tipo] || "")));
      let rotulo = aba.replace(/\s+/g, " ").trim();
      if (matriz && !/[-–]/.test(rotulo)) rotulo += " MATRIZ";
      const empresa = rotulo.toUpperCase() + (cnpj ? " - " + cnpj : "");
      const encerrada = /encerrad/i.test(aba);
      linhasDados.forEach(r => {
        const nome = String(r[col.nome]).replace(/\s+/g, " ").trim();
        const v = k => (col[k] >= 0 ? r[col[k]] : null);
        const emissao = typeof v("emissao") === "number" ? dataExcel(v("emissao")) : "";
        const dias = String(v("validade") || "").trim();
        // A coluna "Vencimento" manda: "IND" (indeterminado) vale mesmo que "Validade" tenha dias
        const vencInd = /^ind/i.test(String(v("venc") || "").trim());
        let validade = typeof v("venc") === "number" ? dataExcel(v("venc")) : "";
        if (!validade && !vencInd && emissao && /^\d+$/.test(dias)) validade = U.addDias(emissao, +dias);
        const obs = [];
        if (/^ind/i.test(dias) || vencInd) obs.push("validade indeterminada");
        else if (/^\d+$/.test(dias)) obs.push("validade de " + dias + " dias");
        if (!emissao && v("emissao")) obs.push(String(v("emissao")).trim().toLowerCase());
        if (typeof v("previsao") === "number") obs.push("renovação prevista para " + U.fmtData(dataExcel(v("previsao"))));
        const st = String(v("status") || "").trim().toUpperCase();
        if (st === "REGULAR" && validade && U.diasAte(validade) < 0) obs.push("na planilha consta REGULAR");
        if (st === "VENCIDO" && (!validade || U.diasAte(validade) >= 0)) obs.push("na planilha consta VENCIDO");
        lidos.push({ nome, tipo: tipoDoDocumento(nome), empresa, setor: col.setor >= 0 ? String(r[col.setor] || "").trim() : "", emissao, validade, obs: obs.join("; "), arquivado: encerrada, origem: "planilha" });
      });
    });
    // O mesmo documento repetido na aba (a linha antiga e a renovada): fica a mais recente
    const porChave = new Map();
    lidos.forEach(x => {
      const k = chaveDoc(x), atual = porChave.get(k);
      const recente = (a, b) => (a.emissao || "") !== (b.emissao || "") ? (a.emissao || "") > (b.emissao || "") : (a.validade || "9999") > (b.validade || "9999");
      if (!atual || recente(x, atual)) porChave.set(k, x);
    });
    return [...porChave.values()];
  }
  const chaveDoc = d => [d.empresa, d.nome].map(x => U.semAcento(x || "").toLowerCase().replace(/\W+/g, "")).join("|");
  async function importarDocs(el) {
    const arq = el.files[0]; el.value = "";
    if (!arq) return;
    toast("Lendo a planilha…", arq.name);
    let lidos;
    try { lidos = await lerPlanilhaDocs(arq); } catch (e) { toast("Não consegui ler a planilha", e.message, "crit"); return; }
    if (!lidos.length) { toast("Nenhum documento encontrado", "A planilha precisa ter o cabeçalho com \"Tipo\" e \"Certidão\".", "crit"); return; }
    const existentes = new Map(S.documentos.map(d => [chaveDoc(d), d]));
    const novos = lidos.filter(x => !existentes.has(chaveDoc(x))), atualizados = lidos.filter(x => existentes.has(chaveDoc(x)));
    const ativos = lidos.filter(x => !x.arquivado);
    const vencidos = ativos.filter(x => x.validade && U.diasAte(x.validade) < 0).length;
    const arquivados = lidos.length - ativos.length;
    confirmar("Importar " + U.plural(lidos.length, "documento", "documentos") + "?",
      "Encontrei <b>" + U.plural(lidos.length, "documento", "documentos") + "</b> de " + U.plural(new Set(lidos.map(x => x.empresa)).size, "empresa/filial", "empresas/filiais") + ": " + U.plural(novos.length, "novo", "novos") + " e " + U.plural(atualizados.length, "já existente", "já existentes") + " (emissão e validade serão atualizadas). " + U.plural(vencidos, "documento ativo vencido", "documentos ativos vencidos") + "." + (arquivados ? " " + U.plural(arquivados, "documento de filial encerrada entra", "documentos de filiais encerradas entram") + " como arquivado(s), sem alerta." : "") + "<br><br>Inscrições estadual/municipal e referências bancárias <b>não foram lidas</b>.",
      "Importar", () => {
        novos.forEach(x => S.documentos.push(Object.assign({ id: U.uid() }, x)));
        atualizados.forEach(x => Object.assign(existentes.get(chaveDoc(x)), { emissao: x.emissao, validade: x.validade, setor: x.setor, obs: x.obs, arquivado: x.arquivado }));
        registrar("Planilha de documentos importada: " + U.plural(novos.length, "novo", "novos") + ", " + U.plural(atualizados.length, "atualizado", "atualizados") + ".", "documentos");
        ui.docFiltro = vencidos ? "vencidos" : "todos";
        atualizar(); toast("Planilha importada", U.plural(lidos.length, "documento", "documentos") + " · " + U.plural(vencidos, "vencido", "vencidos"));
      }, false);
  }
  const camposDoc = () => [
    { nome: "nome", rotulo: "Nome do documento", req: true, span: 2 },
    { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: TIPOS_DOC },
    { nome: "empresa", rotulo: "Empresa / filial" },
    { nome: "setor", rotulo: "Setor responsável" },
    { nome: "emissor", rotulo: "Emissor" },
    { nome: "emissao", rotulo: "Emissão", tipo: "date" },
    { nome: "validade", rotulo: "Validade", tipo: "date", dica: "Deixe vazio se o documento não vence." },
    { nome: "link", rotulo: "Onde emitir (link)", tipo: "url", span: 2, ph: "https://" },
    { nome: "arquivado", rotulo: "Arquivado (filial encerrada ou documento que não se usa mais: não gera alerta)", tipo: "check" },
    { nome: "obs", rotulo: "Observações", tipo: "textarea", span: 2, linhas: 2 }
  ];
  function formDoc(id) {
    const d = id ? S.documentos.find(x => x.id === id) : null;
    abrirForm({
      titulo: d ? "Editar documento" : "Novo documento", campos: camposDoc(), valores: d || { tipo: "cnd_federal", emissao: U.hojeISO() },
      salvar: v => { if (d) Object.assign(d, v); else S.documentos.push(Object.assign({ id: U.uid() }, v)); atualizar(); toast(d ? "Documento atualizado" : "Documento cadastrado", v.nome); }
    });
  }
  function renovarDoc(id) {
    const d = S.documentos.find(x => x.id === id);
    const duracao = d.emissao && d.validade ? Math.max(1, Math.round((U.parse(d.validade) - U.parse(d.emissao)) / 86400000)) : 30;
    abrirForm({
      titulo: "Renovar · " + h(d.nome), tamanho: "estreito", botao: "Salvar renovação",
      campos: [{ nome: "emissao", rotulo: "Nova emissão", tipo: "date", req: true }, { nome: "validade", rotulo: "Nova validade", tipo: "date", req: true, dica: "Sugestão com base na validade anterior (" + duracao + " dias)." }],
      valores: { emissao: U.hojeISO(), validade: U.addDias(U.hojeISO(), duracao) },
      salvar: v => { Object.assign(d, v); registrar(d.nome + " renovado (válido até " + U.fmtData(v.validade) + ").", "documentos"); atualizar(); toast("Documento renovado", "Válido até " + U.fmtData(v.validade)); }
    });
  }

  /* ---------- Portais ---------- */
  // "EMPRESA - FILIAL AM - 00.000.000/0002-00" -> "EMPRESA - FILIAL AM" (tira só o CNPJ do fim)
  const empresaCurta = e => String(e || "").replace(/\s*[-–]\s*\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\s*$/, "").trim() || "Sem empresa";
  function situacaoDoPortal(p) {
    const a = situacaoPortal(p.validadeCadastro), b = situacaoPortal(p.validadePlano);
    let s = a.ordem <= b.ordem ? a : b;
    if (!p.validadeCadastro && !p.validadePlano) {
      s = p.renovacaoSolicitada ? { cls: "info", rotulo: "Renovação solicitada em " + U.fmtData(p.renovacaoSolicitada), dias: null, ordem: 4 }
        : p.semValidade ? { cls: "ok", rotulo: "Sem vencimento", dias: null, ordem: 8 } : { cls: "neutral", rotulo: "Sem data de vencimento", dias: null, ordem: 9 };
    }
    return s;
  }
  function grupoPortal(p) {
    const s = situacaoDoPortal(p);
    if (s.dias !== null && s.dias < 0) return "vencidos";
    if (s.dias !== null && s.dias <= (+S.ajustes.diasPortal || 30)) return "vencendo";
    if (s.dias !== null || s.ordem === 8) return "emdia";
    return "semdata";
  }
  function pgPortais() {
    const f = ui.fPortal || (ui.fPortal = { grupo: "todos", empresa: "", busca: "" });
    const empresas = [...new Set(S.portais.map(p => p.empresa || ""))].sort();
    const base = S.portais.filter(p => !f.empresa || (p.empresa || "") === f.empresa);
    const cont = { vencidos: 0, vencendo: 0, emdia: 0, semdata: 0 };
    base.forEach(p => { cont[grupoPortal(p)]++; });
    const tile = (id, cls, n, rot) => '<button class="' + cls + '" data-acao="filtroPortalGrupo" data-f="' + (f.grupo === id ? "todos" : id) + '" aria-pressed="' + (f.grupo === id) + '"><b>' + n + "</b><span>" + rot + "</span></button>";
    return '<div class="cab"><div><span class="eyebrow">Cadastro da empresa</span><h1>Portais de compras</h1><p>Cadastros e credenciamentos de cada empresa e filial, com aviso de vencimento. Por segurança o portal não guarda senhas: elas continuam só na sua planilha ou no gerenciador de senhas.</p></div>' +
      '<div class="cab-acoes"><label class="btn ghost" for="imp-portais">' + ic("upload") + 'Importar planilha<input type="file" id="imp-portais" accept=".xlsx,.xls" class="sr" data-mudar="importarPortais"></label><button class="btn primario" data-acao="novoPortal">' + ic("mais") + "Novo portal</button></div></div>" +
      (S.portais.length ? '<div class="resumo-docs">' + tile("vencidos", "crit", cont.vencidos, "vencidos") + tile("vencendo", "warn", cont.vencendo, "vencem em até " + (+S.ajustes.diasPortal || 30) + " dias") + tile("emdia", "ok", cont.emdia, "em dia") + tile("semdata", "", cont.semdata, "sem data de vencimento") + "</div>" +
        '<div class="ferramentas"><label class="campo-busca"><span class="sr">Buscar portal</span>' + ic("busca") + '<input type="search" id="f-busca-portal" data-digitar="buscaPortal" value="' + h(f.busca) + '" placeholder="Portal, usuário ou responsável…"></label>' +
        '<select id="f-empresa-portal" data-mudar="filtroPortalEmpresa" aria-label="Empresa"><option value="">Todas as empresas (' + S.portais.length + ")</option>" + empresas.map(e => '<option value="' + h(e) + '"' + (f.empresa === e ? " selected" : "") + ">" + h(e || "Sem empresa") + " (" + S.portais.filter(p => (p.empresa || "") === e).length + ")</option>").join("") + "</select></div>" +
        '<div id="lista-portais">' + listaPortaisHTML() + "</div>"
        : '<div class="card">' + vazio("portais", "Nenhum portal cadastrado. Importe a planilha de controle (as colunas de senha são ignoradas) ou cadastre um por um.", '<label class="btn primario" for="imp-portais2">' + ic("upload") + 'Importar planilha<input type="file" id="imp-portais2" accept=".xlsx,.xls" class="sr" data-mudar="importarPortais"></label>') + "</div>");
  }
  function listaPortaisHTML() {
    const f = ui.fPortal;
    const b = U.semAcento(f.busca).toLowerCase().trim();
    const lista = S.portais.filter(p => (!f.empresa || (p.empresa || "") === f.empresa) && (f.grupo === "todos" || grupoPortal(p) === f.grupo) &&
      (!b || U.semAcento([p.nome, p.usuario, p.responsavel, p.empresa, p.obs].join(" ")).toLowerCase().includes(b)))
      .sort((x, y) => { const a = situacaoDoPortal(x), c = situacaoDoPortal(y); return a.ordem - c.ordem || (a.dias ?? 1e6) - (c.dias ?? 1e6) || empresaCurta(x.empresa).localeCompare(empresaCurta(y.empresa)) || x.nome.localeCompare(y.nome); });
    if (!lista.length) return '<div class="card">' + vazio("portais", "Nenhum portal com esse filtro.") + "</div>";
    return '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Portal</th><th>Empresa</th><th>Usuário</th><th>Responsável</th><th>Validade</th><th>Situação</th><th style="text-align:right">Ações</th></tr></thead><tbody>' +
      lista.map(p => { const s = situacaoDoPortal(p), v = p.validadeCadastro || p.validadePlano;
        return '<tr><td class="forte">' + h(p.nome) + (p.url ? '<span class="sub"><a href="' + h(/^https?:/i.test(p.url) ? p.url : "https://" + p.url) + '" target="_blank" rel="noopener">' + h(p.url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")) + "</a></span>" : "") + (p.obs ? '<span class="sub">' + h(p.obs) + "</span>" : "") +
          "</td><td>" + h(empresaCurta(p.empresa)) + '</td><td class="mono">' + h(p.usuario || "—") + "</td><td>" + h(p.responsavel || "—") + '</td><td class="num">' + (v ? U.fmtData(v) : "—") + '</td><td><span class="pill ' + s.cls + '">' + h(s.rotulo) + "</span></td>" +
          '<td><div class="acoes"><button class="btn peq ghost" data-acao="renovarPortal" data-id="' + p.id + '">' + ic("atualizar") + 'Renovar</button><button class="icon-btn" data-acao="editarPortal" data-id="' + p.id + '" aria-label="Editar">' + ic("editar") + '</button><button class="icon-btn" data-acao="excluirPortal" data-id="' + p.id + '" aria-label="Excluir">' + ic("lixo") + "</button></div></td></tr>"; }).join("") +
      "</tbody></table></div>";
  }
  const camposPortal = () => [
    { nome: "nome", rotulo: "Portal", req: true, ph: "Compras.gov.br (SICAF)" },
    { nome: "empresa", rotulo: "Empresa / filial", ph: "EMPRESA MATRIZ - 00.000.000/0001-00" },
    { nome: "usuario", rotulo: "Usuário / login", dica: "Não guarde senhas aqui." },
    { nome: "responsavel", rotulo: "Responsável pelo cadastro" },
    { nome: "validadeCadastro", rotulo: "Cadastro válido até", tipo: "date" },
    { nome: "validadePlano", rotulo: "Plano/mensalidade até", tipo: "date" },
    { nome: "renovacaoSolicitada", rotulo: "Renovação solicitada em", tipo: "date" },
    { nome: "url", rotulo: "Endereço do portal", tipo: "url", ph: "https://" },
    { nome: "semValidade", rotulo: "Este cadastro não vence", tipo: "check" },
    { nome: "obs", rotulo: "Observações", tipo: "textarea", span: 2, linhas: 2 }
  ];
  function formPortal(id) {
    const p = id ? S.portais.find(x => x.id === id) : null;
    abrirForm({ titulo: p ? "Editar portal" : "Novo portal", campos: camposPortal(), valores: p || { empresa: (ui.fPortal && ui.fPortal.empresa) || "" }, salvar: v => { if (p) Object.assign(p, v); else S.portais.push(Object.assign({ id: U.uid() }, v)); atualizar(); toast(p ? "Portal atualizado" : "Portal cadastrado", v.nome); } });
  }
  function renovarPortal(id) {
    const p = S.portais.find(x => x.id === id);
    abrirForm({
      titulo: "Renovar · " + h(p.nome), tamanho: "estreito", botao: "Salvar renovação",
      campos: [{ nome: "validadeCadastro", rotulo: "Novo vencimento do cadastro", tipo: "date", req: true }],
      valores: { validadeCadastro: U.addDias(U.hojeISO(), 365) },
      salvar: v => { p.validadeCadastro = v.validadeCadastro; p.renovacaoSolicitada = ""; p.semValidade = false; registrar(p.nome + " (" + empresaCurta(p.empresa) + ") renovado até " + U.fmtData(v.validadeCadastro) + ".", "portais"); atualizar(); toast("Cadastro renovado", "Válido até " + U.fmtData(v.validadeCadastro)); }
    });
  }
  /* Importa a planilha de controle de acessos: uma aba por empresa/filial, cabeçalho "Portal | Login | ... | Vencimento".
     Colunas de senha, credencial, pergunta e resposta secreta são ignoradas: nunca entram no portal. */
  const SEGREDO = /senha|credencial|pergunta|resposta|chave|token|\bpin\b/i;
  async function lerPlanilhaPortais(arq) {
    await carregarScript("https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js");
    const wb = window.XLSX.read(await arq.arrayBuffer(), { type: "array" });
    const lidos = [];
    const dataExcel = n => { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000); return d.getUTCFullYear() + "-" + U.pad(d.getUTCMonth() + 1) + "-" + U.pad(d.getUTCDate()); };
    const dataTexto = t => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(t); return m ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) + "-" + U.pad(+m[2]) + "-" + U.pad(+m[1]) : ""; };
    wb.SheetNames.forEach(aba => {
      const linhas = window.XLSX.utils.sheet_to_json(wb.Sheets[aba], { header: 1, raw: true, defval: null });
      const hi = linhas.findIndex(r => r && String(r[0] || "").trim().toLowerCase() === "portal");
      if (hi < 0) return;
      const titulo = String((linhas.slice(0, hi).map(r => r && r[0]).find(v => v && /\d{2}\.\d{3}\.\d{3}/.test(String(v)) || (v && !/acessos|portais/i.test(String(v)))) || aba)).replace(/\s+/g, " ").trim();
      const col = {};
      linhas[hi].forEach((c, j) => { c = String(c || "").trim().toLowerCase(); if (!c || SEGREDO.test(c)) return;
        if (c === "portal") col.nome = j; else if (/^login|usu[áa]rio/.test(c)) col.usuario = j; else if (/respons/.test(c)) col.responsavel = j;
        else if (/venc|validade/.test(c)) col.venc = j; else if (/^(site|link|url|endere)/.test(c)) col.url = j; });
      linhas.slice(hi + 1).forEach(r => {
        const nome = r && r[col.nome] !== null && r[col.nome] !== undefined ? String(r[col.nome]).trim() : "";
        if (!nome) return;
        const v = col.venc !== undefined ? r[col.venc] : null;
        const item = { nome, empresa: titulo, usuario: col.usuario !== undefined && r[col.usuario] !== null ? String(r[col.usuario]).trim() : "", responsavel: col.responsavel !== undefined && r[col.responsavel] ? String(r[col.responsavel]).trim() : "",
          validadeCadastro: "", renovacaoSolicitada: "", semValidade: false, url: "" };
        if (typeof v === "number") item.validadeCadastro = dataExcel(v);
        else if (v) { const t = String(v); if (/solicitad/i.test(t)) item.renovacaoSolicitada = dataTexto(t); else if (/sem (?:vencimento|validade)|n[ãa]o vence|indeterminad/i.test(t)) item.semValidade = true; else item.validadeCadastro = dataTexto(t); }
        const u = col.url !== undefined && r[col.url] ? String(r[col.url]).trim() : "";
        if (/^(https?:\/\/|www\.)/i.test(u)) item.url = u;
        if (/n[ãa]o usar/i.test(item.usuario)) item.obs = "Login marcado como \"não usar\" na planilha.";
        lidos.push(item);
      });
    });
    return lidos;
  }
  const chavePortal = p => [p.empresa, p.nome, p.usuario].map(x => U.semAcento(x || "").toLowerCase().replace(/\W+/g, "")).join("|");
  async function importarPortais(el) {
    const arq = el.files[0]; el.value = "";
    if (!arq) return;
    let lidos;
    try { lidos = await lerPlanilhaPortais(arq); } catch (e) { toast("Não consegui ler a planilha", e.message, "crit"); return; }
    if (!lidos.length) { toast("Nenhum portal encontrado", "A planilha precisa ter uma linha de cabeçalho começando com \"Portal\".", "crit"); return; }
    const existentes = new Map(S.portais.map(p => [chavePortal(p), p]));
    const novos = lidos.filter(x => !existentes.has(chavePortal(x)));
    const atualizados = lidos.filter(x => existentes.has(chavePortal(x)));
    const vencidos = lidos.filter(x => x.validadeCadastro && U.diasAte(x.validadeCadastro) < 0).length;
    const empresas = new Set(lidos.map(x => x.empresa)).size;
    confirmar("Importar " + U.plural(lidos.length, "portal", "portais") + "?",
      "Encontrei <b>" + U.plural(lidos.length, "cadastro", "cadastros") + "</b> em " + U.plural(empresas, "empresa/filial", "empresas/filiais") + ": " + U.plural(novos.length, "novo", "novos") + " e " + U.plural(atualizados.length, "já existente", "já existentes") + " (terão responsável e vencimento atualizados). " + U.plural(vencidos, "cadastro está vencido", "cadastros estão vencidos") + ".<br><br>As colunas de senha, pergunta e resposta secreta <b>não foram lidas</b>.",
      "Importar", () => {
        novos.forEach(x => S.portais.push(Object.assign({ id: U.uid(), origem: "planilha" }, x)));
        atualizados.forEach(x => { const p = existentes.get(chavePortal(x)); ["responsavel", "validadeCadastro", "renovacaoSolicitada", "semValidade", "url"].forEach(k => { if (x[k] || k === "semValidade") p[k] = x[k] || p[k]; }); });
        registrar("Planilha de portais importada: " + U.plural(novos.length, "novo", "novos") + ", " + U.plural(atualizados.length, "atualizado", "atualizados") + ".", "portais");
        ui.fPortal = { grupo: vencidos ? "vencidos" : "todos", empresa: "", busca: "" };
        atualizar(); toast("Planilha importada", U.plural(lidos.length, "portal", "portais") + " · " + U.plural(vencidos, "vencido", "vencidos"));
      }, false);
  }

  /* ---------- Central de alertas ---------- */
  const TIPOS_ALERTA = [["todos", "Todos"], ["proposta", "Propostas"], ["sessao", "Sessões"], ["chat", "Chats"], ["recurso", "Recursos"], ["impugnacao", "Impugnação"], ["documento", "Documentos"], ["portal", "Portais"]];
  function pgAlertas() {
    const todos = gerarAlertas();
    const lista = todos.filter(a => ui.alertaFiltro === "todos" || a.tipo === ui.alertaFiltro);
    const grupo = a => { if (a.semData) return 0; const n = U.diasAte(a.quando); return n <= 0 || U.passou(a.quando) ? 0 : n <= 3 ? 1 : n <= 14 ? 2 : 3; };
    const nomes = ["Atrasados e para hoje", "Próximos 3 dias", "Próximas 2 semanas", "Mais adiante"];
    const nResolvidos = Object.keys(S.resolvidos).length;
    const permissao = "Notification" in window ? Notification.permission : "indisponivel";
    return '<div class="cab"><div><span class="eyebrow">Avisos</span><h1>Central de alertas</h1><p>Tudo o que tem prazo, num lugar só: propostas, sessões, chats, recursos, documentos e portais.</p></div>' +
      '<div class="cab-acoes"><button class="btn ghost" data-acao="copiarResumo">' + ic("copiar") + 'Copiar resumo do dia</button><button class="btn ghost" data-acao="exportarAgenda">' + ic("calendario") + "Exportar agenda</button>" +
      (S.ajustes.notificacoes && permissao === "granted" ? '<span class="pill ok">Notificações ativas</span>' : '<button class="btn primario" data-acao="ativarNotif">' + ic("alertas") + "Ativar notificações</button>") + "</div></div>" +
      '<div class="chips" role="group" aria-label="Filtrar alertas">' + TIPOS_ALERTA.map(([id, nome]) => { const n = id === "todos" ? todos.length : todos.filter(a => a.tipo === id).length; return '<button class="chip" data-acao="filtroAlerta" data-f="' + id + '" aria-pressed="' + (ui.alertaFiltro === id) + '">' + nome + ' <span class="n">' + n + "</span></button>"; }).join("") + "</div>" +
      (lista.length ? nomes.map((nome, g) => { const itens = lista.filter(a => grupo(a) === g); return itens.length ? '<section class="card"><div class="card-h"><h2>' + nome + '</h2><span class="muted">' + itens.length + '</span></div><div class="alertas">' + itens.map(a => alertaHTML(a, true)).join("") + "</div></section>" : ""; }).join("") : '<div class="card">' + vazio("check", "Nenhum alerta por aqui. Pode respirar!") + "</div>") +
      (nResolvidos ? '<p class="nota">' + U.plural(nResolvidos, "alerta resolvido ou adiado", "alertas resolvidos ou adiados") + ' · <button class="link-btn" data-acao="restaurarAlertas">mostrar de novo</button></p>' : "");
  }
  function resumoDoDia() {
    const hoje = U.hojeISO();
    const l = ["Resumo de licitações · " + U.fmtData(hoje) + " (" + U.semanaLonga(hoje) + ")", ""];
    const secao = (titulo, itens) => { if (itens.length) l.push(titulo, ...itens.map(x => "• " + x), ""); };
    secao("Sessões hoje:", S.editais.filter(e => ativo(e) && e.sessao && U.diasAte(e.sessao) === 0).map(e => e.numero + " · " + e.orgao + " · " + U.fmtHora(e.sessao) + " · " + e.portal));
    secao("Propostas a cadastrar (7 dias):", S.editais.filter(e => precisaProposta(e) && limiteDe(e) && !U.passou(limiteDe(e)) && U.diasAte(limiteDe(e)) <= 7).sort((a, b) => limiteDe(a).localeCompare(limiteDe(b))).map(e => e.numero + " · limite " + U.fmtDataHora(limiteDe(e)) + " · " + PROP_NOME(e.propostaStatus)));
    secao("Prazos recursais:", S.recursos.map(r => ({ r, p: prazoNosso(r) })).filter(x => x.p && x.p.data && ["razoes", "contrarrazoes"].includes(x.p.tipo) && !U.passou(x.p.data)).map(x => x.r.pregao + " · " + x.p.titulo + " até " + U.fmtData(x.p.data)));
    secao("Chats com novidade:", S.chats.filter(c => naoLidas(c).length).map(c => c.titulo + " · " + U.plural(naoLidas(c).length, "mensagem nova", "mensagens novas") + (naoLidas(c).some(m => infoMsg(m).citaEmpresa) ? " (cita a " + apelido() + ")" : "") + (retomadaPrevista(c) ? " · retomada " + retomadaPrevista(c) : "")));
    secao("Documentos e portais:", gerarAlertas().filter(a => ["documento", "portal"].includes(a.tipo) && a.nivel !== "info").map(a => a.titulo.replace(/^(Renovar documento|Documento vencido): /, "") + " · " + a.detalhe));
    if (l.length <= 2) l.push("Nenhum prazo crítico hoje.");
    l.push("Gerado pela Equipe Comercial");
    return l.join("\n");
  }
  function mostrarTexto(titulo, texto, nomeArquivo, tipo) {
    abrirModal({
      titulo, tamanho: "largo", corpo: '<p class="nota" style="margin-bottom:10px">' + (nomeArquivo ? "Baixe o arquivo ou copie o conteúdo." : "Copiado! Se preferir, selecione o texto abaixo.") + '</p><textarea id="texto-saida" class="notas-area" rows="14" readonly style="font-family:var(--f-mono);font-size:12.5px">' + h(texto) + "</textarea>",
      rodape: '<button class="btn ghost" data-acao="fecharModal">Fechar</button>' + (nomeArquivo ? '<button class="btn ghost" id="saida-copiar">' + ic("copiar") + 'Copiar</button><button class="btn primario" id="saida-baixar">' + ic("download") + "Baixar " + h(nomeArquivo) + "</button>" : ""),
      aoAbrir: () => {
        const ta = $("#texto-saida");
        ta.addEventListener("focus", () => ta.select());
        if (nomeArquivo) {
          $("#saida-baixar").addEventListener("click", () => { U.baixar(nomeArquivo, texto, tipo); toast("Arquivo gerado", nomeArquivo); });
          $("#saida-copiar").addEventListener("click", async () => { if (await U.copiar(texto)) toast("Conteúdo copiado"); else { ta.focus(); ta.select(); toast("Selecionei o texto", "Use Ctrl+C para copiar."); } });
        }
      }
    });
  }

  /* ---------- Ajustes ---------- */
  /* Resumo diário por e-mail: o robô do GitHub lê os dados com uma chave própria (só o hash fica no banco) */
  const LINK_SEGREDO = "https://github.com/gyovannaflores4-max/ferramentas-licitacoes/settings/secrets/actions/new";
  function resumoDiarioHTML() {
    const c = ui.chaveRobo;
    if (!c) { carregarChaveRobo(); }
    const fmt = iso => iso ? U.fmtDataHora(U.isoDataHora(new Date(iso))) : "";
    const situacao = !c || c.carregando ? "Verificando…" : c.erro ? c.erro : c.criado_em
      ? "Ligado. Chave criada em " + fmt(c.criado_em) + (c.usado_em ? "; último resumo lido em " + fmt(c.usado_em) + "." : "; o robô ainda não usou a chave (confira o segredo no GitHub).")
      : "Desligado. Gere a chave e cadastre no GitHub para receber o resumo.";
    return '<section class="card"><h2>Resumo diário por e-mail</h2><p>Todo dia útil, a partir das 7h, o robô do GitHub manda para ' + h(nuvem.usuario.email) +
      " um e-mail com as sessões da semana, propostas a cadastrar, prazos de impugnação e de recurso, documentos e portais vencendo e as novidades dos chats.</p>" +
      '<p class="nota"' + (c && c.criado_em ? "" : ' style="color:var(--ink-2)"') + ">" + h(situacao) + "</p>" +
      '<div class="linha-acoes"><button class="btn ' + (c && c.criado_em ? "ghost" : "primario") + ' peq" data-acao="gerarChaveRobo">' + ic("raio") + (c && c.criado_em ? "Gerar nova chave" : "Gerar chave do robô") + "</button>" +
      (c && c.criado_em ? '<button class="btn ghost peq" data-acao="desligarResumo">Desligar</button>' : "") + "</div></section>";
  }
  async function carregarChaveRobo() {
    ui.chaveRobo = { carregando: true };
    try {
      const { data, error } = await nuvem.cliente.rpc("portal_situacao_chave_robo");
      if (error) throw error;
      ui.chaveRobo = data || {};
    } catch (e) { ui.chaveRobo = { erro: "Não consegui verificar a chave do robô agora." }; }
    if (rotaAtual() === "ajustes") renderSeLivre();
  }

  function pgAjustes() {
    const e = S.empresa, a = S.ajustes;
    const campo = (id, rot, valor, chave, extra, dica) => '<div class="campo"><label for="' + id + '">' + rot + '</label><input id="' + id + '" value="' + h(valor) + '" data-mudar="ajuste" data-chave="' + chave + '" ' + (extra || "") + ">" + (dica ? "<small>" + dica + "</small>" : "") + "</div>";
    const sw = (id, rot, val, chave) => '<label class="switch" for="' + id + '"><span>' + rot + '</span><input type="checkbox" id="' + id + '" data-mudar="ajuste" data-chave="' + chave + '"' + (val ? " checked" : "") + "></label>";
    return '<div class="cab"><div><span class="eyebrow">Configuração</span><h1>Ajustes</h1><p>As alterações são salvas na hora, neste navegador.</p></div></div>' +
      '<div class="ajustes"><section class="card"><h2>Empresa</h2><p>O nome, o apelido e o CNPJ são usados para detectar quando o pregoeiro cita a empresa no chat.</p>' +
      campo("aj-nome", "Razão social", e.nome, "empresa.nome") + campo("aj-apelido", "Como a empresa aparece no chat (apelido)", e.apelido, "empresa.apelido", 'placeholder="Ex.: Vitalis"') + campo("aj-cnpj", "CNPJ", e.cnpj, "empresa.cnpj", 'inputmode="numeric"') +
      '<div class="campo"><label for="aj-porte">Porte</label><select id="aj-porte" data-mudar="ajuste" data-chave="empresa.porte"><option value="demais"' + (e.porte !== "me" ? " selected" : "") + '>Demais portes</option><option value="me"' + (e.porte === "me" ? " selected" : "") + ">ME / EPP</option></select><small>Usado na análise de editais exclusivos para ME/EPP.</small></div>" +
      campo("aj-equipe", "Como chamar a equipe no painel", e.equipe, "empresa.equipe") +
      '<div class="campo"><label for="aj-grupo">Empresas do grupo (como aparecem nos portais)</label><textarea id="aj-grupo" rows="3" data-mudar="ajuste" data-chave="empresa.grupo" placeholder="DIMPI GESTAO EM SAUDE LTDA&#10;RC ...&#10;CETUS SERVICOS LTDA">' + h(e.grupo || "") + "</textarea><small>Uma por linha. O portal acha essas empresas no ranking da disputa e mostra a posição. Coloque o CNPJ junto do nome (ex.: CETUS SERVICOS LTDA 00.000.000/0001-00) para os ganhos dela entrarem em Resultados do ano.</small></div></section>" +
      '<section class="card"><h2>Alertas</h2><p>Quando cada aviso começa a aparecer.</p>' +
      campo("aj-dprop", "Avisar propostas com quantos dias de antecedência", a.diasProposta, "ajustes.diasProposta", 'type="number" min="1" max="30"') +
      campo("aj-ddoc", "Avisos de documentos (dias antes do vencimento)", Array.isArray(a.diasDoc) ? a.diasDoc.join(", ") : a.diasDoc, "ajustes.diasDoc", "", "Ex.: 30, 15, 7") +
      campo("aj-dportal", "Avisar portais com quantos dias de antecedência", a.diasPortal, "ajustes.diasPortal", 'type="number" min="1" max="120"') +
      sw("aj-notif", "Notificações do navegador", a.notificacoes, "ajustes.notificacoes") + sw("aj-som", "Som ao chegar mensagem ou alerta", a.som, "ajustes.som") +
      '<button class="btn ghost peq" data-acao="testarAlerta" style="align-self:flex-start">' + ic("som") + "Testar aviso</button></section>" +
      '<section class="card"><h2>Prazos e feriados</h2><p>Os feriados nacionais já estão incluídos. Cadastre os do estado e do município do órgão.</p>' +
      sw("aj-pf", "Tratar Carnaval e Corpus Christi como dias sem expediente", a.pontosFacultativos, "ajustes.pontosFacultativos") +
      '<div class="campo"><label for="aj-feriados">Feriados locais (um por linha)</label><textarea id="aj-feriados" rows="4" data-mudar="ajuste" data-chave="ajustes.feriadosLocais" placeholder="05/09 Elevação do Amazonas à categoria de província&#10;24/10 Aniversário de Manaus&#10;08/12/2026 Feriado municipal">' + h(a.feriadosLocais || "") + "</textarea><small>DD/MM para todo ano ou DD/MM/AAAA para uma data só.</small></div></section>" +
      '<section class="card"><h2>Integrações</h2><p>Com o portal publicado na Vercel, o chat do e-compras.AM é lido sozinho e os editais do PNCP são importados pelo link.</p>' +
      campo("aj-api", "Endereço da API", a.apiBase, "ajustes.apiBase", 'placeholder="Vazio = mesmo endereço do portal"', "Preencha só se a API estiver em outro endereço.") +
      campo("aj-int", "Ler os chats a cada (minutos)", a.intervaloChat, "ajustes.intervaloChat", 'type="number" min="2" max="60"') +
      campo("aj-robo", "Arquivo do robô do GitHub (chats.json)", a.arquivoRobo, "ajustes.arquivoRobo", 'type="url"', "As mensagens que o robô manda por e-mail entram nos chats do portal. Deixe vazio para desligar.") +
      (ui.roboErro ? '<p class="nota" style="color:var(--crit)">' + h(ui.roboErro) + "</p>" : "") +
      '<button class="btn ghost peq" data-acao="sincRobo" style="align-self:flex-start">' + ic("atualizar") + "Sincronizar com o robô agora</button>" +
      '<button class="btn ghost peq" data-acao="testarApi" style="align-self:flex-start">' + ic("raio") + "Testar conexão</button></section>" +
      (nuvem.usuario ? resumoDiarioHTML() : "") +
      '<section class="card" style="grid-column:1/-1"><h2>Seus dados</h2>' +
      (nuvem.usuario ? "<p>Seus dados ficam guardados na nuvem, na conta <b>" + h(nuvem.usuario.email) + "</b>, e aparecem em qualquer computador ou celular em que você entrar. " + h(textoNuvem()) + '.</p><div class="linha-acoes"><button class="btn ghost peq" data-acao="sair">Sair do portal</button><button class="btn ghost peq" data-acao="trocarSenha">Trocar a senha</button></div>'
        : "<p>Tudo fica salvo neste navegador. Faça um backup de vez em quando e use-o para levar os dados para outro computador.</p>") +
      '<div class="linha-acoes"><button class="btn ghost" data-acao="backup">' + ic("download") + 'Exportar backup</button><label class="btn ghost" for="aj-importar">' + ic("upload") + 'Importar backup<input type="file" id="aj-importar" accept=".json,application/json" class="sr" data-mudar="importar"></label>' +
      '<span style="flex:1"></span><button class="btn ghost" data-acao="recarregarExemplo">Recarregar dados de exemplo</button><button class="btn perigo" data-acao="zerar">' + ic("lixo") + "Apagar tudo e começar do zero</button></div></section></div>";
  }

  /* =================================================================
     Roteamento e renderização
     ================================================================= */
  const PAGINAS = {
    painel: { html: pgPainel }, editais: { html: pgEditais, depois: ligarArraste }, propostas: { html: pgPropostas }, precos: { html: pgPrecos }, suspensos: { html: pgSuspensos }, resultados: { html: pgResultados }, concorrencia: { html: pgConcorrencia }, garimpo: { html: pgGarimpo }, contratos: { html: pgContratos },
    chats: { html: pgChats, depois: depoisChats }, analise: { html: pgAnalise, depois: ligarAnalise }, recursos: { html: pgRecursos },
    documentos: { html: pgDocumentos }, portais: { html: pgPortais }, alertas: { html: pgAlertas }, ajustes: { html: pgAjustes }
  };
  const rotaAtual = () => { const r = location.hash.replace("#", ""); return PAGINAS[r] ? r : "painel"; };
  function render() {
    if (nuvem.bloqueado) return;
    const r = rotaAtual();
    const el = $("#pagina");
    el.innerHTML = PAGINAS[r].html();
    if (PAGINAS[r].depois) PAGINAS[r].depois(el);
    $$(".nav a").forEach(a => { if (a.dataset.rota === r) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    atualizarNav();
    if (ui.abrirApos) { const id = ui.abrirApos; ui.abrirApos = null; abrirEdital(id); }
    else if (ui.detalhe && !$("#modal").hidden && $("#modal").classList.contains("lateral")) abrirEdital(ui.detalhe, true);
  }
  function renderSeLivre() {
    const foco = document.activeElement;
    if ($("#modal").hidden && !(foco && /INPUT|TEXTAREA|SELECT/.test(foco.tagName) && $("#pagina").contains(foco))) render();
    else atualizarNav();
  }
  function atualizarNav() {
    if (nuvem.bloqueado) return;
    const al = gerarAlertas();
    const cont = {
      editais: S.editais.filter(ativo).length,
      propostas: al.filter(a => a.tipo === "proposta" && a.nivel !== "info").length,
      suspensos: suspensos().filter(x => x.novidade).length,
      chats: S.chats.reduce((s, c) => s + naoLidas(c).length, 0),
      recursos: al.filter(a => a.tipo === "recurso" && a.nivel !== "info").length,
      documentos: docsAtivos().filter(d => situacaoDoc(d).cls === "crit").length,
      portais: 0, // cadastro de portal não é prioridade
      contratos: al.filter(a => a.tipo === "contrato" && a.nivel === "critico").length,
      alertas: al.filter(a => a.nivel === "critico").length
    };
    Object.keys(cont).forEach(k => { const b = $('[data-cont="' + k + '"]'); if (b) { b.textContent = cont[k]; b.hidden = !cont[k]; } });
    const sino = $("#sino");
    sino.textContent = cont.alertas; sino.hidden = !cont.alertas;
    $("#side-empresa").innerHTML = "<b>" + h(S.empresa.nome || "Sua empresa") + '</b><br><span id="side-nuvem">' + h(textoNuvem()) + "</span>" +
      (nuvem.usuario ? '<br><button class="link-btn" data-acao="sair">Sair</button>' : "");
  }
  function irPara(rota, ref) {
    fecharMenu();
    if (!$("#modal").hidden) fecharModal();
    if (rota === "chats" && ref) { ui.chatSel = ref; ui.chatFiltro = "todas"; }
    if ((rota === "editais" || rota === "propostas") && ref && edital(ref)) ui.abrirApos = ref;
    if (rota === "precos" && ref && edital(ref)) { ui.precoSel = ref; ui.precoLance = ""; }
    if (rota === "contratos" && ref) setTimeout(() => abrirContrato(ref), 60); // o Abrir do alerta mostra o contrato
    if (rota === "recursos" && ref && ref.startsWith("novo:")) { setTimeout(() => formRecurso(null, ref.slice(5)), 50); }
    if (location.hash === "#" + rota) render(); else location.hash = "#" + rota;
  }
  function fecharMenu() { $("#app").classList.remove("menu-aberto"); }

  /* =================================================================
     Eventos
     ================================================================= */
  function ligarAnalise() {
    const zona = $("#soltar"), inp = $("#arquivo-edital"), ta = $("#texto-edital");
    if (!zona) return;
    inp.addEventListener("change", () => lerArquivo(inp.files));
    ["dragenter", "dragover"].forEach(t => zona.addEventListener(t, ev => { ev.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach(t => zona.addEventListener(t, () => zona.classList.remove("sobre")));
    zona.addEventListener("drop", ev => { ev.preventDefault(); lerArquivo(ev.dataTransfer.files); });
    ta.addEventListener("input", () => { ui.analiseTexto = ta.value; });
  }

  function excluir(lista, id, nome, rotulo) {
    confirmar("Excluir " + rotulo + "?", "<b>" + h(nome) + "</b> será removido. Essa ação não pode ser desfeita.", "Excluir", () => {
      S[lista] = S[lista].filter(x => x.id !== id);
      S.apagados = (S.apagados || []).concat(id).slice(-1000); // para não voltar ao juntar com a nuvem
      atualizar(); toast(rotulo.charAt(0).toUpperCase() + rotulo.slice(1) + " excluído", nome);
    });
  }

  const ACOES = {
    novoSuspenso: () => formSuspenso(),
    atualizarSuspensos: () => { suspensos().forEach(x => { x.consultadoEm = null; }); verificarSuspensos(); toast("Conferindo os pregões suspensos", "Leva uns 15 segundos por pregão."); },
    lerSuspenso: d => verificarSuspensos(d.id),
    removerSuspenso: d => { const it = suspensos().find(x => x.id === d.id); confirmar("Parar de acompanhar?", "<b>" + h((it.dados && it.dados.numero) || it.link) + "</b> sai da lista de suspensos.", "Remover", () => { S.suspensos = suspensos().filter(x => x.id !== d.id); S.apagados = (S.apagados || []).concat(d.id).slice(-1000); atualizar(); }); },
    cadastrarRepublicado: d => {
      const it = suspensos().find(x => x.id === d.id), p = ((it && it.dados && it.dados.parecidos) || []).find(x => x.linkPncp === d.link);
      if (!p) return;
      formEdital(null, { numero: p.numero.replace(/^Pregão Eletrônico\s*/i, "PE ").replace(/^Dispensa\s*/i, "DE "), orgao: it.dados.orgao, municipio: it.dados.municipio, uf: it.dados.uf, objeto: p.objeto, link: p.link, sessao: p.sessao, portal: /compras|cnet|serpro/i.test(p.link) ? "Compras.gov.br" : it.dados.portal || "Outro" });
    },
    gerarChaveRobo: () => {
      const gerar = async () => {
        const { data, error } = await nuvem.cliente.rpc("portal_gerar_chave_robo");
        if (error || !data) { toast("Não consegui gerar a chave", error ? traduzirErro(error) : "", "crit"); return; }
        ui.chaveRobo = { criado_em: new Date().toISOString(), usado_em: null }; render();
        abrirModal({
          titulo: "Chave do robô", tamanho: "estreito",
          corpo: '<p>Copie a chave agora: por segurança, ela não aparece de novo.</p>' +
            '<div class="importar" style="margin:12px 0"><label for="chave-robo">Chave</label><div class="linha"><input id="chave-robo" readonly value="' + h(data) + '"><button type="button" class="btn primario peq" id="copiar-chave">' + ic("copiar") + "Copiar</button></div></div>" +
            '<ol class="passos"><li>Abra a <a href="' + LINK_SEGREDO + '" target="_blank" rel="noopener">página de segredos do GitHub</a> (repositório → Settings → Secrets and variables → Actions → New repository secret).</li>' +
            "<li>Em <b>Name</b>, escreva <code>PORTAL_CHAVE_ROBO</code>.</li><li>Em <b>Secret</b>, cole a chave e clique em <b>Add secret</b>.</li></ol>" +
            '<p class="muted" style="font-size:13px;margin-top:10px">A chave só dá leitura aos seus dados do portal. Se ela vazar, gere outra aqui: a anterior para de funcionar na hora.</p>',
          rodape: '<span style="flex:1"></span><button class="btn primario" data-acao="fecharModal">Pronto</button>',
          aoAbrir: () => { $("#copiar-chave").addEventListener("click", () => { U.copiar(data); toast("Chave copiada", "Agora cole no segredo PORTAL_CHAVE_ROBO do GitHub."); }); }
        });
      };
      if (ui.chaveRobo && ui.chaveRobo.criado_em) confirmar("Gerar nova chave?", "A chave atual para de funcionar. Depois, atualize o segredo <b>PORTAL_CHAVE_ROBO</b> no GitHub com a nova.", "Gerar nova chave", gerar, false);
      else gerar();
    },
    desligarResumo: () => confirmar("Desligar o resumo diário?", "A chave do robô será apagada e o e-mail diário para de chegar. Dá para ligar de novo quando quiser.", "Desligar", async () => {
      const { error } = await nuvem.cliente.rpc("portal_apagar_chave_robo");
      ui.chaveRobo = error ? null : {}; render();
      toast(error ? "Não consegui desligar" : "Resumo diário desligado", error ? traduzirErro(error) : "", error ? "crit" : "");
    }),
    precoItem: () => {
      const e = editalPreco(); if (!e) return;
      const pr = precificacaoDe(e), ult = pr.itens[pr.itens.length - 1];
      const novo = P.itemNovo(ult ? { unidade: ult.unidade, horas: ult.horas, profissionais: ult.profissionais, valorHora: ult.valorHora } : {});
      pr.itens.push(novo); salvar(); render();
      const i = $("#pi-" + novo.id + "-descricao"); if (i) i.focus();
    },
    precoRemoverItem: d => {
      const e = editalPreco(), pr = precificacaoDe(e), it = pr.itens.find(x => x.id === d.item);
      confirmar("Remover este item?", "<b>" + h(it.descricao || "Item sem descrição") + "</b> sai da formação de preço.", "Remover", () => { pr.itens = pr.itens.filter(x => x.id !== d.item); salvar(); render(); });
    },
    precoCusto: d => { const it = itemPreco(d); (it.custos = it.custos || []).push({ descricao: "", valor: "", maoDeObra: false }); salvar(); render(); const i = $("#pc-" + it.id + "-" + (it.custos.length - 1)); if (i) i.focus(); },
    precoRemoverCusto: d => { const it = itemPreco(d); it.custos.splice(+d.k, 1); salvar(); render(); },
    precoDaAnalise: () => {
      const e = editalPreco(), pr = precificacaoDe(e), novos = itensDaAnalise();
      const aplicar = () => {
        pr.itens = novos; salvar(); render();
        toast(U.plural(novos.length, "item trazido", "itens trazidos") + " da análise", "Confira as quantidades e informe o valor da hora de cada profissional.");
      };
      if (pr.itens.length) confirmar("Substituir os itens?", "Os " + pr.itens.length + " itens atuais de <b>" + h(e.numero) + "</b> serão trocados pelos " + novos.length + " itens da última análise de edital.", "Substituir", aplicar);
      else aplicar();
    },
    precoUsar: () => {
      const e = editalPreco(); if (!e || !e.precificacao) return;
      const calc = P.calcular(e.precificacao);
      if (!calc.total) { toast("Ainda não há preço", "Preencha quantidade, horas e valor da hora dos itens.", "crit"); return; }
      e.nossoValor = calc.total;
      (e.checklist = e.checklist || {})[CHECK_PROPOSTA[0]] = true;
      if (e.etapa === "triagem" || e.etapa === "analise") e.etapa = "proposta";
      if (!e.propostaStatus || e.propostaStatus === "nao_iniciada") e.propostaStatus = "elaborando";
      (e.historico = e.historico || []).unshift({ data: U.hojeISO(), texto: "Formação de preço: proposta de " + U.moeda(calc.total) + " (margem " + pct(calc.margem, 2) + ", lance mínimo " + U.moeda(calc.totalMinimo) + ")." });
      registrar(e.numero + ": proposta de " + U.moeda(calc.total) + " pela formação de preço.", "precos");
      atualizar(); toast("Valor da proposta atualizado", e.numero + ": " + U.moeda(calc.total) + ". Planilha de custos marcada no checklist.");
    },
    precoCopiar: () => {
      const e = editalPreco(); if (!e || !e.precificacao) return;
      const calc = P.calcular(e.precificacao), n = v => (Math.round(v * 100) / 100).toFixed(2).replace(".", ",");
      const l = [["Item", "Descrição", "Unidade", "Quantidade", "Custo direto unitário", "BDI", "Preço unitário", "Preço total", "Lance mínimo unitário"].join("\t")];
      calc.itens.forEach((x, i) => l.push([i + 1, x.item.descricao, x.item.unidade, x.quantidade, n(x.direto), pct(x.bdi, 2), n(x.unitario), n(x.total), n(x.minimo)].join("\t")));
      l.push(["", "TOTAL", "", "", "", "", "", n(calc.total), ""].join("\t"), "", "Parâmetros (%)\tValor");
      Object.keys(P.ROTULOS).forEach(k => l.push(P.ROTULOS[k] + "\t" + String(P.numero(calc.par[k])).replace(".", ",")));
      U.copiar(l.join("\n")); toast("Planilha copiada", "Cole no Excel: cada coluna vai para o lugar certo.");
    },
    abrirPreco: d => { ui.precoSel = d.id; irPara("precos"); },
    fecharModal, abrirMenu: () => $("#app").classList.add("menu-aberto"), fecharMenu,
    ir: d => irPara(d.rota, d.ref),
    tema: () => {
      const raiz = document.documentElement;
      const escuro = raiz.dataset.theme ? raiz.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
      raiz.dataset.theme = escuro ? "light" : "dark"; gravarPref("tema", raiz.dataset.theme); iconeTema();
    },
    manterExemplo: () => { S.exemplo = false; S._exploracao = true; atualizar(); toast("Combinado!", "Os dados de exemplo continuam aqui até você apagar em Ajustes."); },
    zerar: () => confirmar("Começar do zero?", "Todos os editais, chats, recursos, documentos e portais deste navegador serão apagados. Se quiser guardar algo, exporte um backup em Ajustes antes.", "Apagar e começar", () => {
      const emp = S.exemplo ? D.vazio().empresa : S.empresa;
      S = D.vazio(); S.empresa = emp; atualizar(); location.hash = "#ajustes"; toast("Tudo pronto", "Comece pelos dados da empresa e depois cadastre os editais.");
    }),
    sair: () => confirmar("Sair do portal?", "Seus dados continuam guardados na nuvem. Para voltar, entre com seu e-mail e senha.", "Sair", async () => {
      clearTimeout(nuvem.timer);
      if (nuvem.pendente) await enviarNuvem();
      try { localStorage.removeItem(chaveLocal()); } catch (e) { /* sem armazenamento */ }
      await nuvem.cliente.auth.signOut();
      location.hash = ""; location.reload();
    }, false),
    trocarSenha: () => abrirForm({
      titulo: "Trocar a senha", tamanho: "estreito", botao: "Salvar nova senha",
      campos: [{ nome: "senha", rotulo: "Nova senha", tipo: "password", req: true, dica: "Pelo menos 8 caracteres." }, { nome: "confirmar", rotulo: "Repita a nova senha", tipo: "password", req: true }],
      validar: v => (v.senha.length < 8 ? "A senha precisa ter pelo menos 8 caracteres." : v.senha !== v.confirmar ? "As duas senhas não são iguais." : ""),
      salvar: async v => { const { error } = await nuvem.cliente.auth.updateUser({ password: v.senha }); toast(error ? "Não consegui trocar a senha" : "Senha alterada", error ? traduzirErro(error) : "Use a nova senha no próximo acesso.", error ? "crit" : ""); }
    }),
    recarregarExemplo: () => confirmar("Recarregar exemplos?", "Os dados atuais serão substituídos pelos dados de exemplo (fictícios).", "Recarregar", () => { S = D.criar(); atualizar(); toast("Dados de exemplo carregados"); }),

    novoEdital: () => formEdital(),
    editarEdital: d => formEdital(d.id),
    abrirEdital: d => abrirEdital(d.id),
    buscarResultados: () => buscarResultados(ui.resAno, true),
    atualizarConcorrencia: () => verificarConcorrencia(true),
    buscarContratos: () => buscarContratos(true),
    editarContrato: d => formContrato(d.id),
    abrirContrato: d => abrirContrato(d.id),
    garUfsTodas: () => { perfilGarimpo().ufs = ""; ui.garUfsVazio = false; salvar(); render(); toast("Brasil inteiro", "O robô vai ler os 27 estados na próxima rodada."); },
    garUfsLimpar: () => { ui.garUfsVazio = true; render(); document.querySelectorAll('[data-mudar="garUf1"]').forEach(c => { c.checked = false; }); toast("Marque os estados que quer acompanhar"); },
    procurarGarimpo: () => procurarGarimpo(),
    pararBuscaGar: () => { if (ui.buscaGar) ui.buscaGar.cancelar = true; toast("Parando a busca…"); },
    recarregarGarimpo: () => { carregarGarimpo(true); toast("Recarregando o garimpo"); },
    garimpoTriagem: d => garimpoParaTriagem(d.id),
    garimpoDescartar: async d => {
      S.apagados = (S.apagados || []).concat("gar:" + d.id).slice(-1000); salvar(); render();
      if (nuvem.cliente) { try { await nuvem.cliente.from("portal_garimpo").delete().eq("id", d.id); } catch (e) { /* fica escondido pelo "apagados" */ } }
    },
    copiarHab: async d => { const t = textoHab(edital(d.id)); if (await U.copiar(t)) toast("Lista de habilitação copiada"); else mostrarTexto("Habilitação", t); },
    exportarResultados: () => exportarResultados(),
    excluirEdital: d => { const e = edital(d.id); excluir("editais", d.id, e.numero, "edital"); },
    definirEtapa: d => moverEtapa(d.id, d.etapa),
    propCadastrada: d => {
      const e = edital(d.id); e.propostaStatus = "cadastrada";
      if (["triagem", "analise", "proposta"].includes(e.etapa)) e.etapa = "cadastrada";
      CHECK_PROPOSTA.forEach(k => { (e.checklist = e.checklist || {})[k] = true; });
      (e.historico = e.historico || []).unshift({ data: U.hojeISO(), texto: "Proposta cadastrada no portal." });
      registrar("Proposta do " + e.numero + " cadastrada no " + e.portal + ".", "propostas");
      atualizar();
      const auto = garantirMonitoramento();
      toast("Proposta cadastrada!", e.numero + " · sessão " + U.fmtDataHora(e.sessao) + (auto ? " · acompanhamento automático no e-compras.AM iniciado" : ""), "pop");
    },
    vista: d => { ui.editaisVista = d.v; gravarPref("vista", d.v); render(); },
    filtrarEtapa: d => { ui.fEd.etapa = d.etapa; if (ETAPA(d.etapa).final) ui.editaisVista = "lista"; irPara("editais"); },
    monitorarChat: d => { const e = edital(d.id); formChat(null, { titulo: e.numero, editalId: e.id, orgao: e.orgao, portal: e.portal, link: e.link, auto: e.portal === "e-compras AM", processo: e.portal === "e-compras AM" ? (e.numero.match(/(\d+)\/\d{2}(\d{2})/) || []).slice(1).join("/") : "" }); },
    importarPncp: async (d, btn) => {
      const v = $("#pncp-link").value.trim();
      if (!v) { toast("Cole o link do pregão ou do edital", "", "crit"); return; }
      btn.disabled = true; btn.textContent = "Buscando…";
      const f = $("#form-modal");
      const por = (nome, valor) => { if (valor === undefined || valor === null || valor === "" || !f.elements[nome]) return; const el = f.elements[nome]; if (el.tagName === "SELECT" && ![...el.options].some(o => o.value === valor)) return; el.value = valor; };
      const preencher = (j, origem) => {
        ["numero", "modalidade", "orgao", "municipio", "uf", "objeto", "sessao", "limiteProposta", "portal", "link", "processo", "uasg"].forEach(k => por(k, j[k]));
        if (j.valorEstimado) por("valorEstimado", Number(j.valorEstimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
        const n = ["numero", "orgao", "objeto", "sessao", "valorEstimado"].filter(k => j[k]).length;
        toast("Dados importados " + origem, n + " de 5 dados principais preenchidos" + (j.aviso ? " · " + j.aviso : "") + ". Confira antes de salvar.", n < 3 ? "pop" : "");
      };
      // Texto lido de uma página ou PDF: usa a mesma leitura da Análise de edital
      const deTexto = (texto, extra) => {
        const r = A.analisarEdital(texto, { porte: S.empresa.porte }), c = r.campos;
        ui.analise = r; ui.analiseTexto = texto; // fica disponível na Análise de edital
        return Object.assign({ numero: c.numero, modalidade: c.modalidade, orgao: c.orgao, municipio: c.municipio, uf: c.uf, objeto: c.objetoCompleto || c.objeto,
          sessao: c.sessao && c.sessao.length > 10 ? c.sessao : c.sessao ? c.sessao + "T09:00" : "", limiteProposta: c.limiteProposta && c.limiteProposta.length > 10 ? c.limiteProposta : "",
          valorEstimado: c.valorEstimado, portal: (extra && extra.portal) || c.plataforma, processo: c.processo, link: extra && extra.link,
          aviso: (r.conferencia || []).filter(x => x.nivel === "crit").map(x => x.texto).join(" ") }, {});
      };
      try {
        const j = await api("/api/importar?url=" + encodeURIComponent(v), 45000);
        ui.importChat = null;
        if (j.tipo === "dados") {
          preencher(j, j.portal === "e-compras AM" ? "do e-compras.AM" : /pncp\.gov/i.test(v) ? "do PNCP" : "(" + (j.portal || "link") + ")");
          if (j.chatAutomatico) ui.importChat = { link: j.link, situacao: j.situacao || "" };
        } else if (j.tipo === "texto") {
          preencher(deTexto(j.texto, j), "da página");
        } else if (j.tipo === "pdf") {
          btn.textContent = "Lendo o PDF…";
          const bytes = Uint8Array.from(atob(j.base64), ch => ch.charCodeAt(0));
          const arq = new File([bytes], j.nome || "edital.pdf", { type: "application/pdf" });
          const texto = await textoDoArquivo(arq, { textContent: "" });
          preencher(deTexto(texto, j), "do PDF " + (j.nome || ""));
        }
      } catch (e) { toast("Não consegui importar desse link", e.message, "crit"); }
      btn.disabled = false; btn.textContent = "Buscar dados";
    },

    novoChat: () => formChat(), editarChat: d => formChat(d.id),
    excluirChat: d => { const c = S.chats.find(x => x.id === d.id); excluir("chats", d.id, c.titulo, "monitoramento"); },
    selChat: d => { ui.chatSel = d.id; ui.chatBusca = ""; render(); },
    filtroChat: d => { ui.chatFiltro = d.f; render(); },
    colarChat: d => colarChat(d.id),
    lerTudo: d => { const c = S.chats.find(x => x.id === d.id); c.mensagens.forEach(m => { m.lida = true; }); atualizar(); },
    lerChat: d => verificarChats(d.id),
    lerTodos: () => { S.chats.forEach(c => { c.consultadoEm = null; }); ui.apiFalhouEm = 0; verificarChats(); sincronizarRobo(true); },
    sincRobo: () => sincronizarRobo(true),
    simularMsg,

    novoRecurso: d => formRecurso(null, d.edital), editarRecurso: d => formRecurso(d.id),
    excluirRecurso: d => { const r = S.recursos.find(x => x.id === d.id); excluir("recursos", d.id, r.pregao, "recurso"); },

    novoDoc: () => formDoc(), editarDoc: d => formDoc(d.id), renovarDoc: d => renovarDoc(d.id),
    excluirDoc: d => { const x = S.documentos.find(y => y.id === d.id); excluir("documentos", d.id, x.nome, "documento"); },
    filtroDoc: d => { ui.docFiltro = d.f; render(); },
    docArquivados: () => { ui.fDoc.arquivados = !ui.fDoc.arquivados; ui.docFiltro = "todos"; render(); },
    novoPortal: () => formPortal(), editarPortal: d => formPortal(d.id),
    renovarPortal: d => renovarPortal(d.id),
    filtroPortalGrupo: d => { ui.fPortal.grupo = d.f; render(); },
    excluirPortal: d => { const x = S.portais.find(y => y.id === d.id); excluir("portais", d.id, x.nome, "portal"); },

    analisar: analisarAgora,
    exemploEdital: () => { ui.analiseTexto = D.editalExemplo(); $("#texto-edital").value = ui.analiseTexto; analisarAgora(); },
    limparAnalise: () => { ui.analiseTexto = ""; ui.analise = null; render(); },
    copiarResumoEmail,
    refazerResumo: () => { atualizarResumo(); toast("Resumo refeito", "As edições manuais foram descartadas."); },
    buscarCidade: () => buscarCidade($("#resumo-cidade").value.trim(), $("#resumo-uf").value.trim()),
    copiarAnalise: async () => { const t = textoAnalise(ui.analise); if (await U.copiar(t)) toast("Resumo copiado", "Cole no e-mail, Teams ou WhatsApp."); else mostrarTexto("Resumo da análise", t); },
    criarDaAnalise: () => {
      const c = ui.analise.campos;
      formEdital(null, { numero: c.numero, modalidade: c.modalidade, orgao: c.orgao, objeto: c.objeto, sessao: c.sessao && c.sessao.length > 10 ? c.sessao : c.sessao ? c.sessao + "T09:00" : "", limiteProposta: c.limiteProposta && c.limiteProposta.length > 10 ? c.limiteProposta : "", valorEstimado: c.valorEstimado, portal: c.plataforma || "Compras.gov.br", processo: c.processo, etapa: "analise", prioridade: ui.analise.termometro.nivel === "ok" ? "alta" : "media", exigidos: ui.analise.habilitacao.filter(x => x.exigido).map(x => x.chave) });
    },

    filtroAlerta: d => { ui.alertaFiltro = d.f; render(); },
    resolverAlerta: d => { S.resolvidos[d.id] = "sempre"; atualizar(); toast("Alerta resolvido"); },
    adiarAlerta: d => { S.resolvidos[d.id] = U.addDias(U.hojeISO(), 1); atualizar(); toast("Combinado, lembro amanhã"); },
    restaurarAlertas: () => { S.resolvidos = {}; atualizar(); },
    copiarResumo: async () => { const t = resumoDoDia(); if (await U.copiar(t)) toast("Resumo do dia copiado", "Cole no grupo da equipe."); else mostrarTexto("Resumo do dia", t); },
    exportarAgenda: () => {
      const ev = eventosAgenda(365).map(x => ({ uid: U.hash(x.tipo + x.ref + x.data + x.titulo), data: x.data, titulo: x.titulo, descricao: x.sub }));
      mostrarTexto("Agenda de licitações (" + ev.length + " compromissos)", U.ics(ev, "Licitações · " + (S.empresa.apelido || "Equipe Comercial")), "licitacoes.ics", "text/calendar;charset=utf-8");
    },
    ativarNotif: async () => {
      if (!("Notification" in window)) { toast("Este navegador não tem notificações", "Os avisos continuam aparecendo aqui no portal.", "crit"); return; }
      let p = Notification.permission;
      try { if (p === "default") p = await Notification.requestPermission(); } catch (e) { p = "denied"; }
      S.ajustes.notificacoes = p === "granted";
      atualizar();
      toast(p === "granted" ? "Notificações ativadas" : "Notificações bloqueadas", p === "granted" ? "Você será avisado mesmo com o portal em outra aba." : "Libere as notificações nas configurações do navegador para este site.", p === "granted" ? "" : "crit");
    },
    testarAlerta: () => notificar("Assim chega um aviso", "PE 123/2026: o pregoeiro citou a " + apelido() + " no chat.", "pop"),
    testarApi: async () => {
      try { const j = await api("/api/chat?ping=1", 15000); toast("API conectada", j.mensagem || "Tudo certo."); }
      catch (e) { toast("API indisponível", e.message, "crit"); }
    },
    backup: () => mostrarTexto("Backup dos dados", JSON.stringify(S, null, 2), "equipe-comercial-backup-" + U.hojeISO() + ".json", "application/json")
  };

  function definirCaminho(chave, valor) {
    const [obj, campo] = chave.split(".");
    if (campo === "diasDoc") valor = String(valor).split(/[^\d]+/).map(Number).filter(n => n > 0);
    else if (["diasProposta", "diasPortal", "intervaloChat"].includes(campo)) valor = Math.max(1, Number(valor) || 1);
    S[obj][campo] = valor;
  }
  const MUDAR = {
    precoEdital: el => { ui.precoSel = el.value; ui.precoLance = ""; render(); },
    precoUnidade: el => { const it = itemPreco(el.dataset); it.unidade = el.value; if (el.value === "Hora") it.horas = 1; salvar(); render(); },
    precoCustoMO: el => { const it = itemPreco(el.dataset); it.custos[+el.dataset.k].maoDeObra = el.checked; salvar(); recalcPreco(); },
    precoRegime: el => {
      const pr = precificacaoDe(editalPreco()), iss = pr.parametros.iss;
      pr.regime = el.value; Object.assign(pr.parametros, REGIMES[el.value].v);
      if (el.value !== "simples" && pr.parametros.iss !== undefined && iss) pr.parametros.iss = iss; // mantém o ISS do município
      salvar(); render();
    },
    filtroEtapa: el => { ui.fEd.etapa = el.value; $("#ed-resultado").innerHTML = resultadoEditais(); ligarArraste(); },
    filtroPortal: el => { ui.fEd.portal = el.value; $("#ed-resultado").innerHTML = resultadoEditais(); ligarArraste(); },
    propStatus: el => {
      const e = edital(el.dataset.id); e.propostaStatus = el.value;
      if (el.value === "cadastrada") { ACOES.propCadastrada({ id: e.id }); return; }
      if (e.etapa === "triagem" || e.etapa === "analise") e.etapa = "proposta";
      atualizar();
    },
    empresaHab: el => { const e = edital(el.dataset.id); e.empresaHab = el.value; atualizar(); },
    habOk: el => { const e = edital(el.dataset.id); (e.habOk = e.habOk || {})[el.dataset.chave] = el.checked; atualizar(); },
    garimpoPerfil: el => { perfilGarimpo()[el.dataset.campo] = el.value.trim(); salvar(); toast("Perfil salvo", "O robô usa na próxima rodada (todo dia de madrugada)."); },
    garUf: el => { ui.fGar.uf = el.value; render(); },
    buscaGarUf: el => { ui.fBuscaGar.uf = el.value; },
    buscaGarMod: el => { const m = +el.dataset.mod, l = ui.fBuscaGar.mods; ui.fBuscaGar.mods = el.checked ? [...new Set(l.concat(m))] : l.filter(x => x !== m); },
    garUf1: el => {
      const sel = new Set(ufsEscolhidas(perfilGarimpo()));
      if (ui.garUfsVazio) { sel.clear(); ui.garUfsVazio = false; }
      if (el.checked) sel.add(el.dataset.uf); else sel.delete(el.dataset.uf);
      if (!sel.size) { el.checked = true; toast("Marque pelo menos um estado"); return; }
      perfilGarimpo().ufs = sel.size === UFS_BR.length ? "" : UFS_BR.map(x => x[0]).filter(u => sel.has(u)).join(", ");
      salvar(); render();
    },
    garMin: el => { ui.fGar.min = +el.value; render(); },
    checkGanho: el => { const e = edital(el.dataset.id); (e.posGanho = e.posGanho || {})[CHECK_GANHO[+el.dataset.item]] = el.checked; atualizar(); },
    resAno: el => { ui.resAno = el.value; render(); buscarResultados(el.value); },
    checkItem: el => { const e = edital(el.dataset.id); (e.checklist = e.checklist || {})[CHECK_PROPOSTA[+el.dataset.item]] = el.checked; atualizar(); },
    notasEdital: el => { const e = edital(el.dataset.id); e.notas = el.value; salvar(); toast("Anotação salva"); },
    statusRec: el => { const r = S.recursos.find(x => x.id === el.dataset.id); r.status = el.value; registrar(r.pregao + ": recurso agora está \"" + nomeLista(STATUS_REC, el.value) + "\".", "recursos"); atualizar(); },
    resumoOpcao: el => { S.ajustes[el.dataset.chave] = el.value.trim(); salvar(); atualizarResumo(); },
    filtroDocEmpresa: el => { ui.fDoc.empresa = el.value; render(); },
    importarDocs: el => importarDocs(el),
    filtroPortalEmpresa: el => { ui.fPortal.empresa = el.value; render(); },
    importarPortais: el => importarPortais(el),
    calc: () => { ui.calc = { tipo: $("#calc-tipo").value, data: $("#calc-data").value, regime: $("#calc-regime").value }; const lbl = $('label[for="calc-data"]'); if (lbl) lbl.textContent = ui.calc.tipo === "recurso" ? "Data da intimação / ata" : "Data da sessão"; $("#calc-res").innerHTML = calcHTML(); },
    ajuste: el => {
      const v = el.type === "checkbox" ? el.checked : el.value;
      if (el.dataset.chave === "ajustes.notificacoes" && v) { el.checked = false; ACOES.ativarNotif(); return; }
      definirCaminho(el.dataset.chave, v); salvar(); aplicarConfig(); atualizarNav(); toast("Ajuste salvo");
    },
    importar: async el => {
      const arq = el.files[0]; if (!arq) return;
      try {
        const dados = JSON.parse(await arq.text());
        if (!dados || !dados.versao || !Array.isArray(dados.editais)) throw new Error("O arquivo não parece um backup da Equipe Comercial.");
        confirmar("Importar backup?", "Os dados atuais deste navegador serão substituídos pelo backup <b>" + h(arq.name) + "</b> (" + U.plural(dados.editais.length, "edital", "editais") + ").", "Importar", () => {
          const base = D.vazio();
          S = Object.assign(base, dados, { empresa: Object.assign(base.empresa, dados.empresa), ajustes: Object.assign(base.ajustes, dados.ajustes) });
          atualizar(); toast("Backup importado");
        }, false);
      } catch (e) { toast("Não consegui importar", e.message, "crit"); }
      el.value = "";
    }
  };
  const DIGITAR = {
    preco: el => { const it = itemPreco(el.dataset); it[el.dataset.campo] = el.value; recalcPreco(); salvarPreco(); },
    precoCusto: el => { const it = itemPreco(el.dataset); it.custos[+el.dataset.k][el.dataset.campo] = el.value; recalcPreco(); salvarPreco(); },
    precoPar: el => { const pr = precificacaoDe(editalPreco()); pr.parametros[el.dataset.chave] = el.value; recalcPreco(); salvarPreco(); },
    precoLance: el => { ui.precoLance = el.value; const e = editalPreco(); const r = $("#preco-lance-res"); if (e && e.precificacao && r) r.textContent = simulaLance(P.calcular(e.precificacao)); },
    garBusca: el => { ui.fGar.busca = el.value; render(); const i = $('[data-digitar="garBusca"]'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } },
    buscaEd: el => { ui.fEd.busca = el.value; const g = $("#busca-global"); if (g) g.value = el.value; $("#ed-resultado").innerHTML = resultadoEditais(); ligarArraste(); },
    buscaDoc: el => { ui.fDoc.busca = el.value; render(); const i = $("#f-busca-doc"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } },
    buscaPortal: el => { ui.fPortal.busca = el.value; $("#lista-portais").innerHTML = listaPortaisHTML(); },
    buscaChat: el => { ui.chatBusca = el.value; const c = S.chats.find(x => x.id === ui.chatSel); if (c) $("#msgs").innerHTML = mensagensHTML(c); }
  };

  document.addEventListener("click", ev => {
    const b = ev.target.closest("[data-acao]");
    if (!b) return;
    const fn = ACOES[b.dataset.acao];
    if (!fn) return;
    if (b.tagName === "A" && (ev.ctrlKey || ev.metaKey)) return;
    ev.preventDefault();
    fn(b.dataset, b, ev);
  });
  document.addEventListener("keydown", ev => {
    if (ev.key === "Escape") { if (!$("#modal").hidden) fecharModal(); fecharMenu(); }
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches && ev.target.matches("tr[data-acao],[role=button][data-acao]")) { ev.preventDefault(); ACOES[ev.target.dataset.acao](ev.target.dataset, ev.target, ev); }
  });
  document.addEventListener("change", ev => { const el = ev.target.closest("[data-mudar]"); if (el && MUDAR[el.dataset.mudar]) MUDAR[el.dataset.mudar](el, ev); });
  document.addEventListener("input", ev => { const el = ev.target.closest("[data-digitar]"); if (el && DIGITAR[el.dataset.digitar]) DIGITAR[el.dataset.digitar](el, ev); });
  $("#busca-global").addEventListener("input", ev => {
    ui.fEd.busca = ev.target.value;
    if (rotaAtual() === "editais") { const f = $("#f-busca-ed"); if (f) f.value = ev.target.value; $("#ed-resultado").innerHTML = resultadoEditais(); ligarArraste(); }
  });
  $("#busca-global").addEventListener("keydown", ev => { if (ev.key === "Enter") { ui.fEd.etapa = ""; irPara("editais"); } });
  window.addEventListener("hashchange", () => { fecharMenu(); if (!$("#modal").hidden && !ui.abrirApos) fecharModal(); render(); window.scrollTo(0, 0); });

  function iconeTema() {
    const raiz = document.documentElement;
    const escuro = raiz.dataset.theme ? raiz.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    $("#tema-ico").setAttribute("href", escuro ? "#i-sol" : "#i-lua");
  }

  /* =================================================================
     Login e nuvem (Supabase)
     ================================================================= */
  function textoNuvem() {
    if (!nuvem.usuario) return S.exemplo ? "Dados de exemplo (fictícios)" : "Dados salvos neste navegador";
    if (nuvem.status === "erro") return "Sem conexão com a nuvem: salvo neste navegador";
    if (nuvem.pendente || nuvem.enviando) return "Salvando na nuvem…";
    if (!nuvem.salvoEm) return "Salvo na nuvem";
    return "Salvo na nuvem " + (Date.now() - nuvem.salvoEm < 60000 ? "agora" : U.desde(U.isoDataHora(new Date(nuvem.salvoEm))));
  }
  function atualizarStatusNuvem() { const el = $("#side-nuvem"); if (el) el.textContent = textoNuvem(); }
  function agendarNuvem() {
    if (JSON.stringify(S) === nuvem.ultimoEnviado) return;
    nuvem.pendente = true;
    clearTimeout(nuvem.timer);
    nuvem.timer = setTimeout(enviarNuvem, 1500);
    atualizarStatusNuvem();
  }
  /* Junta a versão deste navegador com uma versão mais nova da nuvem (outro computador, ou dados carregados
     pelo Claude). Itens são unidos pelo id; o que foi excluído aqui não volta; mensagens de chat são unidas. */
  const LISTAS = ["editais", "recursos", "documentos", "portais", "chats", "suspensos"];
  function mesclarEstados(local, remoto) {
    const apagados = new Set([].concat(local.apagados || [], remoto.apagados || []));
    const r = normalizar(remoto), out = Object.assign({}, local);
    LISTAS.forEach(k => {
      const meus = (local[k] || []).filter(x => !apagados.has(x.id));
      const ids = new Map(meus.map(x => [x.id, x]));
      (r[k] || []).forEach(x => {
        if (apagados.has(x.id)) return;
        const m = ids.get(x.id);
        if (!m) { meus.push(x); return; }
        // Mesmo item dos dois lados: completa os campos que estão vazios aqui (ex.: edital vinculado ao chat)
        Object.keys(x).forEach(c => { if (c !== "mensagens" && (m[c] === undefined || m[c] === null || m[c] === "") && x[c] !== undefined && x[c] !== null && x[c] !== "") m[c] = x[c]; });
        if (k === "chats") { // une as mensagens dos dois lados
          const vistas = new Map((m.mensagens || []).map(msg => [A.chaveMensagem(msg), msg]));
          (x.mensagens || []).forEach(msg => { const c = A.chaveMensagem(msg); if (!vistas.has(c)) vistas.set(c, msg); else if (msg.lida) vistas.get(c).lida = true; });
          m.mensagens = [...vistas.values()].sort((a, b) => (a.hora < b.hora ? -1 : a.hora > b.hora ? 1 : 0));
        }
      });
      out[k] = meus;
    });
    const atv = new Map([].concat(local.atividade || [], r.atividade || []).map(a => [a.quando + "|" + a.texto, a]));
    out.atividade = [...atv.values()].sort((a, b) => String(b.quando).localeCompare(String(a.quando))).slice(0, 80);
    out.resolvidos = Object.assign({}, r.resolvidos || {}, local.resolvidos || {});
    // controle dos contratos: junta por contrato (o que foi preenchido em outro computador não se perde)
    out.contratosInfo = Object.assign({}, r.contratosInfo || {}, local.contratosInfo || {});
    out.apagados = [...apagados].slice(-1000);
    return out;
  }
  async function enviarNuvem() {
    if (!nuvem.usuario) return;
    if (nuvem.enviando) { clearTimeout(nuvem.timer); nuvem.timer = setTimeout(enviarNuvem, 1500); return; }
    nuvem.enviando = true;
    // Alguém salvou na nuvem depois da nossa última leitura? Junta antes de gravar, para não apagar o trabalho do outro.
    try {
      const v = await nuvem.cliente.from("portal_estado").select("atualizado_em").maybeSingle();
      if (v.data && nuvem.remotoEm && v.data.atualizado_em > nuvem.remotoEm) {
        const rr = await nuvem.cliente.from("portal_estado").select("dados, atualizado_em").maybeSingle();
        if (rr.data) {
          const antes = { d: S.documentos.length, p: S.portais.length, e: S.editais.length };
          S = mesclarEstados(S, rr.data.dados);
          U.gravar(chaveLocal(), S); aplicarConfig();
          if (S.documentos.length !== antes.d || S.portais.length !== antes.p || S.editais.length !== antes.e) { renderSeLivre(); toast("Dados juntados", "Havia alterações feitas em outro lugar; nada foi perdido."); }
        }
      }
    } catch (e) { /* segue com a gravação normal */ }
    const json = JSON.stringify(S);
    let r;
    try { r = await nuvem.cliente.from("portal_estado").upsert({ user_id: nuvem.usuario.id, dados: JSON.parse(json) }).select("atualizado_em").single(); }
    catch (e) { r = { error: e }; }
    nuvem.enviando = false;
    if (r.error) {
      nuvem.status = "erro"; nuvem.erro = r.error.message || String(r.error);
      clearTimeout(nuvem.timer); nuvem.timer = setTimeout(enviarNuvem, 30000);
    } else {
      nuvem.status = "ok"; nuvem.ultimoEnviado = json; nuvem.remotoEm = r.data.atualizado_em; nuvem.salvoEm = Date.now();
      nuvem.pendente = JSON.stringify(S) !== json;
      if (nuvem.pendente) agendarNuvem();
    }
    atualizarStatusNuvem();
  }
  // Traz alterações feitas em outro computador (quando não há nada pendente aqui)
  async function puxarNuvem() {
    if (!nuvem.usuario || nuvem.pendente || nuvem.enviando) return;
    try {
      const v = await nuvem.cliente.from("portal_estado").select("atualizado_em").maybeSingle();
      if (v.error || !v.data || (nuvem.remotoEm && v.data.atualizado_em <= nuvem.remotoEm)) return;
      const r = await nuvem.cliente.from("portal_estado").select("dados, atualizado_em").maybeSingle();
      if (r.error || !r.data || nuvem.pendente) return;
      S = normalizar(r.data.dados); nuvem.remotoEm = r.data.atualizado_em; nuvem.ultimoEnviado = JSON.stringify(S);
      U.gravar(chaveLocal(), S); aplicarConfig(); renderSeLivre();
      toast("Dados atualizados", "Chegaram alterações feitas em outro computador.");
    } catch (e) { /* tenta na próxima */ }
  }
  function traduzirErro(e) {
    const m = String((e && (e.message || e.msg)) || e);
    if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
    if (/não autorizado|nao autorizado|database error|saving new user|unexpected_failure/i.test(m)) return "Este e-mail não está autorizado a usar o portal.";
    if (/already registered|already been registered|already exists/i.test(m)) return "Este e-mail já tem conta. Use a opção Entrar.";
    if (/rate limit|too many|security purposes/i.test(m)) return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
    if (/password should|weak password|weak_password/i.test(m)) return "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
    if (/same.*password|different from the old/i.test(m)) return "A nova senha precisa ser diferente da atual.";
    if (/failed to fetch|network|load failed/i.test(m)) return "Sem conexão com o servidor de login. Confira a internet.";
    return "Não deu certo: " + m;
  }
  const ENTRADA = {
    entrar: ["Entrar", "Use o e-mail e a senha do portal.", "Entrar"],
    criar: ["Primeiro acesso", "Crie a sua senha. Só e-mails autorizados conseguem criar conta.", "Criar senha e entrar"],
    esqueci: ["Esqueci a senha", "Enviamos um link para você criar uma senha nova.", "Enviar link"],
    nova: ["Nova senha", "Escolha a nova senha de acesso.", "Salvar nova senha"]
  };
  function cascaEntrada(conteudo) {
    nuvem.bloqueado = true;
    document.body.classList.add("trancado");
    let el = $("#entrada");
    if (!el) { el = document.createElement("div"); el.id = "entrada"; document.body.insertBefore(el, document.body.firstChild); }
    el.innerHTML = '<div class="entrada-marca"><span class="marca-logo"><svg viewBox="0 0 24 24"><path d="M4 12.5 9 17.5 20 6.5"/><path d="M14 17.5h6"/></svg></span>' +
      "<h1>Equipe Comercial</h1><p>Editais, propostas, chats dos pregões e prazos num lugar só.</p>" +
      "<ul><li>Chat do e-compras lido a cada 5 minutos</li><li>Prazos de recurso em dias úteis, com feriados</li><li>Certidões e portais sempre em dia</li></ul></div>" +
      '<div class="entrada-lado">' + conteudo + "</div>";
    return el;
  }
  function telaEntrada(modo, aviso, ok) {
    modo = modo || "entrar";
    const t = ENTRADA[modo];
    const campo = (id, rot, tipo, extra) => '<div class="campo"><label for="' + id + '">' + rot + '</label><input id="' + id + '" name="' + id.replace("e-", "") + '" type="' + tipo + '" ' + (extra || "") + "></div>";
    cascaEntrada('<form class="entrada-form" id="form-entrada" novalidate><h2>' + t[0] + '</h2><p class="muted">' + t[1] + "</p>" +
      (modo !== "nova" ? campo("e-email", "E-mail", "email", 'autocomplete="username" required') : "") +
      (modo !== "esqueci" ? campo("e-senha", modo === "entrar" ? "Senha" : "Nova senha", "password", 'autocomplete="' + (modo === "entrar" ? "current-password" : "new-password") + '" required') : "") +
      (modo === "criar" || modo === "nova" ? campo("e-confirmar", "Repita a senha", "password", 'autocomplete="new-password" required') : "") +
      '<p class="entrada-msg' + (ok ? " ok" : "") + '" id="entrada-msg" role="alert">' + h(aviso || "") + "</p>" +
      '<button class="btn primario" type="submit" id="entrada-btn">' + t[2] + "</button>" +
      '<div class="entrada-links">' + (modo === "entrar" ? '<button type="button" class="link-btn" data-modo="criar">Primeiro acesso? Criar senha</button><button type="button" class="link-btn" data-modo="esqueci">Esqueci a senha</button>'
        : modo === "nova" ? "" : '<button type="button" class="link-btn" data-modo="entrar">Voltar para Entrar</button>') + "</div></form>");
    const form = $("#form-entrada");
    $$("[data-modo]", form).forEach(b => b.addEventListener("click", () => { const em = form.elements.email ? form.elements.email.value : ""; telaEntrada(b.dataset.modo); if (em && $("#e-email")) $("#e-email").value = em; }));
    form.addEventListener("submit", ev => { ev.preventDefault(); enviarEntrada(modo, form); });
    const f = $("input", form); if (f) f.focus();
  }
  async function enviarEntrada(modo, form) {
    const msg = (texto, ok) => { const m = $("#entrada-msg"); m.textContent = texto; m.classList.toggle("ok", !!ok); };
    const email = form.elements.email ? form.elements.email.value.trim().toLowerCase() : "";
    const senha = form.elements.senha ? form.elements.senha.value : "";
    const conf = form.elements.confirmar ? form.elements.confirmar.value : "";
    if (modo !== "nova" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg("Digite um e-mail válido.");
    if (modo === "entrar" && !senha) return msg("Digite a senha.");
    if ((modo === "criar" || modo === "nova") && senha.length < 8) return msg("A senha precisa ter pelo menos 8 caracteres.");
    if ((modo === "criar" || modo === "nova") && senha !== conf) return msg("As duas senhas não são iguais.");
    const btn = $("#entrada-btn"); btn.disabled = true; btn.textContent = "Aguarde…"; msg("");
    const auth = nuvem.cliente.auth;
    let r;
    try {
      if (modo === "entrar") r = await auth.signInWithPassword({ email, password: senha });
      else if (modo === "criar") r = await auth.signUp({ email, password: senha });
      else if (modo === "esqueci") r = await auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      else r = await auth.updateUser({ password: senha });
    } catch (e) { r = { error: e }; }
    btn.disabled = false; btn.textContent = ENTRADA[modo][2];
    if (r.error) return msg(traduzirErro(r.error));
    if (modo === "esqueci") return msg("Se o e-mail estiver cadastrado, o link chega em alguns minutos. Confira também a caixa de spam.", true);
    if (modo === "nova") { nuvem.recuperando = false; history.replaceState(null, "", location.pathname + "#painel"); }
    const sessao = (r.data && r.data.session) || (await auth.getSession()).data.session;
    if (!sessao) return telaEntrada("entrar", "Conta criada. Agora entre com o e-mail e a senha.", true);
    await entrarComSessao(sessao);
    if (modo === "nova") toast("Senha alterada", "Use a nova senha nos próximos acessos.");
  }
  async function entrarComSessao(sessao) {
    nuvem.usuario = sessao.user;
    let r;
    try { r = await nuvem.cliente.from("portal_estado").select("dados, atualizado_em").maybeSingle(); } catch (e) { r = { error: e }; }
    if (r.error) {
      const cache = U.ler(chaveLocal(), null);
      if (cache && cache.versao) { S = normalizar(cache); nuvem.status = "erro"; abrirPortal(); toast("Sem conexão com a nuvem", "Mostrando a última cópia salva neste navegador.", "crit"); return; }
      nuvem.usuario = null;
      return telaEntrada("entrar", "Não consegui carregar seus dados agora. Confira a internet e tente de novo.");
    }
    if (r.data) {
      S = normalizar(r.data.dados); nuvem.remotoEm = r.data.atualizado_em; nuvem.ultimoEnviado = JSON.stringify(S); nuvem.status = "ok"; nuvem.salvoEm = Date.now();
      return abrirPortal();
    }
    escolherInicio();
  }
  // Primeiro login: de onde vêm os dados
  function escolherInicio() {
    const local = U.ler(CHAVE, null);
    const n = local && local.versao ? (local.editais || []).length + (local.chats || []).length + (local.documentos || []).length + (local.recursos || []).length : 0;
    const opcao = (id, titulo, texto) => '<button type="button" class="opcao-inicio" data-inicio="' + id + '"><b>' + titulo + "</b><span>" + texto + "</span></button>";
    cascaEntrada('<div class="entrada-form"><h2>Tudo pronto!</h2><p class="muted">Sua conta foi criada. Como você quer começar?</p>' +
      (n ? opcao("local", "Levar os dados deste navegador", U.plural((local.editais || []).length, "edital", "editais") + ", " + U.plural((local.chats || []).length, "chat", "chats") + " e " + U.plural((local.documentos || []).length, "documento", "documentos") + (local.exemplo ? " (são os dados de exemplo)" : "") + ".") : "") +
      opcao("vazio", "Começar com o portal vazio", "Cadastre seus editais, documentos e portais do zero.") +
      opcao("exemplo", "Explorar com dados de exemplo", "Dados fictícios para conhecer o portal. Dá para apagar depois em Ajustes.") + "</div>");
    $$("[data-inicio]").forEach(b => b.addEventListener("click", () => {
      const k = b.dataset.inicio;
      S = k === "local" ? normalizar(local) : k === "exemplo" ? D.criar() : D.vazio();
      abrirPortal();
      if (k === "vazio") location.hash = "#ajustes";
      toast("Bem-vinda à Equipe Comercial!", "Seus dados agora ficam salvos na nuvem.");
    }));
  }
  let rotinasLigadas = false;
  function abrirPortal() {
    nuvem.bloqueado = false;
    document.body.classList.remove("trancado");
    const el = $("#entrada"); if (el) el.remove();
    aplicarConfig(); render(); salvar(); ligarRotinas();
  }

  /* =================================================================
     Início
     ================================================================= */
  function ligarRotinas() {
    if (rotinasLigadas) return;
    rotinasLigadas = true;
    // Aviso de abertura: um resumo só dos alertas críticos, uma vez por dia
    setTimeout(() => {
      const criticos = gerarAlertas().filter(a => a.nivel === "critico");
      if (criticos.length && lerPref("avisado", "") !== U.hojeISO()) {
        gravarPref("avisado", U.hojeISO());
        toast(U.plural(criticos.length, "alerta crítico", "alertas críticos") + " hoje", criticos.slice(0, 2).map(a => a.titulo).join(" · "), "pop", { rotulo: "Ver alertas", rota: "alertas" });
      }
      garantirMonitoramento();
      garantirSuspensos();
      verificarChats();
      setTimeout(() => verificarSuspensos(), 5000);
      setTimeout(() => buscarResultados(), 9000);
      setTimeout(() => verificarConcorrencia(), 15000);
      setTimeout(() => buscarContratos(), 20000);
      sincronizarRobo();
    }, 900);
    // A cada minuto: atualiza contadores, lê chats automáticos e redesenha telas sem formulário aberto
    let minuto = 0;
    setInterval(() => {
      minuto++;
      if (minuto % 5 === 0) { garantirMonitoramento(); garantirSuspensos(); verificarSuspensos(); buscarResultados(); }
      if (minuto % 30 === 0) { verificarConcorrencia(); buscarContratos(); }
      verificarChats();
      sincronizarRobo();
      if (minuto % 2 === 0) puxarNuvem();
      if (["painel", "alertas", "propostas"].includes(rotaAtual())) renderSeLivre(); else atualizarNav();
      atualizarStatusNuvem();
    }, 60000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") puxarNuvem(); });
  }

  async function iniciar() {
    const temaSalvo = lerPref("tema", "");
    if (temaSalvo) document.documentElement.dataset.theme = temaSalvo;
    iconeTema();
    if (!CFG.supabaseUrl) { aplicarConfig(); render(); salvar(); ligarRotinas(); return; }
    nuvem.bloqueado = true;
    document.body.classList.add("trancado");
    if (!window.supabase || !window.supabase.createClient) { cascaEntrada('<div class="entrada-form"><h2>Não consegui abrir o login</h2><p class="muted">Confira a internet e recarregue a página.</p><button class="btn primario" onclick="location.reload()">Recarregar</button></div>'); return; }
    const recuperacao = /type=recovery/.test(location.hash);
    nuvem.cliente = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseChave, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "pregao-em-dia-login" } });
    nuvem.cliente.auth.onAuthStateChange(ev => { if (ev === "PASSWORD_RECOVERY") { nuvem.recuperando = true; telaEntrada("nova"); } });
    const { data } = await nuvem.cliente.auth.getSession();
    if (recuperacao || nuvem.recuperando) return telaEntrada("nova");
    if (data && data.session) await entrarComSessao(data.session);
    else telaEntrada("entrar");
  }
  iniciar();
})();
