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
  // 10:00 · 10h · 10h30 · 23h e 59 min
  const RE_HORA = /(\d{1,2})\s*(?:h(?:oras?|rs?)?|:)\s*(?:e\s*(\d{2})\s*min(?:utos?)?|(\d{2}))?(?!\s*(?:dias|%|\d))/;

  // Plataformas mais comuns (mesma lista do Radar de Licitações)
  const PLATAFORMAS = [
    [/compras\.gov|comprasnet|comprasgovernamentais|gov\.br\/compras/, "Compras.gov.br"],
    [/\bbll\b|bolsa de licitac|bllcompras/, "BLL"],
    [/licitacoes-e\b|licitacoes-e\.com|licitacoes e do banco do brasil/, "Licitações-e"],
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
    if (mh && +mh[1] <= 23) { const min = mh[2] || mh[3]; return data + "T" + U.pad(+mh[1]) + ":" + U.pad(min && +min <= 59 ? +min : 0); }
    return data;
  }
  function numeroBR(s) { return Number(String(s).replace(/\./g, "").replace(",", ".")); }

  /* Tabela que o leitor de PDF entrega uma célula por linha:
       ITEM / DESCRIÇÃO ... / UNIDADE / QUANTIDADE ...   (cabeçalho)
       1 / FISIOTERAPIA ... (várias linhas) / 189111 30030 (códigos) / HORA / 240 / [R$ unit] [R$ total] */
  const UNIDADES = /^(hora|horas|m[êe]s|meses|unidade|unidades|un|und|sess[ãa]o|sess[õo]es|servi[çc]o|servi[çc]os|plant[ãa]o|plant[õo]es|di[áa]ria|di[áa]rias|exame|exames|procedimento|procedimentos|consulta|consultas|m[óo]dulo|m[óo]dulos|paciente|pacientes|kit|global)\b\.?(?:\s+(\d[\d.,]*))?$/i;
  function tabelaEmColunas(o) {
    const L = o.replace(/\r/g, "").replace(/[\ue000-\uf8ff\u2022\u25aa\u25cf]/g, " ").split("\n").map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    const itens = [];
    for (let i = 0; i < L.length && itens.length < 30; i++) {
      if (!/^ITEM\b/i.test(L[i])) continue;
      const janela = L.slice(i, i + 16).join(" ");
      if (!/UNIDADE/i.test(janela) || !/QUANTIDADE|QTDE/i.test(janela)) continue;
      let j = i + 1;
      while (j < L.length && j < i + 16 && !/^\d{1,3}$/.test(L[j])) j++;
      while (j < L.length && /^\d{1,3}$/.test(L[j])) {
        const item = { item: L[j], descricao: "", unidade: null, qtd: null, valorUnit: null, valorTotal: null };
        let k = j + 1; const desc = [];
        for (; k < L.length && k < j + 60; k++) {
          const u = UNIDADES.exec(L[k]);
          if (u) { item.unidade = u[1].charAt(0).toUpperCase() + u[1].slice(1).toLowerCase(); if (u[2]) item.qtd = numeroBR(u[2]); k++; break; }
          if (/^(?:\d{5,7}\s*)+$/.test(L[k])) continue; // códigos SIAFÍSICO/CATSER/CATMAT
          if (/^(?:VALOR TOTAL|ANEXO|TOTAL GERAL)/i.test(L[k])) break;
          desc.push(L[k]);
        }
        if (!item.unidade) break;
        if (item.qtd === null && /^\d[\d.,]*$/.test(L[k] || "")) { item.qtd = numeroBR(L[k]); k++; }
        const precos = [];
        while (k < L.length && precos.length < 2 && /^(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}$/.test(L[k])) { precos.push(numeroBR(L[k].replace(/R\$\s*/, ""))); k++; }
        if (precos[0]) item.valorUnit = precos[0];
        if (precos[1]) item.valorTotal = precos[1];
        // Linhas de descrição que sobram depois da quantidade (sub-itens do mesmo item)
        while (k < L.length && !/^\d{1,3}$/.test(L[k]) && !/^(?:VALOR TOTAL|ANEXO|TOTAL|\d+\.\s)/i.test(L[k]) && !/^[A-Z]{2,}.*\d+ de \d+$/.test(L[k]) && desc.length < 80 && /[A-ZÀ-Ú]{3}/.test(L[k]) && L[k] === L[k].toUpperCase()) { desc.push(L[k]); k++; }
        item.descricao = desc.join(" ").replace(/\s+([.,;])/g, "$1");
        if (item.descricao.length >= 5) itens.push(item);
        j = k;
      }
      if (itens.length) break;
    }
    return itens;
  }

  /* Tabela "ITEM | QTE. ESTIMADA | UNID | DESCRIÇÃO" (quantidade e unidade antes da descrição):
       1. / 960 UNID / Atendimento Neurologista ... / 40 consultas mensais / 20 atendimentos por dia
       2. 960 UNID. Atendimento Pediatria / 40 consultas mensais ... */
  const UN = "(UNID(?:ADES?)?|UN|UND|HORAS?|M[ÊE]S(?:ES)?|SERVI[ÇC]OS?|CONSULTAS?|PLANT[ÃA]O|PLANT[ÕO]ES|EXAMES?|SESS[ÃA]O|SESS[ÕO]ES|PROCEDIMENTOS?|DI[ÁA]RIAS?)\\.?";
  function tabelaQtdAntes(o) {
    const L = o.replace(/\r/g, "").replace(/[\ue000-\uf8ff\u2022\u25aa\u25cf]/g, " ").split("\n").map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    const reJunto = new RegExp("^(\\d{1,3})[.)]?\\s+(\\d[\\d.]*)\\s+" + UN + "\\s+(.+)$", "i");
    const reQtd = new RegExp("^(\\d[\\d.]*)\\s+" + UN + "$", "i");
    const fim = /^(?:\d{1,2}\s*[-–]\s*\S|observa[çc][ãa]o|valor total|total geral|anexo|justificativa)/i;
    const itens = [];
    for (let i = 0; i < L.length; i++) {
      if (!/^ITEM\b/i.test(L[i])) continue;
      const cab = L.slice(i, i + 5).join(" ");
      if (!/QT|QUANT/i.test(cab) || !/UNID|UN\b/i.test(cab)) continue;
      let k = i + 1, atual = null;
      const fecha = () => { if (atual && atual.desc.length) { atual.item.descricao = (atual.desc[0] + (atual.desc.length > 1 ? " – " + atual.desc.slice(1).join("; ") : "")).replace(/[\s\u00a0\u2000-\u200b]+/g, " ").trim(); if (/^(?:unid|un|und)$/i.test(atual.item.unidade)) atual.item.unidade = "Unid."; itens.push(atual.item); } atual = null; };
      for (; k < L.length && k < i + 400; k++) {
        let m;
        if ((m = reJunto.exec(L[k]))) { fecha(); atual = { item: { item: m[1], unidade: m[3].charAt(0) + m[3].slice(1).toLowerCase(), qtd: numeroBR(m[2]), valorUnit: null, valorTotal: null }, desc: [m[4]] }; continue; }
        if (/^\d{1,3}[.)]?$/.test(L[k]) && (m = reQtd.exec(L[k + 1] || ""))) { fecha(); atual = { item: { item: L[k].replace(/\D/g, ""), unidade: m[2].charAt(0) + m[2].slice(1).toLowerCase(), qtd: numeroBR(m[1]), valorUnit: null, valorTotal: null }, desc: [] }; k++; continue; }
        if (fim.test(L[k]) || /^[A-ZÀ-Ú ]{12,}$/.test(L[k])) { if (atual || itens.length) break; continue; }
        if (atual) atual.desc.push(L[k]);
      }
      fecha();
      if (itens.length) break;
    }
    return itens;
  }

  /* Itens em blocos (comum no e-compras.AM e em TRs estaduais):
       ITEM Nº 01 / Serviço (s): Quantidade / SEMESTRAL ID UNIDADE / SERVIÇOS DE PLANTÃO / HOSPITALAR 543 153764 PLANTÃO
       Descrição: Contratação de empresa ... plantão de 12 horas, DIURNO, conforme Termo de Referência.
       VALOR UNITÁRIO DO PLANTÃO: / VALOR TOTAL:
     Ignora as linhas de assinatura e autenticação (edoc) que o PDF intercala no meio do texto. */
  const RUIDO_PDF = /^(?:folha:\s*\d+|a autenticidade deste documento|https?:\/\/|c[óo]digo verificador|documento [\dA-F.]+ assinado|assinado digitalmente|.*assinatura por login\/senha)/i;
  function itensEmBlocos(o) {
    const L = o.replace(/\r/g, "").split("\n").map(x => x.replace(/[\s ]+/g, " ").trim()).filter(x => x && !RUIDO_PDF.test(x));
    const cab = /^ITEM\s*(?:N\s*[º°o.]\s*|N[ÚU]MERO\s*)(\d{1,3})\s*:?$/i;
    const reQtd = new RegExp("(?:^|\\s)(\\d{1,3}(?:\\.\\d{3})*(?:,\\d+)?|\\d+(?:,\\d+)?)\\s+(?:\\d{4,8}\\s+)?" + UN + "(?:\\s|$)", "i");
    const itens = [], vistos = new Set();
    for (let i = 0; i < L.length; i++) {
      const m = cab.exec(L[i]);
      if (!m) continue;
      const num = String(+m[1]).padStart(2, "0");
      if (vistos.has(num)) break; // o mesmo TR repetido (edital + TR enviados juntos)
      let fim = i + 1;
      while (fim < L.length && fim < i + 60 && !cab.test(L[fim]) && !/^\d{1,2}\.\d{1,2}\.?\s+[A-ZÀ-Ú]/.test(L[fim])) fim++;
      const bloco = L.slice(i + 1, fim);
      const iDesc = bloco.findIndex(x => /^descri[çc][ãa]o\s*:/i.test(x));
      let desc = "";
      if (iDesc >= 0) {
        const partes = [bloco[iDesc].replace(/^descri[çc][ãa]o\s*:\s*/i, "")];
        for (let k = iDesc + 1; k < bloco.length && !/^valor\b/i.test(bloco[k]); k++) partes.push(bloco[k]);
        desc = partes.join(" ");
      }
      desc = desc.replace(/^contrata[çc][ãa]o de empresa especializada (?:para|na|em) (?:a )?(?:presta[çc][ãa]o de )?servi[çc]os? (?:de |em )?/i, "")
        .replace(/,?\s*conforme (?:o |este )?(?:termo de refer[êe]ncia|projeto b[áa]sico|edital)\.?\s*$/i, "").replace(/\s+/g, " ").trim();
      const antes = (iDesc >= 0 ? bloco.slice(0, iDesc) : bloco).join(" ");
      const q = reQtd.exec(antes);
      if (!desc && !q) continue;
      const vu = /valor unit[áa]rio[^:]*:\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})/i.exec(bloco.join(" "));
      const un = q ? q[2] : "";
      vistos.add(num);
      itens.push({ item: num, descricao: desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : antes.slice(0, 160),
        unidade: un ? un.charAt(0).toUpperCase() + un.slice(1).toLowerCase().replace(/\.$/, "") : null,
        qtd: q ? numeroBR(q[1]) : null, valorUnit: vu ? numeroBR(vu[1]) : null, valorTotal: null });
      i = fim - 1;
    }
    return itens.length >= 1 && itens.some(x => x.descricao) ? itens : [];
  }

  /* Tabela linha a linha, com a descrição quebrada em várias linhas:
       TR:      Item | Quantidade | Unidade | Especificação | Preço Uni. | Preço Total
                01 12 MÊS / Contratação de empresa ... (várias linhas) / R$:25.796,84 R$ / 309.562,08
       Minuta:  ITEM UNID. DESCRIÇÃO QUANT. VALOR UN. VALOR TOTAL
                01 MÊS CONTRATAÇÃO DE EMPRESA ... / 12 R$ ---------- R$ ------------
     Ignora cabeçalhos e rodapés repetidos em todas as páginas. Fica com a tabela mais completa. */
  function tabelaLinhas(o) {
    const L0 = o.replace(/\r/g, "").replace(/[\ue000-\uf8ff\u2022\u25aa\u25cf]/g, " ").split("\n").map(x => x.replace(/\s+/g, " ").trim()).filter(Boolean);
    const freq = {};
    L0.forEach(x => { freq[x] = (freq[x] || 0) + 1; });
    const L = L0.filter(x => !(freq[x] >= 3 && x.length < 120 && !/^\d/.test(x)));
    const U2 = "(M[ÊE]S(?:ES)?|UNID(?:ADES?)?|UN|UND|HORAS?|SERVI[ÇC]OS?|CONSULTAS?|PLANT[ÃA]O|PLANT[ÕO]ES|EXAMES?|SESS[ÃA]O|SESS[ÕO]ES|PROCEDIMENTOS?|DI[ÁA]RIAS?|GLOBAL)\\.?";
    const rowQtdUn = new RegExp("^(\\d{1,3})[.)]?\\s+(\\d[\\d.]*(?:,\\d+)?)\\s+" + U2 + "(?:\\s+(.*))?$", "i");
    const rowUn = new RegExp("^(\\d{1,3})[.)]?\\s+" + U2 + "\\s+(\\D.*)$", "i");
    const qtdDepois = /^(\d[\d.]*(?:,\d+)?)(?:\s+R\$.*)?$/;
    const fim = /^(?:total\b|valor (?:total|global)|cl[áa]usula|\d+(?:\.\d+)+\.?\s|\d+\.\s+[A-ZÀ-Ú]|anexo\b|observa[çc]|justificativa)/i;
    const moedas = x => (x.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || []).map(numeroBR);
    const tabelas = [];
    for (let i = 0; i < L.length; i++) {
      if (!/^item\b/i.test(L[i])) continue;
      const cab = L.slice(i, i + 9).join(" ");
      if (!/quant|qtd|qtde|qte/i.test(cab) || !/unid|\bun\b|und/i.test(cab)) continue;
      const itens = [];
      let atual = null, k = i + 1;
      const fecha = () => {
        if (!atual) return;
        let d = atual.desc.join(" ").replace(/\s+/g, " ").trim();
        if (d && d === d.toUpperCase()) d = d.toLowerCase().replace(/(^|[.!?]\s+)(\S)/g, (z, a, b) => a + b.toUpperCase()); // texto todo em maiúsculas
        if (d.length >= 5) itens.push(Object.assign(atual.item, { descricao: d }));
        atual = null;
      };
      for (; k < L.length && k < i + 200; k++) {
        const x = L[k];
        let m;
        if ((m = rowQtdUn.exec(x)) && !/^\d{1,3}(?:\.\d{3})*,\d{2}/.test(m[2])) { fecha(); atual = { item: { item: m[1], qtd: numeroBR(m[2]), unidade: m[3], valorUnit: null, valorTotal: null }, desc: m[4] ? [m[4]] : [] }; continue; }
        if ((m = rowUn.exec(x))) { fecha(); atual = { item: { item: m[1], qtd: null, unidade: m[2], valorUnit: null, valorTotal: null }, desc: [m[3]] }; continue; }
        if (!atual) { if (k > i + 9) break; continue; }
        if (fim.test(x)) break;
        if (/R\$|^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(x)) { // valores (ou "12 R$ ---- R$ ----", com a quantidade na frente)
          const q = qtdDepois.exec(x);
          if (q && atual.item.qtd === null && !/,\d{2}$/.test(q[1])) atual.item.qtd = numeroBR(q[1]);
          moedas(x).forEach(v => { if (atual.item.valorUnit === null) atual.item.valorUnit = v; else if (atual.item.valorTotal === null) atual.item.valorTotal = v; });
          continue;
        }
        if (atual.item.qtd === null && /^\d[\d.]*(?:,\d+)?$/.test(x)) { atual.item.qtd = numeroBR(x); continue; }
        atual.desc.push(x);
      }
      fecha();
      if (itens.length) {
        itens.forEach(it => { it.unidade = it.unidade.charAt(0).toUpperCase() + it.unidade.slice(1).toLowerCase().replace(/\.$/, ""); });
        const nota = itens.reduce((s, it) => s + (it.qtd ? 2 : 0) + (it.valorUnit ? 2 : 0) + (it.valorTotal ? 1 : 0), 0) / itens.length;
        tabelas.push({ itens, nota });
      }
      i = k;
    }
    tabelas.sort((a, b) => b.nota - a.nota);
    return tabelas.length ? tabelas[0].itens : [];
  }

  A.analisarEdital = function (original, opcoes) {
    opcoes = opcoes || {};
    const o = String(original || "");
    const t = U.normalizarMesmoTamanho(o);
    const campos = {}, riscos = [], achados = {};
    const risco = (nivel, titulo, detalhe, pos) => riscos.push({ nivel, titulo, detalhe: detalhe || "", trecho: pos ? recorte(o, pos.i, pos.m[0].length) : "" });

    /* ---- Identificação ---- */
    let p = primeiro(t, /\b(pregao eletronico|pregao presencial|pregao|concorrencia eletronica|concorrencia|dispensa de licitacao eletronica(?:\s*\(dle\))?|dispensa eletronica|dle|credenciamento|chamamento publico)\s*(?:srp\s*)?(?:n[º°o.]*|numero)?\s*[:\-]?\s*(\d{1,5}\s*\/\s*(?:[a-z]{2,8}\s*\/\s*)?\d{2,4})/);
    if (p) {
      const mod = p.m[1];
      const sigla = /pregao/.test(mod) ? (/presencial/.test(mod) ? "PP" : "PE") : /concorrencia/.test(mod) ? "CE" : /dle/.test(mod) ? "DLE" : /dispensa/.test(mod) ? "DE" : "CH";
      campos.numero = sigla + " " + p.m[2].replace(/\s/g, "").replace(/\/[a-z]{2,8}\//, "/"); // 018/FMS/2026 → 018/2026
      campos.modalidade = /pregao/.test(mod) ? (/presencial/.test(mod) || (!/eletronico/.test(mod) && /pregao presencial/.test(t)) ? "Pregão presencial" : "Pregão eletrônico") : /concorrencia/.test(mod) ? "Concorrência eletrônica" : /dispensa|dle/.test(mod) ? "Dispensa eletrônica" : "Credenciamento";
    }
    p = primeiro(t, /processo(?: administrativo| licitatorio| sei)?\s*(?:n[º°o.]*|numero)?\s*[:\-]?\s*(\d[\d.\/-]{5,30}\d|\d{1,6}\/[a-z]{2,8}\/\d{2,4})/);
    if (p) campos.processo = o.substr(p.i + p.m[0].length - p.m[1].length, p.m[1].length);
    // Órgão: primeira linha com cara de nome de órgão
    const linhas = o.split(/\n/).slice(0, 40);
    // Órgão: linha que COMEÇA com o nome de um órgão (ignora rodapés de modelo, como "aprovado pela secretaria…")
    const ORG = [/^(?:prefeitura|munic[íi]pio d|c[âa]mara municipal)/i, /^(?:fundo (?:municipal|estadual|nacional)|cons[óo]rcio)/i,
      /^(?:secretaria|departamento|diretoria regional|coordenadoria|hospital|tribunal|minist[ée]rio|universidade|instituto|governo|empresa brasileira|centro de servi[çc]os|funda[çc][ãa]o|ag[êe]ncia|assembleia|companhia|servi[çc]o aut[ôo]nomo|autarquia)/i];
    const candidatasOrgao = o.split(/\n/).slice(0, 80).map(l => l.replace(/\s+/g, " ").trim())
      .filter(l => l.length >= 8 && l.length < 140 && !/aprovad|minuta|modelo|padr[ãa]o|p[áa]gina \d|^anexo|edital|preg[ãa]o|processo|cnpj/i.test(l));
    let linhaOrgao = null;
    const rotulo = /(?:^|\n)\s*(?:CONTRATANTE|[ÓO]RG[ÃA]O(?: GERENCIADOR| REQUISITANTE| PROMOTOR)?|UNIDADE COMPRADORA)\s*:\s*([^\n]{6,140})/i.exec(o.slice(0, 8000));
    if (rotulo) linhaOrgao = rotulo[1].replace(/\s+/g, " ").trim();
    if (!linhaOrgao) { // "..., através da FUNDAÇÃO CENTRO DE ... - FCECON, torna público"
      const atraves = /atrav[ée]s\s+(?:d[aoe]s?\s+)?((?:funda[çc][ãa]o|secretaria|hospital|fundo|instituto|departamento|centro|universidade|superintend[êe]ncia|companhia|ag[êe]ncia|empresa|prefeitura|c[âa]mara)[^,;]{5,160}?)\s*,?\s*(?:torna|realiza|comunica|faz saber)/i.exec(o.slice(0, 5000).replace(/\s+/g, " "));
      if (atraves) linhaOrgao = atraves[1].trim();
    }
    for (const re of ORG) { if (linhaOrgao) break; linhaOrgao = candidatasOrgao.find(l => re.test(l)); }
    if (linhaOrgao) campos.orgao = linhaOrgao.replace(/\s+/g, " ").trim().replace(/[–-]\s*$/, "");
    // Objeto: rótulo "OBJETO:" do quadro-resumo do início; depois "tem por objeto ..." / "o objeto da presente licitação é ..."
    const rotObj = /(?:^|\n)[ \t]*OBJETO[ \t]*:[ \t]*(?=\S)/.exec(o.slice(0, 8000));
    p = rotObj ? { m: rotObj, i: rotObj.index } : primeiro(t, /(?:tem (?:como|por) objeto|constitui(?:-se)? (?:o )?objeto d[ao] presente (?:licitacao|pregao|certame|edital)(?: a| o)?|o objeto (?:da presente (?:licitacao|dle|dispensa|contratacao)|desta (?:licitacao|dispensa)|deste (?:pregao|edital|certame|termo)|do presente (?:pregao|certame|edital|termo)) (?:e|consiste (?:em|na|no)|sera))\s+(?:a\s+|o\s+)?/)
      || primeiro(t, /(?:^|\n)[ \t]*(?:\d+(?:\.\d+)*\.?[ \t]*)?(?:do |- )?objeto[ \t]*[:.\-–][ \t]*(?=\S)/);
    if (p) {
      const ini = p.i + p.m[0].length;
      let trecho = o.slice(ini, ini + 600);
      const fim = trecho.search(/\.\s*\n|\n\s*\n|\.\s+\d+(?:\.\d+)+\.?\s|\n[ \t]*[A-ZÀ-Ú][A-ZÀ-Ú /]{3,}:/);
      trecho = (fim > 30 ? trecho.slice(0, fim + 1) : trecho).replace(/\s+/g, " ").trim();
      campos.objetoCompleto = U.corta(trecho.charAt(0).toUpperCase() + trecho.slice(1), 900);
      campos.objeto = U.corta(campos.objetoCompleto, 360);
    }

    /* ---- Datas ---- */
    // Forma "às 10:00 horas do dia 18 de novembro de 2026 (...) será realizada a sessão"
    for (const x of todos(t, /\bas \d{1,2}(?::\d{2}|h\d{0,2}(?:min)?)? ?(?:horas|hs|h)?,? (?:do |de |no )?(?:dia )?(?=\d)/)) {
      const antes = t.slice(Math.max(0, x.i - 70), x.i);
      // "Início às 8h do dia 30/10 até às 8h15min do dia 18/11" é o período de recebimento das propostas, não a sessão
      if (/recebimento|acolhimento|envio das|cadastramento|inicio as|a partir d|\bate $|\bate as $/.test(antes) && !/sessao|disputa|abertura/.test(antes.slice(-45))) continue;
      const d = dataPerto(t, x.i, 90);
      if (d && /sessao|abertura|disputa|recebimento das propostas|lances/.test(antes.slice(-60) + t.slice(x.i, x.i + 400))) { campos.sessao = d; break; }
    }
    const chavesSessao = [/data (?:e hora )?(?:da |de |do )?(?:licitacao|abertura|realizacao|inicio|disputa|certame)(?: da sessao| do certame| das propostas)?/, /sessao publica/, /abertura da sessao|abertura das propostas/, /inicio da (?:sessao|disputa)/, /data da sessao/];
    for (const re of campos.sessao ? [] : chavesSessao) {
      for (const x of todos(t, re)) { const d = dataPerto(t, x.i); if (d) { campos.sessao = d; achados.sessao = x; break; } }
      if (campos.sessao) break;
    }
    for (const x of todos(t, /(?:limite|prazo final|ate)[^.\n]{0,40}(?:recebimento|cadastr|envio|acolhimento)[^.\n]{0,20}propostas?|recebimento das propostas ate/)) {
      const d = dataPerto(t, x.i); if (d) { campos.limiteProposta = d; break; }
    }
    if (!campos.limiteProposta) { // "RECEBIMENTO DAS PROPOSTAS: Início às 8h do dia 30/10/2026 até às 8h15min do dia 18/11/2026"
      for (const x of todos(t, /recebimento\s+(?:das|de)\s+propostas/)) {
        const j = t.slice(x.i, x.i + 220).replace(/\s+/g, " "), a = /\bate (?:as )?/.exec(j);
        if (!a) continue;
        const m = /^(?:(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*(?:min(?:utos)?)?\s*(?:horas\s*)?,?\s*(?:do |de )?(?:dia )?)?(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(j.slice(a.index + a[0].length));
        if (m) { campos.limiteProposta = m[5] + "-" + U.pad(+m[4]) + "-" + U.pad(+m[3]) + (m[1] ? "T" + U.pad(+m[1]) + ":" + U.pad(m[2] ? +m[2] : 0) : ""); break; }
        const d = dataPerto(j, a.index); if (d) { campos.limiteProposta = d; break; }
      }
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
    // Cidades candidatas, da pista mais forte para a mais fraca; o portal confere cada uma na lista do IBGE.
    const cidades = [];
    const addCidade = (nome, uf) => {
      nome = String(nome || "").replace(/\s+/g, " ").trim().replace(/^(?:a|o|de|do|da)\s+/i, "").replace(/\s+(?:estado|secretaria|fundo|em|no|na|sp|rj|mg)$/i, "");
      if (/^(?:capital|estado|comarca|uni[ãa]o|rep[úu]blica|centro|bairro|rua|avenida|munic[íi]pio|unidade|hospital|prefeitura|secretaria|fundo|c[âa]mara|governo|departamento|edital|preg[ãa]o|processo|lei|decreto)\b/i.test(nome)) return;
      if (/\b(?:munic[íi]pio|comunicad|previamente|conforme|mediante)\b/i.test(nome)) return;
      if (nome.length < 3 || nome.split(" ").length > 6 || /\d|^(?:sua|seu|esta|este|cada|todo|qualquer|outro|referido|presente|contratante)\b/i.test(nome)) return;
      if (/^[A-ZÀ-Ú' ]+$/.test(nome)) nome = nome.toLowerCase().replace(/(^|\s)(\S)/g, (x, e, l) => e + l.toUpperCase()).replace(/\s(De|Do|Da|Dos|Das|E)\s/g, x => x.toLowerCase());
      uf = uf ? uf.toUpperCase() : "";
      if (!cidades.some(c => c.nome.toLowerCase() === nome.toLowerCase() && (c.uf === uf || !uf || !c.uf))) cidades.push({ nome, uf });
    };
    const UFRE = "(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)";
    // Nome próprio: palavras com inicial maiúscula (ou tudo maiúsculo), ligadas por de/do/da
    const NOME = "([A-ZÀ-Ú][A-Za-zÀ-ú'’]+(?: (?:d[eoa]s?|D[EOA]S?|[A-ZÀ-Ú][A-Za-zÀ-ú'’]+)){0,5})";
    const ci = txt => txt.replace(/[a-zà-úç]/g, c => "[" + c + c.toUpperCase() + "]"); // sem flag "i", para o NOME continuar exigindo maiúscula
    const DE = "(?:[Dd][EeOoAa][Ss]?)";
    const PRE = "(?:" + ci("prefeitura municipal") + "|" + ci("prefeitura") + "|" + ci("câmara municipal") + "|" + ci("camara municipal") + "|" + ci("fundo municipal de saúde") + ")";
    const MUN = "(?:" + ci("município") + "|" + ci("municipio") + ") " + DE + " ";
    const SUF_UF = "(?:\\s*(?:/|–|-|\\()\\s*" + UFRE + "\\b)?";
    const achar = (re, fn) => { for (const m of o.matchAll(new RegExp(re, "g"))) fn(m); };
    achar(MUN + NOME + "\\s*(?:/|–|-|\\()\\s*" + UFRE + "\\b", m => addCidade(m[1], m[2]));
    // Sede do órgão: "sediado na rua X, 5-45, Centro, Bauru/SP"
    achar("(?:sediad[oa]|situad[oa]|localizad[oa]|com sede)[^\\n.;]{0,140}?,\\s*" + NOME + "\\s*(?:/|–|-)\\s*" + UFRE + "\\b", m => addCidade(m[1], m[2]));
    const mo0 = new RegExp(PRE + " " + DE + " (?:" + MUN + ")?" + NOME + SUF_UF).exec(linhaOrgao || "");
    if (mo0) addCidade(mo0[1], mo0[2]);
    achar(PRE + " " + DE + " (?:" + MUN + ")?" + NOME + SUF_UF, m => addCidade(m[1], m[2]));
    achar(ci("foro") + " (?:" + ci("da comarca") + " )?" + DE + " " + NOME + SUF_UF, m => addCidade(m[1], m[2]));
    achar("CEP[:\\s]*\\d{2}\\.?\\d{3}-?\\d{3}[\\s,–-]*" + NOME + "\\s*(?:/|–|-)\\s*" + UFRE + "\\b", m => addCidade(m[1], m[2]));
    achar(NOME + "\\s*(?:/|–|-)\\s*" + UFRE + "[\\s,–-]*CEP", m => addCidade(m[1], m[2]));
    achar("(?:^|\\n)\\s*" + NOME + "\\s*(?:(?:/|–|-)\\s*" + UFRE + ")?\\s*,\\s*(?:em\\s+)?\\d{1,2}º? de (?:janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro) de \\d{4}", m => addCidade(m[1], m[2]));
    achar(MUN + NOME, m => addCidade(m[1], ""));
    achar(ci("município") + " d[ae] (?:resid[êe]ncia|domic[íi]lio)[^()\\n]{0,40}\\(" + NOME + "\\)", m => addCidade(m[1], ""));
    achar("(?:^|[\\s,(])" + NOME + "\\s*/\\s*" + UFRE + "\\b", m => addCidade(m[1], m[2]));
    campos.cidades = cidades.slice(0, 8);
    if (cidades.length) { campos.municipio = cidades[0].nome; if (cidades[0].uf) campos.uf = cidades[0].uf; }
    if (!campos.municipio) {
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
    const mlc = /servi[çc]os (?:solicitados |contratados )?(?:ser[ãa]o|dever[ãa]o ser) (?:prestados|executados|realizados)\s+((?:n[oa]s?|em)\s+(?!seguinte hor|conformidade|observ[âa]ncia|conson[âa]ncia|acordo|estrita|perfeit)(?:[^.;]|(?<=(?:^|[\s–-])[A-ZÀ-Ú])\.){5,320})/i.exec(o); // "D. Pedro" não encerra a frase
    if (mlc) campos.local = (mlc[1].charAt(0).toUpperCase() + mlc[1].slice(1)).replace(/\s+/g, " ").replace(/\s*,?\s*obedecendo\b.*$/i, "").trim();
    else if (ml) campos.local = ml[1].charAt(0).toUpperCase() + ml[1].slice(1).replace(/\s*,?\s*(?:conforme|de acordo|mediante|contemplando|para|com|sendo)\b.*$/i, "").replace(/[,\s]+$/, "").trim();
    // Junta as linhas que o PDF quebrou no meio da frase (a próxima linha não começa cláusula nem título)
    const unido = o.replace(/\r/g, "").split("\n").filter(x => !RUIDO_PDF.test(x.trim())).join("\n").replace(/([^.;:\n])[ \t]*\n(?![ \t]*(?:\d+(?:\.\d+)*[.)]?\s|[a-z]\)\s|CL[ÁA]USULA\b|[A-ZÀ-Ú][A-ZÀ-Ú ,–-]{12,}\n))/g, "$1 ");
    const frases = unido.split(/(?<=[.;])\s+|\n+/).map(x => x.replace(/^\s*(?:\d+(?:\.\d+)*\.?|[a-z]\))\s*/i, "").replace(/\s+/g, " ").trim());
    const pareceTabela = f => { const tk = f.split(/\s+/); return tk.length > 6 && tk.filter(x => /^[\d.,•]+$/.test(x)).length / tk.length > 0.2; };
    const caixaAlta = f => { const l = f.replace(/[^A-Za-zÀ-ú]/g, ""); return l.length > 10 && l.replace(/[^A-ZÀ-Ú]/g, "").length / l.length > 0.6; };
    // Frase longa: fica só o trecho (entre vírgulas) que fala do horário
    const enxuga = f => {
      if (f.length <= 240) return f;
      const partes = f.split(/,\s+/), i = partes.findIndex(x => RE_HORARIO.test(x));
      if (i < 0) return f.slice(0, 240);
      let r = partes[i];
      if (partes[i + 1] && (RE_HORARIO.test(partes[i + 1]) || /^(?:inclusive|aos?|nos?|de|em)\b/i.test(partes[i + 1])) && (r + partes[i + 1]).length < 260) r += ", " + partes[i + 1];
      r = r.replace(/^(?:de modo a (?:assegurar|garantir)|assegurando|garantindo|bem como|e)\s+/i, "").trim();
      return r.charAt(0).toUpperCase() + r.slice(1);
    };
    // Horários: frases com dias, turnos, escalas ou carga horária. Primeiro nas cláusulas de execução;
    // se não houver, nos trechos do objeto (ex.: "atendimento regular de segunda a sexta-feira e sobreaviso 24 horas").
    const RE_HORARIO = /segunda[- ]feira a sexta|segunda a sexta|segunda a s[áa]bado|segunda a domingo|todos os dias|ininterrupt|s[áa]bados?,|domingos|finais de semana|fins de semana|sobreaviso|plant[ãa]o de \d|plant[õo]es de \d|plant[õo]es? (?:diurnos?|noturnos?|presenciais?)|horas di[áa]rias|horas semanais|horas mensais|carga hor[áa]ria|h\/dia|h\/semana|per[íi]odo (?:da )?(?:manh|tarde|noite|diurno|noturno)|\\bturnos?\\b|\\bescala de|\\bescalas? (?:de trabalho|mensal|semanal)|\b12 ?x ?36\b|\b24 ?x ?(?:48|72)\b|\bdas \d{1,2} ?(?:h|:\d{2}|horas)(?:\d{2})? (?:[àa]s|até) \d{1,2}|\b24 ?(?:h|horas)\b|\b12 ?(?:h|horas)\b|\b6 ?(?:h|horas) di|\b4 ?(?:h|horas) di/i;
    const EXCLUI_HORARIO = /menor(?:es)? de (?:18|dezoito|16|dezesseis)|trabalho noturno, perigoso|insalubre|n[ãa]o emprega|declara|valor|R\$|multa|pagamento|prazo de|licita[çc][ãa]o [ée]|ser[ãa]o (?:prestados|executados) n(?!o seguinte hor|os seguintes hor)|ap[óo]s a assinatura|sess[ãa]o p[úu]blica|impugna|proposta|habilita[çc][ãa]o|recurso|nota fiscal|telefone|whatsapp|e-?mail|@|extraordin[áa]ria|descri[çc][ãa]o\s*:/i;
    let horarios = frases.filter(f => f.length >= 20 && f.length <= 700 && RE_HORARIO.test(f) && !EXCLUI_HORARIO.test(f) && !/objeto/i.test(f) && !caixaAlta(f) && !pareceTabela(f)).map(enxuga).map(f => f.replace(/[.;]$/, "") + ".");
    if (!horarios.length && campos.objetoCompleto) {
      const pedacos = campos.objetoCompleto.split(/,\s*(?=contemplando|incluindo|com |sendo|em regime|nos? (?:per[íi]odos?|turnos?|hor[áa]rios?))|;\s*/i);
      horarios = pedacos.map(x => x.replace(/^(?:contemplando|incluindo|sendo)\s+/i, "").trim()).filter(x => x.length >= 15 && RE_HORARIO.test(x) && !/^contrata[çc][ãa]o/i.test(x));
      if (!horarios.length) { const m = RE_HORARIO.exec(campos.objetoCompleto); if (m) horarios = [campos.objetoCompleto.slice(Math.max(0, campos.objetoCompleto.lastIndexOf(",", m.index) + 1), (campos.objetoCompleto.indexOf(",", m.index) + 1 || campos.objetoCompleto.length + 1) - 1).trim()]; }
      horarios = horarios.map(x => x.charAt(0).toUpperCase() + x.slice(1).replace(/\.$/, ""));
    }
    // Primeiro as frases com carga horária ou horário explícito ("12 horas diárias", "das 7h às 19h")
    const temHora = x => /\d{1,2}\s*(?:\([^)]{2,12}\)\s*)?(?:h\b|hs\b|horas|:\d{2})/i.test(x);
    horarios = horarios.map((x, i) => ({ x, i })).sort((a, b) => (temHora(b.x) - temHora(a.x)) || (a.i - b.i)).map(o2 => o2.x);
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
    if (!campos.itens.length) campos.itens = itensEmBlocos(o);
    if (!campos.itens.length) campos.itens = tabelaEmColunas(o);
    if (!campos.itens.length) campos.itens = tabelaQtdAntes(o);
    if (!campos.itens.length) campos.itens = tabelaLinhas(o);
    // Termo de Referência publicado em arquivo separado: itens, local e horários ficam nele
    campos.trSeparado = !campos.itens.length && /termo de refer[êe]ncia\s*\((?:em )?anexo\)|termo de refer[êe]ncia (?:segue )?em (?:arquivo|anexo) (?:separado|pr[óo]prio)|termo de refer[êe]ncia[^.\n]{0,40}(?:dispon[íi]vel|publicado) (?:em arquivo|separadamente)/i.test(o);
    // Sem cláusula de horário: usa a rotina descrita nos itens ("20 atendimentos por dia; 1 médico no período")
    if (!campos.horarios.length && campos.itens.length) {
      const rotina = [...new Set(campos.itens.flatMap(i => i.descricao.split(/;|–/).map(x => x.trim())).filter(x => /por dia|no per[íi]odo|por m[êe]s|mensais|semanais|por semana|h\/dia|horas/i.test(x)))];
      if (rotina.length) campos.horarios = ["Conforme os itens: " + rotina.slice(0, 4).join("; ")];
    }
    // A descrição do item da tabela não é cláusula de horário
    const chaveTxt = x => U.semAcento(String(x).toLowerCase()).replace(/^de\s+/, "").replace(/\s+/g, " ").slice(0, 45);
    campos.horarios = campos.horarios.filter(x => !campos.itens.some(i => U.semAcento(i.descricao.toLowerCase()).includes(chaveTxt(x))));
    // Escala por turno ("DIURNO ... 07 às 19 hs", "Noturno 19:00 às 07:00", "Manhã 07:00 às 13:00")
    {
      const plano = t.replace(/\s+/g, " "), turnos = {};
      const reT = /\b(diurno|noturno|manha|tarde|vespertino|matutino)\b[^.;]{0,60}?\b(\d{1,2})(?::(\d{2}))?\s*(?:h|hs|horas)?\s*(?:as|a|ate)\s*(\d{1,2})(?::(\d{2}))?\s*(?:h|hs|horas)?\b/g;
      let mt;
      while ((mt = reT.exec(plano)) && Object.keys(turnos).length < 4) {
        const a = +mt[2], b = +mt[4];
        if (a > 23 || b > 24 || a === b || turnos[mt[1]]) continue;
        const nome = { manha: "Manhã", matutino: "Manhã", tarde: "Tarde", vespertino: "Tarde", diurno: "Diurno", noturno: "Noturno" }[mt[1]];
        if (Object.values(turnos).some(x => x.startsWith(nome))) continue;
        turnos[mt[1]] = nome + ": " + U.pad(a) + "h" + (mt[3] && mt[3] !== "00" ? mt[3] : "") + " às " + U.pad(b) + "h" + (mt[5] && mt[5] !== "00" ? mt[5] : "");
      }
      const lista = Object.values(turnos);
      if (lista.length >= 2 || (!campos.horarios.length && lista.length)) campos.horarios = lista;
    }
    if (!campos.valorEstimado && campos.itens.length && campos.itens.every(x => x.valorTotal || (x.qtd && x.valorUnit))) campos.valorEstimado = Math.round(campos.itens.reduce((s, x) => s + (x.valorTotal || x.qtd * x.valorUnit), 0) * 100) / 100;

    /* ---- Disputa ---- */
    if ((p = primeiro(t, /menor preco (?:global|por item|por lote|por grupo|unitario)?|maior desconto|tecnica e preco|melhor tecnica|maior retorno economico/))) {
      const s = p.m[0];
      campos.criterio = s.charAt(0).toUpperCase() + o.substr(p.i + 1, s.length - 1).toLowerCase().trim();
    }
    if ((p = primeiro(t, /modo de disputa\s*(?:sera\s*)?(?:o\s*)?[:\-]?\s*["“]?(aberto e fechado|fechado e aberto|aberto|fechado)/)) || (p = primeiro(t, /\b(aberto e fechado|fechado e aberto)\b/))) {
      campos.modoDisputa = p.m[1].charAt(0).toUpperCase() + p.m[1].slice(1);
    }
    { // a plataforma mais citada (o edital costuma repetir o endereço do portal da disputa)
      let melhor = 0;
      for (const [re, nome] of PLATAFORMAS) { const n = todos(t, re).length; if (n > melhor) { melhor = n; campos.plataforma = nome; } }
    }
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
    if ((p = primeiro(t, /orcamento (?:estimado )?(?:da contratacao )?(?:sera |tera |e )?(?:de )?carater sigiloso|orcamento sigiloso|valor estimado (?:e |sera )?sigiloso|(?:custo|valor) estimado da contratacao (?:possui|tera|tem) carater sigiloso|(?:orcamento|valor|custo) estimado[^.]{0,60}(?:sera|serao) (?:divulgad[oa]s?|tornad[oa] public[oa]) (?:somente |apenas |imediatamente )?(?:apos|depois)/))) {
      campos.orcamentoSigiloso = true;
      risco("info", "Orçamento sigiloso", "O valor estimado só é divulgado depois da fase de lances (art. 24 da Lei 14.133).", p);
    }

    /* ---- Execução e contrato ---- */
    if ((p = primeiro(t, /vigencia[^.\n]{0,120}?(\d{1,3})\s*(?:\([^)]{1,30}\)\s*)?(meses|dias|anos?)/))) campos.vigencia = p.m[1] + " " + p.m[2];
    else if ((p = primeiro(t, /(?:o contrato|a contratacao|o prazo do contrato)[^.\n]{0,80}?sera de (\d{1,3})\s*(?:\([^)]{1,30}\)\s*)?(meses|dias|anos?)/))) campos.vigencia = p.m[1] + " " + p.m[2];
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
    // Item único sem preço na tabela (minuta do contrato): unitário = valor estimado ÷ quantidade
    if (campos.itens.length === 1 && campos.valorEstimado && campos.itens[0].qtd && !campos.itens[0].valorUnit) campos.itens[0].valorUnit = Math.round(campos.valorEstimado / campos.itens[0].qtd * 100) / 100;
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
