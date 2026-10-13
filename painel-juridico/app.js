/* Gabinete Digital: telas e comportamento. Regras puras ficam em nucleo.js (window.Nucleo). */
(function () {
  "use strict";
  const N = window.Nucleo;
  // Demonstração: dados fictícios, sem senha, guardados à parte e nunca sincronizados.
  const DEMO = window.GD_DEMO || null;
  const P = DEMO ? "gdd:" : "gd:";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const novoId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const hoje = () => N.hojeIso();
  const br = (iso) => N.brData(iso);
  const moeda = (n) => (n == null ? "" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
  const hhmm = (min) => { min = Math.round(min || 0); return Math.floor(min / 60) + "h" + String(min % 60).padStart(2, "0"); };

  // ---------- armazenamento local (tolerante a navegador sem storage) ----------
  const LS = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* sem storage */ } },
  };
  const SS = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sem storage */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* sem storage */ } },
  };

  const COLS = ["processos", "tarefas", "pecas", "atividades"];
  const E = { processos: {}, tarefas: {}, pecas: {}, atividades: {} };
  const UI = { visao: "inicio", advogado: "", modo: "lista", fichaId: null, mes: null, modelo: "ata", mostrarFeitas: false, cron: null, formMov: false };

  let timerLocal = null;
  function salvarLocal() {
    clearTimeout(timerLocal);
    timerLocal = setTimeout(() => {
      if (!LS.set(P + "dados", E)) setSync("Sem armazenamento local: os dados valem só nesta aba");
    }, 250);
  }

  // ---------- sincronização pelo claude.ai (capability db) ----------
  let DB = null;
  let fila = Promise.resolve();
  function gravarRemoto(col, id, obj) {
    if (!DB) return;
    const dados = obj ? clone(obj) : null;
    fila = fila.then(() => (dados ? DB.collection(col).doc(id).set(dados) : DB.collection(col).doc(id).delete()))
      .catch((e) => toast("Não foi possível sincronizar (" + (e && e.code || "erro") + "). A alteração ficou salva neste aparelho."));
  }
  function salvar(col, obj) { E[col][obj.id] = obj; salvarLocal(); gravarRemoto(col, obj.id, obj); }
  function remover(col, id) { delete E[col][id]; salvarLocal(); gravarRemoto(col, id, null); }

  function setSync(txt, on) { $("#sync-texto").textContent = txt; $("#sync").classList.toggle("on", !!on); }

  async function conectarClaude() {
    if (!window.claude || !window.claude.use) return;
    window.claude.use("sample").then((s) => { SAMPLE = s; document.body.classList.toggle("sem-ia", !s); renderConectores(); });
    window.claude.use("user").then(async (u) => {
      if (!u) return;
      try { const me = await u.me(); if (me && me.name) { NOME_CLAUDE = me.name; renderConectores(); } } catch (e) { /* sem identidade */ }
    });
    if (DEMO) return;
    const db = await window.claude.use("db");
    if (!db) return;
    DB = db;
    setSync("Sincronizado com claude.ai", true);
    COLS.forEach((col) => {
      let primeira = true;
      db.collection(col).onSnapshot((snap) => {
        if (primeira) {
          primeira = false;
          // Primeira vez com a nuvem vazia: envia o que já existe neste aparelho.
          if (snap.empty && Object.keys(E[col]).length) { Object.values(E[col]).forEach((o) => gravarRemoto(col, o.id, o)); return; }
        }
        const remoto = {};
        snap.docs.forEach((d) => { remoto[d.id] = clone(d.data()); });
        E[col] = remoto;
        if (col === "processos" && !UI.advogadoEscolhido && USUARIO) {
          UI.advogado = advogados().find((a) => N.norm(a) === N.norm(USUARIO)) || "";
          if (!$("#app").hidden) montarFiltros();
        }
        salvarLocal();
        renderTudo();
      }, (e) => { setSync("Sincronização interrompida (" + (e && e.code) + ")", false); });
    });
  }
  let SAMPLE = null;
  let NOME_CLAUDE = "";
  document.body.classList.add("sem-ia");
  const estiloIa = document.createElement("style");
  estiloIa.textContent = ".sem-ia .ia{display:none!important}";
  document.head.appendChild(estiloIa);

  async function perguntarClaude(prompt, onText, opcoes = {}) {
    if (!SAMPLE) throw { code: "indisponivel", message: "O Claude responde quando o painel está aberto pelo claude.ai." };
    const r = await SAMPLE(prompt, Object.assign({ onText: onText ? ({ text }) => onText(text) : undefined }, opcoes));
    return r.text;
  }
  function erroIa(e) {
    const c = e && e.code;
    if (c === "not_granted") return "Você não autorizou o Claude neste painel. Use o modelo pronto.";
    if (c === "rate_limited") return "Muitas solicitações seguidas. Aguarde um minuto e tente de novo.";
    if (c === "cancelled") return "Redação interrompida.";
    return (e && e.message) || "O Claude não respondeu. Tente novamente.";
  }

  // ---------- downloads (capability downloads no claude.ai, link comum fora dele) ----------
  let downloadsP = null;
  async function baixar(nome, dados, mime) {
    if (window.claude && window.claude.use) {
      downloadsP = downloadsP || window.claude.use("downloads");
      const d = await downloadsP;
      if (d) {
        try { await d.save({ filename: nome, data: dados instanceof Blob ? dados : new Blob([dados], { type: mime }) }); toast("Arquivo salvo: " + nome); }
        catch (e) { if (e && e.code !== "cancelled") toast("Não foi possível salvar o arquivo (" + (e.code || "erro") + ")."); }
        return;
      }
    }
    const blob = dados instanceof Blob ? dados : new Blob([dados], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function carregarScript(src) {
    return new Promise((ok, falha) => {
      if ($$("script").some((s) => s.src === src)) return ok();
      const s = document.createElement("script");
      s.src = src; s.onload = ok; s.onerror = () => falha(new Error("Não carregou " + src));
      document.head.appendChild(s);
    });
  }
  const XLSX_URL = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
  const MAMMOTH_URL = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";

  // ---------- avisos ----------
  let timerToast = null;
  function toast(msg) {
    const t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(timerToast); timerToast = setTimeout(() => { t.hidden = true; }, 4200);
  }
  function dialogo(html, aoConfirmar, rotuloOk = "Confirmar") {
    const d = $("#dialogo");
    $("#dialogo-corpo").innerHTML = html + `<div class="acoes" style="justify-content:flex-end"><button class="btn" type="button" id="dlg-cancelar">Cancelar</button><button class="btn primario" type="button" id="dlg-ok">${esc(rotuloOk)}</button></div>`;
    d.hidden = false;
    const fechar = () => { d.hidden = true; };
    $("#dlg-cancelar").onclick = fechar;
    $("#dlg-ok").onclick = () => { if (aoConfirmar() !== false) fechar(); };
    const primeiro = $("#dialogo-corpo input, #dialogo-corpo select, #dialogo-corpo textarea");
    (primeiro || $("#dlg-ok")).focus();
  }

  // =====================================================================
  // LOGIN
  // =====================================================================
  async function hash(txt) {
    if (window.crypto && crypto.subtle) {
      const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt));
      return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
    }
    let h = 0; for (const c of txt) h = (h * 31 + c.charCodeAt(0)) | 0; return "f" + h;
  }
  function prepararLogin() {
    if (DEMO) {
      ["#login-senha", "#login-confirma-wrap", "#login-lembrar"].forEach((s) => { const el = $(s); (el.closest("label") || el).hidden = true; });
      $("#login-senha").required = false;
      $("#login-usuario").value = DEMO.usuario; $("#login-usuario").readOnly = true;
      $("#login-modo").textContent = "Demonstração · dados fictícios";
      $("#login-titulo").textContent = "Conheça o painel por dentro";
      $("#login-botao").textContent = "Entrar como Dr. " + DEMO.usuario;
      $("#login-nota").textContent = "Advogado, clientes e processos desta demonstração são inventados. Tudo o que você fizer fica só neste navegador.";
      return;
    }
    const conta = LS.get(P + "conta");
    const criando = !conta;
    $("#login-confirma-wrap").hidden = !criando;
    $("#login-confirma").required = criando;
    $("#login-titulo").textContent = criando ? "Crie sua senha de acesso" : "Entrar no gabinete";
    $("#login-modo").textContent = criando ? "Primeiro acesso" : "Acesso do advogado";
    $("#login-botao").textContent = criando ? "Criar acesso e entrar" : "Entrar";
    $("#login-senha").autocomplete = criando ? "new-password" : "current-password";
    if (conta) $("#login-usuario").value = conta.usuario;
  }
  $("#form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (DEMO) {
      SS.set(P + "sessao", { usuario: DEMO.usuario, ate: Date.now() + 12 * 3600 * 1000 });
      if (!Object.keys(E.processos).length) carregarExemplo();
      entrar(DEMO.usuario);
      return;
    }
    const usuario = $("#login-usuario").value.trim();
    const senha = $("#login-senha").value;
    const erro = $("#login-erro");
    erro.textContent = "";
    if (!usuario || senha.length < 4) { erro.textContent = "Informe o usuário e uma senha com pelo menos 4 caracteres."; return; }
    let conta = LS.get(P + "conta");
    if (!conta) {
      if (senha !== $("#login-confirma").value) { erro.textContent = "As senhas não conferem. Digite a mesma senha nos dois campos."; return; }
      const sal = Math.random().toString(36).slice(2) + Date.now().toString(36);
      conta = { usuario, sal, hash: await hash(sal + senha) };
      if (!LS.set(P + "conta", conta)) toast("Este navegador bloqueia armazenamento: a senha vale só nesta sessão.");
    } else {
      if (N.norm(usuario) !== N.norm(conta.usuario) || (await hash(conta.sal + senha)) !== conta.hash) { erro.textContent = "Usuário ou senha incorretos."; $("#login-senha").select(); return; }
    }
    const sessao = { usuario: conta.usuario, ate: Date.now() + 12 * 3600 * 1000 };
    if ($("#login-lembrar").checked) LS.set(P + "sessao", sessao); else SS.set(P + "sessao", sessao);
    $("#login-senha").value = ""; $("#login-confirma").value = "";
    entrar(conta.usuario);
  });
  function sessaoValida() {
    const s = LS.get(P + "sessao") || SS.get(P + "sessao");
    return s && s.ate > Date.now() ? s : null;
  }
  function carregarExemplo() {
    const dados = DEMO.gerar();
    COLS.forEach((c) => { E[c] = dados[c]; });
    salvarLocal();
  }
  function entrar(usuario) {
    USUARIO = usuario;
    $("#faixa-demo").hidden = !DEMO;
    $("#tela-login").hidden = true;
    $("#app").hidden = false;
    $("#marca-usuario").textContent = "Dr. " + usuario;
    const advs = advogados();
    UI.advogado = advs.find((a) => N.norm(a) === N.norm(usuario)) || "";
    montarFiltros();
    ir(location.hash.replace("#", "") || "inicio");
    retomarCronometro();
  }
  function sair() {
    LS.del(P + "sessao"); SS.del(P + "sessao");
    $("#app").hidden = true; $("#tela-login").hidden = false;
    fecharFicha(); prepararLogin(); $("#login-senha").focus();
  }
  let USUARIO = "";

  // =====================================================================
  // DADOS DERIVADOS
  // =====================================================================
  const lista = () => Object.values(E.processos);
  const advogados = () => [...new Set(lista().map((p) => p.advogado).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const meus = () => lista().filter((p) => !UI.advogado || N.norm(p.advogado) === N.norm(UI.advogado));
  const ativo = (p) => !N.ehEncerrado(p);
  const partes = (p) => (p.empresa || "—") + " × " + (p.outro || "—");
  const numeroPrincipal = (p) => (p.cnj && p.cnj[0] ? p.cnj[0].numero : (p.numero || "sem número").split("\n")[0]);
  const tarefasAbertas = () => Object.values(E.tarefas).filter((t) => !t.feita);
  const prioClasse = (p) => ({ alta: "alta", media: "media", baixa: "baixa" }[N.norm(p.prioridade)] || "");
  function diasUteisAte(iso) {
    const h = hoje();
    if (!iso) return null;
    if (iso === h) return 0;
    const sinal = iso > h ? 1 : -1;
    let d = N.deIso(h), n = 0;
    const alvo = iso;
    while (N.iso(d) !== alvo) { d = N.somaDias(d, sinal); if (N.ehDiaUtil(d, false)) n += sinal; if (Math.abs(n) > 400) break; }
    return n;
  }
  function rotuloPrazo(iso) {
    if (!iso) return { txt: "sem data", cls: "" };
    const h = hoje();
    if (iso < h) return { txt: "atrasada", cls: "critico" };
    if (iso === h) return { txt: "hoje", cls: "critico" };
    const du = diasUteisAte(iso);
    return { txt: du === 1 ? "amanhã útil" : "em " + du + " dias úteis", cls: du <= 3 ? "aviso" : "" };
  }

  // =====================================================================
  // NAVEGAÇÃO E RENDER
  // =====================================================================
  function ir(visao) {
    if (!$(`[data-visao="${visao}"]`)) visao = "inicio";
    UI.visao = visao;
    $$("[data-visao]").forEach((s) => { s.hidden = s.dataset.visao !== visao; });
    $$(".nav button").forEach((b) => b.setAttribute("aria-current", b.dataset.ir === visao ? "page" : "false"));
    try { history.replaceState(null, "", "#" + visao); } catch (e) { /* sandbox */ }
    renderTudo();
    window.scrollTo(0, 0);
  }
  function renderTudo() {
    if ($("#app").hidden) return;
    const r = { inicio: renderInicio, processos: renderProcessos, prazos: renderPrazos, atelie: renderAtelie, horas: renderHoras, integracoes: renderConectores }[UI.visao];
    if (r) r();
    const urg = tarefasAbertas().filter((t) => t.vencimento && t.vencimento <= hoje()).length;
    const b = $("#badge-hoje"); b.hidden = !urg; b.textContent = urg;
    if (UI.fichaId && !$("#ficha").hidden) renderFicha();
  }

  // ---------- HOJE ----------
  function renderInicio() {
    const agora = new Date();
    const hora = agora.getHours();
    $("#saudacao").textContent = (hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite") + ", Dr. " + (USUARIO || "");
    $("#hoje-data").textContent = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const fer = N.ehFeriado(agora);
    const nota = fer ? "Hoje é feriado: " + fer + ". Prazos não correm." :
      N.ehRecesso(agora) ? "Recesso forense: prazos suspensos até 20/01 (CPC art. 220)." :
      !N.ehDiaUtil(agora) ? "Fim de semana: prazos não correm." : "Dia útil. Prazos correndo normalmente.";
    $("#hoje-nota").textContent = nota;

    if (!lista().length) { renderVazioInicio(); return; }
    const ms = meus();
    const at = ms.filter(ativo);
    const sete = N.iso(N.somaDias(new Date(), 7));
    const minhasTarefas = tarefasAbertas().filter((t) => !t.processoId || ms.some((p) => p.id === t.processoId));
    const prazos = minhasTarefas.filter((t) => t.vencimento && t.vencimento <= sete);
    const parados = at.filter((p) => { const d = N.diasParado(p); return d == null || d > 45; });
    const mes = hoje().slice(0, 7);
    const minMes = Object.values(E.atividades).filter((a) => a.data && a.data.startsWith(mes)).reduce((s, a) => s + (a.minutos || 0), 0);
    $("#kpis").innerHTML = [
      ["Em andamento", at.length, UI.advogado ? "de " + UI.advogado : "todos os advogados", "ativos", false],
      ["Prazos em 7 dias", prazos.length, prazos.filter((t) => t.vencimento < hoje()).length + " atrasado(s)", "prazos", prazos.length > 0],
      ["Parados > 45 dias", parados.length, "conferir movimentação", "parados", parados.length > 0],
      ["Horas no mês", hhmm(minMes), Object.values(E.atividades).length + " atividades registradas", "horas", false],
    ].map(([r, v, s, alvo, alerta]) => `<button class="kpi${alerta ? " alerta" : ""}" data-acao="kpi" data-alvo="${alvo}"><span class="rotulo">${r}</span><strong>${esc(v)}</strong><span class="sutil" style="font-size:.8rem">${esc(s)}</span></button>`).join("");

    $("#pauta").innerHTML = htmlPauta(minhasTarefas, at, true);
    $("#pauta-resumo").textContent = minhasTarefas.length + " tarefa(s) aberta(s)";

    const ideias = N.gerarIdeias(lista(), UI.advogado);
    $("#ideias").innerHTML = ideias.length ? ideias.map(htmlIdeia).join("") : `<p class="vazio">Nenhum alerta. Carteira em dia.</p>`;

    const movs = [];
    ms.forEach((p) => (p.andamentos || []).forEach((a) => { if (a.data) movs.push({ p, a }); }));
    movs.sort((x, y) => (y.a.data > x.a.data ? 1 : y.a.data < x.a.data ? -1 : 0));
    $("#ultimas").innerHTML = movs.slice(0, 8).map(({ p, a }) => `<li><time>${br(a.data)}</time><div><a href="#" data-abrir="${esc(p.id)}">${esc(partes(p))}</a><span class="pill origem ${/datajud|djen/.test(a.origem) ? "bordo" : ""}">${esc(origemNome(a.origem))}</span><div class="sutil">${esc(a.texto)}</div></div></li>`).join("") || `<li class="vazio">Sem movimentações datadas.</li>`;
  }
  const origemNome = (o) => ({ planilha: "planilha", manual: "registrada", datajud: "robô DataJud", djen: "DJEN" }[o] || o || "");
  function renderVazioInicio() {
    $("#kpis").innerHTML = "";
    $("#pauta").innerHTML = `<div class="vazio"><p>Nenhum processo carregado ainda.</p><p>Importe a planilha <b>Controle de Processos Judiciais e Atividades</b> para montar a pauta, os prazos e os alertas automaticamente.</p><button class="btn primario" data-acao="importar-planilha">Importar planilha (.xlsx)</button></div>`;
    $("#ideias").innerHTML = `<p class="vazio">As ideias aparecem depois da importação.</p>`;
    $("#ultimas").innerHTML = "";
    $("#pauta-resumo").textContent = "";
  }
  function htmlIdeia(i) {
    const tipo = { alerta: ["Alerta", "critico"], limpeza: ["Limpeza", "aviso"], tese: ["Tese", "latao"], conexao: ["Conexão", "bordo"], organizacao: ["Organização", ""], gestao: ["Gestão", ""] }[i.tipo] || ["Ideia", ""];
    const chips = i.ids.slice(0, 12).map((id) => { const p = E.processos[id]; return p ? `<button class="pill" data-abrir="${esc(id)}" title="${esc(partes(p))}">${esc(curto(p))}</button>` : ""; }).join("");
    const extra = i.acao === "modelo:ordem" ? `<div><button class="btn mini" data-acao="usar-modelo" data-modelo="ordem">Abrir modelo no Ateliê</button></div>` :
      i.tipo === "limpeza" ? `<div><button class="btn mini" data-acao="filtrar-ids" data-ids="${esc(i.ids.join(","))}">Revisar estes processos</button></div>` : "";
    return `<article class="ideia"><header><span class="pill ${tipo[1]}">${tipo[0]}</span><h3>${esc(i.titulo)}</h3></header><p>${esc(i.texto)}</p>${chips ? `<div class="ids">${chips}</div>` : ""}${extra}</article>`;
  }
  const curto = (p) => { const n = p.cnj && p.cnj[0]; const quem = (p.empresa || "").split(/\s+/)[0]; return (quem ? quem + " · " : "") + (n ? n.numero.slice(0, 7) : "nº " + (p.codigo || "?")); };

  function htmlPauta(tarefas, processosAtivos, compacto) {
    const h = hoje(), sete = N.iso(N.somaDias(new Date(), 7));
    const ord = tarefas.slice().sort((a, b) => (a.vencimento || "9999") < (b.vencimento || "9999") ? -1 : 1);
    const grupos = [
      ["Atrasadas", ord.filter((t) => t.vencimento && t.vencimento < h && !t.feita)],
      ["Hoje", ord.filter((t) => t.vencimento === h && !t.feita)],
      ["Próximos 7 dias", ord.filter((t) => t.vencimento > h && t.vencimento <= sete && !t.feita)],
      ["Mais adiante", ord.filter((t) => t.vencimento > sete && !t.feita)],
      ["Sem data", ord.filter((t) => !t.vencimento && !t.feita)],
      ["Concluídas", ord.filter((t) => t.feita)],
    ];
    let html = grupos.filter(([, l]) => l.length).map(([nome, l]) => `<div class="grupo-pauta"><p class="rotulo">${nome} · ${l.length}</p>${l.map(htmlTarefa).join("")}</div>`).join("");
    // Próximos passos da planilha que ainda não viraram tarefa
    const comTarefa = new Set(tarefasAbertas().map((t) => t.processoId));
    const sugeridos = processosAtivos.filter((p) => p.proximosPassos && !comTarefa.has(p.id) && !/aguard|andamento natural|arquiv|prejudicad|baixa definitiva|sa[íi]mos da lide/i.test(p.proximosPassos)).slice(0, compacto ? 6 : 40);
    if (sugeridos.length) {
      html += `<div class="grupo-pauta"><p class="rotulo">Próximos passos sem data · ${sugeridos.length}</p>${sugeridos.map((p) => `
        <div class="tarefa"><span class="prio ${prioClasse(p)}" style="margin-top:.45rem"></span>
          <div><div class="titulo">${esc(p.proximosPassos.split("\n")[0])}</div><div class="meta"><a href="#" data-abrir="${esc(p.id)}">${esc(partes(p))}</a></div></div>
          <div class="acoes"><button class="btn mini" data-acao="agendar-passo" data-id="${esc(p.id)}" data-dias="5">+5 dias úteis</button></div></div>`).join("")}</div>`;
    }
    return html || `<p class="vazio">Nada pendente. Registre uma movimentação para gerar o próximo prazo.</p>`;
  }
  function htmlTarefa(t) {
    const p = E.processos[t.processoId];
    const r = rotuloPrazo(t.vencimento);
    const gcal = t.vencimento ? N.linkGoogleAgenda(t.titulo + (p ? " · " + partes(p) : ""), t.vencimento, (p ? numeroPrincipal(p) + "\n" : "") + (t.base || "")) : "";
    return `<div class="tarefa${t.feita ? " feita" : ""}">
      <input type="checkbox" data-acao="feita" data-id="${esc(t.id)}" ${t.feita ? "checked" : ""} aria-label="Concluir ${esc(t.titulo)}">
      <div><div class="titulo">${esc(t.titulo)}</div><div class="meta">${p ? `<a href="#" data-abrir="${esc(p.id)}">${esc(partes(p))}</a>` : ""}${t.base ? `<span>${esc(t.base)}</span>` : ""}${t.origem === "robo" ? `<span class="pill bordo">robô</span>` : ""}${gcal ? `<a href="${esc(gcal)}" target="_blank" rel="noopener">Google Agenda</a>` : ""}<a href="#" data-acao="apagar-tarefa" data-id="${esc(t.id)}">remover</a></div></div>
      <div class="data-prazo"><b>${t.vencimento ? br(t.vencimento).slice(0, 5) : "—"}</b><span class="pill ${t.feita ? "ok" : r.cls}">${t.feita ? "feita" : r.txt}</span></div></div>`;
  }

  // ---------- PROCESSOS ----------
  function montarFiltros() {
    const advs = advogados();
    $("#f-advogado").innerHTML = `<option value="">Todos</option>` + advs.map((a) => `<option ${N.norm(a) === N.norm(UI.advogado) ? "selected" : ""}>${esc(a)}</option>`).join("");
    const st = [...new Set(lista().map((p) => p.status))].sort();
    $("#f-status").innerHTML = `<option value="">Todos</option>` + st.map((s) => `<option>${esc(s)}</option>`).join("");
    $("#cr-processo").innerHTML = `<option value="">Sem processo (interno)</option>` + meus().filter(ativo).map((p) => `<option value="${esc(p.id)}">${esc(partes(p))}</option>`).join("");
  }
  let filtroIds = null;
  function filtrados() {
    const busca = N.norm($("#f-busca").value);
    const st = $("#f-status").value;
    const sit = $("#f-situacao").value;
    return meus().filter((p) => {
      if (filtroIds && !filtroIds.includes(p.id)) return false;
      if (st && p.status !== st) return false;
      if (sit === "ativos" && !ativo(p)) return false;
      if (sit === "encerrados" && ativo(p)) return false;
      if (sit === "novidades" && !p.novidades) return false;
      if (sit === "parados") { const d = N.diasParado(p); if (!ativo(p) || (d != null && d <= 45)) return false; }
      if (busca) {
        const alvo = N.norm([p.numero, p.empresa, p.outro, p.acao, p.edital, p.resumo, p.proximosPassos, p.status, p.codigo, (p.andamentos || []).map((a) => a.texto).join(" ")].join(" "));
        if (!busca.split(/\s+/).every((t) => alvo.includes(t))) return false;
      }
      return true;
    }).sort((a, b) => (b.novidades || 0) - (a.novidades || 0) || pesoPrio(a) - pesoPrio(b) || (N.diasParado(b) || 9999) - (N.diasParado(a) || 9999));
  }
  const pesoPrio = (p) => ({ alta: 0, media: 1, baixa: 2 }[N.norm(p.prioridade)] ?? 1.5);
  function renderProcessos() {
    if (!lista().length) { $("#lista-processos").innerHTML = `<div class="painel vazio">Nenhum processo. <button class="btn primario" data-acao="importar-planilha">Importar planilha</button></div>`; $("#proc-contagem").textContent = ""; return; }
    const l = filtrados();
    $("#proc-contagem").textContent = l.length + " de " + meus().length + " processos" + (UI.advogado ? " de " + UI.advogado : "") + (filtroIds ? " (seleção da ideia)" : "");
    $("#aba-lista").setAttribute("aria-selected", UI.modo === "lista");
    $("#aba-quadro").setAttribute("aria-selected", UI.modo === "quadro");
    if (UI.modo === "quadro") {
      const ordem = ["Chamando o feito à ordem", "Fase citação", "Fase contestação", "Fase Réplica", "Fase audiência", "Fase sentença", "Fase Cumprimento de sentença", "Ativo", "Sem status", "Encerrado"];
      const grupos = {};
      l.forEach((p) => (grupos[p.status] = grupos[p.status] || []).push(p));
      const chaves = Object.keys(grupos).sort((a, b) => (ordem.indexOf(a) + 99) % 99 - (ordem.indexOf(b) + 99) % 99);
      $("#lista-processos").innerHTML = `<div class="quadro">${chaves.map((k) => `<section class="coluna"><h3><span>${esc(k)}</span><span class="sutil">${grupos[k].length}</span></h3>${grupos[k].map((p) => `
        <button class="cartao" data-abrir="${esc(p.id)}"><span class="mono">${esc(numeroPrincipal(p))}</span><b>${esc(partes(p))}</b><span class="sutil" style="font-size:.82rem">${esc(p.proximosPassos || p.acao || "")}</span>${htmlParado(p)}</button>`).join("")}</section>`).join("")}</div>`;
      return;
    }
    $("#lista-processos").innerHTML = l.length ? `<div class="painel tabela-wrap" style="padding:0 .4rem"><table class="processos"><thead><tr><th>Processo</th><th>Partes</th><th>Status</th><th>Última atualização</th><th>Próximo passo</th></tr></thead><tbody>${l.map((p) => `
      <tr data-abrir="${esc(p.id)}" tabindex="0">
        <td><span class="mono">${esc(numeroPrincipal(p))}</span>${p.novidades ? `<span class="novo-mov" title="${p.novidades} movimentação(ões) nova(s)"></span>` : ""}<div class="sutil" style="font-size:.8rem">${esc(p.acao || "")}${p.codigo ? " · ID " + esc(p.codigo) : ""}</div></td>
        <td class="partes"><b>${esc(p.empresa || "—")}</b><span>× ${esc(p.outro || "—")}</span></td>
        <td><div class="acoes" style="gap:.4rem"><span class="prio ${prioClasse(p)}" title="Prioridade ${esc(p.prioridade || "não definida")}"></span>${pillStatus(p)}</div></td>
        <td class="num">${p.atualizadoEm ? br(p.atualizadoEm) : "—"}<div>${htmlParado(p)}</div></td>
        <td><span class="passo">${esc(p.proximosPassos || "—")}</span></td></tr>`).join("")}</tbody></table></div>` : `<div class="painel vazio">Nenhum processo com esses filtros.</div>`;
  }
  function pillStatus(p) {
    const s = p.status;
    const cls = /encerr/i.test(s) ? "ok" : /ordem/i.test(s) ? "bordo" : /senten|audi/i.test(s) ? "aviso" : "";
    return `<span class="pill ${cls}">${esc(s)}</span>`;
  }
  function htmlParado(p) {
    if (!ativo(p)) return "";
    const d = N.diasParado(p);
    if (d == null) return `<span class="pill aviso">sem data</span>`;
    return d > 90 ? `<span class="pill critico">${d} dias parado</span>` : d > 45 ? `<span class="pill aviso">${d} dias</span>` : `<span class="pill ok">${d} dias</span>`;
  }

  // ---------- FICHA DO PROCESSO ----------
  function abrirFicha(id, comFormulario) {
    UI.fichaId = id; UI.formMov = !!comFormulario; UI.sugestoes = null; UI.analiseIa = "";
    $("#ficha").hidden = false; $("#veu").hidden = false;
    const p = E.processos[id];
    if (p && p.novidades) { p.novidades = 0; salvar("processos", p); }
    renderFicha();
    $("#ficha").scrollTop = 0;
    $("#ficha").focus();
  }
  function fecharFicha() { UI.fichaId = null; $("#ficha").hidden = true; $("#veu").hidden = true; }
  function htmlCnj(c) {
    const [seq, resto] = c.numero.split("-");
    const [dv, ano, j, tr, or] = resto.split(".");
    return `<div style="display:grid;gap:.25rem">${c.rotulo ? `<span class="rotulo">${esc(c.rotulo)}</span>` : ""}
      <div class="acoes"><span class="cnj-num"><span data-dica="Nº sequencial">${seq}</span><span data-dica="Dígito verificador ${c.digitoOk ? "conferido" : "não confere"}">${dv}</span><span data-dica="Ano de ajuizamento">${ano}</span><span class="tr" data-dica="${esc(c.segmentoNome)}">${j}</span><span class="tr" data-dica="${esc(c.tribunal)}">${tr}</span><span data-dica="Unidade de origem">${or}</span></span>
      <span class="pill">${esc(c.tribunal)}</span>${c.encerrado ? `<span class="pill ok">encerrado</span>` : ""}${c.digitoOk ? "" : `<span class="pill critico">dígito não confere</span>`}</div>
      <div class="acoes" style="font-size:.82rem">${N.linksConsulta(c).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.rotulo)}</a>`).join(" · ")}</div></div>`;
  }
  function renderFicha() {
    const p = E.processos[UI.fichaId];
    const f = $("#ficha");
    if (!p) { fecharFicha(); return; }
    const tarefas = Object.values(E.tarefas).filter((t) => t.processoId === p.id).sort((a, b) => (a.vencimento || "9") < (b.vencimento || "9") ? -1 : 1);
    const andamentos = (p.andamentos || []).map((a, i) => ({ a, i })).sort((x, y) => (y.a.data || "") > (x.a.data || "") ? 1 : (y.a.data || "") < (x.a.data || "") ? -1 : y.i - x.i);
    const relatorio = textoRelatorio(p);
    const assunto = "Atualização do processo " + numeroPrincipal(p);
    const minutosAtiv = Object.values(E.atividades).filter((a) => a.processoId === p.id).reduce((s, a) => s + a.minutos, 0);
    const statusOpc = [...new Set(["Ativo", "Fase citação", "Fase contestação", "Fase Réplica", "Fase audiência", "Fase sentença", "Fase Cumprimento de sentença", "Chamando o feito à ordem", "Encerrado", p.status])];
    f.innerHTML = `
      <div class="ficha-topo"><div><p class="rotulo">${esc(p.acao || "Processo")}${p.codigo ? " · ID " + esc(p.codigo) : ""}</p><h2>${esc(p.empresa || "—")} <span class="sutil" style="font-style:italic">×</span> ${esc(p.outro || "—")}</h2>
        <p class="sutil" style="margin:.3rem 0 0;font-size:.88rem">${esc([p.qualifEmpresa && p.empresa ? p.empresa.split(" ")[0] + ": " + p.qualifEmpresa : "", p.qualifOutro ? (p.outro || "").split(" ")[0] + ": " + p.qualifOutro : ""].filter(Boolean).join(" · "))}</p></div>
        <button class="btn fantasma" data-acao="fechar-ficha" aria-label="Fechar ficha">✕</button></div>
      <div class="cnj">${p.cnj && p.cnj.length ? p.cnj.map(htmlCnj).join("") : `<span class="sutil">${esc(p.numero || "Sem número CNJ")}</span>`}</div>
      <div class="acoes">
        <button class="btn primario" data-acao="toggle-mov">${UI.formMov ? "Fechar registro" : "Registrar movimentação"}</button>
        <button class="btn" data-acao="usar-modelo" data-modelo="${/scp/i.test(p.outro) ? "ordem" : /preg|licit|edital/i.test(p.edital + p.resumo) ? "recurso" : "relatorio"}" data-processo="${esc(p.id)}">Gerar peça</button>
        <button class="btn ia" data-acao="analisar-ia">Analisar com Claude</button>
        <a class="btn" href="${esc(N.linkGmail(assunto, relatorio))}" target="_blank" rel="noopener">Gmail</a>
        <a class="btn" href="${esc(N.linkWhatsApp(relatorio))}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn" href="${esc(N.linkOutlook(assunto, relatorio))}" target="_blank" rel="noopener">Outlook</a>
        ${p.link ? `<a class="btn" href="${esc(p.link)}" target="_blank" rel="noopener">Tribunal</a>` : ""}
        ${p.pasta ? `<a class="btn" href="${esc(p.pasta)}" target="_blank" rel="noopener">Pasta</a>` : ""}
      </div>
      ${UI.formMov ? htmlFormMov(p) : ""}
      ${UI.analiseIa ? `<section class="painel"><header><h3>Análise do Claude</h3></header><div class="resposta-ia" id="analise-ia">${md(UI.analiseIa)}</div></section>` : `<div id="analise-ia"></div>`}
      <section class="painel"><header><h3>Situação</h3><button class="btn mini" data-acao="salvar-ficha">Salvar alterações</button></header>
        <div class="linha-campos">
          <label class="campo"><span>Status</span><select id="fx-status">${statusOpc.map((s) => `<option ${s === p.status ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
          <label class="campo"><span>Prioridade</span><select id="fx-prioridade">${["", "Alta", "Média", "Baixa"].map((s) => `<option value="${s}" ${N.norm(s) === N.norm(p.prioridade) ? "selected" : ""}>${s || "Não definida"}</option>`).join("")}</select></label>
          <label class="campo"><span>Advogado</span><select id="fx-advogado">${[...new Set([...advogados(), p.advogado, USUARIO].filter(Boolean))].map((s) => `<option ${N.norm(s) === N.norm(p.advogado) ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>
          <label class="campo"><span>Previsão</span><input id="fx-previsao" type="text" value="${esc(/^\d{4}-/.test(p.previsao) ? br(p.previsao) : p.previsao)}"></label>
        </div>
        <label class="campo" style="margin-top:.75rem"><span>Próximos passos</span><textarea id="fx-passos" rows="3">${esc(p.proximosPassos)}</textarea></label>
        <div class="linha-campos" style="margin-top:.75rem">
          <label class="campo"><span>Link no tribunal</span><input id="fx-link" type="url" value="${esc(p.link)}" placeholder="https://"></label>
          <label class="campo"><span>Pasta de documentos (Drive)</span><input id="fx-pasta" type="url" value="${esc(p.pasta)}" placeholder="https://drive.google.com/…"></label>
        </div>
      </section>
      <section class="painel"><header><h3>Prazos e tarefas</h3><button class="btn mini" data-acao="nova-tarefa" data-processo="${esc(p.id)}">Nova tarefa</button></header>${tarefas.length ? tarefas.map(htmlTarefa).join("") : `<p class="vazio">Sem tarefas. Registre uma movimentação para gerar o prazo.</p>`}</section>
      ${p.resumo ? `<section class="painel"><header><h3>Resumo</h3></header><p style="margin:0;white-space:pre-line">${esc(p.resumo)}</p></section>` : ""}
      <section class="painel"><header><h3>Andamentos</h3><span class="sutil">${(p.andamentos || []).length} registros · atualizado em ${p.atualizadoEm ? br(p.atualizadoEm) : "—"}</span></header>
        <ol class="timeline">${andamentos.map(({ a }) => `<li><time>${a.data ? br(a.data) : "sem data"}</time><div>${esc(a.texto)}${a.origem !== "planilha" ? `<span class="pill origem ${/datajud|djen/.test(a.origem) ? "bordo" : "latao"}">${esc(origemNome(a.origem))}</span>` : ""}</div></li>`).join("") || `<li class="vazio">Sem andamentos.</li>`}</ol></section>
      <section class="painel"><header><h3>Dados</h3></header><dl class="dados">
        ${[["Edital / contrato", p.edital], ["Juízo", [p.juizo, p.vara].filter(Boolean).join("ª ")], ["Comarca / foro", [p.comarca, p.foro].filter(Boolean).join(" · ")], ["Valor da causa", moeda(p.valorCausa)], ["Valor P.E.", moeda(p.valorPE)], ["Horas", hhmm((p.minutos || 0) + minutosAtiv)], ["Referência", p.referencia]].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("")}
      </dl></section>
      <div class="acoes"><button class="btn fantasma" data-acao="apagar-processo" style="color:var(--critico)">Remover processo do painel</button></div>`;
  }
  function htmlFormMov(p) {
    const s = UI.sugestoes;
    return `<section class="painel" style="border-color:var(--bordo)"><header><h3>Nova movimentação</h3><span class="sutil">gera prazo sugerido automaticamente</span></header>
      ${s ? `<div style="display:grid;gap:.5rem">
          <p style="margin:0">Movimentação registrada. Sugestões a partir do texto:</p>
          ${s.length ? s.map((x, i) => `<label class="sugestao"><input type="checkbox" id="sug-${i}" ${x.vencimento || x.encerrar ? "checked" : ""}><div style="flex:1;display:grid;gap:.35rem"><b>${esc(x.titulo)}</b><span class="sutil" style="font-size:.82rem">${esc(x.base)}${x.dias ? " · " + x.dias + " dias" + (x.base.includes("14.133") ? " úteis" : " úteis") : ""}</span>${x.encerrar ? "" : `<input type="date" id="sug-data-${i}" value="${esc(x.vencimento || "")}">`}</div></label>`).join("") : `<p class="sutil">Nenhum prazo reconhecido no texto. Crie uma tarefa manualmente se precisar.</p>`}
          <div class="acoes"><button class="btn primario" data-acao="aplicar-sugestoes">Criar selecionadas</button><button class="btn" data-acao="toggle-mov">Fechar</button></div></div>`
        : `<div class="linha-campos"><label class="campo"><span>Data</span><input id="mov-data" type="date" value="${hoje()}"></label></div>
          <label class="campo" style="margin-top:.75rem"><span>O que aconteceu</span><textarea id="mov-texto" rows="3" placeholder="Ex.: Intimação para apresentar contrarrazões ao recurso de apelação (DJEN)"></textarea></label>
          <div class="acoes" style="margin-top:.75rem"><button class="btn primario" data-acao="registrar-mov">Registrar e calcular prazo</button></div>`}
    </section>`;
  }
  function textoRelatorio(p) {
    const ult = (p.andamentos || []).filter((a) => a.data).sort((a, b) => (a.data < b.data ? 1 : -1)).slice(0, 3);
    return `Prezado(a),\n\nSegue atualização do processo ${numeroPrincipal(p)} (${p.acao || "ação"}), ${partes(p)}.\n\nSituação: ${p.status}.\n` +
      (ult.length ? "Últimos andamentos:\n" + ult.map((a) => "- " + br(a.data) + ": " + a.texto).join("\n") + "\n" : "") +
      (p.proximosPassos ? "\nPróximos passos: " + p.proximosPassos + "\n" : "") + "\nFicamos à disposição.\n\nAtenciosamente,\nDr. " + USUARIO;
  }
  function registrarMov() {
    const p = E.processos[UI.fichaId];
    const data = $("#mov-data").value || hoje();
    const texto = $("#mov-texto").value.trim();
    if (!texto) { toast("Descreva a movimentação antes de registrar."); $("#mov-texto").focus(); return; }
    p.andamentos = (p.andamentos || []).concat([{ data, texto, origem: "manual" }]);
    if (!p.atualizadoEm || data > p.atualizadoEm) p.atualizadoEm = data;
    salvar("processos", p);
    UI.sugestoes = N.sugerirAposMovimentacao(texto, data, p);
    renderFicha();
    toast("Movimentação registrada.");
  }
  function aplicarSugestoes() {
    const p = E.processos[UI.fichaId];
    let n = 0;
    (UI.sugestoes || []).forEach((s, i) => {
      if (!$("#sug-" + i) || !$("#sug-" + i).checked) return;
      if (s.encerrar) { p.status = "Encerrado"; salvar("processos", p); return; }
      const venc = ($("#sug-data-" + i) || {}).value || null;
      salvar("tarefas", { id: novoId("t"), titulo: s.titulo, processoId: p.id, vencimento: venc, base: s.base, feita: false, criadaEm: hoje(), origem: "movimentacao" });
      n++;
    });
    UI.sugestoes = null; UI.formMov = false;
    renderTudo();
    toast(n ? n + " tarefa(s) criada(s) na pauta." : "Pronto.");
  }
  function salvarFicha() {
    const p = E.processos[UI.fichaId];
    p.status = $("#fx-status").value;
    p.prioridade = $("#fx-prioridade").value;
    p.advogado = $("#fx-advogado").value;
    const prev = $("#fx-previsao").value.trim();
    p.previsao = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(prev) ? N.lerData(prev) : prev;
    p.proximosPassos = $("#fx-passos").value.trim();
    p.link = $("#fx-link").value.trim();
    p.pasta = $("#fx-pasta").value.trim();
    p.atualizadoEm = hoje() > (p.atualizadoEm || "") ? hoje() : p.atualizadoEm;
    salvar("processos", p);
    montarFiltros();
    renderTudo();
    toast("Processo atualizado.");
  }
  async function analisarIa() {
    const p = E.processos[UI.fichaId];
    UI.analiseIa = "Pensando…";
    renderFicha();
    const prompt = `Você é assessor jurídico sênior de um escritório brasileiro. Analise o processo abaixo e responda em português, em Markdown curto, com as seções: "Onde estamos" (2 frases), "Riscos e pontos de atenção" (até 4 itens), "Próximos passos recomendados" (até 4 itens com prazo legal quando houver, citando o artigo), "Mensagem para o cliente" (3 frases simples). Não invente fatos nem datas que não estejam nos dados; se faltar informação, diga o que conferir.

DADOS DO PROCESSO
Ação: ${p.acao}
Partes: ${p.empresa} (${p.qualifEmpresa}) x ${p.outro} (${p.qualifOutro})
Números: ${p.numero}
Edital/contrato: ${p.edital}
Status: ${p.status} | Prioridade: ${p.prioridade || "não definida"}
Resumo: ${p.resumo}
Andamentos:
${(p.andamentos || []).map((a) => "- " + (a.data ? br(a.data) : "s/d") + ": " + a.texto).join("\n")}
Próximos passos anotados: ${p.proximosPassos}
Data de hoje: ${br(hoje())}`;
    try {
      await perguntarClaude(prompt, (t) => { UI.analiseIa = t; const el = $("#analise-ia"); if (el) el.innerHTML = md(t); });
      renderFicha();
    } catch (e) { UI.analiseIa = erroIa(e); renderFicha(); }
  }

  // ---------- PRAZOS ----------
  function renderPrazos() {
    const ts = Object.values(E.tarefas).filter((t) => UI.mostrarFeitas || !t.feita);
    $("#pauta-completa").innerHTML = htmlPauta(ts, meus().filter(ativo), false);
    if (!$("#calc-inicio").value) $("#calc-inicio").value = hoje();
    calcular();
    renderCalendario();
  }
  function calcular() {
    const r = N.calcularPrazo($("#calc-inicio").value, +$("#calc-dias").value, { uteis: $("#calc-modo").value === "uteis" });
    if (!r) { $("#calc-resultado").innerHTML = `<p class="sutil">Informe a data e o número de dias.</p>`; return; }
    const venc = N.deIso(r.vencimento);
    $("#calc-resultado").innerHTML = `<p class="rotulo">Vencimento</p><p style="margin:.1rem 0 .5rem"><span style="font-family:var(--f-display);font-size:1.9rem">${br(r.vencimento)}</span> <span class="sutil">${venc.toLocaleDateString("pt-BR", { weekday: "long" })}</span></p>
      ${r.pulados.length ? `<details><summary class="sutil" style="cursor:pointer">${r.pulados.length} dia(s) sem expediente descontado(s)</summary><ul style="font-size:.85rem;margin:.4rem 0 0;padding-left:1.1rem">${r.pulados.slice(0, 30).map((x) => `<li>${br(x.data)} · ${esc(x.motivo)}</li>`).join("")}</ul></details>` : ""}
      <div class="acoes" style="margin-top:.6rem"><a class="btn mini" href="${esc(N.linkGoogleAgenda("Prazo processual", r.vencimento, "Calculado no Gabinete Digital"))}" target="_blank" rel="noopener">Google Agenda</a><button class="btn mini" data-acao="nova-tarefa" data-venc="${r.vencimento}">Criar tarefa com esta data</button></div>`;
  }
  function renderCalendario() {
    const base = UI.mes || new Date();
    const ano = base.getFullYear(), mes = base.getMonth();
    $("#cal-titulo").textContent = base.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    const primeiro = new Date(ano, mes, 1);
    const ini = N.somaDias(primeiro, -primeiro.getDay());
    const porDia = {};
    Object.values(E.tarefas).filter((t) => t.vencimento && !t.feita).forEach((t) => (porDia[t.vencimento] = porDia[t.vencimento] || []).push(t));
    let html = ["D", "S", "T", "Q", "Q", "S", "S"].map((d) => `<div class="cab">${d}</div>`).join("");
    for (let i = 0; i < 42; i++) {
      const d = N.somaDias(ini, i), k = N.iso(d);
      const fer = N.ehFeriado(d);
      const cls = [d.getMonth() !== mes ? "fds" : "", d.getDay() === 0 || d.getDay() === 6 ? "fds" : "", fer ? "fer" : "", k === hoje() ? "hoje" : ""].join(" ");
      html += `<div class="${cls}" title="${esc(fer || "")}"><span class="dia-num">${d.getDate()}</span>${fer ? `<span class="ev" style="background:none;color:var(--tinta-3)">${esc(fer)}</span>` : ""}${(porDia[k] || []).map((t) => `<span class="ev" title="${esc(t.titulo)}">${esc(t.titulo)}</span>`).join("")}</div>`;
    }
    $("#calendario").innerHTML = html;
  }
  function novaTarefa(processoId, venc) {
    const opcoes = meus().filter(ativo).map((p) => `<option value="${esc(p.id)}" ${p.id === processoId ? "selected" : ""}>${esc(partes(p))}</option>`).join("");
    dialogo(`<h2>Nova tarefa</h2>
      <label class="campo"><span>O que fazer</span><input id="nt-titulo" type="text" placeholder="Ex.: Despachar com o juiz sobre a saída do polo passivo"></label>
      <label class="campo"><span>Processo</span><select id="nt-proc"><option value="">Sem processo</option>${opcoes}</select></label>
      <label class="campo"><span>Vencimento</span><input id="nt-data" type="date" value="${esc(venc || "")}"></label>`, () => {
      const titulo = $("#nt-titulo").value.trim();
      if (!titulo) { $("#nt-titulo").focus(); return false; }
      salvar("tarefas", { id: novoId("t"), titulo, processoId: $("#nt-proc").value || null, vencimento: $("#nt-data").value || null, base: "", feita: false, criadaEm: hoje(), origem: "manual" });
      renderTudo(); toast("Tarefa criada.");
    }, "Criar tarefa");
  }
  function exportarIcs() {
    const evs = tarefasAbertas().filter((t) => t.vencimento).map((t) => { const p = E.processos[t.processoId]; return { uid: t.id, data: t.vencimento, titulo: t.titulo + (p ? " · " + (p.empresa || "") : ""), descricao: (p ? numeroPrincipal(p) + " · " + partes(p) + "\n" : "") + (t.base || "") }; });
    if (!evs.length) { toast("Não há tarefas com data para exportar."); return; }
    baixar("prazos-gabinete.ics", N.gerarIcs(evs), "text/calendar");
  }

  // ---------- ATELIÊ ----------
  const MODELOS = {
    ata: { nome: "Ata de audiência ou reunião", dica: "Transcreva por ditado ou arquivo" },
    recurso: { nome: "Recurso administrativo", dica: "Lei 14.133/2021, art. 165, I" },
    contrarrazoes: { nome: "Contrarrazões administrativas", dica: "Lei 14.133/2021, art. 165, § 4º" },
    impugnacao: { nome: "Impugnação ao edital", dica: "Lei 14.133/2021, art. 164" },
    ordem: { nome: "Chamar o feito à ordem", dica: "Ilegitimidade passiva da SCP" },
    embargos: { nome: "Embargos de declaração", dica: "CPC, art. 1.022" },
    relatorio: { nome: "Relatório ao cliente", dica: "Linguagem simples, pronto para e-mail" },
  };
  let atelieProcesso = "";
  function renderAtelie() {
    $("#modelos").innerHTML = Object.entries(MODELOS).map(([k, m]) => `<button class="modelo" data-acao="modelo" data-modelo="${k}" aria-pressed="${k === UI.modelo}"><b>${m.nome}</b><small>${m.dica}</small></button>`).join("");
    if ($("#atelie-form").dataset.modelo !== UI.modelo || $("#atelie-form").dataset.proc !== atelieProcesso) montarFormAtelie();
    const pecas = Object.values(E.pecas).sort((a, b) => (a.criadaEm < b.criadaEm ? 1 : -1));
    $("#bib-contagem").textContent = pecas.length + " documento(s)";
    $("#biblioteca").innerHTML = pecas.length ? pecas.map((x) => `<div class="tarefa" style="grid-template-columns:minmax(0,1fr) auto"><div><div class="titulo">${esc(x.titulo)}</div><div class="meta"><span>${esc((MODELOS[x.modelo] || {}).nome || x.modelo)}</span><span>${br(x.criadaEm)}</span></div></div><div class="acoes"><button class="btn mini" data-acao="abrir-peca" data-id="${esc(x.id)}">Abrir</button><button class="btn mini fantasma" data-acao="apagar-peca" data-id="${esc(x.id)}">Remover</button></div></div>`).join("") : `<p class="vazio">As minutas salvas aparecem aqui.</p>`;
    atualizarGmailPeca();
  }
  function campo(id, rotulo, valor, tipo = "text", extra = "") {
    if (tipo === "area") return `<label class="campo"><span>${rotulo}</span><textarea id="${id}" rows="${extra || 4}">${esc(valor)}</textarea></label>`;
    return `<label class="campo"><span>${rotulo}</span><input id="${id}" type="${tipo}" value="${esc(valor)}" ${extra}></label>`;
  }
  function montarFormAtelie() {
    const form = $("#atelie-form");
    form.dataset.modelo = UI.modelo; form.dataset.proc = atelieProcesso;
    const p = E.processos[atelieProcesso] || {};
    const juizo = [p.juizo ? p.juizo + "ª" : "", p.vara, p.comarca ? "da Comarca de " + p.comarca : ""].filter(Boolean).join(" ");
    const opcoes = lista().filter(ativo).sort((a, b) => partes(a).localeCompare(partes(b))).map((x) => `<option value="${esc(x.id)}" ${x.id === atelieProcesso ? "selected" : ""}>${esc(partes(x))}</option>`).join("");
    let h = `<header><h2>${MODELOS[UI.modelo].nome}</h2></header><div style="display:grid;gap:.75rem">
      <label class="campo"><span>Processo vinculado</span><select id="at-proc"><option value="">Nenhum</option>${opcoes}</select></label>`;
    const m = UI.modelo;
    if (m === "ata") {
      h += `<div class="linha-campos">${campo("at-tipo", "Tipo", "Audiência de conciliação")}${campo("at-data", "Data", hoje(), "date")}${campo("at-hora", "Horário", "", "text", 'placeholder="14h00"')}</div>
        ${campo("at-local", "Local ou plataforma", juizo || "Microsoft Teams")}
        ${campo("at-presentes", "Presentes", [USUARIO ? "Dr. " + USUARIO + " (advogado)" : "", p.empresa ? "Representante de " + p.empresa : "", p.outro ? "Representante de " + p.outro : ""].filter(Boolean).join("\n"), "area", 3)}
        <label class="campo"><span>Transcrição ou anotações</span><textarea id="at-texto" rows="9" placeholder="Dite, cole a transcrição do Teams/Meet/Zoom ou envie um arquivo .txt, .vtt, .srt ou .docx"></textarea></label>
        <div class="acoes"><button class="btn mini" data-acao="ditado" id="btn-ditado">Ditar</button><label class="btn mini" for="at-arquivo">Enviar arquivo</label><input type="file" id="at-arquivo" accept=".txt,.vtt,.srt,.docx,.md" hidden><button class="btn mini" data-acao="extrair-tarefas">Extrair prazos da ata</button><span class="sutil" id="ditado-status" style="font-size:.82rem"></span></div>`;
    } else if (m === "recurso" || m === "contrarrazoes") {
      h += `${campo("at-orgao", "Autoridade destinatária", "Ilmo(a). Sr(a). Agente de Contratação / Pregoeiro(a)")}
        <div class="linha-campos">${campo("at-certame", "Certame", p.edital || "Pregão Eletrônico nº ")}${campo("at-intimacao", "Intimação / divulgação", hoje(), "date")}</div>
        ${campo("at-empresa", m === "recurso" ? "Recorrente" : "Recorrida (nossa cliente)", p.empresa || "")}
        ${campo("at-adversa", m === "recurso" ? "Licitante beneficiada pela decisão" : "Recorrente adversária", p.outro || "")}
        ${campo("at-decisao", m === "recurso" ? "Decisão recorrida" : "O que o recurso adversário alega", m === "recurso" ? "Decisão que inabilitou a recorrente / habilitou a adversária, sob o fundamento de…" : "", "area", 3)}
        ${campo("at-fund", "Fundamentos e argumentos", p.resumo || "", "area", 6)}
        <p class="sutil" style="margin:0;font-size:.85rem" id="at-prazo"></p>`;
    } else if (m === "impugnacao") {
      h += `${campo("at-orgao", "Autoridade destinatária", "Ilmo(a). Sr(a). Agente de Contratação / Pregoeiro(a)")}
        <div class="linha-campos">${campo("at-certame", "Certame", p.edital || "Pregão Eletrônico nº ")}${campo("at-abertura", "Data de abertura", "", "date")}</div>
        ${campo("at-empresa", "Impugnante", p.empresa || "")}
        ${campo("at-clausulas", "Itens do edital impugnados", "", "area", 3)}
        ${campo("at-fund", "Fundamentos", "", "area", 6)}
        <p class="sutil" style="margin:0;font-size:.85rem" id="at-prazo"></p>`;
    } else if (m === "ordem") {
      h += `${campo("at-juizo", "Juízo", juizo ? "Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a) de Direito da " + juizo : "Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a) de Direito da __ Vara __")}
        ${campo("at-numero", "Processo nº", numeroPrincipal(p) === "sem número" ? "" : (p.cnj && p.cnj[0] ? p.cnj[0].numero : ""))}
        <div class="linha-campos">${campo("at-autor", "Parte autora", p.empresa || "")}${campo("at-scp", "Parte indicada no polo passivo", p.outro || "DIMPI - SCP")}</div>
        <div class="linha-campos">${campo("at-baixa", "Encerramento da SCP / contrato", "", "date")}${campo("at-cnpj", "CNPJ baixado", "")}</div>
        ${campo("at-fund", "Fatos específicos do caso", p.resumo || "", "area", 5)}`;
    } else if (m === "embargos") {
      h += `${campo("at-juizo", "Juízo", juizo ? "Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a) de Direito da " + juizo : "Excelentíssimo(a) Senhor(a) Doutor(a) Juiz(a) de Direito")}
        <div class="linha-campos">${campo("at-numero", "Processo nº", p.cnj && p.cnj[0] ? p.cnj[0].numero : "")}${campo("at-intimacao", "Intimação da decisão", hoje(), "date")}</div>
        ${campo("at-empresa", "Embargante", p.empresa || "")}
        <label class="campo"><span>Vício</span><select id="at-vicio"><option>Omissão</option><option>Contradição</option><option>Obscuridade</option><option>Erro material</option></select></label>
        ${campo("at-decisao", "Trecho da decisão embargada", "", "area", 3)}
        ${campo("at-fund", "Ponto não enfrentado / argumento", "", "area", 5)}
        <p class="sutil" style="margin:0;font-size:.85rem" id="at-prazo"></p>`;
    } else {
      h += `${campo("at-dest", "Destinatário", p.empresa ? "Equipe " + p.empresa : "")}
        <label class="campo"><span>Tom</span><select id="at-tom"><option>Executivo, direto</option><option>Didático, para leigos</option><option>Formal</option></select></label>
        ${campo("at-fund", "Observações para incluir", "", "area", 4)}`;
    }
    h += `</div>`;
    form.innerHTML = h;
    atualizarPrazoAtelie();
    const arq = $("#at-arquivo");
    if (arq) arq.addEventListener("change", lerArquivoAta);
  }
  function v(id) { const el = $("#" + id); return el ? el.value.trim() : ""; }
  function atualizarPrazoAtelie() {
    const alvo = $("#at-prazo");
    if (!alvo) return;
    if (UI.modelo === "impugnacao") {
      const ab = v("at-abertura");
      if (!ab) { alvo.textContent = "Informe a abertura: a impugnação cabe até 3 dias úteis antes (art. 164)."; return; }
      let d = N.deIso(ab), n = 0;
      while (n < 3) { d = N.somaDias(d, -1); if (N.ehDiaUtil(d, false)) n++; }
      alvo.textContent = "Protocolar até " + br(N.iso(d)) + " (3 dias úteis antes da abertura).";
      return;
    }
    const dias = UI.modelo === "embargos" ? 5 : 3;
    const r = N.calcularPrazo(v("at-intimacao") || hoje(), dias, { recesso: UI.modelo === "embargos" });
    alvo.textContent = "Prazo de " + dias + " dias úteis: vence em " + br(r.vencimento) + ".";
  }
  function dadosForm() {
    const o = {};
    $$("#atelie-form [id^='at-']").forEach((el) => { if (el.type !== "file") o[el.id.slice(3)] = el.value.trim(); });
    return o;
  }
  const par = (t) => `<p>${esc(t)}</p>`;
  function minutaPronta() {
    const d = dadosForm();
    const p = E.processos[d.proc] || {};
    const local = (p.comarca || "Rio de Janeiro") + ", " + new Date().toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" }) + ".";
    const ass = `<p style="text-align:center;margin-top:2em">${esc(local)}</p><p style="text-align:center">______________________________<br>Dr. ${esc(USUARIO)}<br>OAB/__ nº ______</p>`;
    const linhas = (t) => String(t || "").split(/\n+/).filter(Boolean).map(par).join("");
    switch (UI.modelo) {
      case "ata": {
        const texto = limparTranscricao(d.texto);
        return `<h4>Ata de ${esc(d.tipo || "reunião")}</h4>` +
          par(`Aos ${d.data ? br(d.data) : "__/__/____"}${d.hora ? ", às " + d.hora : ""}, em ${d.local || "__"}, reuniram-se os presentes abaixo relacionados${p.id ? ", nos autos do processo nº " + numeroPrincipal(p) + " (" + partes(p) + ")" : ""}.`) +
          `<p><b>Presentes:</b></p>` + linhas(d.presentes) +
          `<p><b>Ocorrências:</b></p>` + (texto ? linhas(texto) : par("[transcrição]")) +
          `<p><b>Deliberações e encaminhamentos:</b></p>` + par("1. [responsável] — [providência] — [prazo]") +
          par("Nada mais havendo, encerrou-se a sessão, lavrando-se a presente ata, que vai assinada pelos presentes.") + ass;
      }
      case "recurso":
        return par(d.orgao) + par(d.certame) + "<br>" +
          par(`${(d.empresa || "[RECORRENTE]").toUpperCase()}, já qualificada nos autos do certame em epígrafe, por seu advogado, vem, tempestivamente, com fundamento no art. 165, inciso I, da Lei nº 14.133/2021, interpor`) +
          `<h4>Recurso administrativo</h4>` + par(`contra a decisão que ${d.decisao || "[descrever a decisão recorrida]"}, pelas razões a seguir expostas.`) +
          `<p><b>I. DA TEMPESTIVIDADE</b></p>` + par(`A intimação ocorreu em ${d.intimacao ? br(d.intimacao) : "__/__/____"}. Interposto dentro do prazo de 3 (três) dias úteis previsto no art. 165, I, da Lei nº 14.133/2021, o recurso é tempestivo.`) +
          `<p><b>II. DOS FATOS</b></p>` + par(`Trata-se de ${d.certame || "certame"}${d.adversa ? ", no qual a licitante " + d.adversa + " foi beneficiada pela decisão ora atacada" : ""}.`) +
          `<p><b>III. DAS RAZÕES</b></p>` + linhas(d.fund || "[fundamentos]") +
          par("A decisão contraria os princípios da vinculação ao edital, do julgamento objetivo, da razoabilidade e da competitividade (art. 5º da Lei nº 14.133/2021), bem como a vedação a exigências que não constem do instrumento convocatório.") +
          `<p><b>IV. DOS PEDIDOS</b></p>` + par("Diante do exposto, requer: (a) o recebimento e o provimento do presente recurso, com a reforma da decisão recorrida; (b) caso não haja retratação, o encaminhamento à autoridade superior, nos termos do art. 165, § 2º, da Lei nº 14.133/2021; (c) a atribuição de efeito suspensivo, na forma do art. 168.") +
          par("Termos em que pede deferimento.") + ass;
      case "contrarrazoes":
        return par(d.orgao) + par(d.certame) + "<br>" +
          par(`${(d.empresa || "[RECORRIDA]").toUpperCase()}, já qualificada, por seu advogado, vem, com fundamento no art. 165, § 4º, da Lei nº 14.133/2021, apresentar`) +
          `<h4>Contrarrazões ao recurso administrativo</h4>` + par(`interposto por ${d.adversa || "[RECORRENTE]"}, pelos fundamentos a seguir.`) +
          `<p><b>I. DA TEMPESTIVIDADE</b></p>` + par(`Intimada em ${d.intimacao ? br(d.intimacao) : "__/__/____"}, a recorrida apresenta as contrarrazões no prazo de 3 (três) dias úteis.`) +
          `<p><b>II. SÍNTESE DO RECURSO</b></p>` + linhas(d.decisao || "[o que alega a recorrente]") +
          `<p><b>III. DAS RAZÕES PARA O IMPROVIMENTO</b></p>` + linhas(d.fund || "[argumentos]") +
          par("A decisão recorrida observou o edital e o julgamento objetivo, não havendo vício a ser corrigido.") +
          `<p><b>IV. DO PEDIDO</b></p>` + par("Requer o conhecimento e o não provimento do recurso, mantendo-se integralmente a decisão recorrida.") + par("Termos em que pede deferimento.") + ass;
      case "impugnacao":
        return par(d.orgao) + par(d.certame) + "<br>" +
          par(`${(d.empresa || "[IMPUGNANTE]").toUpperCase()}, por seu advogado, vem, com fundamento no art. 164 da Lei nº 14.133/2021, apresentar`) +
          `<h4>Impugnação ao edital</h4>` + `<p><b>I. DA TEMPESTIVIDADE</b></p>` + par(`A impugnação é apresentada até 3 (três) dias úteis antes da data de abertura${d.abertura ? " (" + br(d.abertura) + ")" : ""}, conforme o art. 164.`) +
          `<p><b>II. DOS ITENS IMPUGNADOS</b></p>` + linhas(d.clausulas || "[itens]") + `<p><b>III. DOS FUNDAMENTOS</b></p>` + linhas(d.fund || "[fundamentos]") +
          par("As exigências restringem indevidamente a competitividade, em afronta ao art. 9º, I, \"a\", da Lei nº 14.133/2021.") +
          `<p><b>IV. DOS PEDIDOS</b></p>` + par("Requer o acolhimento da impugnação, com a retificação do edital e a republicação com reabertura do prazo, nos termos do art. 55, § 1º, da Lei nº 14.133/2021, e resposta no prazo de 3 (três) dias úteis (art. 164, parágrafo único).") + ass;
      case "ordem":
        return par(d.juizo) + par("Processo nº " + (d.numero || "____")) + "<br>" +
          par(`${(d.scp || "DIMPI - SCP").toUpperCase()}, indicada no polo passivo da ação proposta por ${d.autor || "[AUTOR]"}, vem, por seu advogado, requerer que este Juízo`) +
          `<h4>Chame o feito à ordem</h4>` +
          par(`A Sociedade em Conta de Participação indicada encerrou suas atividades e teve o contrato que a vinculava ao ente público extinto em ${d.baixa ? br(d.baixa) : "__/__/____"}${d.cnpj ? ", com baixa do CNPJ nº " + d.cnpj : ""}, antes da ocorrência dos fatos narrados na inicial.`) +
          linhas(d.fund) +
          par("Além disso, a sociedade em conta de participação não possui personalidade jurídica (arts. 991 a 996 do Código Civil), de modo que não pode figurar como parte, sendo manifesta a ilegitimidade passiva (CPC, arts. 17 e 485, VI). A questão é de ordem pública e pode ser conhecida a qualquer tempo (CPC, art. 485, § 3º).") +
          par("Diante do exposto, requer: (a) a exclusão da requerente do polo passivo, com a extinção do feito em relação a ela, sem resolução do mérito; (b) a retificação da autuação; (c) que as intimações futuras não sejam a ela dirigidas.") +
          par("Termos em que pede deferimento.") + ass;
      case "embargos":
        return par(d.juizo) + par("Processo nº " + (d.numero || "____")) + "<br>" +
          par(`${(d.empresa || "[EMBARGANTE]").toUpperCase()}, por seu advogado, vem, com fundamento no art. 1.022 do CPC, opor`) +
          `<h4>Embargos de declaração</h4>` + par(`em face da decisão publicada em ${d.intimacao ? br(d.intimacao) : "__/__/____"}, no prazo de 5 (cinco) dias úteis (CPC, art. 1.023).`) +
          `<p><b>I. DA ${esc((d.vicio || "omissão").toUpperCase())}</b></p>` + (d.decisao ? par("A decisão consignou: \"" + d.decisao + "\".") : "") + linhas(d.fund || "[ponto não enfrentado]") +
          par("Nos termos do art. 489, § 1º, IV, do CPC, não se considera fundamentada a decisão que deixa de enfrentar argumento capaz de infirmar a conclusão adotada.") +
          `<p><b>II. DO PEDIDO</b></p>` + par(`Requer o acolhimento dos embargos para que seja sanada a ${(d.vicio || "omissão").toLowerCase()} apontada, com efeitos infringentes, se for o caso, e para fins de prequestionamento (CPC, art. 1.025).`) + ass;
      default:
        return p.id ? linhas(textoRelatorio(p) + (d.fund ? "\n\nObservações: " + d.fund : "")) : par("Vincule um processo para montar o relatório.");
    }
  }
  function limparTranscricao(t) {
    return String(t || "").replace(/^WEBVTT.*$/m, "").replace(/^\d+\s*$/gm, "").replace(/^[\d:.,]+\s*-->\s*[\d:.,]+.*$/gm, "").replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
  }
  async function redigirIa() {
    const d = dadosForm();
    const p = E.processos[d.proc];
    const ctx = p ? `\nPROCESSO: ${numeroPrincipal(p)} · ${p.acao} · ${partes(p)} · status ${p.status}\nResumo: ${p.resumo}\nAndamentos: ${(p.andamentos || []).slice(-10).map((a) => (a.data ? br(a.data) : "") + " " + a.texto).join(" | ")}` : "";
    const campos = Object.entries(d).filter(([k, x]) => x && k !== "proc").map(([k, x]) => k + ": " + x).join("\n");
    const instr = {
      ata: "Transforme a transcrição em ATA formal em português: título, qualificação (data, hora, local), presentes, resumo objetivo do que foi dito por cada parte (sem inventar falas), deliberações, encaminhamentos numerados com responsável e prazo quando citados, e fecho. Corrija vícios de fala e repetições da transcrição. Onde algo estiver inaudível ou ambíguo, marque [conferir].",
      recurso: "Redija RECURSO ADMINISTRATIVO completo com base no art. 165, I, da Lei 14.133/2021: endereçamento, qualificação, tempestividade, fatos, razões (vinculação ao edital, julgamento objetivo, formalismo moderado, diligência do art. 64), pedidos (reforma, encaminhamento à autoridade superior, efeito suspensivo do art. 168).",
      contrarrazoes: "Redija CONTRARRAZÕES a recurso administrativo (art. 165, § 4º, Lei 14.133/2021), rebatendo ponto a ponto as alegações e pedindo o não provimento.",
      impugnacao: "Redija IMPUGNAÇÃO AO EDITAL (art. 164, Lei 14.133/2021), demonstrando a restrição à competitividade de cada item impugnado e pedindo retificação e republicação.",
      ordem: "Redija petição pedindo que o juízo CHAME O FEITO À ORDEM para excluir a sociedade em conta de participação do polo passivo: ausência de personalidade jurídica (CC arts. 991-996), encerramento anterior aos fatos, ilegitimidade passiva (CPC arts. 17 e 485, VI), matéria de ordem pública.",
      embargos: "Redija EMBARGOS DE DECLARAÇÃO (CPC arts. 1.022 a 1.026) apontando o vício indicado, com prequestionamento.",
      relatorio: "Escreva um e-mail de atualização ao cliente, claro, sem juridiquês, com situação atual, o que fizemos, próximos passos e riscos.",
    }[UI.modelo];
    const prompt = `Você é advogado brasileiro experiente em direito administrativo, licitações (Lei 14.133/2021) e processo civil. ${instr}
Use somente os dados fornecidos; quando faltar um dado, deixe [preencher]. Não cite jurisprudência específica com número de processo, pois não há como conferir aqui. Responda apenas com o texto da peça, em parágrafos separados por linha em branco; títulos de seção em MAIÚSCULAS numa linha própria. Finalize com local, data e "Dr. ${USUARIO}, OAB/__ nº ____".

DADOS DO FORMULÁRIO
${campos}${ctx}
Data de hoje: ${br(hoje())}`;
    const folha = $("#folha");
    const st = $("#atelie-status");
    st.textContent = "O Claude está redigindo…";
    folha.innerHTML = `<p class="sutil">Pensando…</p>`;
    try {
      const txt = await perguntarClaude(prompt, (t) => { folha.innerHTML = textoParaFolha(t); });
      folha.innerHTML = textoParaFolha(txt);
      st.textContent = "Minuta redigida pelo Claude. Revise antes de protocolar.";
    } catch (e) { st.textContent = erroIa(e); folha.innerHTML = minutaPronta(); }
    atualizarGmailPeca();
  }
  function textoParaFolha(t) {
    return String(t).replace(/\*\*/g, "").split(/\n\s*\n|\n(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 .,–-]{6,}\n)/).map((b) => b.trim()).filter(Boolean).map((b) => {
      const umaLinha = !b.includes("\n");
      if (umaLinha && b.length < 90 && b === b.toUpperCase() && /[A-Z]/.test(b)) return `<p><b>${esc(b.replace(/^#+\s*/, ""))}</b></p>`;
      return `<p>${esc(b.replace(/^#+\s*/, "")).replace(/\n/g, "<br>")}</p>`;
    }).join("");
  }
  function atualizarGmailPeca() {
    const a = $("#peca-gmail");
    if (!a) return;
    const texto = $("#folha").innerText.slice(0, 1800);
    a.href = N.linkGmail(MODELOS[UI.modelo].nome, texto);
  }
  async function lerArquivoAta(ev) {
    const f = ev.target.files[0];
    if (!f) return;
    const st = $("#ditado-status");
    try {
      let texto;
      if (/\.docx$/i.test(f.name)) {
        st.textContent = "Lendo documento…";
        await carregarScript(MAMMOTH_URL);
        texto = (await window.mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })).value;
      } else texto = await f.text();
      $("#at-texto").value = limparTranscricao(texto);
      st.textContent = f.name + " carregado.";
    } catch (e) { st.textContent = "Não consegui ler o arquivo. Envie em .txt, .vtt, .srt ou .docx."; }
    ev.target.value = "";
  }
  let reconhecedor = null;
  function alternarDitado() {
    const st = $("#ditado-status"), btn = $("#btn-ditado");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (reconhecedor) { reconhecedor.stop(); return; }
    if (!SR) { st.textContent = "Este navegador não oferece ditado. Use o Chrome ou o Edge, ou envie a transcrição em arquivo."; return; }
    reconhecedor = new SR();
    reconhecedor.lang = "pt-BR"; reconhecedor.continuous = true; reconhecedor.interimResults = true;
    const area = $("#at-texto");
    let base = area.value ? area.value.trimEnd() + "\n" : "";
    reconhecedor.onresult = (e) => {
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) base += t.trim() + " "; else parcial += t;
      }
      area.value = base + parcial;
    };
    reconhecedor.onerror = (e) => { st.textContent = e.error === "not-allowed" || e.error === "service-not-allowed" ? "O microfone está bloqueado aqui. Abra o painel direto no navegador (index.html) ou envie a transcrição em arquivo." : "Ditado interrompido: " + e.error; };
    reconhecedor.onend = () => { reconhecedor = null; btn.textContent = "Ditar"; btn.classList.remove("gravando"); if (/Gravando/.test(st.textContent)) st.textContent = "Ditado encerrado."; };
    try { reconhecedor.start(); btn.textContent = "Parar ditado"; btn.classList.add("gravando"); st.textContent = "Gravando… fale normalmente."; }
    catch (e) { reconhecedor = null; st.textContent = "Não foi possível iniciar o ditado."; }
  }
  async function extrairTarefasAta() {
    const d = dadosForm();
    const texto = $("#folha").innerText.length > 80 ? $("#folha").innerText : d.texto;
    if (!texto || texto.length < 20) { toast("Monte ou cole a ata antes de extrair os prazos."); return; }
    let itens = [];
    if (SAMPLE) {
      $("#ditado-status").textContent = "Procurando prazos e encaminhamentos…";
      try {
        itens = await SAMPLE.json(`Liste os encaminhamentos com prazo desta ata. Responda apenas com um array JSON de objetos {"titulo": string curta, "data": "AAAA-MM-DD" ou null}. Datas relativas ("em 15 dias") calcule a partir de ${hoje()} em dias corridos. Ata:\n\n${texto.slice(0, 20000)}`, { modelTier: "quick" });
      } catch (e) { $("#ditado-status").textContent = erroIa(e); }
    }
    if (!Array.isArray(itens) || !itens.length) {
      itens = [...texto.matchAll(/([^.\n]{0,80}?)(\d{1,2}\/\d{1,2}\/\d{2,4})/g)].map((m) => ({ titulo: m[1].trim() || "Compromisso da ata", data: N.lerData(m[2]) })).filter((x) => x.data && x.data >= hoje());
    }
    if (!itens.length) { $("#ditado-status").textContent = "Nenhum prazo encontrado na ata."; return; }
    itens.forEach((x) => salvar("tarefas", { id: novoId("t"), titulo: String(x.titulo || "Encaminhamento da ata").slice(0, 140), processoId: d.proc || null, vencimento: /^\d{4}-\d{2}-\d{2}$/.test(x.data || "") ? x.data : null, base: "Ata de " + (d.tipo || "reunião") + " " + (d.data ? br(d.data) : ""), feita: false, criadaEm: hoje(), origem: "ata" }));
    $("#ditado-status").textContent = itens.length + " tarefa(s) criada(s) na pauta.";
    renderTudo();
  }
  function salvarPeca() {
    const d = dadosForm();
    const p = E.processos[d.proc];
    const html = $("#folha").innerHTML;
    if ($("#folha").innerText.trim().length < 30) { toast("A minuta está vazia."); return; }
    salvar("pecas", { id: novoId("d"), modelo: UI.modelo, titulo: MODELOS[UI.modelo].nome + (p ? " · " + partes(p) : ""), processoId: d.proc || null, html, criadaEm: hoje() });
    renderAtelie(); toast("Salvo na biblioteca.");
  }
  function baixarDoc() {
    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><style>body{font-family:'Times New Roman';font-size:12pt;line-height:1.5}p{text-align:justify;margin:0 0 10pt}h4{text-align:center;text-transform:uppercase}</style></head><body>${$("#folha").innerHTML}</body></html>`;
    baixar(MODELOS[UI.modelo].nome.replace(/\s+/g, "-").toLowerCase() + "-" + hoje() + ".doc", html, "application/msword");
  }
  async function copiarPeca() {
    const t = $("#folha").innerText;
    try { await navigator.clipboard.writeText(t); toast("Texto copiado."); }
    catch (e) { const r = document.createRange(); r.selectNodeContents($("#folha")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Texto selecionado. Use Ctrl+C para copiar."); }
  }

  // ---------- HORAS ----------
  let tick = null;
  function retomarCronometro() {
    UI.cron = LS.get(P + "cron");
    if (UI.cron) {
      $("#cr-processo").value = UI.cron.processoId || ""; $("#cr-tipo").value = UI.cron.tipo; $("#cr-desc").value = UI.cron.desc;
      iniciarTick();
    }
    pintarCronometro();
  }
  function iniciarTick() { clearInterval(tick); tick = setInterval(pintarCronometro, 1000); }
  function pintarCronometro() {
    const seg = UI.cron ? Math.floor((Date.now() - UI.cron.inicio) / 1000) : 0;
    $("#relogio").textContent = [Math.floor(seg / 3600), Math.floor(seg / 60) % 60, seg % 60].map((n) => String(n).padStart(2, "0")).join(":");
    $("#cr-botao").textContent = UI.cron ? "Parar e lançar" : "Iniciar";
  }
  function alternarCronometro() {
    if (!UI.cron) {
      UI.cron = { inicio: Date.now(), processoId: $("#cr-processo").value, tipo: $("#cr-tipo").value, desc: $("#cr-desc").value.trim() };
      LS.set(P + "cron", UI.cron); iniciarTick(); pintarCronometro(); toast("Cronômetro iniciado."); return;
    }
    const minutos = Math.max(1, Math.round((Date.now() - UI.cron.inicio) / 60000));
    salvar("atividades", { id: novoId("a"), data: hoje(), processoId: $("#cr-processo").value || null, tipo: $("#cr-tipo").value, desc: $("#cr-desc").value.trim() || $("#cr-tipo").value, minutos });
    UI.cron = null; LS.del(P + "cron"); clearInterval(tick); pintarCronometro();
    renderHoras(); toast(hhmm(minutos) + " lançadas.");
  }
  function lancarManual() {
    dialogo(`<h2>Lançar horas</h2>
      <div class="linha-campos"><label class="campo"><span>Data</span><input id="lm-data" type="date" value="${hoje()}"></label><label class="campo"><span>Duração (h:mm)</span><input id="lm-dur" type="text" placeholder="1:30"></label></div>
      <label class="campo"><span>Atividade</span><input id="lm-desc" type="text"></label>`, () => {
      const m = /^(\d+)(?::(\d{1,2}))?$/.exec($("#lm-dur").value.trim());
      if (!m) { $("#lm-dur").focus(); return false; }
      salvar("atividades", { id: novoId("a"), data: $("#lm-data").value || hoje(), processoId: $("#cr-processo").value || null, tipo: $("#cr-tipo").value, desc: $("#lm-desc").value.trim() || $("#cr-tipo").value, minutos: +m[1] * 60 + +(m[2] || 0) });
      renderHoras(); toast("Horas lançadas.");
    }, "Lançar");
  }
  function renderHoras() {
    const at = Object.values(E.atividades).sort((a, b) => (a.data < b.data ? 1 : -1));
    const total = at.reduce((s, a) => s + a.minutos, 0);
    $("#horas-total").textContent = hhmm(total) + " no total";
    $("#tabela-horas").innerHTML = at.map((a) => { const p = E.processos[a.processoId]; return `<tr><td class="num">${br(a.data)}</td><td>${esc(a.desc)}<div class="sutil" style="font-size:.8rem">${esc(a.tipo)}</div></td><td>${p ? `<a href="#" data-abrir="${esc(p.id)}">${esc(p.empresa)}</a>` : "Interno"}</td><td class="num">${hhmm(a.minutos)}</td><td><button class="btn mini fantasma" data-acao="apagar-atividade" data-id="${esc(a.id)}" aria-label="Remover">✕</button></td></tr>`; }).join("") || `<tr><td colspan="5" class="vazio">Nenhuma atividade ainda. Inicie o cronômetro ao trabalhar em um processo.</td></tr>`;
    const mes = hoje().slice(0, 7);
    const porCliente = {};
    at.filter((a) => a.data.startsWith(mes)).forEach((a) => { const p = E.processos[a.processoId]; const k = p ? (p.empresa || "Sem cliente").trim() : "Interno"; porCliente[k] = (porCliente[k] || 0) + a.minutos; });
    const max = Math.max(1, ...Object.values(porCliente));
    $("#barras-horas").innerHTML = Object.entries(porCliente).sort((a, b) => b[1] - a[1]).map(([k, m]) => `<div class="barra"><span title="${esc(k)}">${esc(k)}</span><span class="trilho"><i style="width:${(m / max) * 100}%"></i></span><span class="num" style="text-align:right">${hhmm(m)}</span></div>`).join("") || `<p class="vazio">Sem horas lançadas neste mês.</p>`;
  }

  // ---------- CONEXÕES ----------
  function renderConectores() {
    if (UI.visao !== "integracoes") return;
    const nProc = lista().length;
    const card = (titulo, estado, cls, texto, acoes) => `<article class="conector"><header><h3>${titulo}</h3><span class="pill ${cls}">${estado}</span></header><p>${texto}</p><div class="acoes">${acoes}</div></article>`;
    $("#conectores").innerHTML = [
      card("Planilha Excel", nProc ? nProc + " processos" : "vazia", nProc ? "ok" : "aviso", "Importe a planilha <b>Controle de Processos Judiciais e Atividades</b> sempre que ela mudar. Andamentos e tarefas registrados aqui são preservados.", `<button class="btn mini primario" data-acao="importar-planilha">Importar .xlsx</button><button class="btn mini" data-acao="exportar-planilha">Exportar atualizada</button>`),
      card("Claude", SAMPLE ? "conectado" : "indisponível", SAMPLE ? "ok" : "", SAMPLE ? "Redige atas e peças, analisa processos e sugere ideias. Cada uso pede sua autorização na primeira vez." : "O Claude funciona quando o painel é aberto pelo claude.ai. Fora dele, o Ateliê usa os modelos prontos.", ""),
      card("Sincronização", DB ? "ativa" : "neste aparelho", DB ? "ok" : "", DB ? "Processos, tarefas, peças e horas ficam salvos na sua conta claude.ai" + (NOME_CLAUDE ? " (" + esc(NOME_CLAUDE) + ")" : "") + " e aparecem em qualquer aparelho." : "Os dados ficam no navegador deste aparelho. Faça backup em JSON ou abra pelo claude.ai para sincronizar.", `<button class="btn mini" data-acao="backup">Baixar backup</button><button class="btn mini" data-acao="restaurar">Restaurar backup</button>`),
      card("Google Agenda", "por link", "", "Cada prazo tem o botão <b>Google Agenda</b>. Para levar todos de uma vez, exporte o .ics e importe em Configurações › Importar e exportar.", `<button class="btn mini" data-acao="exportar-ics">Exportar .ics</button><a class="btn mini" href="https://calendar.google.com/calendar/r/settings/export" target="_blank" rel="noopener">Abrir importação</a>`),
      card("Gmail e Outlook", "por link", "", "Na ficha de cada processo, <b>Gmail</b> e <b>Outlook</b> abrem um e-mail de atualização ao cliente já escrito. No Ateliê, a minuta vai junto.", `<a class="btn mini" href="https://mail.google.com" target="_blank" rel="noopener">Abrir Gmail</a>`),
      card("WhatsApp", "por link", "", "Envie o resumo do processo ao cliente pelo WhatsApp Web ou celular, a partir da ficha.", `<a class="btn mini" href="https://web.whatsapp.com" target="_blank" rel="noopener">Abrir WhatsApp Web</a>`),
      card("DJEN · Comunica PJe", "consulta", "", "Diário de Justiça Eletrônico Nacional. Cada número CNJ na ficha tem o link direto para as comunicações daquele processo.", `<a class="btn mini" href="https://comunica.pje.jus.br/" target="_blank" rel="noopener">Abrir Comunica PJe</a>`),
      card("Robô DataJud (CNJ)", "movimentações", "latao", "O script <span class=\"mono\">robo/sincronizar_datajud.py</span> consulta a API pública do CNJ para todos os processos e gera <span class=\"mono\">movimentacoes.json</span>. Importe aqui: o que for novo entra na linha do tempo e vira tarefa sugerida.", `<button class="btn mini primario" data-acao="importar-movs">Importar movimentações</button><button class="btn mini" data-acao="exportar-numeros">Exportar lista de números</button>`),
      card("Tribunais", "consulta", "", "Atalhos para os sistemas onde estão os processos da carteira.", `<a class="btn mini" href="https://www3.tjrj.jus.br/consultaprocessual/" target="_blank" rel="noopener">TJRJ</a><a class="btn mini" href="https://consultasaj.tjam.jus.br/cpopg/open.do" target="_blank" rel="noopener">TJAM</a><a class="btn mini" href="https://pje.trt1.jus.br/consultaprocessual/" target="_blank" rel="noopener">TRT1</a><a class="btn mini" href="https://esaj.tjms.jus.br/cpopg5/open.do" target="_blank" rel="noopener">TJMS</a><a class="btn mini" href="https://processo.stj.jus.br/processo/pesquisa/" target="_blank" rel="noopener">STJ</a>`),
      card("Google Drive", "por processo", "", "Cole o link da pasta de documentos na ficha do processo; o botão <b>Pasta</b> passa a abrir direto.", `<a class="btn mini" href="https://drive.google.com" target="_blank" rel="noopener">Abrir Drive</a>`),
    ].join("");
  }
  async function importarPlanilha(arquivo) {
    try {
      toast("Lendo planilha…");
      await carregarScript(XLSX_URL);
      const wb = window.XLSX.read(await arquivo.arrayBuffer(), { cellDates: true });
      const nome = wb.SheetNames.find((n) => /processo/i.test(n) && /controle/i.test(n)) || wb.SheetNames[0];
      const matriz = window.XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null });
      const novos = N.processosDaPlanilha(matriz);
      let criados = 0, atualizados = 0;
      novos.forEach((p) => {
        const atual = E.processos[p.id];
        if (!atual) { salvar("processos", p); criados++; return; }
        const daPlanilha = new Set(p.andamentos.map((a) => (a.data || "") + "|" + N.norm(a.texto)));
        const extras = (atual.andamentos || []).filter((a) => a.origem !== "planilha" && !daPlanilha.has((a.data || "") + "|" + N.norm(a.texto)));
        const mesclado = Object.assign({}, p, {
          andamentos: p.andamentos.concat(extras), novidades: atual.novidades || 0,
          atualizadoEm: [p.atualizadoEm, atual.atualizadoEm].filter(Boolean).sort().pop() || null,
          link: p.link || atual.link, pasta: p.pasta || atual.pasta, minutos: Math.max(p.minutos || 0, atual.minutos || 0),
        });
        if (JSON.stringify(mesclado) !== JSON.stringify(atual)) { salvar("processos", mesclado); atualizados++; }
      });
      montarFiltros();
      if (!UI.advogado) UI.advogado = advogados().find((a) => N.norm(a) === N.norm(USUARIO)) || "";
      montarFiltros();
      renderTudo();
      toast(`Planilha importada: ${criados} novo(s), ${atualizados} atualizado(s).`);
    } catch (e) { toast("Não consegui importar: " + (e.message || e)); }
  }
  async function exportarPlanilha() {
    try {
      await carregarScript(XLSX_URL);
      const cab = ["ID", "Status", "Advogado", "Prioridade", "Ação", "Empresa", "Qualificação", "Outro envolvido", "Qualificação", "Número", "Edital/ Contrato Relacionado", "RESUMO PROCESSO", "Andamentos Atualizados", "PROX. PASSOS", "Atualizado em", "Previsão", "Juízo", "Vara", "Comarca", "Foro", "Valor da causa", "VALOR P.E", "Distribuído em", "Link no tribunal", "Horas trabalhadas", "Link para pasta de documentos"];
      const linhas = lista().map((p) => {
        const min = (p.minutos || 0) + Object.values(E.atividades).filter((a) => a.processoId === p.id).reduce((s, a) => s + a.minutos, 0);
        return [p.codigo, p.status, p.advogado, p.prioridade || p.referencia, p.acao, p.empresa, p.qualifEmpresa, p.outro, p.qualifOutro, p.numero, p.edital, p.resumo,
          (p.andamentos || []).map((a) => (a.origem !== "planilha" && a.data && !a.texto.includes(br(a.data)) ? "Em " + br(a.data) + " - " : "") + a.texto).join("\n"),
          p.proximosPassos, p.atualizadoEm ? br(p.atualizadoEm) : "", /^\d{4}-/.test(p.previsao) ? br(p.previsao) : p.previsao, p.juizo, p.vara, p.comarca, p.foro, p.valorCausa, p.valorPE, "", p.link, hhmm(min).replace("h", ":") + ":00", p.pasta];
      });
      const ws = window.XLSX.utils.aoa_to_sheet([["Controle de processos"], cab].concat(linhas));
      const wsT = window.XLSX.utils.aoa_to_sheet([["Tarefa", "Processo", "Vencimento", "Base legal", "Situação"]].concat(Object.values(E.tarefas).map((t) => [t.titulo, E.processos[t.processoId] ? numeroPrincipal(E.processos[t.processoId]) : "", t.vencimento ? br(t.vencimento) : "", t.base, t.feita ? "Realizada" : "Por fazer"])));
      const wsA = window.XLSX.utils.aoa_to_sheet([["Data", "Advogado", "Tipo", "Atividade", "Duração", "Processo"]].concat(Object.values(E.atividades).map((a) => [br(a.data), USUARIO, a.tipo, a.desc, hhmm(a.minutos), E.processos[a.processoId] ? numeroPrincipal(E.processos[a.processoId]) : "Interno"])));
      const wb = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(wb, ws, "1. Controle de processos");
      window.XLSX.utils.book_append_sheet(wb, wsA, "2. Controle de atividades");
      window.XLSX.utils.book_append_sheet(wb, wsT, "Prazos e tarefas");
      const bytes = window.XLSX.write(wb, { bookType: "xlsx", type: "array" });
      baixar("Controle de Processos - atualizado " + hoje() + ".xlsx", new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    } catch (e) { toast("Não consegui gerar a planilha: " + (e.message || e)); }
  }
  async function importarJson(arquivo) {
    let dados;
    try { dados = JSON.parse(await arquivo.text()); } catch (e) { toast("O arquivo não é um JSON válido."); return; }
    if (dados && dados.processos && !Array.isArray(dados.processos) && /^(datajud|djen)$/.test(dados.fonte)) return importarMovs(dados);
    if (dados && dados.processos && dados.tarefas) {
      COLS.forEach((c) => Object.values(dados[c] || {}).forEach((o) => salvar(c, o)));
      montarFiltros(); renderTudo(); toast("Backup restaurado.");
      return;
    }
    toast("Arquivo não reconhecido. Use um backup do painel ou o movimentacoes.json do robô.");
  }
  function importarMovs(dados) {
    const origem = dados.fonte === "djen" ? "djen" : "datajud";
    let total = 0, procs = 0, tarefas = 0;
    lista().forEach((p) => {
      const movs = [];
      (p.cnj || []).forEach((c) => (dados.processos[c.digitos] || []).forEach((m) => movs.push({ data: N.lerData(m.data), texto: m.texto + (p.cnj.length > 1 && c.rotulo ? " [" + c.rotulo + "]" : ""), origem })));
      const novas = N.mesclarMovimentacoes(p, movs);
      if (!novas.length) return;
      p.andamentos = (p.andamentos || []).concat(novas);
      p.novidades = (p.novidades || 0) + novas.length;
      const ult = N.ultimaDataAndamento(novas);
      if (ult && (!p.atualizadoEm || ult > p.atualizadoEm)) p.atualizadoEm = ult;
      salvar("processos", p);
      total += novas.length; procs++;
      // A movimentação mais recente gera a tarefa sugerida.
      const recente = novas.slice().sort((a, b) => ((a.data || "") < (b.data || "") ? 1 : -1))[0];
      const s = N.sugerirAposMovimentacao(recente.texto, recente.data || hoje(), p).find((x) => !x.encerrar);
      if (s && s.vencimento && s.vencimento >= hoje()) { salvar("tarefas", { id: novoId("t"), titulo: s.titulo, processoId: p.id, vencimento: s.vencimento, base: s.base + " · " + recente.texto.slice(0, 60), feita: false, criadaEm: hoje(), origem: "robo" }); tarefas++; }
    });
    renderTudo();
    toast(total ? `${total} movimentação(ões) nova(s) em ${procs} processo(s); ${tarefas} prazo(s) sugerido(s).` : "Nenhuma movimentação nova.");
  }
  function exportarNumeros() {
    const nums = [];
    lista().filter(ativo).forEach((p) => (p.cnj || []).filter((c) => !c.encerrado).forEach((c) => nums.push(c.numero)));
    baixar("numeros-processos.txt", [...new Set(nums)].join("\n") + "\n", "text/plain");
  }
  function backup() { baixar("gabinete-backup-" + hoje() + ".json", JSON.stringify(Object.assign({ versao: 1, geradoEm: new Date().toISOString() }, E)), "application/json"); }

  // ---------- Ideias do Claude ----------
  async function ideiasIa() {
    const box = $("#ideias-ia");
    box.hidden = false;
    box.innerHTML = `<div class="resposta-ia"><p class="sutil">Pensando…</p></div>`;
    const at = meus().filter(ativo);
    const resumo = at.map((p) => `- [${numeroPrincipal(p)}] ${p.acao} | ${partes(p)} | ${p.status} | parado ${N.diasParado(p) ?? "?"} dias | próximo: ${p.proximosPassos || "-"} | último: ${((p.andamentos || []).slice(-1)[0] || {}).texto || "-"}`).join("\n");
    const prompt = `Você é sócio consultor de um escritório de advocacia brasileiro focado em contencioso cível, trabalhista e licitações. Abaixo está a carteira ativa do Dr. ${USUARIO}. Dê até 6 ideias práticas e específicas, em Markdown, cada uma com título em negrito e 1-2 frases: o que fazer esta semana, teses que se repetem e podem virar modelo, processos que podem ser encerrados, riscos de prazo, oportunidades de automação e de relacionamento com o cliente. Cite os números de processo. Não invente fatos.

Hoje: ${br(hoje())}
CARTEIRA:
${resumo}`;
    try { await perguntarClaude(prompt, (t) => { box.innerHTML = `<div class="resposta-ia">${md(t)}</div>`; }); }
    catch (e) { box.innerHTML = `<p class="sutil">${esc(erroIa(e))}</p>`; }
  }
  function md(t) {
    const linhas = String(t || "").split("\n");
    let html = "", lista = false;
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, '<span class="mono">$1</span>');
    for (const l of linhas) {
      const li = /^\s*(?:[-*•]|\d+[.)])\s+(.*)/.exec(l);
      if (li) { if (!lista) { html += "<ul>"; lista = true; } html += "<li>" + inline(li[1]) + "</li>"; continue; }
      if (lista) { html += "</ul>"; lista = false; }
      const h = /^#{1,6}\s+(.*)/.exec(l);
      if (h) html += "<h4>" + inline(h[1]) + "</h4>";
      else if (l.trim()) html += "<p>" + inline(l) + "</p>";
    }
    return html + (lista ? "</ul>" : "");
  }

  // =====================================================================
  // EVENTOS
  // =====================================================================
  document.addEventListener("click", (ev) => {
    const abrir = ev.target.closest("[data-abrir]");
    if (abrir) { ev.preventDefault(); abrirFicha(abrir.dataset.abrir); return; }
    const navb = ev.target.closest("[data-ir]");
    if (navb) { ir(navb.dataset.ir); return; }
    const modo = ev.target.closest("[data-modo]");
    if (modo) { UI.modo = modo.dataset.modo; renderProcessos(); return; }
    const el = ev.target.closest("[data-acao]");
    if (!el) return;
    const a = el.dataset.acao;
    if (el.tagName === "A" && el.getAttribute("href") === "#") ev.preventDefault();
    const acoes = {
      sair, "fechar-ficha": fecharFicha,
      kpi: () => {
        const alvo = el.dataset.alvo;
        if (alvo === "prazos") return ir("prazos");
        if (alvo === "horas") return ir("horas");
        filtroIds = null; $("#f-situacao").value = alvo === "parados" ? "parados" : "ativos"; ir("processos");
      },
      "nova-tarefa": () => novaTarefa(el.dataset.processo || UI.fichaId, el.dataset.venc),
      "registrar-rapido": () => {
        const opc = meus().filter(ativo).map((p) => `<option value="${esc(p.id)}">${esc(partes(p))} · ${esc(numeroPrincipal(p))}</option>`).join("");
        if (!opc) { toast("Importe ou cadastre um processo primeiro."); return; }
        dialogo(`<h2>Registrar movimentação</h2><label class="campo"><span>Processo</span><select id="rr-proc">${opc}</select></label>`, () => { abrirFicha($("#rr-proc").value, true); }, "Continuar");
      },
      feita: () => { const t = E.tarefas[el.dataset.id]; if (t) { t.feita = el.checked; t.feitaEm = el.checked ? hoje() : null; salvar("tarefas", t); setTimeout(renderTudo, 250); } },
      "apagar-tarefa": () => { remover("tarefas", el.dataset.id); renderTudo(); toast("Tarefa removida."); },
      "agendar-passo": () => {
        const p = E.processos[el.dataset.id];
        const venc = N.calcularPrazo(hoje(), +el.dataset.dias).vencimento;
        salvar("tarefas", { id: novoId("t"), titulo: p.proximosPassos.split("\n")[0].slice(0, 140), processoId: p.id, vencimento: venc, base: "Próximo passo da planilha", feita: false, criadaEm: hoje(), origem: "manual" });
        renderTudo(); toast("Agendado para " + br(venc) + ".");
      },
      "usar-modelo": () => { UI.modelo = el.dataset.modelo; if (el.dataset.processo) atelieProcesso = el.dataset.processo; fecharFicha(); ir("atelie"); },
      "filtrar-ids": () => { filtroIds = el.dataset.ids.split(","); $("#f-situacao").value = ""; ir("processos"); },
      "limpar-filtros": () => { filtroIds = null; $("#f-busca").value = ""; $("#f-status").value = ""; $("#f-situacao").value = "ativos"; renderProcessos(); },
      "novo-processo": () => {
        dialogo(`<h2>Novo processo</h2>
          <label class="campo"><span>Número CNJ</span><input id="np-num" type="text" class="mono" placeholder="0000000-00.0000.0.00.0000"></label>
          <label class="campo"><span>Ação</span><input id="np-acao" type="text" placeholder="Mandado de Segurança"></label>
          <div class="linha-campos"><label class="campo"><span>Cliente</span><input id="np-emp" type="text"></label><label class="campo"><span>Parte contrária</span><input id="np-outro" type="text"></label></div>`, () => {
          const numero = $("#np-num").value.trim();
          const cnj = N.analisarCnj(numero);
          const id = cnj[0] ? cnj[0].digitos : novoId("m");
          if (E.processos[id]) { toast("Esse processo já está no painel."); abrirFicha(id); return; }
          salvar("processos", { id, codigo: "", status: "Ativo", advogado: USUARIO, prioridade: "", referencia: "", acao: $("#np-acao").value.trim(), empresa: $("#np-emp").value.trim(), qualifEmpresa: "", outro: $("#np-outro").value.trim(), qualifOutro: "", numero, cnj, edital: "", resumo: "", andamentos: [], proximosPassos: "", atualizadoEm: hoje(), previsao: "", juizo: "", vara: "", comarca: "", foro: "", valorCausa: null, valorPE: null, link: "", pasta: "", minutos: 0, novidades: 0 });
          montarFiltros(); abrirFicha(id);
        }, "Cadastrar");
      },
      "toggle-mov": () => { UI.formMov = !UI.formMov; UI.sugestoes = null; renderFicha(); if (UI.formMov) $("#mov-texto").focus(); },
      "registrar-mov": registrarMov, "aplicar-sugestoes": aplicarSugestoes, "salvar-ficha": salvarFicha, "analisar-ia": analisarIa,
      "apagar-processo": () => dialogo(`<h2>Remover processo?</h2><p>O processo sai do painel com seus andamentos registrados. A planilha original não é alterada.</p>`, () => { const id = UI.fichaId; fecharFicha(); remover("processos", id); renderTudo(); toast("Processo removido."); }, "Remover"),
      "exportar-ics": exportarIcs,
      mes: () => { const b = UI.mes || new Date(); UI.mes = new Date(b.getFullYear(), b.getMonth() + +el.dataset.delta, 1); renderCalendario(); },
      modelo: () => { UI.modelo = el.dataset.modelo; renderAtelie(); },
      montar: () => { $("#folha").innerHTML = minutaPronta(); $("#atelie-status").textContent = "Minuta montada com o modelo. Edite à vontade."; atualizarGmailPeca(); },
      "redigir-ia": redigirIa, "copiar-peca": copiarPeca, "baixar-doc": baixarDoc, "salvar-peca": salvarPeca,
      "abrir-peca": () => { const x = E.pecas[el.dataset.id]; if (x) { UI.modelo = x.modelo; atelieProcesso = x.processoId || ""; renderAtelie(); $("#folha").innerHTML = x.html; atualizarGmailPeca(); $("#folha").scrollIntoView({ behavior: "smooth" }); } },
      "apagar-peca": () => { remover("pecas", el.dataset.id); renderAtelie(); },
      ditado: alternarDitado, "extrair-tarefas": extrairTarefasAta,
      cronometro: alternarCronometro, "lancar-manual": lancarManual,
      "apagar-atividade": () => { remover("atividades", el.dataset.id); renderHoras(); },
      "importar-planilha": () => $("#arquivo-planilha").click(),
      "exportar-planilha": exportarPlanilha,
      "importar-movs": () => $("#arquivo-json").click(), restaurar: () => $("#arquivo-json").click(),
      "exportar-numeros": exportarNumeros, backup,
      "ideias-ia": ideiasIa,
      "simular-djen": () => { if (DEMO) { importarMovs(DEMO.simulacao()); ir("inicio"); } },
      "restaurar-exemplo": () => { if (DEMO) { carregarExemplo(); montarFiltros(); renderTudo(); toast("Exemplo restaurado."); } },
      tema: () => { const r = document.documentElement; const escuro = r.dataset.theme ? r.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches; r.dataset.theme = escuro ? "light" : "dark"; LS.set(P + "tema", r.dataset.theme); },
      "trocar-senha": async () => {
        const conta = LS.get(P + "conta");
        if (!conta || (await hash(conta.sal + $("#conta-atual").value)) !== conta.hash) { toast("A senha atual não confere."); return; }
        const nova = $("#conta-nova").value;
        if (nova.length < 4) { toast("A nova senha precisa de pelo menos 4 caracteres."); return; }
        conta.hash = await hash(conta.sal + nova); LS.set(P + "conta", conta);
        $("#conta-atual").value = ""; $("#conta-nova").value = ""; toast("Senha alterada.");
      },
    };
    if (acoes[a]) acoes[a]();
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") { if (!$("#dialogo").hidden) $("#dialogo").hidden = true; else if (!$("#ficha").hidden) fecharFicha(); }
    if (ev.key === "Enter" && ev.target.matches("tr[data-abrir]")) abrirFicha(ev.target.dataset.abrir);
  });
  ["#f-busca", "#f-status", "#f-situacao"].forEach((s) => $(s).addEventListener("input", () => renderProcessos()));
  $("#f-advogado").addEventListener("change", (e) => { UI.advogado = e.target.value; UI.advogadoEscolhido = true; filtroIds = null; renderTudo(); });
  ["#calc-inicio", "#calc-dias", "#calc-modo"].forEach((s) => $(s).addEventListener("input", calcular));
  $("#mostrar-feitas").addEventListener("change", (e) => { UI.mostrarFeitas = e.target.checked; renderPrazos(); });
  $("#atelie-form").addEventListener("input", (e) => {
    if (e.target.id === "at-proc") { atelieProcesso = e.target.value; montarFormAtelie(); return; }
    if (/at-(intimacao|abertura)/.test(e.target.id)) atualizarPrazoAtelie();
  });
  $("#folha").addEventListener("input", () => { clearTimeout(timerLocal); setTimeout(atualizarGmailPeca, 400); });
  $("#arquivo-planilha").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) importarPlanilha(f); e.target.value = ""; });
  $("#arquivo-json").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) importarJson(f); e.target.value = ""; });

  // =====================================================================
  // INÍCIO
  // =====================================================================
  const tema = LS.get(P + "tema");
  if (tema) document.documentElement.dataset.theme = tema;
  const salvo = LS.get(P + "dados");
  if (salvo) COLS.forEach((c) => { E[c] = salvo[c] || {}; });
  prepararLogin();
  conectarClaude();
  const s = sessaoValida();
  if (s) entrar(s.usuario); else $("#login-senha").focus();
})();
