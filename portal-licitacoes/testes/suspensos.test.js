// Teste da comparação de objetos usada para achar republicação de pregão suspenso (api/suspensos.js).
// Rodar: node testes/suspensos.test.js
// Casos reais: o mesmo órgão publica muitos editais com o nome do hospital e "serviços médicos";
// só deve casar quando a parte técnica do objeto é a mesma.

const { semelhanca } = require("../api/suspensos.js");

const casos = [
  // [objeto suspenso, objeto publicado depois, palavras do órgão, deve casar?]
  ["PRESTAÇÃO DE SERVIÇOS MÉDICOS DE NEUROCIRURGIA PARA O HOSPITAL ESTADUAL SILVIO AVIDOS – HESA.", "SERVIÇOS MÉDICOS DE NEUROCIRURGIA - HESA (REPUBLICAÇÃO)", new Set(["silvio", "avido", "hesa", "medico"]), true],
  ["PRESTAÇÃO DE SERVIÇOS MÉDICOS DE NEUROCIRURGIA PARA O HOSPITAL ESTADUAL SILVIO AVIDOS – HESA.", "CONTRATAÇÃO EMERGENCIAL DE SERVIÇOS MÉDICOS DE NEUROCIRURGIA PARA O HESA", new Set(["silvio", "avido", "hesa", "medico"]), true],
  ["PRESTAÇÃO DE SERVIÇOS MÉDICOS DE NEUROCIRURGIA PARA O HOSPITAL ESTADUAL SILVIO AVIDOS – HESA.", "PRESTAÇÃO DE SERVIÇOS MÉDICOS EM CIRURGIA VASCULAR PARA ATENDIMENTO DO HOSPITAL ESTADUAL SILVIO AVIDOS - HESA", new Set(["silvio", "avido", "hesa", "medico"]), false],
  ["PRESTAÇÃO DE SERVIÇOS MÉDICOS DE NEUROCIRURGIA PARA O HOSPITAL ESTADUAL SILVIO AVIDOS – HESA.", "AQUISIÇÃO DE CERTIFICADO DIGITAL A3 (E-CPF) PARA HOSPITAL ESTADUAL SILVIO AVIDOS - HESA", new Set(["silvio", "avido", "hesa", "medico"]), false],
  ["CONTRATAÇÃO DE EMPRESA PARA PRESTAÇÃO DE SERVIÇO DE DIALISE AGUDA, objetivando atender os estabelecimentos de saúde vinculados ao Departamento de Atenção à Saúde-DAS, pertencentes à SECRETARIA MUNICIPAL DE SAÚDE – SESMA, de acordo com as condições estabelecidas no Edital e seus Anexos.",
    "AQUISIÇÃO DE INSULINAS ANÁLOGAS, objetivando abastecer os estabelecimentos de saúde da SECRETARIA MUNICIPAL DE SAÚDE DE BELÉM – SESMA/PMB, de acordo com as condições estabelecidas neste Edital e seus Anexos.", "SESMA SECRETARIA MUNICIPAL SAUDE MEIO AMBIENTE Belém", false],
  ["CONTRATAÇÃO DE EMPRESA PARA PRESTAÇÃO DE SERVIÇO DE DIALISE AGUDA, objetivando atender os estabelecimentos de saúde", "CONTRATAÇÃO EMERGENCIAL DE SERVIÇO DE DIÁLISE AGUDA", "SESMA SECRETARIA MUNICIPAL SAUDE MEIO AMBIENTE Belém", true],
  ["Prestação de serviços de terapias renais substitutivas dos tipos hemodiálise intermitente e hemodiálise prolongada em ambiente hospitalar, visando atender as necessidades do Hospital Público Municipal",
    "Aquisição de materiais de consumo hospitalares diversos do tipo colar cervical, visando atender as necessidades do Hospital Público Municipal", "FUNDO MUNICIPAL DE SAUDE Macaé", false],
  ["Prestação de serviços de terapias renais substitutivas dos tipos hemodiálise intermitente e hemodiálise prolongada", "Contratação de empresa para serviços de hemodiálise intermitente e prolongada (terapia renal substitutiva) em ambiente hospitalar", "FUNDO MUNICIPAL DE SAUDE Macaé", true],
  ["Contratação de empresa especializada para a prestação de serviços médicos e multiprofissionais, presenciais e ininterruptos, em caráter suplementar", "Contratação de empresa para prestação de serviços médicos e multiprofissionais em caráter suplementar, ininterruptos", "REDE MUNICIPAL DR. MARIO GATTI Campinas", true]
];

let falhas = 0;
casos.forEach(([a, b, fora, esperado], i) => {
  const v = semelhanca(a, b, fora), casou = v >= 0.4;
  if (casou !== esperado) { falhas++; console.log("✗ caso " + (i + 1) + ": " + (esperado ? "devia casar" : "não devia casar") + " (" + v.toFixed(2) + ")\n    " + b.slice(0, 90)); }
  else console.log("✓ caso " + (i + 1) + " (" + v.toFixed(2) + ")");
});
console.log(falhas ? "\n" + falhas + " caso(s) com problema." : "\nTodos os casos certos.");
process.exit(falhas ? 1 : 0);
