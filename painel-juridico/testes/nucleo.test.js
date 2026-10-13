// Testes do núcleo com dados fictícios. Rode: node --test painel-juridico/testes
const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../nucleo.js");

test("lê datas nos formatos usados na planilha", () => {
  assert.equal(N.lerData("2026-03-03T00:00:00"), "2026-03-03");
  assert.equal(N.lerData("30.06.2026"), "2026-06-30");
  assert.equal(N.lerData("30.06.26"), "2026-06-30");
  assert.equal(N.lerData("Em 10/11/2025 apelação"), "2025-11-10");
  assert.equal(N.lerData("*"), null);
  assert.equal(N.lerData("31/02/2026"), null);
});

test("número CNJ: segmento, tribunal e dígito verificador", () => {
  const [c] = N.analisarCnj("Principal: 1234567-77.2025.8.19.0001");
  assert.equal(c.alias, "tjrj");
  assert.equal(c.segmentoNome, "Justiça Estadual");
  assert.equal(c.rotulo, "Principal");
  assert.equal(c.digitoOk, true);
  assert.equal(N.analisarCnj("1234567-78.2025.8.19.0001")[0].digitoOk, false);
  assert.equal(N.analisarCnj("7654321-52.2025.5.01.0011")[0].alias, "trt1");
  assert.equal(N.analisarCnj("Apelação: 1234567-77.2025.8.19.0001 (encerrado)")[0].encerrado, true);
});

test("prazo em dias úteis pula feriado nacional e fim de semana", () => {
  // 09/10/2026 (sexta) + 15 dias úteis, com 12/10 e 02/11 no caminho
  const r = N.calcularPrazo("2026-10-09", 15);
  assert.equal(r.vencimento, "2026-11-03");
  assert.deepEqual(r.pulados.map((p) => p.data), ["2026-10-12", "2026-11-02"]);
});

test("recesso forense suspende a contagem (CPC art. 220)", () => {
  assert.equal(N.calcularPrazo("2026-12-15", 5).vencimento, "2027-01-22");
  assert.equal(N.calcularPrazo("2026-12-15", 5, { recesso: false }).vencimento, "2026-12-22");
});

test("Páscoa e feriados móveis", () => {
  const f = N.feriados(2026);
  assert.equal(f["2026-04-03"], "Sexta-feira Santa");
  assert.equal(f["2026-02-16"], "Carnaval");
  assert.equal(f["2026-06-04"], "Corpus Christi");
});

test("movimentação sugere o prazo certo", () => {
  const civel = { cnj: N.analisarCnj("1234567-77.2025.8.19.0001"), acao: "Obrigação de fazer" };
  const trab = { cnj: N.analisarCnj("7654321-52.2025.5.01.0011"), acao: "Reclamação" };
  assert.equal(N.sugerirAposMovimentacao("Publicada sentença de improcedência", "2026-10-13", civel)[0].dias, 15);
  assert.equal(N.sugerirAposMovimentacao("Publicada sentença", "2026-10-13", trab)[0].dias, 8);
  assert.equal(N.sugerirAposMovimentacao("Inabilitação no pregão eletrônico", "2026-10-13", civel)[0].dias, 3);
  assert.ok(N.sugerirAposMovimentacao("Processo arquivado definitivamente", "2026-10-13", civel)[0].encerrar);
  const jec = { cnj: N.analisarCnj("1234567-77.2025.8.19.0001"), acao: "Indenização", vara: "JEC" };
  assert.equal(N.sugerirAposMovimentacao("Sentença de procedência publicada", "2026-10-13", jec)[0].dias, 10);
});

test("planilha: cabeçalho, limpeza e chaves sem duplicar", () => {
  const cab = ["ID", "Status", "Advogado", "Prioridade", "Ação", "Empresa", "Qualificação", "Outro envolvido", "Qualificação", "Número", "Edital/ Contrato Relacionado ", "RESUMO PROCESSO ", "Andamentos Atualizados ", "PROX. PASSOS", "Atualizado em", "Previsão "];
  const m = [
    ["Controle de processos"],
    cab,
    [1, "ativo ", "flavio", "alta ", "Mandado de Segurança", "Empresa Exemplo", "Impetrante", "Órgão Exemplo", "Impetrado", "1234567-77.2025.8.19.0001", "*", "Resumo", "Distribuído em 02/09/2024;\n- Liminar negada em 10/09/2024", "Aguardar", "30.06.26", "-"],
    [1, "Ativo", "Flávio", "(EXEMPLO) OFICIO 01/2025", "Reclamação", "Cliente B", "Reclamado", "Fulano de Tal", "Reclamante", "1234567-77.2025.8.19.0001", "", "", "", "", "", ""],
    [2, "Ativo", null, null, null, null, null, null, null, null, null, null, null, null, null, null],
  ];
  const ps = N.processosDaPlanilha(m);
  assert.equal(ps.length, 2);
  assert.equal(ps[0].status, "Ativo");
  assert.equal(ps[0].advogado, "Flávio");
  assert.equal(ps[1].advogado, "Flávio");
  assert.equal(ps[0].prioridade, "Alta");
  assert.equal(ps[1].referencia, "(EXEMPLO) OFICIO 01/2025");
  assert.equal(ps[0].edital, "");
  assert.equal(ps[0].andamentos.length, 2);
  assert.equal(ps[0].andamentos[1].data, "2024-09-10");
  assert.equal(ps[0].atualizadoEm, "2026-06-30");
  assert.notEqual(ps[0].id, ps[1].id);
});

test("ideias apontam processo parado e encerrável", () => {
  const base = { advogado: "Flávio", status: "Ativo", outro: "", edital: "", andamentos: [], prioridade: "Alta", minutos: 0, previsao: "" };
  const ps = [
    Object.assign({}, base, { id: "a", atualizadoEm: "2026-01-01", proximosPassos: "Aguardar" }),
    Object.assign({}, base, { id: "b", atualizadoEm: "2026-10-01", proximosPassos: "Recurso prejudicado, acompanhar arquivamento" }),
  ];
  const ideias = N.gerarIdeias(ps, "Flavio", "2026-10-13");
  assert.deepEqual(ideias.find((i) => /sem atualização/.test(i.titulo)).ids, ["a"]);
  assert.deepEqual(ideias.find((i) => i.tipo === "limpeza").ids, ["b"]);
});

test("agenda .ics e mescla de movimentações", () => {
  const ics = N.gerarIcs([{ data: "2026-11-03", titulo: "Contrarrazões, apelação", descricao: "linha 1\nlinha 2" }]);
  assert.match(ics, /DTSTART;VALUE=DATE:20261103/);
  assert.match(ics, /SUMMARY:Contrarrazões\\, apelação/);
  const p = { andamentos: [{ data: "2026-10-01", texto: "Juntada de petição" }] };
  const novas = N.mesclarMovimentacoes(p, [{ data: "2026-10-01", texto: "Juntada de Petição" }, { data: "2026-10-05", texto: "Conclusos" }]);
  assert.deepEqual(novas.map((n) => n.texto), ["Conclusos"]);
});
