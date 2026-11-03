/* Pregão em Dia | formação de preço (cálculo puro, sem tela).
   Preço = custo direto × (1 + BDI), com o BDI no formato do TCU (Acórdão 2.622/2013):
     BDI = [(1 + AC + S + R + G) × (1 + DF) × (1 + L)] / (1 − I) − 1
   AC administração central, S seguros, R riscos, G garantias, DF despesas financeiras, L lucro,
   I tributos sobre o faturamento (PIS, COFINS, ISS, IRPJ e CSLL no lucro presumido, outros). */
(function (g) {
  "use strict";
  const P = {};

  // Valores de partida (Lucro Presumido, prestação de serviços). Todos ajustáveis na tela.
  P.PARAMETROS_PADRAO = () => ({
    ac: 3, seguro: 0.4, risco: 1, garantia: 0.4, df: 1, lucro: 8, lucroMinimo: 2,
    pis: 0.65, cofins: 3, iss: 5, irpj: 4.8, csll: 2.88, outros: 0, encargos: 0
  });
  P.ROTULOS = {
    ac: "Administração central", seguro: "Seguros", risco: "Riscos", garantia: "Garantia contratual", df: "Despesas financeiras",
    lucro: "Lucro", lucroMinimo: "Lucro mínimo aceito na disputa", pis: "PIS", cofins: "COFINS", iss: "ISS", irpj: "IRPJ",
    csll: "CSLL", outros: "Outros tributos", encargos: "Encargos sobre a mão de obra"
  };

  P.numero = v => {
    if (v === null || v === undefined || v === "") return 0;
    if (typeof v === "number") return isFinite(v) ? v : 0;
    let s = String(v).replace(/[^\d,.-]/g, "");
    if (s.includes(",") || /^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); // 1.460 e 1.460,50 no formato brasileiro
    const n = Number(s);
    return isFinite(n) ? n : 0;
  };
  const pc = v => P.numero(v) / 100;

  P.tributos = par => pc(par.pis) + pc(par.cofins) + pc(par.iss) + pc(par.irpj) + pc(par.csll) + pc(par.outros);
  P.fatorIndireto = par => (1 + pc(par.ac) + pc(par.seguro) + pc(par.risco) + pc(par.garantia)) * (1 + pc(par.df));
  P.bdi = (par, lucro) => {
    const I = P.tributos(par);
    if (I >= 1) return NaN;
    return P.fatorIndireto(par) * (1 + (lucro === undefined ? pc(par.lucro) : lucro)) / (1 - I) - 1;
  };

  // Custo direto de UMA unidade do item (um plantão, uma hora, um mês…)
  P.custoUnitario = (item, par) => {
    const prof = P.numero(item.profissionais), horas = P.numero(item.horas), valorHora = P.numero(item.valorHora);
    const moBase = prof * horas * valorHora;
    const linhas = (item.custos || []).map(c => ({ descricao: c.descricao || "", valor: P.numero(c.valor), maoDeObra: !!c.maoDeObra }));
    const moLinhas = linhas.filter(c => c.maoDeObra).reduce((s, c) => s + c.valor, 0);
    const outras = linhas.filter(c => !c.maoDeObra).reduce((s, c) => s + c.valor, 0);
    const maoDeObra = moBase + moLinhas;
    const encargos = maoDeObra * pc(par.encargos);
    return { maoDeObra, encargos, outras, direto: maoDeObra + encargos + outras };
  };

  // Lucro líquido e margem para um preço unitário qualquer (útil durante os lances)
  P.margemNoPreco = (preco, direto, par) => {
    const lucro = preco * (1 - P.tributos(par)) - direto * P.fatorIndireto(par);
    return { lucro, margem: preco > 0 ? lucro / preco : 0 };
  };

  const arred = v => Math.round(v * 100) / 100;

  P.calcularItem = (item, par) => {
    const c = P.custoUnitario(item, par);
    const qtd = P.numero(item.quantidade);
    const bdi = P.bdi(par);
    const unit = arred(c.direto * (1 + bdi));
    const minimo = arred(c.direto * (1 + P.bdi(par, pc(par.lucroMinimo))));      // lance mínimo com o lucro mínimo
    const equilibrio = arred(c.direto * (1 + P.bdi(par, 0)));                      // lucro zero
    const m = P.margemNoPreco(unit, c.direto, par);
    return Object.assign({}, c, { quantidade: qtd, bdi, unitario: unit, total: arred(unit * qtd), minimo, totalMinimo: arred(minimo * qtd),
      equilibrio, totalEquilibrio: arred(equilibrio * qtd), lucroUnit: m.lucro, margem: m.margem });
  };

  P.calcular = precificacao => {
    const par = Object.assign(P.PARAMETROS_PADRAO(), (precificacao && precificacao.parametros) || {});
    const itens = ((precificacao && precificacao.itens) || []).map(it => Object.assign({ item: it }, P.calcularItem(it, par)));
    const soma = k => arred(itens.reduce((s, x) => s + x[k], 0));
    const total = soma("total"), totalMinimo = soma("totalMinimo"), totalEquilibrio = soma("totalEquilibrio");
    const diretoTotal = arred(itens.reduce((s, x) => s + x.direto * x.quantidade, 0));
    const lucroTotal = arred(itens.reduce((s, x) => s + x.lucroUnit * x.quantidade, 0));
    return { par, itens, total, totalMinimo, totalEquilibrio, diretoTotal, lucroTotal, margem: total > 0 ? lucroTotal / total : 0,
      bdi: P.bdi(par), tributos: P.tributos(par) };
  };

  /* Comparação com o valor estimado da Administração:
     - abaixo de 50%: indício de inexequibilidade para bens e serviços em geral (IN SEGES/ME 73/2022, art. 34, parágrafo único);
     - abaixo de 75%: referência da Lei 14.133 para obras e serviços de engenharia (art. 59, § 4º); para serviços médicos,
       sinal para ter a planilha de custos pronta, porque o pregoeiro costuma pedir diligência;
     - acima de 100%: acima do estimado, pode ser desclassificada se o edital fixar o estimado como máximo. */
  P.exequibilidade = (valor, estimado) => {
    if (!estimado || !valor) return { nivel: "info", razao: null, texto: "Sem valor estimado para comparar (orçamento sigiloso ou não informado)." };
    const r = valor / estimado;
    if (r < 0.5) return { nivel: "crit", razao: r, texto: "Abaixo de 50% do estimado: indício de inexequibilidade (IN SEGES 73/2022, art. 34). Espere diligência e tenha a planilha de custos detalhada." };
    if (r < 0.75) return { nivel: "warn", razao: r, texto: "Entre 50% e 75% do estimado: não é inexequível por si, mas o pregoeiro pode pedir a composição de custos. Deixe a planilha pronta." };
    if (r > 1) return { nivel: "warn", razao: r, texto: "Acima do valor estimado: pode ser desclassificada se o edital usar o estimado como preço máximo." };
    return { nivel: "ok", razao: r, texto: "Dentro da faixa usual em relação ao estimado." };
  };

  // Tabela de lances: preço global e margem em cada degrau, do proposto até o equilíbrio
  P.tabelaLances = (calc, passos) => {
    passos = passos || [0, 0.02, 0.05, 0.08, 0.1, 0.15];
    const linhas = passos.map(p => ({ rotulo: p ? "−" + Math.round(p * 100) + "%" : "Proposto", desconto: p, global: Math.round(calc.total * (1 - p) * 100) / 100 }));
    linhas.push({ rotulo: "Lance mínimo", desconto: calc.total ? 1 - calc.totalMinimo / calc.total : 0, global: calc.totalMinimo, marco: "minimo" });
    linhas.push({ rotulo: "Equilíbrio (lucro zero)", desconto: calc.total ? 1 - calc.totalEquilibrio / calc.total : 0, global: calc.totalEquilibrio, marco: "equilibrio" });
    const tribut = calc.tributos, fator = P.fatorIndireto(calc.par);
    return linhas.map(l => {
      const lucro = l.global * (1 - tribut) - calc.diretoTotal * fator;
      return Object.assign(l, { lucro: Math.round(lucro * 100) / 100, margem: l.global > 0 ? lucro / l.global : 0 });
    }).sort((a, b) => b.global - a.global);
  };

  P.itemNovo = (o) => Object.assign({ id: Math.random().toString(36).slice(2, 9), descricao: "", unidade: "Plantão", quantidade: 0, profissionais: 1, horas: 12, valorHora: 0, custos: [] }, o || {});

  g.Preco = P;
})(typeof window !== "undefined" ? window : globalThis);
