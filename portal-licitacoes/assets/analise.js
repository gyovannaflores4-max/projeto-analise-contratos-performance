/* Pregão em Dia | análise de edital (por regras de texto) e leitura das mensagens de chat dos pregões.
   Tudo roda no navegador: o texto do edital não sai do computador. */
(function (g) {
  "use strict";
  const U = g.U;
  const A = {};

  /* =====================================================================
     1. ANÁLISE DE EDITAL
     ===================================================================== */
  const MES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  const RE_DATA = /(\d{1,2})\s*[\/.-]\s*(\d{1,2})\s*[\/.-]\s*(\d{4}|\d{2})\b|(\d{1,2})(?:º|o)?\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/;
  const RE_HORA = /(\d{1,2})\s*(?:h(?:oras?|rs?)?|:)\s*(\d{2})?(?!\s*(?:dias|%|\d))/;

  // Plataformas mais comuns (mesma lista do Radar de Licitações)
  const PLATAFORMAS = [
    [/compras\.gov|comprasnet|comprasgovernamentais|gov\.br\/compras/, "Compras.gov.br"],
    [/\bbll\b|bolsa de licitac|bllcompras/, "BLL"],
    [/licitacoes-e|licitacoes e\b|banco do brasil/, "Licitações-e"],
    [/portal de compras publicas|portaldecompraspublicas/, "Portal de Compras Públicas"],
    [/\bbnc\b|bolsa nacional de compras|bnccompras/, "BNC"],
    [/licitanet/, "Licitanet"],
    [/licitar digital|licitardigital/, "Licitar Digital"],
    [/e-compras\.am|e-compras am|ecompras\.am/, "e-compras AM"]
  ];

  // Documentos de habilitação: a "chave" casa com o tipo dos documentos cadastrados na pasta da empresa.
  A.HABILITACAO = [
    { chave: "cnd_federal", nome: "CND Federal (Receita/PGFN)", grupo: "Fiscal", re: /tributos federais|divida ativa da uniao|receita federal|fazenda (?:publica )?federal|fazenda nacional|creditos tributarios federais/ },
    { chave: "fgts", nome: "Certificado de Regularidade do FGTS", grupo: "Fiscal", re: /\bfgts\b|fundo de garantia/ },
    { chave: "cndt", nome: "Certidão Negativa de Débitos Trabalhistas", grupo: "Trabalhista", re: /\bcndt\b|debitos trabalhistas|justica do trabalho/ },
    { chave: "estadual", nome: "Regularidade fiscal estadual", grupo: "Fiscal", re: /fazenda (?:publica )?estadual|tributos estaduais|fisco estadual|(?:regularidade|certidao)[^.;\n]{0,50}estadua/ },
    { chave: "municipal", nome: "Regularidade fiscal municipal", grupo: "Fiscal", re: /fazenda (?:publica )?municipal|tributos municipais|(?:regularidade|certidao)[^.;\n]{0,50}municipa/ },
    { chave: "falencia", nome: "Certidão de falência e recuperação judicial", grupo: "Econômico-financeira", re: /falencia|recuperacao judicial/ },
    { chave: "balanco", nome: "Balanço patrimonial e demonstrações contábeis", grupo: "Econômico-financeira", re: /balanco patrimonial|demonstracoes contabeis|demonstracoes financeiras/ },
    { chave: "contrato_social", nome: "Ato constitutivo / contrato social", grupo: "Jurídica", re: /contrato social|ato constitutivo|estatuto social/ },
    { chave: "conselho", nome: "Registro no conselho de classe (CRM, COREN…)", grupo: "Técnica", re: /conselho regional|\bcrm\b|\bcoren\b|\bcrf\b|\bcrea\b|\bcro\b/ },
    { chave: "cnes", nome: "Cadastro no CNES", grupo: "Técnica", re: /\bcnes\b|cadastro nacional de estabelecimentos de saude/ },
    { chave: "licenca_sanitaria", nome: "Licença ou alvará sanitário", grupo: "Técnica", re: /(?:licenca|alvara) sanitari|vigilancia sanitaria/ },
    { chave: "atestado", nome: "Atestado de capacidade técnica", grupo: "Técnica", re: /atestados? de capacidade tecnica|capacidade tecnico-operacional|atestados?[^.;\n]{0,60}(?:aptidao|desempenho anterior)/ },
    { chave: "responsavel_tecnico", nome: "Indicação de responsável técnico", grupo: "Técnica", re: /responsavel tecnico/ },
    { chave: "declaracoes", nome: "Declarações (menor aprendiz, ME/EPP, cotas…)", grupo: "Declarações", re: /declaracao de (?:que|cumprimento|inexistencia)|declaracoes? (?:exigidas|de habilitacao|constantes)/ }
  ];

  function recorte(o, idx, len, raio) {
    raio = raio || 170;
    const ini = Math.max(0, idx - raio), fim = Math.min(o.length, idx + (len || 0) + raio);
    return (ini > 0 ? "…" : "") + o.slice(ini, fim).replace(/\s+/g, " ").trim() + (fim < o.length ? "…" : "");
  }
  function primeiro(t, re) { const m = re.exec(t); return m ? { m, i: m.index } : null; }
  function todos(t, re) { const r = new RegExp(re.source, "g"); const out = []; let m; while ((m = r.exec(t))) { out.push({ m, i: m.index }); if (m[0] === "") r.lastIndex++; } return out; }

  function lerData(m) {
    let dia, mes, ano;
    if (m[1]) { dia = +m[1]; mes = +m[2]; ano = +m[3]; if (ano < 100) ano += 2000; }
    else { dia = +m[4]; mes = MES[m[5]]; ano = +m[6]; }
    if (!(dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && ano >= 2020 && ano <= 2100)) return null;
    return ano + "-" + U.pad(mes) + "-" + U.pad(dia);
  }
  // Procura data (e hora) logo depois de uma expressão-chave
  function dataPerto(t, idx, alcance) {
    const janela = t.slice(idx, idx + (alcance || 260));
    const md = RE_DATA.exec(janela);
    if (!md) return null;
    const data = lerData(md);
    if (!data) return null;
    const depois = janela.slice(md.index + md[0].length, md.index + md[0].length + 70);
    const antes = janela.slice(Math.max(0, md.index - 50), md.index);
    const mh = RE_HORA.exec(depois) || RE_HORA.exec(antes);
    if (mh && +mh[1] <= 23) return data + "T" + U.pad(+mh[1]) + ":" + U.pad(mh[2] ? +mh[2] : 0);
    return data;
  }
  function numeroBR(s) { return Number(String(s).replace(/\./g, "").replace(",", ".")); }

  A.analisarEdital = function (original, opcoes) {
    opcoes = opcoes || {};
    const o = String(original || "");
    const t = U.normalizarMesmoTamanho(o);
    const campos = {}, riscos = [], achados = {};
    const risco = (nivel, titulo, detalhe, pos) => riscos.push({ nivel, titulo, detalhe: detalhe || "", trecho: pos ? recorte(o, pos.i, pos.m[0].length) : "" });

    /* ---- Identificação ---- */
    let p = primeiro(t, /\b(pregao eletronico|pregao presencial|pregao|concorrencia eletronica|concorrencia|dispensa eletronica|credenciamento|chamamento publico)\s*(?:srp\s*)?(?:n[º°o.]*|numero)?\s*[:\-]?\s*(\d{1,5}\s*\/\s*\d{2,4})/);
    if (p) {
      const mod = p.m[1];
      const sigla = /pregao/.test(mod) ? (/presencial/.test(mod) ? "PP" : "PE") : /concorrencia/.test(mod) ? "CE" : /dispensa/.test(mod) ? "DE" : "CH";
      campos.numero = sigla + " " + p.m[2].replace(/\s/g, "");
      campos.modalidade = /pregao/.test(mod) ? (/presencial/.test(mod) || (!/eletronico/.test(mod) && /pregao presencial/.test(t)) ? "Pregão presencial" : "Pregão eletrônico") : /concorrencia/.test(mod) ? "Concorrência eletrônica" : /dispensa/.test(mod) ? "Dispensa eletrônica" : "Credenciamento";
    }
    p = primeiro(t, /processo(?: administrativo| licitatorio| sei)?\s*(?:n[º°o.]*|numero)?\s*[:\-]?\s*([\d][\d.\/-]{5,30}\d)/);
    if (p) campos.processo = o.substr(p.i + p.m[0].length - p.m[1].length, p.m[1].length);
    // Órgão: primeira linha com cara de nome de órgão
    const linhas = o.split(/\n/).slice(0, 40);
    const linhaOrgao = linhas.find(l => /prefeitura|secretaria|tribunal|hospital|fundo (?:municipal|estadual|nacional)|minist[eé]rio|universidade|instituto|cons[oó]rcio|governo|empresa brasileira|centro de servi[cç]os|funda[cç][aã]o|ag[eê]ncia|c[aâ]mara municipal|assembleia/i.test(l) && l.trim().length < 140);
    if (linhaOrgao) campos.orgao = linhaOrgao.replace(/\s+/g, " ").trim().replace(/[–-]\s*$/, "");
    // Objeto: "tem por objeto ...", "o objeto da presente licitação é ..." ou uma linha "OBJETO: ..."
    p = primeiro(t, /(?:tem (?:como|por) objeto|o objeto (?:da presente licitacao|desta licitacao|deste (?:pregao|edital|certame)|do presente (?:pregao|certame|edital)) (?:e|consiste (?:em|na|no)|sera))\s+(?:a\s+|o\s+)?/)
      || primeiro(t, /(?:^|\n)[ \t]*(?:\d+(?:\.\d+)*\.?[ \t]*)?(?:do |- )?objeto[ \t]*[:.\-–][ \t]*(?=\S)/);
    if (p) {
      const ini = p.i + p.m[0].length;
      let trecho = o.slice(ini, ini + 600);
      const fim = trecho.search(/\.\s*\n|\n\s*\n|\.\s+\d+(?:\.\d+)+\.?\s/);
      trecho = (fim > 30 ? trecho.slice(0, fim + 1) : trecho).replace(/\s+/g, " ").trim();
      campos.objetoCompleto = U.corta(trecho.charAt(0).toUpperCase() + trecho.slice(1), 900);
      campos.objeto = U.corta(campos.objetoCompleto, 360);
    }

    /* ---- Datas ---- */
    const chavesSessao = [/data (?:e hora )?(?:da |de |do )?(?:licitacao|abertura|realizacao|inicio|disputa|certame)(?: da sessao| do certame| das propostas)?/, /sessao publica/, /abertura da sessao|abertura das propostas/, /inicio da (?:sessao|disputa)/, /data da sessao/];
    for (const re of chavesSessao) {
      for (const x of todos(t, re)) { const d = dataPerto(t, x.i); if (d) { campos.sessao = d; achados.sessao = x; break; } }
      if (campos.sessao) break;
    }
    for (const x of todos(t, /(?:limite|prazo final|ate)[^.\n]{0,40}(?:recebimento|cadastr|envio|acolhimento)[^.\n]{0,20}propostas?|recebimento das propostas ate/)) {
      const d = dataPerto(t, x.i); if (d) { campos.limiteProposta = d; break; }
    }
    if (campos.sessao) {
      campos.impugnacaoAte = U.subtrairDiasUteis(campos.sessao, 3);
      campos.esclarecimentoAte = campos.impugnacaoAte;
    }
    // Prazo de impugnação escrito no próprio edital (vale mais que o calculado)
    for (const x of todos(t, /(?:prazo|data|ate)[^.\n]{0,25}(?:impugnac|esclarecimento)[^\n]{0,15}/)) {
      const d = dataPerto(t, x.i, 120); if (d) { campos.impugnacaoInformada = U.soData(d); break; }
    }

    /* ---- Cidade, local e horários (para o resumo) ---- */
    const UF_NOMES = { acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE", "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA", "mato grosso do sul": "MS", "mato grosso": "MT", "minas gerais": "MG", paraiba: "PB", parana: "PR", para: "PA", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ", "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR", "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO" };
    const SIGLAS = "AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO";
    let mc = /munic[íi]pio de ([A-ZÀ-Ú][A-Za-zÀ-ú'’ ]{2,40}?)\s*(?:\/|–|-|\()\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/.exec(o);
    if (mc) { campos.municipio = mc[1].trim(); campos.uf = mc[2]; }
    else {
      const mo = /(?:prefeitura municipal|c[âa]mara municipal|fundo municipal de sa[úu]de|secretaria municipal de sa[úu]de|munic[íi]pio) d[eoa]s? ([A-ZÀ-Úa-zà-ú'’ ]{3,40}?)(?:\s*(?:\/|–|-|,|\(|\n|$)\s*(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)?)/i.exec(campos.orgao || o.slice(0, 3000));
      if (mo) { campos.municipio = mo[1].trim().replace(/\s+(estado|secretaria|fundo)\b.*$/i, ""); if (mo[2]) campos.uf = mo[2].toUpperCase(); }
    }
    if (campos.municipio && /^[A-ZÀ-Ú' ]+$/.test(campos.municipio)) campos.municipio = campos.municipio.toLowerCase().replace(/(^|\s)(\S)/g, (x, e, l) => e + l.toUpperCase()).replace(/\s(De|Do|Da|Dos|Das|E)\s/g, x => x.toLowerCase());
    if (!campos.uf) {
      const me = /estado d[oea] ([a-z ]{4,22})/.exec(t);
      if (me) { const nome = Object.keys(UF_NOMES).find(k => me[1].startsWith(k)); if (nome) campos.uf = UF_NOMES[nome]; }
      if (!campos.uf) { const ms = new RegExp("(?:/|–|- )\\s*(" + SIGLAS + ")\\b").exec(o.slice(0, 4000)); if (ms) campos.uf = ms[1]; }
    }
    const ml = /\b(?:n[oa]s?)\s+((?:Unidade Hospitalar|Hospital|UPA|Unidade de Pronto Atendimento|Pronto[- ]Socorro|Pronto Atendimento|Unidade B[áa]sica de Sa[úu]de|UBS|Centro de Sa[úu]de|Policl[íi]nica|Maternidade|Santa Casa|Ambulat[óo]rio|Centro Cir[úu]rgico|Unidade de Terapia Intensiva|UTI)\b[^.;:\n]{0,110})/i.exec(o);
    if (ml) campos.local = ml[1].charAt(0).toUpperCase() + ml[1].slice(1).replace(/\s*,?\s*(?:conforme|de acordo|mediante|contemplando|para|com|sendo)\b.*$/i, "").replace(/[,\s]+$/, "").trim();
    const frases = o.replace(/\r/g, "").split(/(?<=[.;])\s+|\n+/).map(x => x.replace(/^\s*(?:\d+(?:\.\d+)*\.?|[a-z]\))\s*/i, "").replace(/\s+/g, " ").trim());
    // Horários: frases com dias, turnos, escalas ou carga horária. Primeiro nas cláusulas de execução;
    // se não houver, nos trechos do objeto (ex.: "atendimento regular de segunda a sexta-feira e sobreaviso 24 horas").
    const RE_HORARIO = /segunda[- ]feira a sexta|segunda a sexta|segunda a s[áa]bado|segunda a domingo|todos os dias|ininterrupt|s[áa]bados?,|domingos|finais de semana|fins de semana|sobreaviso|plant[ãa]o de \d|plant[õo]es de \d|plant[õo]es? (?:diurnos?|noturnos?|presenciais?)|horas di[áa]rias|horas semanais|horas mensais|carga hor[áa]ria|h\/dia|h\/semana|per[íi]odo (?:da )?(?:manh|tarde|noite|diurno|noturno)|turnos?|escala|\b12 ?x ?36\b|\b24 ?x ?(?:48|72)\b|\bdas \d{1,2} ?(?:h|:\d{2}|horas)(?:\d{2})? (?:[àa]s|até) \d{1,2}|\b24 ?(?:h|horas)\b|\b12 ?(?:h|horas)\b|\b6 ?(?:h|horas) di|\b4 ?(?:h|horas) di/i;
    const EXCLUI_HORARIO = /valor|R\$|multa|pagamento|prazo de|licita[çc][ãa]o [ée]|ser[ãa]o (?:prestados|executados) n|ap[óo]s a assinatura|sess[ãa]o p[úu]blica|impugna|proposta|habilita|recurso|nota fiscal/i;
    let horarios = frases.filter(f => f.length >= 20 && f.length <= 320 && RE_HORARIO.test(f) && !EXCLUI_HORARIO.test(f) && !/objeto/i.test(f));
    if (!horarios.length && campos.objetoCompleto) {
      const pedacos = campos.objetoCompleto.split(/,\s*(?=contemplando|incluindo|com |sendo|em regime|nos? (?:per[íi]odos?|turnos?|hor[áa]rios?))|;\s*/i);
      horarios = pedacos.map(x => x.replace(/^(?:contemplando|incluindo|sendo)\s+/i, "").trim()).filter(x => x.length >= 15 && RE_HORARIO.test(x) && !/^contrata[çc][ãa]o/i.test(x));
      if (!horarios.length) { const m = RE_HORARIO.exec(campos.objetoCompleto); if (m) horarios = [campos.objetoCompleto.slice(Math.max(0, campos.objetoCompleto.lastIndexOf(",", m.index) + 1), (campos.objetoCompleto.indexOf(",", m.index) + 1 || campos.objetoCompleto.length + 1) - 1).trim()]; }
      horarios = horarios.map(x => x.charAt(0).toUpperCase() + x.slice(1).replace(/\.$/, ""));
    }
    campos.horarios = [...new Set(horarios)].slice(0, 3);

    /* ---- Itens (tabela de preços) ---- */
    const UNID = "m[eê]s(?:es)?|unid(?:ade)?s?|und|un|hora(?:s)?|plant(?:ão|ões|ao|oes)|servi[cç]os?|exames?|di[áa]rias?|sv|procedimentos?|consultas?|sess(?:ão|ões)";
    const reItem = new RegExp("(?:^|\\n)[ \\t]*(\\d{1,3})[ \\t]*[.)–-]?[ \\t]+(?=[A-Za-zÀ-ú])((?:(?!\\n[ \\t]*\\d{1,3}(?:[ \\t.)–-]))[\\s\\S]){8,600}?)\\s+(" + UNID + ")\\s+(\\d{1,7}(?:[.,]\\d+)?)\\s+(?:R\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})*,\\d{2})(?:\\s+(?:R\\$\\s*)?(\\d{1,3}(?:\\.\\d{3})*,\\d{2}))?", "gi");
    campos.itens = [];
    let mi;
    while ((mi = reItem.exec(o)) && campos.itens.length < 30) {
      const desc = mi[2].replace(/\s+/g, " ").trim();
      if (/^\d+(?:\.\d+)+/.test(desc) || /^(?:item|descri|do pre|dos pre)/i.test(desc) || desc.length > 520) continue;
      campos.itens.push({ item: mi[1], descricao: desc, unidade: mi[3].charAt(0).toUpperCase() + mi[3].slice(1).toLowerCase(), qtd: numeroBR(mi[4]), valorUnit: numeroBR(mi[5]), valorTotal: mi[6] ? numeroBR(mi[6]) : null });
    }
    // A descrição do item da tabela não é cláusula de horário
    campos.horarios = campos.horarios.filter(x => !campos.itens.some(i => i.descricao.includes(x.slice(0, 50))));
    if (!campos.valorEstimado && campos.itens.length) campos.valorEstimado = Math.round(campos.itens.reduce((s, x) => s + (x.valorTotal || x.qtd * x.valorUnit), 0) * 100) / 100;

    /* ---- Disputa ---- */
    if ((p = primeiro(t, /menor preco (?:global|por item|por lote|por grupo|unitario)?|maior desconto|tecnica e preco|melhor tecnica|maior retorno economico/))) {
      const s = p.m[0];
      campos.criterio = s.charAt(0).toUpperCase() + o.substr(p.i + 1, s.length - 1).toLowerCase();
    }
    if ((p = primeiro(t, /modo de disputa\s*(?:sera\s*)?(?:o\s*)?[:\-]?\s*["“]?(aberto e fechado|fechado e aberto|aberto|fechado)/)) || (p = primeiro(t, /\b(aberto e fechado|fechado e aberto)\b/))) {
      campos.modoDisputa = p.m[1].charAt(0).toUpperCase() + p.m[1].slice(1);
    }
    for (const [re, nome] of PLATAFORMAS) { if (re.test(t)) { campos.plataforma = nome; break; } }
    campos.srp = /registro de precos|\bsrp\b|ata de registro/.test(t);
    if ((p = primeiro(t, /(?:participacao )?exclusiva?(?:mente)? (?:para |a |as |de )?(?:participacao de )?(?:microempresas|\bme\b|me\/epp|me e epp)/))) {
      campos.exclusivaME = true;
      risco(opcoes.porte === "me" ? "info" : "alto", "Participação exclusiva para ME/EPP",
        opcoes.porte === "me" ? "A empresa está cadastrada como ME/EPP, então pode participar." : "A empresa está cadastrada como \"demais portes\" nos Ajustes. Confirme se pode disputar todos os itens.", p);
    }
    if ((p = primeiro(t, /cota reservada/))) { campos.cotaReservada = true; risco("info", "Há cota reservada para ME/EPP", "Alguns itens ou parte do quantitativo ficam só para ME/EPP.", p); }

    /* ---- Valores ---- */
    for (const x of todos(t, /valor (?:total |global |anual |mensal )?(?:maximo |medio )?(?:estimado|de referencia|orcado|da contratacao)/)) {
      const jan = o.slice(x.i, x.i + 220);
      const mv = /R\$\s*([\d.]+,\d{2})/.exec(jan);
      if (mv) { campos.valorEstimado = numeroBR(mv[1]); break; }
    }
    if ((p = primeiro(t, /orcamento (?:estimado )?(?:da contratacao )?(?:sera |tera |e )?(?:de )?carater sigiloso|orcamento sigiloso|valor estimado (?:e |sera )?sigiloso/))) {
      campos.orcamentoSigiloso = true;
      risco("info", "Orçamento sigiloso", "O valor estimado só é divulgado depois da fase de lances (art. 24 da Lei 14.133).", p);
    }

    /* ---- Execução e contrato ---- */
    if ((p = primeiro(t, /vigencia[^.\n]{0,120}?(\d{1,3})\s*(?:\([^)]{1,30}\)\s*)?(meses|dias|anos?)/))) campos.vigencia = p.m[1] + " " + p.m[2];
    if ((p = primeiro(t, /validade (?:da |das |minima da )?propostas?[^.\n]{0,80}?(\d{2,3})\s*(?:\([^)]{1,30}\)\s*)?dias/))) campos.validadeProposta = p.m[1] + " dias";
    if ((p = primeiro(t, /pagamento[^.\n]{0,160}?(?:ate|em|no prazo (?:maximo )?de)\s*(\d{1,3})\s*(?:\([^)]{1,30}\)\s*)?dias/))) {
      campos.pagamento = p.m[1] + " dias";
      if (+p.m[1] > 30) risco("medio", "Prazo de pagamento acima de 30 dias", "Pagamento em " + p.m[1] + " dias. Considere o custo financeiro na planilha.", p);
    }
    if (!/reajust|repactua|reequilibrio/.test(t)) risco("medio", "Não encontrei regra de reajuste ou repactuação", "Em contratos de serviço contínuo vale pedir esclarecimento sobre o índice e a data-base.");
    else if ((p = primeiro(t, /reajust\w*[^.\n]{0,120}?(ipca|igp-?m|inpc|ist|convencao coletiva)/))) campos.reajuste = p.m[1].toUpperCase();

    /* ---- Habilitação e pontos de atenção ---- */
    const habilitacao = A.HABILITACAO.map(item => {
      const x = primeiro(t, item.re);
      return Object.assign({}, item, { exigido: !!x, trecho: x ? recorte(o, x.i, x.m[0].length, 120) : "" });
    });

    for (const x of todos(t, /atestad[\s\S]{0,320}?(\d{1,3})\s*%/)) {
      const pct = +x.m[1];
      if (pct > 50 && pct <= 100) { risco("alto", "Atestado exige mais de 50% do quantitativo (" + pct + "%)", "O TCU costuma considerar restritiva a exigência acima de 50%. Avalie impugnar ou pedir esclarecimento.", x); break; }
      if (pct > 0 && pct <= 50) { risco("info", "Atestado com quantitativo mínimo de " + pct + "%", "Confira se os atestados da pasta somam esse volume.", x); break; }
    }
    if ((p = primeiro(t, /visita tecnica|vistoria (?:previa|tecnica|ao local)/))) {
      const perto = t.slice(Math.max(0, p.i - 120), p.i + 260);
      if (/obrigatori/.test(perto) && !/facultativ|nao (?:sera )?obrigatori/.test(perto)) risco("medio", "Visita técnica obrigatória", "Agende a visita com antecedência. A falta pode inabilitar.", p);
      else risco("info", "Visita técnica facultativa", "Pode ser substituída por declaração de conhecimento das condições.", p);
    }
    if ((p = primeiro(t, /garantia (?:de|da) proposta/))) risco("medio", "Exige garantia de proposta", "Até 1% do valor estimado (art. 58 da Lei 14.133). Providencie a apólice ou caução antes da sessão.", p);
    if ((p = primeiro(t, /garantia (?:contratual|de execucao|da execucao|do contrato)[\s\S]{0,220}?(\d{1,2}(?:,\d+)?)\s*%/))) {
      const pct = numeroBR(p.m[1]);
      campos.garantiaContratual = p.m[1] + "%";
      risco(pct > 5 ? "medio" : "info", "Garantia contratual de " + p.m[1] + "%", pct > 5 ? "Acima dos 5% usuais (até 10% só em casos justificados)." : "Percentual usual. Inclua o custo da apólice no preço.", p);
    }
    if ((p = primeiro(t, /(?:liquidez geral|\blg\b)[\s\S]{0,160}?(?:superior|maior|igual|minimo)[^0-9]{0,30}(\d+(?:[,.]\d+)?)/))) {
      const v = numeroBR(p.m[1]);
      if (v > 1) risco("medio", "Índice de liquidez acima de 1 (" + p.m[1] + ")", "Confira os índices do último balanço antes de investir na proposta.", p);
      else risco("info", "Índices contábeis padrão (≥ 1)", "LG, SG e LC maiores ou iguais a 1.", p);
    }
    if ((p = primeiro(t, /(?:patrimonio liquido|capital social)[\s\S]{0,200}?(\d{1,2}(?:,\d+)?)\s*%/))) {
      const v = numeroBR(p.m[1]);
      risco(v > 10 ? "alto" : "info", "Patrimônio líquido ou capital mínimo de " + p.m[1] + "%", v > 10 ? "Acima do limite de 10% do valor estimado (art. 69, § 4º)." : "Compare com o patrimônio do último balanço.", p);
    }
    if ((p = primeiro(t, /amostra|prova de conceito/))) risco("medio", "Pode haver amostra ou prova de conceito", "Veja prazo e local de entrega no edital.", p);
    for (const x of todos(t, /prazo (?:maximo )?de (?:ate )?(\d{1,3})\s*(?:\([^)]{1,30}\)\s*)?(?:horas?|h)\b/)) {
      if (+x.m[1] <= 2) { risco("medio", "Prazo curto após convocação (" + x.m[1] + "h)", "Deixe proposta ajustada e documentos prontos antes da sessão.", x); break; }
    }
    if ((p = primeiro(t, /(?:inicio|iniciar|inicie)[^.\n]{0,40}(?:servicos|execucao|prestacao|atividades)[^.\n]{0,120}?(\d{1,3})\s*(?:\([^)]{1,30}\)\s*)?(dias|horas)/))) {
      campos.inicioServicos = p.m[1] + " " + p.m[2];
      if (p.m[2] === "horas" || +p.m[1] <= 5) risco("medio", "Início dos serviços em " + p.m[1] + " " + p.m[2], "Prazo curto para mobilizar equipe médica. Valide a escala antes de disputar.", p);
    }
    for (const x of todos(t, /multa[^.\n]{0,140}?(\d{1,2}(?:,\d+)?)\s*%/)) {
      if (numeroBR(x.m[1]) > 20) { risco("medio", "Multa de " + x.m[1] + "%", "Percentual alto. Leia a cláusula de penalidades com atenção.", x); break; }
    }
    if ((p = primeiro(t, /(?:juntamente|concomitantemente|simultaneamente) com a proposta|documentos de habilitacao[^.\n]{0,60}(?:no ato|junto) (?:do|ao|com o) (?:cadastro|envio)/))) risco("info", "Documentos de habilitação junto com a proposta", "Anexe tudo no portal antes da abertura.", p);
    if ((p = primeiro(t, /(?:vedada|nao sera admitida|nao sera permitida|e vedada) a (?:participacao de empresas reunidas em )?consorcio/))) risco("info", "Consórcio não permitido", "", p);
    if ((p = primeiro(t, /(?:vedada|nao sera admitida|nao sera permitida) a subcontratacao/))) risco("info", "Subcontratação vedada", "Toda a equipe precisa ser própria ou vinculada à contratada.", p);

    /* ---- Termômetro ---- */
    const pontos = riscos.reduce((s, r) => s + (r.nivel === "alto" ? 3 : r.nivel === "medio" ? 1.5 : 0), 0);
    const termometro = pontos >= 6 ? { nivel: "alto", rotulo: "Atenção redobrada", texto: "Edital com exigências que podem restringir a participação. Vale considerar esclarecimento ou impugnação." }
      : pontos >= 3 ? { nivel: "medio", rotulo: "Avaliar com cuidado", texto: "Nada impeditivo à primeira vista, mas há pontos para checar antes de montar a proposta." }
      : { nivel: "ok", rotulo: "Sinal verde", texto: "Exigências dentro do usual. Siga para a planilha de custos." };
    const ordem = { alto: 0, medio: 1, info: 2 };
    riscos.sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);

    const preenchidos = ["numero", "orgao", "objeto", "sessao", "criterio", "plataforma", "valorEstimado"].filter(k => campos[k]).length;
    return { campos, habilitacao, riscos, termometro, pontos, preenchidos, caracteres: o.length, analisadoEm: U.agoraISO() };
  };

  /* =====================================================================
     2. CHAT DOS PREGÕES
     ===================================================================== */
  A.CATEGORIAS = [
    { id: "retomada", nome: "Retomada", re: /retom|reabert|reinici|prosseguimento|continuidade|nova data|remarc|sessao do chat aberta/ },
    { id: "suspensao", nome: "Suspensão", re: /suspen|adiad|adiament|prorrog/ },
    { id: "convocacao", nome: "Convocação", re: /convoc|anexo|encaminh|envi(?:ar|o|e) (?:a |da |de |o )?(?:proposta|documenta|planilha)|prazo de (?:ate )?\d/ },
    { id: "recurso", nome: "Recurso", re: /recurso|contrarraz|intencao|reconsidera/ },
    { id: "habilitacao", nome: "Habilitação", re: /habilit/ },
    { id: "diligencia", nome: "Diligência", re: /diligenc|esclarec|questionament/ },
    { id: "resultado", nome: "Resultado", re: /vencedor|arremat|aceit|adjudic|homolog/ },
    { id: "desclassificacao", nome: "Desclassificação", re: /desclassific|recusad|fracassad|desert|revog|anulad|cancelad/ }
  ];
  const RE_RETOMADA = /retom|reabert|reinici|prosseguimento|continuidade|adiad|remarcad|nova data/;

  // Termos que identificam a empresa nas mensagens (nome, apelido e CNPJ)
  A.termosEmpresa = empresa => {
    const termos = [];
    const add = s => { s = U.semAcento(s || "").toLowerCase().trim(); if (s.length >= 4) termos.push(s); };
    if (empresa) {
      add(empresa.apelido);
      const palavras = U.semAcento(empresa.nome || "").toLowerCase().split(/\s+/).filter(w => w.length >= 5 && !/servicos|medicos|ltda|eireli|saude|empresa|comercio|clinica|assistencia/.test(w));
      if (palavras[0]) add(palavras[0]);
      const cnpj = String(empresa.cnpj || "").replace(/\D/g, "");
      if (cnpj.length === 14) termos.push(cnpj, cnpj.slice(0, 8));
    }
    return [...new Set(termos)];
  };

  A.classificar = (msg, termos) => {
    const t = U.semAcento(msg.texto || "").toLowerCase();
    const tags = A.CATEGORIAS.filter(c => c.re.test(t)).map(c => c.id);
    const soDigitos = (msg.texto || "").replace(/\D/g, "");
    const alvo = t + " " + U.semAcento(msg.autor || "").toLowerCase();
    const citaEmpresa = (termos || []).some(x => /^\d+$/.test(x) ? soDigitos.includes(x) : alvo.includes(x));
    const comHorario = /\d{1,2} ?h ?\d{0,2}\b|\d{1,2}:\d{2}|\d{2}\/\d{2}\/\d{4}/.test(t) && /retom|prazo|ate as|a partir|sessao|reabert/.test(t);
    return { tags, citaEmpresa, importante: tags.length > 0 || citaEmpresa || comHorario, retomada: A.retomada(msg.texto) };
  };

  // "a sessão será retomada em 15/10/2026 às 14h30" -> "15/10/2026 às 14h30"
  A.retomada = texto => {
    const t = U.semAcento(texto || "").toLowerCase();
    if (!RE_RETOMADA.test(t)) return "";
    const hora = /\b(\d{1,2})(?:h(\d{2})?(?:min)?\b|:(\d{2}))/.exec(t);
    const data = /\d{2}\/\d{2}\/\d{4}/.exec(t);
    if (!hora && !data) return "";
    return [data ? data[0] : "", hora ? "às " + U.pad(+hora[1]) + "h" + (hora[2] || hora[3] || "00") : ""].filter(Boolean).join(" ");
  };

  A.papelAutor = (autor, termos) => {
    const a = U.semAcento(autor || "").toLowerCase();
    if (/pregoeir|agente de contratac|comissao|presidente|leiloeir|autoridade/.test(a)) return "pregoeiro";
    if (/sistema|^\s*$/.test(a)) return "sistema";
    if ((termos || []).some(x => !/^\d+$/.test(x) && a.includes(x))) return "nos";
    return "licitante";
  };

  // "15/10/2026 10:21:33" -> "2026-10-15T10:21:33"
  A.horaISO = s => {
    const m = String(s || "").match(/(\d{2})\/(\d{2})\/(\d{4})\D+(\d{2}):(\d{2})(?::(\d{2}))?/);
    return m ? m[3] + "-" + m[2] + "-" + m[1] + "T" + m[4] + ":" + m[5] + ":" + (m[6] || "00") : null;
  };
  A.chaveMensagem = m => U.hash((m.hora || "") + "|" + (m.autor || "") + "|" + (m.texto || ""));

  /* Lê mensagens coladas de qualquer portal. Formatos aceitos:
       15/10/2026 10:21:33 - Pregoeiro: texto
       Pregoeiro 15/10/2026 10:21:33 texto
       [15/10/2026 10:21] Sistema: texto
     Linhas sem data são continuação da mensagem anterior. */
  A.lerChatColado = texto => {
    const out = [];
    const RE1 = /^\s*\[?(\d{2}\/\d{2}\/\d{4})[\s,-]+(\d{2}:\d{2}(?::\d{2})?)\]?\s*[-–]?\s*(?:([^:]{2,60}?)\s*:\s+)?(.*)$/;
    const RE2 = /^\s*([^\d\n][^\n]{1,60}?)\s+[-–]?\s*\[?(\d{2}\/\d{2}\/\d{4})[\s,-]+(\d{2}:\d{2}(?::\d{2})?)\]?\s*[-–:]?\s*(.*)$/;
    String(texto || "").replace(/\r/g, "").split("\n").forEach(linha => {
      if (!linha.trim()) return;
      let m = RE1.exec(linha), msg = null;
      if (m) msg = { data: m[1], hora: m[2], autor: (m[3] || "").trim(), texto: m[4].trim() };
      else if ((m = RE2.exec(linha))) msg = { data: m[2], hora: m[3], autor: m[1].replace(/[:\-–]\s*$/, "").trim(), texto: m[4].trim() };
      if (msg) {
        if (msg.autor.split(/\s+/).length > 8) { msg.texto = msg.autor + ": " + msg.texto; msg.autor = ""; }
        const h = msg.hora.length === 5 ? msg.hora + ":00" : msg.hora;
        out.push({ hora: A.horaISO(msg.data + " " + h), autor: msg.autor || "Sistema", texto: msg.texto });
      } else if (out.length) {
        out[out.length - 1].texto += (out[out.length - 1].texto ? " " : "") + linha.trim();
      }
    });
    return out.filter(m => m.hora && m.texto);
  };

  g.Analise = A;
})(typeof window !== "undefined" ? window : globalThis);
