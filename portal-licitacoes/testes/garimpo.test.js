// Teste da nota de aderência da busca "Procurar editais agora" (api/garimpo.js).
// É a mesma regra do robô diário (alerta-csc/garimpo.py). Rodar: node testes/garimpo.test.js
const { nota, categoria } = require("../api/garimpo.js");
const casos = [
  ["CONTRATAÇÃO DE PRESTAÇÃO DE SERVIÇOS MÉDICOS NA ESPECIALIDADE DE ANESTESIOLOGIA", true],
  ["Contratação de empresa especializada para a prestação de serviços médicos em Pediatria, Plantão Médico Presencial", true],
  ["Prestação de serviços continuados de natureza assistencial, com predominância de mão de obra especializada, destinados à prestação de serviços médicos", true],
  ["Registro de Preços para aquisição de MATERIAIS MÉDICO-HOSPITALARES destinados às Unidades de Pronto Atendimento", false],
  ["Registro de Preços para futura e eventual aquisição de materiais de diálise e hemodiálise grupo 1", true],
  ["CREDENCIAMENTO DE EMPRESAS ESPECIALIZADAS NA REALIZAÇÃO DE HEMODIÁLISE EM PACIENTES ADULTOS, INCLUINDO OS EXAMES LABORATORIAIS", true],
  ["Credenciamento de clínicas para tratamento dialítico: diálise peritoneal e hemodiálise", true],
  ["Contratação de empresa para fornecimento de mão de obra médica (médicos plantonistas) para o hospital municipal", true],
  ["Contratação de clínica veterinária para serviços de castração por médico-veterinário, com anestesia", false],
  ["Aquisição de Equipamentos Médicos", false]
];
let falhas = 0;
casos.forEach(([o, esperado]) => { const n = nota(o).n, ok = (n >= 4) === esperado; if (!ok) falhas++; console.log((ok ? "✓ " : "✗ ") + (esperado ? "pega" : "ignora") + " (" + n + "): " + o.slice(0, 70)); });
[["Credenciamento para realização de hemodiálise", "nefrologia"], ["Contratação de médicos plantonistas para a UPA", "mao_obra"], ["Aquisição de medicamentos", ""]].forEach(([o, c]) => {
  const ok = categoria(o) === c; if (!ok) falhas++; console.log((ok ? "✓ " : "✗ ") + "categoria " + (c || "outros") + ": " + o);
});
const sv = nota("Prestação de serviços de terapia renal substitutiva (hemodiálise)").n, cp = nota("Aquisição de insumos de hemodiálise").n;
if (!(sv > cp && cp >= 4)) { falhas++; console.log("✗ serviço de nefrologia devia ficar acima da compra de insumo"); } else console.log("✓ serviço de nefrologia acima da compra de insumo");
console.log(falhas ? "\n" + falhas + " caso(s) com problema." : "\nTodos os casos certos.");
process.exit(falhas ? 1 : 0);
