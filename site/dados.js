/*
  DADOS DO PORTAL
  ---------------
  Edite este arquivo para cadastrar grupos, comunidades, vagas e serviços.
  Tudo abaixo é EXEMPLO FICTÍCIO: troque pelos grupos reais antes de publicar.

  convite: link de convite do WhatsApp (https://chat.whatsapp.com/...).
           Deixe "" para o site mostrar "Pedir convite" em vez de "Entrar no grupo".
  contato: número com DDI e DDD, só dígitos (ex.: "5511999999999"). "" = sem botão de WhatsApp.
*/
window.PORTAL = {
  grupos: [
    { id: "g1", nome: "Plantões SP Capital · Clínica Médica", uf: "SP", cidade: "São Paulo", cat: "Plantões", esp: "Clínica Médica", membros: 986, vagasSemana: 42, verificado: true, convite: "", regras: ["Somente médicos com CRM ativo", "Vagas com valor, data e local", "Proibido propaganda fora do tema"] },
    { id: "g2", nome: "UTI Adulto SP · Intensivistas", uf: "SP", cidade: "São Paulo", cat: "Plantões", esp: "Medicina Intensiva", membros: 641, vagasSemana: 27, verificado: true, convite: "", regras: ["RQE em Intensiva ou experiência comprovada", "Vagas com escala e valor"] },
    { id: "g3", nome: "Trocas de Plantão · Grande SP", uf: "SP", cidade: "São Paulo", cat: "Trocas", esp: "Todas", membros: 1012, vagasSemana: 63, verificado: true, convite: "", regras: ["Informe hospital, setor, data e turno", "Troca combinada no privado"] },
    { id: "g4", nome: "Plantões Campinas e Região", uf: "SP", cidade: "Campinas", cat: "Plantões", esp: "Clínica Médica", membros: 512, vagasSemana: 18, verificado: false, convite: "", regras: ["Vagas da RMC", "Sem correntes ou propaganda"] },
    { id: "g5", nome: "Pediatria · Plantões RJ", uf: "RJ", cidade: "Rio de Janeiro", cat: "Plantões", esp: "Pediatria", membros: 377, vagasSemana: 14, verificado: true, convite: "", regras: ["Pediatras e residentes de Pediatria", "Valor sempre informado"] },
    { id: "g6", nome: "Emergência RJ · Sala Vermelha", uf: "RJ", cidade: "Rio de Janeiro", cat: "Plantões", esp: "Medicina de Emergência", membros: 723, vagasSemana: 31, verificado: true, convite: "", regras: ["ATLS/ACLS recomendado", "Proibido repassar vaga sem autorização"] },
    { id: "g7", nome: "Vagas Fixas e Rotinas · BH", uf: "MG", cidade: "Belo Horizonte", cat: "Vagas fixas", esp: "Todas", membros: 455, vagasSemana: 9, verificado: true, convite: "", regras: ["Contratos fixos, rotinas e diaristas", "Informe regime (PJ, CLT, cooperativa)"] },
    { id: "g8", nome: "Plantões Curitiba · Clínica e PS", uf: "PR", cidade: "Curitiba", cat: "Plantões", esp: "Clínica Médica", membros: 398, vagasSemana: 16, verificado: false, convite: "", regras: ["Somente vagas em Curitiba e RMC"] },
    { id: "g9", nome: "Anestesio Brasil · Escalas", uf: "BR", cidade: "Nacional", cat: "Plantões", esp: "Anestesiologia", membros: 860, vagasSemana: 22, verificado: true, convite: "", regras: ["Anestesiologistas com RQE", "Vagas de todo o Brasil"] },
    { id: "g10", nome: "Enfermagem Plantões SP", uf: "SP", cidade: "São Paulo", cat: "Plantões", esp: "Enfermagem", membros: 1003, vagasSemana: 58, verificado: true, convite: "", regras: ["Enfermeiros e técnicos com COREN ativo", "Valor por plantão obrigatório"] },
    { id: "g11", nome: "Residentes e Recém-formados · Nordeste", uf: "PE", cidade: "Recife", cat: "Residência", esp: "Todas", membros: 690, vagasSemana: 12, verificado: true, convite: "", regras: ["Dúvidas de residência, provas e primeiros plantões"] },
    { id: "g12", nome: "Classificados Médicos · Serviços", uf: "BR", cidade: "Nacional", cat: "Serviços", esp: "Todas", membros: 940, vagasSemana: 0, verificado: true, convite: "", regras: ["Contabilidade, seguros, cursos e consultórios", "Um anúncio por semana por empresa"] }
  ],

  comunidades: [
    { nome: "Comunidade Plantões São Paulo", desc: "Avisos gerais + grupos por especialidade e por região da cidade.", grupos: 9, membros: 6200, uf: "SP" },
    { nome: "Comunidade Intensivistas Brasil", desc: "Vagas de UTI, trocas, discussão de casos e eventos.", grupos: 6, membros: 3400, uf: "BR" },
    { nome: "Comunidade Pediatria RJ", desc: "Plantões, rotinas e trocas para pediatras do estado.", grupos: 4, membros: 1500, uf: "RJ" },
    { nome: "Comunidade Enfermagem Plantões", desc: "Plantões e coberturas para enfermeiros e técnicos.", grupos: 8, membros: 7100, uf: "BR" }
  ],

  vagas: [
    { id: "v1", titulo: "UTI Adulto · noturno", local: "Hospital Santa Clara (exemplo)", cidade: "São Paulo", uf: "SP", esp: "Medicina Intensiva", data: "Sáb 17/10", turno: "19:00–07:00", valor: 1950, regime: "PJ", grupo: "g2", horas: 2, contato: "" },
    { id: "v2", titulo: "PS Adulto · diurno", local: "Hospital São Lucas (exemplo)", cidade: "São Paulo", uf: "SP", esp: "Clínica Médica", data: "Ter 20/10", turno: "07:00–19:00", valor: 1500, regime: "PJ ou cooperativa", grupo: "g1", horas: 5, contato: "" },
    { id: "v3", titulo: "Troca: PS sex noturno por dom diurno", local: "UPA Centro (exemplo)", cidade: "São Paulo", uf: "SP", esp: "Clínica Médica", data: "Sex 16/10", turno: "19:00–07:00", valor: 1400, regime: "Troca", grupo: "g3", horas: 1, contato: "" },
    { id: "v4", titulo: "Sala vermelha · 24 h", local: "Hospital Municipal Sul (exemplo)", cidade: "Rio de Janeiro", uf: "RJ", esp: "Medicina de Emergência", data: "Dom 18/10", turno: "07:00–07:00", valor: 3200, regime: "PJ", grupo: "g6", horas: 8, contato: "" },
    { id: "v5", titulo: "PS Infantil · noturno", local: "Clínica Pequenos (exemplo)", cidade: "Rio de Janeiro", uf: "RJ", esp: "Pediatria", data: "Qua 21/10", turno: "19:00–07:00", valor: 1700, regime: "PJ", grupo: "g5", horas: 3, contato: "" },
    { id: "v6", titulo: "Rotina de enfermaria · seg a sex", local: "Hospital Horizonte (exemplo)", cidade: "Belo Horizonte", uf: "MG", esp: "Clínica Médica", data: "A partir de 03/11", turno: "07:00–13:00", valor: 14000, regime: "Mensal · PJ", grupo: "g7", horas: 20, contato: "" },
    { id: "v7", titulo: "Anestesia · centro cirúrgico", local: "Hospital Vale (exemplo)", cidade: "Ribeirão Preto", uf: "SP", esp: "Anestesiologia", data: "Qui 22/10", turno: "07:00–19:00", valor: 2600, regime: "PJ", grupo: "g9", horas: 6, contato: "" },
    { id: "v8", titulo: "Enfermeiro UTI · noturno", local: "Hospital Vida Leste (exemplo)", cidade: "São Paulo", uf: "SP", esp: "Enfermagem", data: "Seg 19/10", turno: "19:00–07:00", valor: 480, regime: "Autônomo", grupo: "g10", horas: 4, contato: "" },
    { id: "v9", titulo: "Clínica geral · PA", local: "Pronto Atendimento Batel (exemplo)", cidade: "Curitiba", uf: "PR", esp: "Clínica Médica", data: "Sáb 24/10", turno: "07:00–19:00", valor: 1350, regime: "PJ", grupo: "g8", horas: 12, contato: "" }
  ],

  servicos: [
    { cat: "Contabilidade", nome: "Contabilidade para médicos PJ", desc: "Abertura de empresa, notas fiscais e IR.", selo: "Parceiro (exemplo)" },
    { cat: "Seguro", nome: "Seguro de responsabilidade civil", desc: "Cotação de RC profissional para plantonistas.", selo: "Parceiro (exemplo)" },
    { cat: "Cursos", nome: "ACLS, ATLS e PALS", desc: "Turmas mensais em SP, RJ e BH.", selo: "Parceiro (exemplo)" },
    { cat: "Consultórios", nome: "Salas por período", desc: "Consultórios mobiliados por turno ou mês.", selo: "Anúncio (exemplo)" },
    { cat: "Jurídico", nome: "Advocacia médica", desc: "Contratos de plantão, PJ e defesa ética.", selo: "Anúncio (exemplo)" },
    { cat: "Finanças", nome: "Crédito e consórcio para médicos", desc: "Equipamentos, consultório e veículo.", selo: "Anúncio (exemplo)" }
  ]
};
