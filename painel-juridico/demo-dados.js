/*
 * Dados FICTÍCIOS da demonstração do Gabinete Digital.
 * Nenhuma pessoa, empresa ou processo aqui existe. As datas são relativas a hoje,
 * para a pauta sempre parecer atual. Os números CNJ são gerados com dígito verificador válido.
 */
(function () {
  "use strict";
  const N = window.Nucleo;
  const dia = (n) => N.iso(N.somaDias(new Date(), n));

  // Dígito verificador CNJ (ISO 7064 mód. 97): DV = 98 - (N·100 mod 97)
  function cnj(seq, ano, j, tr, origem) {
    const mod = (s) => { let r = 0; for (const c of s) r = (r * 10 + +c) % 97; return r; };
    const r = mod(mod(mod(seq) + ano + j + tr) + origem + "00");
    const dv = String(98 - r).padStart(2, "0");
    return `${seq}-${dv}.${ano}.${j}.${tr}.${origem}`;
  }

  const base = (o) => Object.assign({
    codigo: "", status: "Ativo", advogado: "Rafael Lima", prioridade: "Média", referencia: "", qualifEmpresa: "", qualifOutro: "",
    edital: "", resumo: "", proximosPassos: "", previsao: "", juizo: "", vara: "", comarca: "", foro: "",
    valorCausa: null, valorPE: null, link: "", pasta: "", minutos: 0, novidades: 0,
  }, o);
  const and = (pares) => pares.map(([d, texto]) => ({ data: dia(d), texto, origem: "planilha" }));

  const brutos = [
    base({ codigo: "1", acao: "Ação de cobrança", empresa: "Construtora Vale Norte Ltda.", qualifEmpresa: "Autora", outro: "Condomínio Jardim das Acácias", qualifOutro: "Réu",
      numero: cnj("4812031", "2025", "8", "19", "0001"), prioridade: "Alta", vara: "Vara Cível", juizo: "12", comarca: "Rio de Janeiro", valorCausa: 186400,
      resumo: "Cobrança de serviços de reforma de fachada executados e não pagos (3 medições).",
      andamentos: and([[-160, "Distribuída a ação"], [-120, "Citação positiva do réu"], [-95, "Contestação juntada"], [-60, "Réplica apresentada"], [-4, "Publicada sentença de procedência parcial"]]),
      proximosPassos: "Avaliar apelação quanto aos juros da 3ª medição" }),
    base({ codigo: "2", acao: "Reclamação trabalhista", empresa: "Padaria Bom Grão ME", qualifEmpresa: "Reclamada", outro: "Ex-funcionário (sigilo)", qualifOutro: "Reclamante",
      numero: cnj("1009877", "2025", "5", "01", "0045"), prioridade: "Alta", vara: "Vara do Trabalho", juizo: "45", comarca: "Rio de Janeiro", valorCausa: 42000,
      resumo: "Pedido de horas extras e adicional noturno. Cliente tem controle de ponto eletrônico.",
      andamentos: and([[-70, "Notificação para audiência inicial"], [-40, "Audiência inicial: conciliação recusada"], [-10, "Designada audiência de instrução para " + N.brData(dia(9))]]),
      proximosPassos: "Preparar preposto e 2 testemunhas para a instrução" }),
    base({ codigo: "3", acao: "Recurso administrativo", empresa: "Medsul Serviços Hospitalares", qualifEmpresa: "Recorrente", outro: "Prefeitura de Niterói", qualifOutro: "Órgão licitante",
      numero: "", edital: "Pregão Eletrônico nº 45/2026", prioridade: "Alta", valorPE: 2380000,
      resumo: "Inabilitação por suposta falta de atestado de capacidade técnica; atestado foi juntado no anexo III.",
      andamentos: and([[-3, "Sessão pública do pregão"], [-1, "Inabilitação publicada no portal de compras"]]),
      proximosPassos: "Interpor recurso administrativo (3 dias úteis)" }),
    base({ codigo: "4", acao: "Indenização por danos morais", empresa: "Marina Couto", qualifEmpresa: "Autora", outro: "Aérea Brasil S.A.", qualifOutro: "Ré",
      numero: cnj("0832211", "2026", "8", "19", "0209"), status: "Fase audiência", prioridade: "Média", vara: "JEC", comarca: "Barra da Tijuca", valorCausa: 15000,
      resumo: "Cancelamento de voo sem reacomodação; autora perdeu compromisso profissional.",
      andamentos: and([[-55, "Distribuída a ação"], [-30, "Audiência de conciliação sem acordo"], [-28, "Contestação da ré juntada"]]),
      proximosPassos: "Aguardar sentença do juiz leigo" }),
    base({ codigo: "5", acao: "Execução de título extrajudicial", empresa: "Distribuidora Ponte Alta", qualifEmpresa: "Exequente", outro: "Mercado Irmãos Sá", qualifOutro: "Executado",
      numero: cnj("0219945", "2024", "8", "19", "0002"), prioridade: "Baixa", vara: "Vara Cível", juizo: "3", comarca: "Niterói", valorCausa: 58700,
      andamentos: and([[-300, "Distribuída a execução"], [-250, "Citação negativa"], [-190, "Pedido de pesquisa SISBAJUD"]]),
      proximosPassos: "Reiterar pedido de penhora on-line" }),
    base({ codigo: "6", acao: "Mandado de segurança", empresa: "Medsul Serviços Hospitalares", qualifEmpresa: "Impetrante", outro: "Secretário Municipal de Saúde", qualifOutro: "Impetrado",
      numero: cnj("0045120", "2025", "8", "19", "0002"), edital: "Pregão Eletrônico nº 12/2025", prioridade: "Média", vara: "Vara de Fazenda Pública", comarca: "Niterói", valorCausa: 1000,
      andamentos: and([[-90, "Impetrado o mandado de segurança"], [-80, "Liminar indeferida"], [-20, "Parecer do Ministério Público pela denegação"]]),
      proximosPassos: "Acompanhar sentença" }),
    base({ codigo: "7", acao: "Obrigação de fazer", empresa: "Instituto Saúde Leste (SCP encerrada)", qualifEmpresa: "Ré indicada", outro: "Joana Ribeiro", qualifOutro: "Autora",
      numero: cnj("0807731", "2025", "8", "19", "0024"), status: "Chamando o feito à ordem", prioridade: "Média", vara: "Vara Cível", comarca: "Itaguaí",
      resumo: "Autora incluiu sociedade em conta de participação já encerrada antes dos fatos.",
      andamentos: and([[-50, "Citação recebida por pessoa estranha à sociedade"], [-35, "Petição chamando o feito à ordem"], [-6, "Despacho: manifeste-se a autora"]]),
      proximosPassos: "Acompanhar exclusão do polo passivo" }),
    base({ codigo: "8", acao: "Divórcio consensual", empresa: "Paulo e Lia Mendes", qualifEmpresa: "Requerentes", outro: "—", qualifOutro: "",
      numero: cnj("0011873", "2026", "8", "19", "0208"), status: "Encerrado", prioridade: "Baixa", vara: "Vara de Família", comarca: "Rio de Janeiro",
      andamentos: and([[-80, "Distribuído"], [-40, "Sentença homologatória"], [-20, "Trânsito em julgado e arquivamento"]]),
      proximosPassos: "" }),
  ];

  const processos = brutos.map((p) => {
    p.cnj = N.analisarCnj(p.numero);
    p.id = p.cnj[0] ? p.cnj[0].digitos : "demo" + p.codigo;
    p.atualizadoEm = N.ultimaDataAndamento(p.andamentos);
    return p;
  });
  const idDe = (codigo) => processos.find((p) => p.codigo === codigo).id;

  const t = (id, titulo, codigo, venc, base) => ({ id, titulo, processoId: idDe(codigo), vencimento: venc, base, feita: false, criadaEm: dia(-5), origem: "movimentacao" });
  const tarefas = [
    t("td1", "Interpor recurso administrativo contra a inabilitação", "3", N.calcularPrazo(dia(-1), 3).vencimento, "Lei 14.133/2021 art. 165"),
    t("td2", "Avaliar recurso contra a sentença", "1", N.calcularPrazo(dia(-4), 15).vencimento, "CPC art. 1.003 §5º"),
    t("td3", "Preparar audiência de instrução", "2", dia(9), "agenda"),
    t("td4", "Reiterar pedido de penhora on-line", "5", dia(-2), "controle interno"),
    t("td5", "Ler o despacho e falar com a autora", "7", N.calcularPrazo(dia(-6), 5).vencimento, "CPC art. 218 §3º"),
  ];
  const atividades = [
    { id: "ad1", data: dia(-6), processoId: idDe("1"), tipo: "Recurso", desc: "Leitura da sentença e cálculo dos juros", minutos: 95 },
    { id: "ad2", data: dia(-3), processoId: idDe("3"), tipo: "Administrativo", desc: "Análise da ata do pregão", minutos: 70 },
    { id: "ad3", data: dia(-2), processoId: idDe("2"), tipo: "Atendimento", desc: "Reunião com o sócio da padaria", minutos: 45 },
    { id: "ad4", data: dia(-1), processoId: idDe("7"), tipo: "Prazo", desc: "Petição de chamamento do feito à ordem", minutos: 60 },
  ];

  // Publicações que o botão "Simular intimação do DJEN" faz chegar.
  const simulacao = {
    [idDe("6")]: [{ data: dia(0), texto: "Intimação: publicada sentença que denegou a segurança" }],
    [idDe("4")]: [{ data: dia(0), texto: "Intimação: projeto de sentença do juiz leigo homologado; sentença de procedência publicada" }],
  };

  window.GD_DEMO = {
    usuario: "Rafael Lima",
    gerar: () => ({ processos: Object.fromEntries(processos.map((p) => [p.id, JSON.parse(JSON.stringify(p))])), tarefas: Object.fromEntries(tarefas.map((x) => [x.id, Object.assign({}, x)])), pecas: {}, atividades: Object.fromEntries(atividades.map((x) => [x.id, Object.assign({}, x)])) }),
    simulacao: () => ({ fonte: "djen", processos: Object.fromEntries(Object.entries(simulacao).map(([id, l]) => [processos.find((p) => p.id === id).cnj[0].digitos, l])) }),
  };
})();
