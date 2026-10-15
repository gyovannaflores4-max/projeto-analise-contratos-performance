// Rodar com: node --test testes/
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../regras.js");

// 15/10/2026 10:00 em Brasília
const AGORA = Date.UTC(2026, 9, 15, 13, 0);

test("datas em Brasília", () => {
  assert.equal(R.hojeBrasilia(Date.UTC(2026, 9, 16, 2, 30)), "2026-10-15"); // 23:30 do dia 15 em Brasília
  assert.equal(R.agoraBrasilia(AGORA), "2026-10-15T10:00");
  assert.equal(R.somaMeses("2025-01-31", 1), "2025-02-28");
  assert.equal(R.somaMeses("2024-02-29", 12), "2025-02-28");
  assert.equal(R.diffDias("2026-10-15", "2026-11-14"), 30);
  assert.equal(R.msBrasilia("2026-10-15T10:00"), AGORA);
});

test("feriados nacionais e dias úteis", () => {
  assert.equal(R.pascoa(2026), "2026-04-05");
  assert.equal(R.pascoa(2027), "2027-03-28");
  assert.ok(R.feriadosNacionais(2026).has("2026-04-03")); // Sexta-feira Santa
  assert.ok(R.feriadosNacionais(2026).has("2026-11-20"));
  // sexta 30/10/2026 + 3 dias úteis: seg 02/11 é Finados -> ter 03, qua 04, qui 05
  assert.equal(R.somaDiasUteis("2026-10-30", 3), "2026-11-05");
  // quinta 19/11/2026: sex 20 é feriado -> seg 23, ter 24, qua 25
  assert.equal(R.somaDiasUteis("2026-11-19", 3), "2026-11-25");
  // 3 dias úteis antes de uma sessão na segunda 26/10/2026 -> quarta 21/10
  assert.equal(R.somaDiasUteis("2026-10-26", -3), "2026-10-21");
});

test("leitura de planilhas", () => {
  assert.equal(R.lerData("15/01/2027"), "2027-01-15");
  assert.equal(R.lerData("5/1/27"), "2027-01-05");
  assert.equal(R.lerData("2027-01-15T10:00:00"), "2027-01-15");
  assert.equal(R.lerData("16/10/2026 às 14h", true), "2026-10-16T14:00");
  assert.equal(R.lerData(46037), "2026-01-15"); // número de série do Excel
  assert.equal(R.lerData("31/02"), "");
  assert.equal(R.lerNumero("R$ 1.234.567,89"), 1234567.89);
  assert.equal(R.lerNumero("1234.5"), 1234.5);
  assert.equal(R.lerNumero("1.234.567"), 1234567);
  assert.equal(R.lerNumero("950.000"), 950000);
  assert.equal(R.lerNumero("1234.567"), 1234.567);
  assert.deepEqual(R.lerAvisos("30, 7; 15 30"), [30, 15, 7]);
  assert.deepEqual(R.lerAvisos("", [1, 0]), [1, 0]);
  assert.deepEqual(R.lerEmails("a@b.com; x, C@D.COM.BR"), ["a@b.com", "c@d.com.br"]);
  const csv = R.lerCSV('Nº Contrato;Órgão;Vencimento;Valor Total\n12/2025;"Prefeitura de X; SP";15/01/2027;"R$ 1.000,50"\n');
  assert.equal(csv.length, 1);
  assert.equal(csv[0]["Órgão"], "Prefeitura de X; SP");
  const mapa = R.mapearColunas(Object.keys(csv[0]), "contratos");
  assert.deepEqual(mapa, { numero: "Nº Contrato", cliente: "Órgão", fim: "Vencimento", valor: "Valor Total" });
  const reg = R.linhaParaRegistro(csv[0], "contratos", mapa);
  assert.deepEqual(reg, { numero: "12/2025", cliente: "Prefeitura de X; SP", fim: "2027-01-15", valor: 1000.5 });
  const doc = R.linhaParaRegistro({ Documento: "Certidão FGTS", Validade: "10/11/2026" }, "documentos", R.mapearColunas(["Documento", "Validade"], "documentos"));
  assert.equal(doc.tipo, "crf_fgts");
  assert.equal(R.statusPorTexto("Ganhamos - contrato assinado"), "ganha");
  assert.equal(R.statusPorTexto("Em recurso"), "recurso");
});

test("prazos de renovação e reajuste do contrato", () => {
  const c = { id: "1", numero: "12/2025", fim: "2027-01-15", renovacaoDiasAntes: 90, reajusteDataBase: "2025-03-10" };
  assert.equal(R.prazoRenovacao(c), "2026-10-17");
  assert.equal(R.prazoRenovacao({ ...c, renovacaoData: "2026-11-01" }), "2026-11-01");
  assert.equal(R.prazoRenovacao({ ...c, renovacaoDiasAntes: "" }), null);
  // próximo aniversário depois de 15/10/2026 é 10/03/2027
  assert.deepEqual(R.prazoReajuste(c, "2026-10-15"), { prazo: "2027-03-10", aniversario: "2027-03-10" });
  // até 30 dias depois de vencido continua mostrando o ciclo atual
  assert.deepEqual(R.prazoReajuste({ ...c, reajusteDataBase: "2025-10-01" }, "2026-10-15"), { prazo: "2026-10-01", aniversario: "2026-10-01" });
  // marcado como pedido: passa para o ciclo seguinte
  assert.equal(R.prazoReajuste({ ...c, reajusteDataBase: "2025-10-01", reajusteSolicitadoPara: "2026-10-01" }, "2026-10-15").prazo, "2027-10-01");
  // prazo com tolerância depois do aniversário
  assert.equal(R.prazoReajuste({ ...c, reajusteDiasApos: 60 }, "2026-10-15").prazo, "2027-05-09");
});

test("eventos e alertas sem repetição", () => {
  const dados = {
    contratos: [
      { id: "c1", numero: "12/2025", cliente: "Prefeitura X", fim: "2026-12-14", renovacaoDiasAntes: 60 },
      { id: "c2", numero: "99", fim: "2026-01-01", situacao: "encerrado" }
    ],
    documentos: [{ id: "d1", nome: "CRF FGTS", tipo: "crf_fgts", validade: "2026-10-18" }, { id: "d2", tipo: "cndt", validade: "2026-10-01" }],
    licitacoes: [{ id: "l1", numero: "90012/2026", orgao: "Hospital Y", status: "recurso", prazos: [{ id: "p1", tipo: "recurso", limite: "2026-10-16T23:59" }, { id: "p2", tipo: "outro", limite: "2026-10-10", feito: true }] }]
  };
  const lista = R.eventos(dados, "2026-10-15");
  assert.deepEqual(lista.map(e => e.chave).sort(), ["c:c1:renov", "c:c1:venc", "d:d1", "d:d2", "l:l1:p:p1"]);

  const p = R.pendentes(dados, AGORA, {});
  const por = Object.fromEntries(p.map(x => [x.ev.chave, x.a]));
  assert.equal(por["c:c1:venc"].marco, 60); // faltam 60 dias
  assert.equal(por["c:c1:renov"].marco, 0); // 14/12 - 60 dias = 15/10: vence hoje
  assert.equal(por["c:c1:renov"].nivel, "urgente");
  assert.equal(por["d:d1"].marco, 3); // faltam 3 dias, avisos do FGTS: 7,3,1,0
  assert.equal(por["d:d2"].nivel, "vencido");
  assert.equal(por["l:l1:p:p1"].marco, 72); // faltam ~38 horas
  assert.equal(p[0].a.nivel, "vencido"); // vencidos primeiro

  const enviados = new Set(p.map(x => x.a.chave));
  assert.equal(R.pendentes(dados, AGORA, enviados).length, 0);
  // no dia seguinte só o que mudou: renovação venceu, lembrete semanal do vencido e o prazo entrou nas 24 horas
  const amanha = R.pendentes(dados, AGORA + R.DIA, enviados).map(x => x.ev.chave).sort();
  assert.deepEqual(amanha, ["c:c1:renov", "d:d2", "l:l1:p:p1"]);
});

test("renovação que vence hoje", () => {
  const ev = R.eventos({ contratos: [{ id: "c", fim: "2026-12-14", renovacaoDiasAntes: 60 }] }, "2026-10-15").find(e => e.tipo === "renovacao");
  assert.equal(ev.data, "2026-10-15");
  const a = R.avaliar(ev, AGORA);
  assert.equal(a.marco, 0);
  assert.equal(R.textoFalta(ev, a), "vence hoje");
});

test("agenda .ics", () => {
  const ics = R.gerarICS(R.eventos({ documentos: [{ id: "d1", nome: "CND", tipo: "cnd_federal", validade: "2026-11-30" }], licitacoes: [{ id: "l", status: "recurso", prazos: [{ id: "p", tipo: "recurso", limite: "2026-10-16T18:00" }] }] }, "2026-10-15"), AGORA);
  assert.match(ics, /DTSTART;VALUE=DATE:20261130/);
  assert.match(ics, /DTEND:20261016T210000Z/);
  assert.match(ics, /TRIGGER:-P7D/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
});

test("mensagens dos portais", () => {
  const m = R.classificarMensagem("Sr. licitante, envie a proposta ajustada no prazo de 2 horas.");
  assert.equal(m.classe, "convocacao");
  assert.equal(R.classificarMensagem("Fica aberto o prazo para manifestação de intenção de recurso").classe, "recurso");
  assert.equal(R.classificarMensagem("A sessão foi suspensa e será retomada em 20/10/2026 às 9h").classe, "suspensao");
  assert.deepEqual(R.datasNoTexto("retomada em 20/10/2026 às 9h30"), ["2026-10-20T09:30"]);
  assert.deepEqual(R.datasNoTexto("prazo de 2 horas", AGORA), ["2026-10-15T12:00"]);

  const lics = [
    { id: "a", numero: "Pregão 90012/2026", uasg: "155021" },
    { id: "b", numero: "12/2026", uasg: "155021" },
    { id: "c", compraId: "15502106000022026" }
  ];
  assert.equal(R.encontrarLicitacao(lics, "UASG 155021 - Pregão Eletrônico Nº 90012 / 2026: nova mensagem").id, "a");
  assert.equal(R.encontrarLicitacao(lics, "Compra 15502106000022026 - mensagem do agente").id, "c");
  assert.equal(R.encontrarLicitacao(lics, "Sessão marcada para 15/12/2026"), null); // data não confunde com 12/2026
  assert.equal(R.encontrarLicitacao(lics, "Pregão 190012/2026"), null);
});

test("formatação de moeda", () => {
  assert.equal(R.moeda(1234567.8), "R$ 1.234.567,80");
});
