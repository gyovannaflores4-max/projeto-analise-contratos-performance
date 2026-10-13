/*
 * Núcleo do Gabinete Digital: regras puras, sem tela.
 * - leitura da planilha "Controle de processos" (linhas já extraídas)
 * - número CNJ (Res. CNJ 65/2008): segmento, tribunal, links de consulta
 * - prazos em dias úteis (CPC art. 219 e 220) com feriados nacionais
 * - sugestões automáticas de prazo a partir do texto de uma movimentação
 * - ideias e alertas sobre a carteira
 * Funciona no navegador (window.Nucleo) e no Node (require).
 */
(function (raiz, fabrica) {
  if (typeof module === "object" && module.exports) module.exports = fabrica();
  else raiz.Nucleo = fabrica();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ---------- utilidades de data ----------
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const deIso = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const hojeIso = () => iso(new Date());
  const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const diasEntre = (a, b) => Math.round((deIso(b) - deIso(a)) / 86400000);
  const brData = (s) => { const d = deIso(s); return d ? pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() : ""; };

  // Aceita 2026-03-03T00:00:00, 30.06.2026, 30.06.26, 30/06/2026, 3/3/26.
  function lerData(v) {
    if (v == null) return null;
    if (v instanceof Date && !isNaN(v)) return iso(v);
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[1] + "-" + m[2] + "-" + m[3];
    m = /(\d{1,2})[./](\d{1,2})[./](\d{2,4})/.exec(s);
    if (m) {
      let a = +m[3];
      if (a < 100) a += 2000;
      const d = new Date(a, +m[2] - 1, +m[1]);
      if (d.getMonth() === +m[2] - 1) return iso(d);
    }
    return null;
  }

  // ---------- feriados nacionais e recesso forense ----------
  function pascoa(ano) {
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
  }
  const cacheFeriados = {};
  function feriados(ano) {
    if (cacheFeriados[ano]) return cacheFeriados[ano];
    const p = pascoa(ano);
    const lista = {};
    const add = (d, nome) => { lista[iso(d)] = nome; };
    [["01-01", "Confraternização Universal"], ["04-21", "Tiradentes"], ["05-01", "Dia do Trabalho"],
     ["09-07", "Independência"], ["10-12", "Nossa Senhora Aparecida"], ["11-02", "Finados"],
     ["11-15", "Proclamação da República"], ["11-20", "Consciência Negra"], ["12-25", "Natal"],
     ["08-11", "Dia do Advogado (expediente forense)"]]
      .forEach(([md, n]) => { lista[ano + "-" + md] = n; });
    add(somaDias(p, -48), "Carnaval");
    add(somaDias(p, -47), "Carnaval");
    add(somaDias(p, -46), "Quarta-feira de Cinzas (expediente reduzido)");
    add(somaDias(p, -3), "Quinta-feira Santa");
    add(somaDias(p, -2), "Sexta-feira Santa");
    add(somaDias(p, 60), "Corpus Christi");
    cacheFeriados[ano] = lista;
    return lista;
  }
  const ehFeriado = (d) => feriados(d.getFullYear())[iso(d)] || null;
  // CPC art. 220: suspensão de prazos de 20/12 a 20/01.
  const ehRecesso = (d) => { const m = d.getMonth() + 1, dia = d.getDate(); return (m === 12 && dia >= 20) || (m === 1 && dia <= 20); };
  const ehDiaUtil = (d, comRecesso = true) => {
    const s = d.getDay();
    return s !== 0 && s !== 6 && !ehFeriado(d) && !(comRecesso && ehRecesso(d));
  };

  /*
   * Conta um prazo a partir da data da intimação/publicação.
   * CPC art. 224: exclui o dia do começo, inclui o do vencimento;
   * a contagem começa no primeiro dia útil seguinte.
   */
  function calcularPrazo(inicioIso, dias, opcoes = {}) {
    const uteis = opcoes.uteis !== false;
    const recesso = opcoes.recesso !== false;
    let d = deIso(inicioIso);
    if (!d || !(dias > 0)) return null;
    const pulados = [];
    let contados = 0;
    while (contados < dias) {
      d = somaDias(d, 1);
      if (!uteis) { contados++; continue; }
      if (ehDiaUtil(d, recesso)) contados++;
      else if (d.getDay() !== 0 && d.getDay() !== 6) pulados.push({ data: iso(d), motivo: ehFeriado(d) || "Recesso forense (CPC art. 220)" });
    }
    // prazo em dias corridos que cai em dia sem expediente prorroga ao próximo útil
    while (!uteis && !ehDiaUtil(d, recesso)) d = somaDias(d, 1);
    return { vencimento: iso(d), pulados };
  }

  // ---------- número CNJ ----------
  const UF_TJ = { "01": "ac", "02": "al", "03": "ap", "04": "am", "05": "ba", "06": "ce", "07": "dft", "08": "es", "09": "go", "10": "ma", "11": "mt", "12": "ms", "13": "mg", "14": "pa", "15": "pb", "16": "pr", "17": "pe", "18": "pi", "19": "rj", "20": "rn", "21": "rs", "22": "ro", "23": "rr", "24": "sc", "25": "se", "26": "sp", "27": "to" };
  const SEGMENTOS = { "1": "STF", "2": "CNJ", "3": "STJ", "4": "Justiça Federal", "5": "Justiça do Trabalho", "6": "Justiça Eleitoral", "7": "Justiça Militar da União", "8": "Justiça Estadual", "9": "Justiça Militar Estadual" };
  const RE_CNJ = /(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})/g;

  function analisarCnj(texto) {
    const out = [];
    const s = String(texto || "");
    let m;
    RE_CNJ.lastIndex = 0;
    while ((m = RE_CNJ.exec(s))) {
      const [, seq, dv, ano, j, tr, origem] = m;
      const numero = `${seq}-${dv}.${ano}.${j}.${tr}.${origem}`;
      // rótulo antes do número na mesma linha (ex.: "Apelação:", "ED:")
      const linha = s.slice(s.lastIndexOf("\n", m.index) + 1, m.index);
      const rotulo = (linha.match(/([A-Za-zÀ-ú .]+):?\s*$/) || [])[1];
      const encerrado = /encerrad|arquivad/i.test(s.slice(m.index, (s.indexOf("\n", m.index) + 1 || s.length + 1) - 1));
      let tribunal = "", alias = "";
      if (j === "8") { alias = "tj" + (UF_TJ[tr] || tr); tribunal = alias.toUpperCase(); }
      else if (j === "5") { alias = "trt" + (+tr); tribunal = "TRT" + (+tr) + "ª Região"; }
      else if (j === "4") { alias = "trf" + (+tr); tribunal = "TRF" + (+tr) + "ª Região"; }
      else if (j === "3") { alias = "stj"; tribunal = "STJ"; }
      else if (j === "6") { alias = "tre-" + (UF_TJ[tr] || tr); tribunal = "TRE-" + (UF_TJ[tr] || tr).toUpperCase(); }
      out.push({
        numero, digitos: seq + dv + ano + j + tr + origem, ano, segmento: j, tr, origem,
        segmentoNome: SEGMENTOS[j] || "?", tribunal, alias,
        rotulo: rotulo ? rotulo.trim().replace(/^[-*\s]+/, "") : "",
        encerrado, digitoOk: validarDv(seq, dv, ano, j, tr, origem),
      });
    }
    return out;
  }
  // Dígito verificador módulo 97 (ISO 7064), conferido em partes para não estourar inteiros.
  function validarDv(seq, dv, ano, j, tr, origem) {
    const mod = (str) => { let r = 0; for (const ch of str) r = (r * 10 + +ch) % 97; return r; };
    const r1 = mod(seq);
    const r2 = mod(String(r1) + ano + j + tr);
    const r3 = mod(String(r2) + origem + dv);
    return r3 === 1;
  }
  function linksConsulta(cnj) {
    const n = cnj.numero, d = cnj.digitos;
    const L = [];
    L.push({ rotulo: "Comunica PJe (DJEN)", url: "https://comunica.pje.jus.br/consulta?numeroProcesso=" + d });
    if (cnj.alias === "tjrj") L.push({ rotulo: "TJRJ consulta", url: "https://www3.tjrj.jus.br/consultaprocessual/#/consultapublica?numProcessoCNJ=" + n });
    if (cnj.alias === "tjam") L.push({ rotulo: "TJAM e-SAJ", url: "https://consultasaj.tjam.jus.br/cpopg/search.do?cbPesquisa=NUMPROC&dadosConsulta.valorConsulta=" + n });
    if (cnj.alias === "tjms") L.push({ rotulo: "TJMS e-SAJ", url: "https://esaj.tjms.jus.br/cpopg5/search.do?cbPesquisa=NUMPROC&dadosConsulta.valorConsulta=" + n });
    if (cnj.alias === "tjsp") L.push({ rotulo: "TJSP e-SAJ", url: "https://esaj.tjsp.jus.br/cpopg/search.do?cbPesquisa=NUMPROC&dadosConsulta.valorConsulta=" + n });
    if (cnj.segmento === "5") L.push({ rotulo: "PJe-JT consulta", url: "https://pje.trt" + (+cnj.tr) + ".jus.br/consultaprocessual/detalhe-processo/" + n });
    if (cnj.segmento === "4") L.push({ rotulo: "TRF consulta", url: "https://www.google.com/search?q=" + encodeURIComponent("consulta processual " + cnj.tribunal + " " + n) });
    L.push({ rotulo: "Jusbrasil", url: "https://www.jusbrasil.com.br/consulta-processual/busca?q=" + n });
    return L;
  }

  // ---------- andamentos ----------
  function lerAndamentos(texto) {
    const linhas = String(texto || "").split(/\r?\n/).map((l) => l.replace(/^[\s\-–•*]+/, "").trim()).filter(Boolean);
    return linhas.map((l) => ({ data: lerData(l), texto: l, origem: "planilha" }));
  }
  const ultimaDataAndamento = (and) => (and || []).reduce((max, a) => (a.data && (!max || a.data > max) ? a.data : max), null);

  // ---------- normalização da planilha ----------
  const limpa = (v) => (v == null ? "" : String(v).replace(/\s+$/g, "").replace(/^\s+/g, ""));
  const vazio = (v) => { const s = limpa(v); return !s || s === "*" || s === "-"; };
  function capitaliza(s) { s = limpa(s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }
  function statusNormal(s) {
    s = limpa(s);
    if (!s) return "Sem status";
    const k = s.toLowerCase();
    if (k === "ativo") return "Ativo";
    if (k.startsWith("chamando feito")) return "Chamando o feito à ordem";
    return capitaliza(s);
  }
  function numeroValor(v) {
    if (v == null || v === "") return null;
    if (typeof v === "number") return v;
    const s = String(v).replace(/[^\d,.-]/g, "");
    if (!s) return null;
    const n = /,\d{1,2}$/.test(s) ? +s.replace(/\./g, "").replace(",", ".") : +s.replace(/,/g, "");
    return isNaN(n) ? null : n;
  }
  function horasParaMin(v) {
    if (v == null) return 0;
    if (typeof v === "number") return Math.round(v * 24 * 60);
    const m = /(\d+):(\d{2})/.exec(String(v));
    return m ? +m[1] * 60 + +m[2] : 0;
  }

  /*
   * Recebe a planilha como matriz (linhas x colunas) e devolve processos normalizados.
   * Procura o cabeçalho pela coluna "Número"/"Status" para tolerar linhas de título.
   */
  function processosDaPlanilha(matriz) {
    const idxCab = matriz.findIndex((r) => r && r.some((c) => /^status$/i.test(limpa(c))) && r.some((c) => /^n[úu]mero$/i.test(limpa(c))));
    if (idxCab < 0) throw new Error("Não encontrei o cabeçalho da aba de processos (colunas Status e Número).");
    const cab = matriz[idxCab].map((c) => limpa(c).toLowerCase());
    const col = (re, n = 0) => { let k = -1; for (let i = 0; i < cab.length; i++) if (re.test(cab[i]) && n-- === 0) { k = i; break; } return k; };
    const C = {
      id: col(/^id$/), status: col(/^status$/), advogado: col(/^advogado/), prioridade: col(/^prioridade/), acao: col(/^a[cç][aã]o/),
      empresa: col(/^empresa/), qualifEmpresa: col(/^qualifica/), outro: col(/^outro envolvido/), qualifOutro: col(/^qualifica/, 1),
      numero: col(/^n[úu]mero$/), edital: col(/^edital/), resumo: col(/^resumo/), andamentos: col(/^andamentos/), proximos: col(/^prox/),
      atualizado: col(/^atualizado/), previsao: col(/^previs/), juizo: col(/^ju[íi]zo/), vara: col(/^vara/), comarca: col(/^comarca/),
      foro: col(/^foro/), valorCausa: col(/^valor da causa/), valorPE: col(/^valor p/), distribuido: col(/^distribu/), link: col(/^link no tribunal/),
      horas: col(/^horas/), pasta: col(/^link para pasta/),
    };
    const v = (r, k) => (C[k] >= 0 ? r[C[k]] : null);
    const out = [];
    for (const r of matriz.slice(idxCab + 1)) {
      if (!r) continue;
      const temConteudo = ["empresa", "numero", "acao", "outro", "andamentos"].some((k) => !vazio(v(r, k)));
      if (!temConteudo) continue;
      const idBruto = v(r, "id");
      const id = idBruto != null && idBruto !== "" ? String(idBruto).replace(/\.0$/, "") : "p" + (out.length + 1);
      let prioridade = capitaliza(v(r, "prioridade"));
      let referencia = "";
      if (prioridade && !/^(alta|m[ée]dia|baixa)$/i.test(prioridade)) { referencia = prioridade; prioridade = ""; }
      const numeroBruto = limpa(v(r, "numero")).replace(/^\*+/, "");
      const andamentos = lerAndamentos(v(r, "andamentos"));
      const prev = v(r, "previsao");
      out.push({
        id,
        codigo: idBruto != null && idBruto !== "" ? String(idBruto).replace(/\.0$/, "") : "",
        status: statusNormal(v(r, "status")),
        advogado: limpa(v(r, "advogado")),
        prioridade: prioridade ? prioridade.replace(/^Media$/i, "Média") : "",
        referencia,
        acao: capitaliza(v(r, "acao")),
        empresa: limpa(v(r, "empresa")),
        qualifEmpresa: capitaliza(v(r, "qualifEmpresa")),
        outro: limpa(v(r, "outro")),
        qualifOutro: capitaliza(v(r, "qualifOutro")),
        numero: numeroBruto,
        cnj: analisarCnj(numeroBruto),
        edital: vazio(v(r, "edital")) ? "" : limpa(v(r, "edital")),
        resumo: vazio(v(r, "resumo")) ? "" : limpa(v(r, "resumo")),
        andamentos,
        proximosPassos: vazio(v(r, "proximos")) ? "" : limpa(v(r, "proximos")),
        atualizadoEm: lerData(v(r, "atualizado")) || ultimaDataAndamento(andamentos),
        previsao: vazio(prev) ? "" : (prev instanceof Date || /^\d{4}-\d{2}-\d{2}/.test(String(prev)) ? lerData(prev) : limpa(prev)),
        juizo: vazio(v(r, "juizo")) ? "" : limpa(v(r, "juizo")),
        vara: vazio(v(r, "vara")) ? "" : limpa(v(r, "vara")),
        comarca: vazio(v(r, "comarca")) ? "" : limpa(v(r, "comarca")),
        foro: vazio(v(r, "foro")) ? "" : limpa(v(r, "foro")),
        valorCausa: numeroValor(v(r, "valorCausa")),
        valorPE: numeroValor(v(r, "valorPE")),
        link: limpa(v(r, "link")),
        pasta: limpa(v(r, "pasta")),
        minutos: horasParaMin(v(r, "horas")),
        novidades: 0,
      });
    }
    // Chave estável para reimportar sem duplicar: 1º número CNJ, senão o ID da planilha.
    const usadas = {};
    const grafias = {};
    out.forEach((p) => { const k = norm(p.advogado); if (k) (grafias[k] = grafias[k] || []).push(p.advogado); });
    const canon = {};
    Object.entries(grafias).forEach(([k, l]) => {
      const preferida = l.slice().sort((a, b) => (b !== norm(b) ? 1 : 0) - (a !== norm(a) ? 1 : 0) || l.filter((x) => x === b).length - l.filter((x) => x === a).length)[0];
      canon[k] = (preferida === preferida.toUpperCase() ? preferida.toLowerCase() : preferida).replace(/^\p{Ll}/u, (c) => c.toUpperCase());
    });
    out.forEach((p) => {
      p.advogado = canon[norm(p.advogado)] || "";
      let k = p.cnj[0] ? p.cnj[0].digitos : "id" + (p.codigo || p.id);
      if (usadas[k]) k = k + "-" + (++usadas[k]); else usadas[k] = 1;
      p.id = k;
    });
    return out;
  }

  // ---------- leitura de movimentação: o que fazer depois ----------
  const REGRAS_MOV = [
    { re: /senten[çc]a/i, titulo: "Avaliar recurso contra a sentença", civel: 15, trab: 8, base: "CPC art. 1.003 §5º / CLT art. 895" },
    { re: /ac[óo]rd[ãa]o/i, titulo: "Avaliar recurso contra o acórdão (REsp/RE ou ED)", civel: 15, trab: 8, base: "CPC art. 1.003 §5º" },
    { re: /embargos de declara|omiss[ãa]o|contradi[çc][ãa]o/i, titulo: "Embargos de declaração / contrarrazões aos ED", civel: 5, trab: 5, base: "CPC art. 1.023" },
    { re: /contrarraz|contra-raz/i, titulo: "Apresentar contrarrazões", civel: 15, trab: 8, base: "CPC art. 1.010 §1º" },
    { re: /cita[çc][ãa]o|citad[oa]/i, titulo: "Preparar contestação", civel: 15, trab: 0, base: "CPC art. 335" },
    { re: /r[ée]plica|contesta[çc][ãa]o juntada|juntada de contesta/i, titulo: "Manifestar sobre a contestação (réplica)", civel: 15, trab: 0, base: "CPC art. 350/351" },
    { re: /agravo interno/i, titulo: "Responder ao agravo interno", civel: 15, trab: 8, base: "CPC art. 1.021 §2º" },
    { re: /especifica[çc][ãa]o de provas|despacho em provas|provas/i, titulo: "Especificar provas", civel: 5, trab: 5, base: "prazo judicial usual" },
    { re: /recurso administrativo|inabilita|habilita[çc][ãa]o|preg[ãa]o|licita/i, titulo: "Recurso administrativo / contrarrazões na licitação", civel: 3, trab: 3, base: "Lei 14.133/2021 art. 165" },
    { re: /impugna[çc][ãa]o ao edital|edital/i, titulo: "Avaliar impugnação ao edital (até 3 dias úteis antes da abertura)", civel: 0, trab: 0, base: "Lei 14.133/2021 art. 164" },
    { re: /despacho|decis[ãa]o|intima[çc][ãa]o|intimad|publica[çc][ãa]o|djen/i, titulo: "Ler o teor e conferir prazo", civel: 5, trab: 5, base: "CPC art. 218 §3º (prazo supletivo de 5 dias)" },
    { re: /audi[êe]ncia/i, titulo: "Preparar audiência (testemunhas, preposto, documentos)", civel: 0, trab: 0, base: "agenda", evento: true },
    { re: /arquiv|baixa definitiva|tr[âa]nsito em julgado/i, titulo: "Conferir arquivamento e encerrar o processo no painel", civel: 0, trab: 0, base: "controle interno", encerrar: true },
  ];
  function sugerirAposMovimentacao(texto, dataIso, processo) {
    const trab = (processo && processo.cnj || []).some((c) => c.segmento === "5") || /trabalh/i.test(processo && processo.acao || "");
    const sugestoes = [];
    for (const r of REGRAS_MOV) {
      if (!r.re.test(texto)) continue;
      const dias = trab ? r.trab || r.civel : r.civel;
      let venc = null;
      if (r.evento) {
        const datas = [...String(texto).matchAll(/(\d{1,2}[./]\d{1,2}[./]\d{2,4})/g)].map((m) => lerData(m[1])).filter((d) => d && d > (dataIso || ""));
        venc = datas[0] || null;
      } else if (dias) venc = calcularPrazo(dataIso || hojeIso(), dias).vencimento;
      sugestoes.push({ titulo: r.titulo, dias, base: r.base, vencimento: venc, encerrar: !!r.encerrar, evento: !!r.evento });
      if (sugestoes.length >= 2) break;
    }
    return sugestoes;
  }

  // ---------- ideias e alertas ----------
  const ehEncerrado = (p) => /encerrad|arquivad|baixad/i.test(p.status);
  function diasParado(p, hoje) {
    const ref = p.atualizadoEm || ultimaDataAndamento(p.andamentos);
    return ref ? diasEntre(ref, hoje || hojeIso()) : null;
  }
  function gerarIdeias(processos, filtroAdvogado, hoje) {
    hoje = hoje || hojeIso();
    const meus = processos.filter((p) => !filtroAdvogado || norm(p.advogado) === norm(filtroAdvogado));
    const ativos = meus.filter((p) => !ehEncerrado(p));
    const ideias = [];
    const parados = ativos.map((p) => ({ p, d: diasParado(p, hoje) })).filter((x) => x.d == null || x.d > 45).sort((a, b) => (b.d ?? 9999) - (a.d ?? 9999));
    if (parados.length) ideias.push({
      tipo: "alerta", titulo: `${parados.length} processo${parados.length > 1 ? "s" : ""} sem atualização há mais de 45 dias`,
      texto: "Abra a consulta no tribunal e no DJEN e registre o que mudou. Movimentação nova gera prazo sugerido automaticamente.",
      ids: parados.map((x) => x.p.id),
    });
    const paraEncerrar = ativos.filter((p) => /arquiv|prejudicad|baixa definitiva|sa[íi]mos da lide|extinto/i.test(p.proximosPassos + " " + (p.andamentos.slice(-2).map((a) => a.texto).join(" "))));
    if (paraEncerrar.length) ideias.push({
      tipo: "limpeza", titulo: `${paraEncerrar.length} processo${paraEncerrar.length > 1 ? "s parecem" : " parece"} encerrado${paraEncerrar.length > 1 ? "s" : ""}`,
      texto: "Os próximos passos falam em arquivamento, recurso prejudicado ou saída da lide, mas o status continua ativo. Confirme e encerre para limpar a pauta.",
      ids: paraEncerrar.map((p) => p.id),
    });
    const ordem = ativos.filter((p) => /feito [àa] ordem|ilegitimidade|polo passivo/i.test(p.status + " " + p.proximosPassos + " " + p.andamentos.map((a) => a.texto).join(" ")) && /scp/i.test(p.outro + p.edital));
    if (ordem.length >= 2) ideias.push({
      tipo: "tese", titulo: `Tese repetida: exclusão da DIMPI-SCP do polo passivo (${ordem.length} processos)`,
      texto: "Os casos repetem o mesmo argumento: a sociedade em conta de participação já estava encerrada antes dos fatos e não tem personalidade jurídica. Monte um kit único (petição modelo + certidão de baixa do CNPJ + distrato) e use o Ateliê para gerar cada peça já preenchida.",
      ids: ordem.map((p) => p.id), acao: "modelo:ordem",
    });
    const porEdital = {};
    // Mesma parte contrária em vários processos de licitação: decisões tendem a repercutir entre eles.
    ativos.filter((p) => p.edital && !/scp/i.test(p.outro + p.edital)).forEach((p) => {
      const k = norm(p.outro).split(/\s+-\s+|\s+/)[0];
      if (k && k.length > 2) (porEdital[k] = porEdital[k] || []).push(p);
    });
    Object.values(porEdital).filter((l) => l.length >= 2).forEach((l) => ideias.push({
      tipo: "conexao", titulo: `${l.length} processos ligados à disputa com ${l[0].outro.split(/\s+-\s+/)[0].trim()}`,
      texto: "Ações e recursos sobre o mesmo certame. Uma decisão em um afeta os outros: ao registrar movimentação em um, revise os demais no mesmo dia.",
      ids: l.map((p) => p.id),
    }));
    const prevVencida = ativos.filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.previsao) && p.previsao < hoje);
    if (prevVencida.length) ideias.push({
      tipo: "alerta", titulo: prevVencida.length > 1 ? `${prevVencida.length} previsões de andamento já passaram` : "1 previsão de andamento já passou",
      texto: "A data prevista na planilha ficou para trás. Atualize a previsão ou registre o andamento.",
      ids: prevVencida.map((p) => p.id),
    });
    const semPrioridade = ativos.filter((p) => !p.prioridade);
    if (semPrioridade.length) ideias.push({
      tipo: "organizacao", titulo: `${semPrioridade.length} processo${semPrioridade.length > 1 ? "s" : ""} sem prioridade definida`,
      texto: "Defina Alta, Média ou Baixa para a pauta do dia ordenar o que vem primeiro.",
      ids: semPrioridade.map((p) => p.id),
    });
    const semHoras = ativos.filter((p) => !p.minutos);
    if (semHoras.length > 3) ideias.push({
      tipo: "gestao", titulo: "Horas trabalhadas zeradas na maioria dos casos",
      texto: "Use o cronômetro ao despachar ou peticionar. Com as horas registradas dá para medir o custo de cada cliente e embasar honorários.",
      ids: [],
    });
    return ideias;
  }
  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

  // ---------- integrações por link ----------
  function linkGoogleAgenda(titulo, dataIso, detalhes) {
    const d = dataIso.replace(/-/g, "");
    const fim = iso(somaDias(deIso(dataIso), 1)).replace(/-/g, "");
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(titulo) + "&dates=" + d + "/" + fim + "&details=" + encodeURIComponent(detalhes || "");
  }
  function linkGmail(assunto, corpo, para) {
    return "https://mail.google.com/mail/?view=cm&fs=1&to=" + encodeURIComponent(para || "") + "&su=" + encodeURIComponent(assunto) + "&body=" + encodeURIComponent(corpo);
  }
  function linkOutlook(assunto, corpo) {
    return "https://outlook.office.com/mail/deeplink/compose?subject=" + encodeURIComponent(assunto) + "&body=" + encodeURIComponent(corpo);
  }
  const linkWhatsApp = (texto) => "https://wa.me/?text=" + encodeURIComponent(texto);
  function gerarIcs(eventos) {
    const esc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Gabinete Digital//Prazos//PT-BR", "CALSCALE:GREGORIAN"];
    const agora = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    eventos.forEach((e, i) => {
      const d = e.data.replace(/-/g, "");
      const fim = iso(somaDias(deIso(e.data), 1)).replace(/-/g, "");
      linhas.push("BEGIN:VEVENT", "UID:" + (e.uid || "prazo-" + i + "-" + d) + "@gabinete-digital", "DTSTAMP:" + agora,
        "DTSTART;VALUE=DATE:" + d, "DTEND;VALUE=DATE:" + fim, "SUMMARY:" + esc(e.titulo), "DESCRIPTION:" + esc(e.descricao),
        "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:" + esc(e.titulo), "END:VALARM", "END:VEVENT");
    });
    linhas.push("END:VCALENDAR");
    return linhas.join("\r\n");
  }

  // ---------- mesclar movimentações vindas do robô (DataJud) ----------
  function mesclarMovimentacoes(processo, movs) {
    const chave = (a) => (a.data || "") + "|" + norm(a.texto).slice(0, 80);
    const existentes = new Set((processo.andamentos || []).map(chave));
    const novas = movs.filter((m) => !existentes.has(chave(m)));
    return novas;
  }

  return {
    iso, deIso, hojeIso, somaDias, diasEntre, brData, lerData,
    feriados, ehFeriado, ehRecesso, ehDiaUtil, calcularPrazo,
    analisarCnj, validarDv, linksConsulta,
    lerAndamentos, ultimaDataAndamento, processosDaPlanilha,
    sugerirAposMovimentacao, gerarIdeias, diasParado, ehEncerrado, norm,
    linkGoogleAgenda, linkGmail, linkOutlook, linkWhatsApp, gerarIcs, mesclarMovimentacoes,
  };
});
