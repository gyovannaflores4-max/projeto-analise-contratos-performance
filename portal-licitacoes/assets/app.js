/* Pregão em Dia | aplicação
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
  function carregar() {
    const s = U.ler(CHAVE, null);
    if (s && s.versao) {
      const base = D.vazio();
      return Object.assign(base, s, { empresa: Object.assign(base.empresa, s.empresa), ajustes: Object.assign(base.ajustes, s.ajustes) });
    }
    return D.criar();
  }
  function aplicarConfig() {
    U.config.pontosFacultativos = !!S.ajustes.pontosFacultativos;
    U.config.feriadosLocais = U.lerFeriadosLocais(S.ajustes.feriadosLocais);
    U.limparCacheFeriados();
    termos = A.termosEmpresa(S.empresa);
    cacheMsg = new WeakMap();
  }
  function salvar() { U.gravar(CHAVE, S); }
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
      if (["triagem", "analise", "proposta"].includes(e.etapa) && e.sessao) {
        const imp = U.subtrairDiasUteis(e.sessao, 3), n = U.diasAte(imp);
        if (n >= 0 && n <= 3) add({ id: "imp:" + e.id + ":" + imp, tipo: "impugnacao", icone: "recursos", nivel: n === 0 ? "atencao" : "info", quando: imp,
          titulo: "Último dia para impugnar ou pedir esclarecimento: " + e.numero, detalhe: "Até " + U.fmtData(imp) + " (3 dias úteis antes da sessão)", rota: "editais", ref: e.id });
      }
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
    S.documentos.forEach(d => {
      const s = situacaoDoc(d);
      if (s.cls !== "crit" && s.cls !== "warn") return;
      const afeta = sessaoAfetada(d.validade);
      add({ id: "doc:" + d.id + ":" + d.validade, tipo: "documento", icone: "documentos", quando: d.validade,
        nivel: s.dias < 0 || s.dias <= L.menor ? "critico" : s.dias <= Math.round(L.maior / 2) ? "atencao" : "info",
        titulo: (s.dias < 0 ? "Documento vencido: " : "Renovar documento: ") + d.nome,
        detalhe: s.rotulo + (afeta ? " · antes da sessão do " + afeta.numero : ""), rota: "documentos", ref: d.id });
    });
    S.portais.forEach(p => {
      [["validadeCadastro", "Cadastro"], ["validadePlano", "Plano/mensalidade"]].forEach(([campo, rot]) => {
        const s = situacaoPortal(p[campo]);
        if (s.cls !== "crit" && s.cls !== "warn") return;
        add({ id: "portal:" + p.id + ":" + campo + ":" + p[campo], tipo: "portal", icone: "portais", quando: p[campo],
          nivel: s.dias < 0 || s.dias <= 7 ? "critico" : "atencao", titulo: rot + " no " + p.nome + (s.dias < 0 ? " vencido" : " vencendo"), detalhe: s.rotulo, rota: "portais", ref: p.id });
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
    S.documentos.forEach(d => { if (dentro(d.validade)) ev.push({ data: d.validade, tipo: "documento", titulo: "Vence: " + d.nome, sub: d.emissor || "Documento", rota: "documentos", ref: d.id }); });
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
    else inp = '<input id="' + id + '" name="' + f.nome + '" type="' + ({ datetime: "datetime-local", date: "date", url: "url", number: "number" }[f.tipo] || "text") + '" value="' + h(val) + '" placeholder="' + h(f.ph || "") + '"' + (f.tipo === "number" ? ' min="0" step="1"' : "") + ">";
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
    const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), ms || 30000);
    try {
      const r = await fetch((S.ajustes.apiBase || "").replace(/\/+$/, "") + caminho, { signal: ctrl.signal, headers: { accept: "application/json" } });
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

  async function verificarChats(soEste) {
    const lista = S.chats.filter(c => c.auto && c.processo && (!soEste || c.id === soEste));
    if (!lista.length) return;
    if (!soEste && Date.now() - ui.apiFalhouEm < 10 * 60000) return;
    const intervalo = Math.max(2, +S.ajustes.intervaloChat || 5) * 60000;
    let mudou = false;
    for (const c of lista) {
      if (!soEste && c.consultadoEm && Date.now() - new Date(c.consultadoEm).getTime() < intervalo) continue;
      ui.lendo[c.id] = true;
      if (soEste) render();
      try {
        mesclarChat(c, await api("/api/chat?" + consultaChat(c.processo)));
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
        || S.chats.find(x => (x.portal === "e-compras AM" || x.robo) && numAno(x.titulo) && numAno(x.titulo) === numAno(p.edital));
      if (!c) {
        c = { id: "robo-" + ident, titulo: p.edital, orgao: "", portal: "e-compras AM", status: "", processo: p.link, link: p.link, auto: false, mensagens: [] };
        S.chats.push(c);
        registrar("Chat do " + p.edital + " trazido do robô do GitHub.", "chats");
        novos++;
      }
      c.ident = ident; c.robo = true; c.roboEm = dados.atualizado_em || null; c.roboOrigem = origem;
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
      const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 20000);
      const r = await fetch(url + (url.includes("?") ? "&" : "?") + "t=" + Math.floor(Date.now() / 60000), { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(t);
      if (!r.ok) throw new Error("O arquivo do robô respondeu com erro " + r.status + ".");
      dados = await r.json();
      ui.roboErro = "";
    } catch (e) {
      ui.roboErro = e.name === "AbortError" ? "O GitHub demorou para responder." : e.message === "sem endereço" ? "" : "Não consegui ler o arquivo do robô neste endereço.";
      // Versão publicada no Claude: o navegador bloqueia acesso externo; usa a cópia embutida na publicação.
      if (window.ROBO_FOTO && !ui.fotoAplicada) { dados = window.ROBO_FOTO; origem = "cópia de " + U.fmtDataHora(U.isoDataHora(new Date(dados.atualizado_em))); ui.fotoAplicada = true; }
    }
    if (dados) {
      const novos = aplicarRobo(dados, origem);
      salvar();
      if (forcar) toast("Chats sincronizados com o robô", novos ? U.plural(novos, "pregão novo", "pregões novos") + " na lista." : "Mensagens atualizadas.");
      if (["chats", "painel", "alertas"].includes(rotaAtual())) renderSeLivre(); else atualizarNav();
    } else if (forcar) toast("Não consegui ler o arquivo do robô", ui.roboErro || "Confira o endereço em Ajustes → Integrações.", "crit");
  }

  // "408/26" -> processo=408/26; link de acompanhamento ou número interno -> ident=256066
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
    }
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

    const prioridades = al.filter(a => a.nivel !== "info").slice(0, 6);
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
      '<section class="card"><div class="card-h"><h2>Prioridades de agora</h2><span class="muted">' + U.plural(al.length, "alerta ativo", "alertas ativos") + "</span></div>" +
      (prioridades.length ? '<div class="alertas">' + prioridades.map(a => alertaHTML(a)).join("") + "</div>" : vazio("check", "Nada urgente. Tudo em dia!")) + "</section>" +
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
      '<select id="f-portal" data-mudar="filtroPortal" aria-label="Filtrar por portal"><option value="">Todos os portais</option>' + PORTAIS.map(p => '<option' + (ui.fEd.portal === p ? " selected" : "") + ">" + h(p) + "</option>").join("") + "</select>" +
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

      '<div class="bloco"><h3>Etapa</h3><div class="etapas">' + ETAPAS.map(x => '<button data-acao="definirEtapa" data-id="' + e.id + '" data-etapa="' + x.id + '" aria-pressed="' + (x.id === e.etapa) + '">' + h(x.curto || x.nome) + "</button>").join("") + "</div></div>" +

      '<div class="bloco"><h3>Proposta</h3><div class="ferramentas"><select data-mudar="propStatus" data-id="' + e.id + '" aria-label="Situação da proposta">' + PROP_STATUS.map(p => '<option value="' + p[0] + '"' + (p[0] === e.propostaStatus ? " selected" : "") + ">" + p[1] + "</option>").join("") + "</select>" +
      '<span class="muted" style="font-size:13px">' + progresso(e) + " de " + CHECK_PROPOSTA.length + ' itens prontos</span></div><div class="progresso"><i style="width:' + Math.round(100 * progresso(e) / CHECK_PROPOSTA.length) + '%"></i></div>' + checklistHTML(e) + "</div>" +

      '<div class="bloco"><h3>Atalhos</h3><div class="linha-acoes">' +
      (e.link ? '<a class="btn peq ghost" href="' + h(e.link) + '" target="_blank" rel="noopener">' + ic("link") + "Abrir no portal</a>" : "") +
      (chat ? '<a class="btn peq ghost" href="#chats" data-acao="ir" data-rota="chats" data-ref="' + chat.id + '">' + ic("chats") + "Ver chat" + (naoLidas(chat).length ? " (" + naoLidas(chat).length + " novas)" : "") + "</a>" : '<button class="btn peq ghost" data-acao="monitorarChat" data-id="' + e.id + '">' + ic("chats") + "Monitorar chat</button>") +
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
  const TOPO_PNCP = '<div class="importar"><label for="pncp-link">Importar do PNCP</label><div class="linha"><input id="pncp-link" placeholder="Cole o link do edital no PNCP (pncp.gov.br/app/editais/…)"><button type="button" class="btn primario peq" data-acao="importarPncp">Buscar dados</button></div><small>Preenche órgão, objeto, datas, valor e portal sozinho. Funciona com o portal publicado na Vercel.</small></div>';
  function formEdital(id, preset) {
    const e = id ? edital(id) : null;
    abrirForm({
      titulo: e ? "Editar " + h(e.numero) : "Novo edital", tamanho: "largo", topo: e ? "" : TOPO_PNCP, campos: camposEdital(),
      valores: e || Object.assign({ modalidade: "Pregão eletrônico", portal: "Compras.gov.br", etapa: "triagem", propostaStatus: "nao_iniciada", prioridade: "media", responsavel: "" }, preset || {}),
      salvar: v => {
        if (e) { Object.assign(e, v); (e.historico = e.historico || []).unshift({ data: U.hojeISO(), texto: "Dados do edital atualizados." }); }
        else {
          const novo = Object.assign({ id: U.uid(), checklist: {}, notas: "", criadoEm: U.hojeISO(), historico: [{ data: U.hojeISO(), texto: "Edital cadastrado no portal." }] }, v);
          S.editais.push(novo);
          registrar("Novo edital cadastrado: " + novo.numero + ".", "editais");
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
      '<div class="linha-acoes"><button class="btn peq primario" data-acao="propCadastrada" data-id="' + e.id + '">' + ic("check") + 'Cadastrada no portal</button><button class="btn peq ghost" data-acao="abrirEdital" data-id="' + e.id + '">Detalhes</button>' + (e.link ? '<a class="btn peq ghost" href="' + h(e.link) + '" target="_blank" rel="noopener">' + ic("link") + "Portal</a>" : "") + "</div></div></article>";
  }

  /* ---------- Análise de edital ---------- */
  function pgAnalise() {
    const r = ui.analise;
    return '<div class="cab"><div><span class="eyebrow">Análise e jurídico</span><h1>Análise de edital</h1><p>Cole o texto ou envie o PDF. O portal lê o edital no seu navegador, separa os dados principais, confere a habilitação com a sua pasta de documentos e aponta exigências que merecem atenção.</p></div></div>' +
      '<div class="analise"><section class="card entrada"><div class="card-h"><h2>Edital</h2><button class="link-btn" data-acao="exemploEdital">Usar edital de exemplo</button></div>' +
      '<label class="soltar" id="soltar">' + ic("upload") + '<span><b>Arraste o PDF ou TXT aqui</b> ou <span class="link-btn">escolha o arquivo</span><br><small class="muted">O arquivo não sai do seu computador.</small></span><input type="file" id="arquivo-edital" accept=".pdf,.txt,application/pdf,text/plain" class="sr"></label>' +
      '<label class="sr" for="texto-edital">Texto do edital</label><textarea id="texto-edital" placeholder="…ou cole aqui o texto do edital (Ctrl+V)">' + h(ui.analiseTexto) + "</textarea>" +
      '<div class="linha-acoes" style="margin-top:12px"><button class="btn primario" data-acao="analisar">' + ic("analise") + 'Analisar edital</button><button class="btn ghost" data-acao="limparAnalise">Limpar</button><span class="muted" id="status-analise" style="font-size:13px"></span></div></section>' +
      '<div class="pilha" id="resultado-analise">' + (r ? resultadoAnalise(r) : '<section class="card">' + vazio("analise", "O resultado aparece aqui: dados do certame, prazos de impugnação, checklist de habilitação e pontos de atenção.") + "</section>") + "</div></div>";
  }
  function resultadoAnalise(r) {
    const c = r.campos, t = r.termometro;
    const niveis = t.nivel === "ok" ? 1 : t.nivel === "medio" ? 2 : 3;
    const dado = (rot, v, largo) => '<div class="' + (largo ? "largo" : "") + '"><dt>' + rot + "</dt><dd" + (v ? "" : ' class="vazio-dd"') + ">" + (v || "não encontrado") + "</dd></div>";
    const sessaoData = c.sessao ? U.soData(c.sessao) : U.hojeISO();
    const exigidos = r.habilitacao.filter(x => x.exigido);
    const pasta = exigidos.map(x => {
      if (x.chave === "declaracoes" || x.chave === "responsavel_tecnico") return Object.assign({ st: "neutral", rot: "Preparar para este edital" }, x);
      const docs = S.documentos.filter(d => d.tipo === x.chave);
      if (!docs.length) return Object.assign({ st: "warn", rot: "Não está na pasta" }, x);
      const valido = docs.find(d => !d.validade || d.validade >= sessaoData);
      if (valido) return Object.assign({ st: "ok", rot: valido.validade ? "Válido na sessão (até " + U.fmtData(valido.validade) + ")" : "Na pasta" }, x);
      return Object.assign({ st: "crit", rot: "Vence antes da sessão (" + U.fmtData(docs[0].validade) + ")" }, x);
    });
    const okCount = pasta.filter(x => x.st === "ok").length;
    return '<section class="termometro ' + t.nivel + '"><div class="escala" aria-hidden="true"><i style="height:18px" class="' + (niveis >= 1 ? "on" : "") + '"></i><i style="height:28px" class="' + (niveis >= 2 ? "on" : "") + '"></i><i style="height:38px" class="' + (niveis >= 3 ? "on" : "") + '"></i></div>' +
      "<div><span class=\"eyebrow\" style=\"color:inherit;opacity:.7\">Termômetro do edital</span><h3>" + t.rotulo + "</h3><p>" + t.texto + "</p></div></section>" +
      '<section class="card"><div class="card-h"><h2>Dados do certame</h2><div class="linha-acoes"><button class="btn peq ghost" data-acao="copiarAnalise">' + ic("copiar") + 'Copiar resumo</button><button class="btn peq primario" data-acao="criarDaAnalise">' + ic("mais") + "Criar edital</button></div></div>" +
      '<dl class="dados">' + dado("Número", h(c.numero)) + dado("Modalidade", h(c.modalidade)) + dado("Órgão", h(c.orgao), true) + dado("Objeto", h(c.objeto), true) +
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
    $("#resultado-analise").innerHTML = resultadoAnalise(ui.analise);
    toast("Edital analisado", ui.analise.preenchidos + " de 7 dados principais encontrados · " + U.plural(ui.analise.riscos.length, "ponto de atenção", "pontos de atenção"));
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
  async function lerArquivo(arq) {
    const st = $("#status-analise");
    if (!arq) return;
    try {
      if (/\.txt$/i.test(arq.name) || arq.type === "text/plain") { $("#texto-edital").value = await arq.text(); }
      else {
        st.textContent = "Lendo o PDF…";
        const base = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
        await carregarScript(base + "pdf.min.js");
        await carregarScript(base + "pdf.worker.min.js"); // roda o leitor na própria página
        const pdfjs = window.pdfjsLib;
        pdfjs.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.js";
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await arq.arrayBuffer()), isEvalSupported: false }).promise;
        let texto = "";
        for (let i = 1; i <= doc.numPages; i++) {
          st.textContent = "Lendo página " + i + " de " + doc.numPages + "…";
          const conteudo = await (await doc.getPage(i)).getTextContent();
          texto += conteudo.items.map(it => it.str + (it.hasEOL ? "\n" : "")).join("") + "\n\n";
        }
        if (texto.replace(/\s/g, "").length < 100) throw new Error("O PDF parece ser uma imagem escaneada (sem texto). Use um PDF pesquisável ou copie o texto.");
        $("#texto-edital").value = texto;
      }
      st.textContent = arq.name + " carregado.";
      analisarAgora();
    } catch (e) { st.textContent = ""; toast("Não consegui ler o arquivo", e.message, "crit"); }
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
      '<div class="mensagens" id="msgs" aria-live="polite">' + mensagensHTML(c) + "</div>" +
      (c.robo && !c.auto ? '<div class="conversa-f" style="border-top:1px solid var(--line);border-bottom:0;font-size:12.5px;color:var(--ink-3)">Mensagens do robô do GitHub (as mesmas dos e-mails)' + (c.roboEm ? " · robô atualizou " + U.desde(U.isoDataHora(new Date(c.roboEm))) : "") + (c.roboOrigem && c.roboOrigem !== "ao vivo" ? " · " + h(c.roboOrigem) : " · o portal confere a cada " + (S.ajustes.intervaloChat || 5) + " min") + ' · <button class="link-btn" data-acao="sincRobo">sincronizar agora</button></div>' : "") +
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
  function pgDocumentos() {
    const L = limitesDoc();
    const docs = S.documentos.map(d => ({ d, s: situacaoDoc(d) }));
    const grupos = {
      vencidos: docs.filter(x => x.s.dias !== null && x.s.dias < 0),
      curto: docs.filter(x => x.s.dias !== null && x.s.dias >= 0 && x.s.dias <= L.menor),
      medio: docs.filter(x => x.s.dias !== null && x.s.dias > L.menor && x.s.dias <= L.maior),
      ok: docs.filter(x => x.s.dias === null || x.s.dias > L.maior)
    };
    const lista = (ui.docFiltro === "todos" ? docs : grupos[ui.docFiltro] || docs).sort((a, b) => a.s.ordem - b.s.ordem || (a.s.dias === null ? 1e6 : a.s.dias) - (b.s.dias === null ? 1e6 : b.s.dias));
    const tile = (id, cls, n, rot) => '<button class="' + cls + '" data-acao="filtroDoc" data-f="' + id + '" aria-pressed="' + (ui.docFiltro === id) + '"><b>' + n + "</b><span>" + rot + "</span></button>";
    return '<div class="cab"><div><span class="eyebrow">Cadastro da empresa</span><h1>Documentos e certidões</h1><p>A pasta de habilitação sempre em dia. Alertas em ' + L.maior + " e " + L.menor + ' dias antes do vencimento, e aviso quando algo vence antes de uma sessão marcada.</p></div><div class="cab-acoes"><button class="btn primario" data-acao="novoDoc">' + ic("mais") + "Novo documento</button></div></div>" +
      '<div class="resumo-docs">' + tile(ui.docFiltro === "vencidos" ? "todos" : "vencidos", "crit", grupos.vencidos.length, "vencidos") + tile(ui.docFiltro === "curto" ? "todos" : "curto", "crit", grupos.curto.length, "vencem em até " + L.menor + " dias") + tile(ui.docFiltro === "medio" ? "todos" : "medio", "warn", grupos.medio.length, "vencem em até " + L.maior + " dias") + tile(ui.docFiltro === "ok" ? "todos" : "ok", "ok", grupos.ok.length, "em dia") + "</div>" +
      (lista.length ? '<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Documento</th><th>Grupo</th><th>Validade</th><th>Situação</th><th style="text-align:right">Ações</th></tr></thead><tbody>' + lista.map(({ d, s }) => {
        const afeta = s.dias !== null ? sessaoAfetada(d.validade) : null;
        return '<tr><td class="forte">' + h(d.nome) + '<span class="sub">' + h(d.emissor || nomeLista(TIPOS_DOC, d.tipo)) + "</span></td><td>" + h(GRUPO_DOC(d.tipo)) + '</td><td class="num">' + (d.validade ? U.fmtData(d.validade) : "—") + '</td><td><span class="pill ' + s.cls + '">' + h(s.rotulo) + "</span>" + (afeta ? '<span class="sub" style="color:var(--crit)">antes da sessão do ' + h(afeta.numero) + "</span>" : "") + "</td>" +
          '<td><div class="acoes">' + (d.validade ? '<button class="btn peq ghost" data-acao="renovarDoc" data-id="' + d.id + '">' + ic("atualizar") + "Renovar</button>" : "") + (d.link ? '<a class="icon-btn" href="' + h(d.link) + '" target="_blank" rel="noopener" aria-label="Emitir no site oficial">' + ic("link") + "</a>" : "") + '<button class="icon-btn" data-acao="editarDoc" data-id="' + d.id + '" aria-label="Editar">' + ic("editar") + '</button><button class="icon-btn" data-acao="excluirDoc" data-id="' + d.id + '" aria-label="Excluir">' + ic("lixo") + "</button></div></td></tr>";
      }).join("") + "</tbody></table></div>" : '<div class="card">' + vazio("documentos", ui.docFiltro === "todos" ? "Nenhum documento cadastrado." : "Nenhum documento nesta situação.", '<button class="btn primario" data-acao="novoDoc">Cadastrar documento</button>') + "</div>") +
      '<p class="nota">Dica: o campo "tipo" liga cada documento às exigências encontradas na análise de edital. Assim o portal diz se a certidão estará válida no dia da sessão.</p>';
  }
  const camposDoc = () => [
    { nome: "nome", rotulo: "Nome do documento", req: true, span: 2 },
    { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: TIPOS_DOC },
    { nome: "emissor", rotulo: "Emissor" },
    { nome: "emissao", rotulo: "Emissão", tipo: "date" },
    { nome: "validade", rotulo: "Validade", tipo: "date", dica: "Deixe vazio se o documento não vence." },
    { nome: "link", rotulo: "Onde emitir (link)", tipo: "url", span: 2, ph: "https://" },
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
  function pgPortais() {
    const linhaVal = (rot, v) => { const s = situacaoPortal(v); return "<div><dt>" + rot + "</dt><dd>" + (v ? '<span class="num">' + U.fmtData(v) + '</span><span class="pill ' + s.cls + '">' + h(s.cls === "ok" ? "Em dia" : s.rotulo) + "</span>" : '<span class="muted">—</span>') + "</dd></div>"; };
    const iniciais = n => n.replace(/\(.*?\)/g, "").split(/[\s.-]+/).filter(w => w.length > 1 && !/^(de|do|da|dos|das|e)$/i.test(w)).slice(0, 2).map(w => w[0]).join("").toUpperCase();
    const ord = S.portais.slice().sort((a, b) => Math.min(situacaoPortal(a.validadeCadastro).ordem, situacaoPortal(a.validadePlano).ordem) - Math.min(situacaoPortal(b.validadeCadastro).ordem, situacaoPortal(b.validadePlano).ordem));
    return '<div class="cab"><div><span class="eyebrow">Cadastro da empresa</span><h1>Portais de compras</h1><p>Cadastros, credenciamentos e planos de cada plataforma. Por segurança o portal não guarda senhas: use um gerenciador de senhas da empresa.</p></div><div class="cab-acoes"><button class="btn primario" data-acao="novoPortal">' + ic("mais") + "Novo portal</button></div></div>" +
      (ord.length ? '<div class="portais">' + ord.map(p => '<article class="portal"><div class="portal-h"><span class="av" style="--cor:' + corPortal(p.nome) + '">' + h(iniciais(p.nome) || "P") + "</span><div><b>" + h(p.nome) + "</b>" + (p.url ? '<a href="' + h(p.url) + '" target="_blank" rel="noopener">' + h(p.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")) + "</a>" : "") + "</div></div>" +
        "<dl>" + (p.usuario ? '<div><dt>Usuário</dt><dd class="mono">' + h(p.usuario) + "</dd></div>" : "") + (p.cadastro ? "<div><dt>Tipo de cadastro</dt><dd>" + h(p.cadastro) + "</dd></div>" : "") + linhaVal("Cadastro válido até", p.validadeCadastro) + linhaVal("Plano/mensalidade até", p.validadePlano) + "</dl>" +
        (p.obs ? '<p class="nota">' + h(p.obs) + "</p>" : "") +
        '<div class="linha-acoes">' + (p.url ? '<a class="btn peq ghost" href="' + h(p.url) + '" target="_blank" rel="noopener">' + ic("link") + "Acessar</a>" : "") + '<button class="btn peq ghost" data-acao="editarPortal" data-id="' + p.id + '">' + ic("editar") + 'Editar</button><button class="icon-btn" data-acao="excluirPortal" data-id="' + p.id + '" aria-label="Excluir">' + ic("lixo") + "</button></div></article>").join("") + "</div>"
        : '<div class="card">' + vazio("portais", "Nenhum portal cadastrado.", '<button class="btn primario" data-acao="novoPortal">Cadastrar portal</button>') + "</div>");
  }
  const camposPortal = () => [
    { nome: "nome", rotulo: "Portal", req: true, ph: "Compras.gov.br (SICAF)" },
    { nome: "url", rotulo: "Endereço", tipo: "url", ph: "https://" },
    { nome: "usuario", rotulo: "Usuário / login", dica: "Não guarde senhas aqui." },
    { nome: "cadastro", rotulo: "Tipo de cadastro", ph: "SICAF níveis I a VI" },
    { nome: "validadeCadastro", rotulo: "Cadastro válido até", tipo: "date" },
    { nome: "validadePlano", rotulo: "Plano/mensalidade até", tipo: "date" },
    { nome: "obs", rotulo: "Observações", tipo: "textarea", span: 2, linhas: 2 }
  ];
  function formPortal(id) {
    const p = id ? S.portais.find(x => x.id === id) : null;
    abrirForm({ titulo: p ? "Editar portal" : "Novo portal", campos: camposPortal(), valores: p || {}, salvar: v => { if (p) Object.assign(p, v); else S.portais.push(Object.assign({ id: U.uid() }, v)); atualizar(); toast(p ? "Portal atualizado" : "Portal cadastrado", v.nome); } });
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
    l.push("Gerado pelo Pregão em Dia");
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
  function pgAjustes() {
    const e = S.empresa, a = S.ajustes;
    const campo = (id, rot, valor, chave, extra, dica) => '<div class="campo"><label for="' + id + '">' + rot + '</label><input id="' + id + '" value="' + h(valor) + '" data-mudar="ajuste" data-chave="' + chave + '" ' + (extra || "") + ">" + (dica ? "<small>" + dica + "</small>" : "") + "</div>";
    const sw = (id, rot, val, chave) => '<label class="switch" for="' + id + '"><span>' + rot + '</span><input type="checkbox" id="' + id + '" data-mudar="ajuste" data-chave="' + chave + '"' + (val ? " checked" : "") + "></label>";
    return '<div class="cab"><div><span class="eyebrow">Configuração</span><h1>Ajustes</h1><p>As alterações são salvas na hora, neste navegador.</p></div></div>' +
      '<div class="ajustes"><section class="card"><h2>Empresa</h2><p>O nome, o apelido e o CNPJ são usados para detectar quando o pregoeiro cita a empresa no chat.</p>' +
      campo("aj-nome", "Razão social", e.nome, "empresa.nome") + campo("aj-apelido", "Como a empresa aparece no chat (apelido)", e.apelido, "empresa.apelido", 'placeholder="Ex.: Vitalis"') + campo("aj-cnpj", "CNPJ", e.cnpj, "empresa.cnpj", 'inputmode="numeric"') +
      '<div class="campo"><label for="aj-porte">Porte</label><select id="aj-porte" data-mudar="ajuste" data-chave="empresa.porte"><option value="demais"' + (e.porte !== "me" ? " selected" : "") + '>Demais portes</option><option value="me"' + (e.porte === "me" ? " selected" : "") + ">ME / EPP</option></select><small>Usado na análise de editais exclusivos para ME/EPP.</small></div>" +
      campo("aj-equipe", "Como chamar a equipe no painel", e.equipe, "empresa.equipe") + "</section>" +
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
      '<section class="card" style="grid-column:1/-1"><h2>Seus dados</h2><p>Tudo fica salvo neste navegador. Faça um backup de vez em quando e use-o para levar os dados para outro computador.</p>' +
      '<div class="linha-acoes"><button class="btn ghost" data-acao="backup">' + ic("download") + 'Exportar backup</button><label class="btn ghost" for="aj-importar">' + ic("upload") + 'Importar backup<input type="file" id="aj-importar" accept=".json,application/json" class="sr" data-mudar="importar"></label>' +
      '<span style="flex:1"></span><button class="btn ghost" data-acao="recarregarExemplo">Recarregar dados de exemplo</button><button class="btn perigo" data-acao="zerar">' + ic("lixo") + "Apagar tudo e começar do zero</button></div></section></div>";
  }

  /* =================================================================
     Roteamento e renderização
     ================================================================= */
  const PAGINAS = {
    painel: { html: pgPainel }, editais: { html: pgEditais, depois: ligarArraste }, propostas: { html: pgPropostas },
    chats: { html: pgChats, depois: depoisChats }, analise: { html: pgAnalise, depois: ligarAnalise }, recursos: { html: pgRecursos },
    documentos: { html: pgDocumentos }, portais: { html: pgPortais }, alertas: { html: pgAlertas }, ajustes: { html: pgAjustes }
  };
  const rotaAtual = () => { const r = location.hash.replace("#", ""); return PAGINAS[r] ? r : "painel"; };
  function render() {
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
    const al = gerarAlertas();
    const cont = {
      editais: S.editais.filter(ativo).length,
      propostas: al.filter(a => a.tipo === "proposta" && a.nivel !== "info").length,
      chats: S.chats.reduce((s, c) => s + naoLidas(c).length, 0),
      recursos: al.filter(a => a.tipo === "recurso" && a.nivel !== "info").length,
      documentos: S.documentos.filter(d => situacaoDoc(d).cls === "crit").length,
      portais: S.portais.filter(p => situacaoPortal(p.validadeCadastro).cls === "crit" || situacaoPortal(p.validadePlano).cls === "crit").length,
      alertas: al.filter(a => a.nivel === "critico").length
    };
    Object.keys(cont).forEach(k => { const b = $('[data-cont="' + k + '"]'); if (b) { b.textContent = cont[k]; b.hidden = !cont[k]; } });
    const sino = $("#sino");
    sino.textContent = cont.alertas; sino.hidden = !cont.alertas;
    $("#side-empresa").innerHTML = "<b>" + h(S.empresa.nome || "Sua empresa") + "</b><br>" + (S.exemplo ? "Dados de exemplo (fictícios)" : "Dados salvos neste navegador");
  }
  function irPara(rota, ref) {
    fecharMenu();
    if (!$("#modal").hidden) fecharModal();
    if (rota === "chats" && ref) { ui.chatSel = ref; ui.chatFiltro = "todas"; }
    if ((rota === "editais" || rota === "propostas") && ref && edital(ref)) ui.abrirApos = ref;
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
    inp.addEventListener("change", () => lerArquivo(inp.files[0]));
    ["dragenter", "dragover"].forEach(t => zona.addEventListener(t, ev => { ev.preventDefault(); zona.classList.add("sobre"); }));
    ["dragleave", "drop"].forEach(t => zona.addEventListener(t, () => zona.classList.remove("sobre")));
    zona.addEventListener("drop", ev => { ev.preventDefault(); lerArquivo(ev.dataTransfer.files[0]); });
    ta.addEventListener("input", () => { ui.analiseTexto = ta.value; });
  }

  function excluir(lista, id, nome, rotulo) {
    confirmar("Excluir " + rotulo + "?", "<b>" + h(nome) + "</b> será removido. Essa ação não pode ser desfeita.", "Excluir", () => {
      S[lista] = S[lista].filter(x => x.id !== id);
      atualizar(); toast(rotulo.charAt(0).toUpperCase() + rotulo.slice(1) + " excluído", nome);
    });
  }

  const ACOES = {
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
    recarregarExemplo: () => confirmar("Recarregar exemplos?", "Os dados atuais serão substituídos pelos dados de exemplo (fictícios).", "Recarregar", () => { S = D.criar(); atualizar(); toast("Dados de exemplo carregados"); }),

    novoEdital: () => formEdital(),
    editarEdital: d => formEdital(d.id),
    abrirEdital: d => abrirEdital(d.id),
    excluirEdital: d => { const e = edital(d.id); excluir("editais", d.id, e.numero, "edital"); },
    definirEtapa: d => moverEtapa(d.id, d.etapa),
    propCadastrada: d => {
      const e = edital(d.id); e.propostaStatus = "cadastrada";
      if (["triagem", "analise", "proposta"].includes(e.etapa)) e.etapa = "cadastrada";
      CHECK_PROPOSTA.forEach(k => { (e.checklist = e.checklist || {})[k] = true; });
      (e.historico = e.historico || []).unshift({ data: U.hojeISO(), texto: "Proposta cadastrada no portal." });
      registrar("Proposta do " + e.numero + " cadastrada no " + e.portal + ".", "propostas");
      atualizar(); toast("Proposta cadastrada!", e.numero + " · sessão " + U.fmtDataHora(e.sessao), "pop");
    },
    vista: d => { ui.editaisVista = d.v; gravarPref("vista", d.v); render(); },
    filtrarEtapa: d => { ui.fEd.etapa = d.etapa; if (ETAPA(d.etapa).final) ui.editaisVista = "lista"; irPara("editais"); },
    monitorarChat: d => { const e = edital(d.id); formChat(null, { titulo: e.numero, editalId: e.id, orgao: e.orgao, portal: e.portal, link: e.link, auto: e.portal === "e-compras AM", processo: e.portal === "e-compras AM" ? (e.numero.match(/(\d+)\/\d{2}(\d{2})/) || []).slice(1).join("/") : "" }); },
    importarPncp: async (d, btn) => {
      const v = $("#pncp-link").value.trim();
      if (!v) { toast("Cole o link do edital no PNCP", "", "crit"); return; }
      btn.disabled = true; btn.textContent = "Buscando…";
      try {
        const j = await api("/api/pncp?url=" + encodeURIComponent(v));
        const f = $("#form-modal");
        const por = (nome, valor) => { if (valor === undefined || valor === null || valor === "" || !f.elements[nome]) return; const el = f.elements[nome]; if (el.tagName === "SELECT" && ![...el.options].some(o => o.value === valor)) return; el.value = valor; };
        ["numero", "modalidade", "orgao", "municipio", "uf", "objeto", "sessao", "limiteProposta", "portal", "link", "processo", "uasg"].forEach(k => por(k, j[k]));
        if (j.valorEstimado) por("valorEstimado", Number(j.valorEstimado).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
        toast("Dados importados do PNCP", (j.arquivos || []).length ? U.plural(j.arquivos.length, "documento publicado", "documentos publicados") : "");
      } catch (e) { toast("Não consegui buscar no PNCP", e.message, "crit"); }
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
    novoPortal: () => formPortal(), editarPortal: d => formPortal(d.id),
    excluirPortal: d => { const x = S.portais.find(y => y.id === d.id); excluir("portais", d.id, x.nome, "portal"); },

    analisar: analisarAgora,
    exemploEdital: () => { ui.analiseTexto = D.editalExemplo(); $("#texto-edital").value = ui.analiseTexto; analisarAgora(); },
    limparAnalise: () => { ui.analiseTexto = ""; ui.analise = null; render(); },
    copiarAnalise: async () => { const t = textoAnalise(ui.analise); if (await U.copiar(t)) toast("Resumo copiado", "Cole no e-mail, Teams ou WhatsApp."); else mostrarTexto("Resumo da análise", t); },
    criarDaAnalise: () => {
      const c = ui.analise.campos;
      formEdital(null, { numero: c.numero, modalidade: c.modalidade, orgao: c.orgao, objeto: c.objeto, sessao: c.sessao && c.sessao.length > 10 ? c.sessao : c.sessao ? c.sessao + "T09:00" : "", limiteProposta: c.limiteProposta && c.limiteProposta.length > 10 ? c.limiteProposta : "", valorEstimado: c.valorEstimado, portal: c.plataforma || "Compras.gov.br", processo: c.processo, etapa: "analise", prioridade: ui.analise.termometro.nivel === "ok" ? "alta" : "media" });
    },

    filtroAlerta: d => { ui.alertaFiltro = d.f; render(); },
    resolverAlerta: d => { S.resolvidos[d.id] = "sempre"; atualizar(); toast("Alerta resolvido"); },
    adiarAlerta: d => { S.resolvidos[d.id] = U.addDias(U.hojeISO(), 1); atualizar(); toast("Combinado, lembro amanhã"); },
    restaurarAlertas: () => { S.resolvidos = {}; atualizar(); },
    copiarResumo: async () => { const t = resumoDoDia(); if (await U.copiar(t)) toast("Resumo do dia copiado", "Cole no grupo da equipe."); else mostrarTexto("Resumo do dia", t); },
    exportarAgenda: () => {
      const ev = eventosAgenda(365).map(x => ({ uid: U.hash(x.tipo + x.ref + x.data + x.titulo), data: x.data, titulo: x.titulo, descricao: x.sub }));
      mostrarTexto("Agenda de licitações (" + ev.length + " compromissos)", U.ics(ev, "Licitações · " + (S.empresa.apelido || "Pregão em Dia")), "licitacoes.ics", "text/calendar;charset=utf-8");
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
    backup: () => mostrarTexto("Backup dos dados", JSON.stringify(S, null, 2), "pregao-em-dia-backup-" + U.hojeISO() + ".json", "application/json")
  };

  function definirCaminho(chave, valor) {
    const [obj, campo] = chave.split(".");
    if (campo === "diasDoc") valor = String(valor).split(/[^\d]+/).map(Number).filter(n => n > 0);
    else if (["diasProposta", "diasPortal", "intervaloChat"].includes(campo)) valor = Math.max(1, Number(valor) || 1);
    S[obj][campo] = valor;
  }
  const MUDAR = {
    filtroEtapa: el => { ui.fEd.etapa = el.value; $("#ed-resultado").innerHTML = resultadoEditais(); ligarArraste(); },
    filtroPortal: el => { ui.fEd.portal = el.value; $("#ed-resultado").innerHTML = resultadoEditais(); ligarArraste(); },
    propStatus: el => {
      const e = edital(el.dataset.id); e.propostaStatus = el.value;
      if (el.value === "cadastrada") { ACOES.propCadastrada({ id: e.id }); return; }
      if (e.etapa === "triagem" || e.etapa === "analise") e.etapa = "proposta";
      atualizar();
    },
    checkItem: el => { const e = edital(el.dataset.id); (e.checklist = e.checklist || {})[CHECK_PROPOSTA[+el.dataset.item]] = el.checked; atualizar(); },
    notasEdital: el => { const e = edital(el.dataset.id); e.notas = el.value; salvar(); toast("Anotação salva"); },
    statusRec: el => { const r = S.recursos.find(x => x.id === el.dataset.id); r.status = el.value; registrar(r.pregao + ": recurso agora está \"" + nomeLista(STATUS_REC, el.value) + "\".", "recursos"); atualizar(); },
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
        if (!dados || !dados.versao || !Array.isArray(dados.editais)) throw new Error("O arquivo não parece um backup do Pregão em Dia.");
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
    buscaEd: el => { ui.fEd.busca = el.value; const g = $("#busca-global"); if (g) g.value = el.value; $("#ed-resultado").innerHTML = resultadoEditais(); ligarArraste(); },
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
     Início
     ================================================================= */
  const temaSalvo = lerPref("tema", "");
  if (temaSalvo) document.documentElement.dataset.theme = temaSalvo;
  iconeTema();
  aplicarConfig();
  render();
  salvar();

  // Aviso de abertura: um resumo só dos alertas críticos, uma vez por dia
  setTimeout(() => {
    const criticos = gerarAlertas().filter(a => a.nivel === "critico");
    if (criticos.length && lerPref("avisado", "") !== U.hojeISO()) {
      gravarPref("avisado", U.hojeISO());
      toast(U.plural(criticos.length, "alerta crítico", "alertas críticos") + " hoje", criticos.slice(0, 2).map(a => a.titulo).join(" · "), "pop", { rotulo: "Ver alertas", rota: "alertas" });
    }
    verificarChats();
    sincronizarRobo();
  }, 900);
  // A cada minuto: atualiza contadores, lê chats automáticos e redesenha telas sem formulário aberto
  setInterval(() => {
    verificarChats();
    sincronizarRobo();
    if (["painel", "alertas", "propostas"].includes(rotaAtual())) renderSeLivre(); else atualizarNav();
  }, 60000);
})();
