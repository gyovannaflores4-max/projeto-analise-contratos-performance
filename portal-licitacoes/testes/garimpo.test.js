// Teste da nota de aderência da busca "Procurar editais agora" (api/garimpo.js).
// É a mesma regra do robô diário (alerta-csc/garimpo.py). Rodar: node testes/garimpo.test.js
const { nota } = require("../api/garimpo.js");
const casos = [
  ["CONTRATAÇÃO DE PRESTAÇÃO DE SERVIÇOS MÉDICOS NA ESPECIALIDADE DE ANESTESIOLOGIA", true],
  ["Contratação de empresa especializada para a prestação de serviços médicos em Pediatria, Plantão Médico Presencial", true],
  ["Prestação de serviços continuados de natureza assistencial, com predominância de mão de obra especializada, destinados à prestação de serviços médicos", true],
  ["Registro de Preços para aquisição de MATERIAIS MÉDICO-HOSPITALARES destinados às Unidades de Pronto Atendimento", false],
  ["Registro de Preços para futura e eventual aquisição de materiais de diálise e hemodiálise grupo 1", false],
  ["Contratação de clínica veterinária para serviços de castração por médico-veterinário, com anestesia", false],
  ["Aquisição de Equipamentos Médicos", false]
];
let falhas = 0;
casos.forEach(([o, esperado]) => { const n = nota(o).n, ok = (n >= 4) === esperado; if (!ok) falhas++; console.log((ok ? "✓ " : "✗ ") + (esperado ? "pega" : "ignora") + " (" + n + "): " + o.slice(0, 70)); });
console.log(falhas ? "\n" + falhas + " caso(s) com problema." : "\nTodos os casos certos.");
process.exit(falhas ? 1 : 0);
