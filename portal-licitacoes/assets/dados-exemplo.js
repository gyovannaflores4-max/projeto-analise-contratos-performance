/* Pregão em Dia | estado inicial e dados de exemplo.
   Todos os órgãos, empresas, números e mensagens abaixo são FICTÍCIOS. As datas são calculadas
   a partir de hoje, para o exemplo sempre mostrar prazos correndo. */
(function (g) {
  "use strict";
  const U = g.U;
  const D = {};

  D.vazio = () => ({
    versao: 1,
    exemplo: false,
    empresa: { nome: "", apelido: "", cnpj: "", porte: "demais", equipe: "Equipe de licitações" },
    ajustes: {
      diasProposta: 3, diasDoc: [30, 15, 7], diasPortal: 30,
      pontosFacultativos: true, feriadosLocais: "",
      apiBase: "", intervaloChat: 5, notificacoes: false, som: true
    },
    editais: [], recursos: [], documentos: [], portais: [], chats: [],
    resolvidos: {}, atividade: []
  });

  D.criar = () => {
    const s = D.vazio();
    const hoje = U.hojeISO();
    const d = n => U.addDias(hoje, n);
    const dh = (n, hora) => d(n) + "T" + hora;
    const du = n => (n >= 0 ? U.somarDiasUteis(hoje, n) : U.subtrairDiasUteis(hoje, -n));
    const agora = new Date();
    // mensagem de chat "x minutos atrás"
    const ha = min => U.isoDataHora(new Date(agora.getTime() - min * 60000)) + ":" + U.pad((min * 7) % 60);

    s.exemplo = true;
    s.empresa = { nome: "Vitalis Serviços Médicos Ltda", apelido: "Vitalis", cnpj: "12.345.678/0001-90", porte: "demais", equipe: "Equipe de licitações" };

    const checklist = n => { const c = {}; ["Planilha de custos e formação de preços", "Proposta comercial assinada", "Declarações exigidas no edital", "Documentos de habilitação anexados", "Conferência de valor, lote e marca/modelo"].forEach((k, i) => { c[k] = i < n; }); return c; };
    const ed = (id, o) => Object.assign({
      id, uf: "", municipio: "", processo: "", uasg: "", link: "", notas: "", responsavel: "Gyovanna",
      prioridade: "media", propostaStatus: "nao_iniciada", checklist: checklist(0), historico: [], criadoEm: d(-20)
    }, o);

    s.editais = [
      ed("e1", { numero: "PE 87/2026", orgao: "Prefeitura Municipal de Santa Aurora do Norte", uf: "PA", municipio: "Santa Aurora do Norte", objeto: "Plantões médicos presenciais em urgência e emergência no Pronto-Socorro Municipal, 24 horas por dia.", portal: "BLL", modalidade: "Pregão eletrônico", sessao: dh(4, "09:00"), limiteProposta: dh(4, "08:59"), valorEstimado: 4860000, nossoValor: 4590000, etapa: "proposta", propostaStatus: "elaborando", prioridade: "alta", checklist: checklist(2), link: "https://bllcompras.com", historico: [{ data: d(-6), texto: "Edital analisado: sinal verde." }] }),
      ed("e2", { numero: "PE 152/2026", orgao: "Hospital Regional do Vale Verde", uf: "MT", municipio: "Vale Verde", objeto: "Serviços de hemodiálise e terapia renal substitutiva para pacientes internados, com fornecimento de equipe médica nefrologista.", portal: "Compras.gov.br", modalidade: "Pregão eletrônico", sessao: dh(9, "10:00"), valorEstimado: 12300000, etapa: "analise", prioridade: "alta", uasg: "158432", responsavel: "Ana Paula" }),
      ed("e3", { numero: "PE 64/2026", orgao: "Fundo Municipal de Saúde de Rio Claro do Sul", uf: "GO", municipio: "Rio Claro do Sul", objeto: "Médicos intensivistas para UTI adulto de 10 leitos, em regime de plantão de 12 horas.", portal: "Portal de Compras Públicas", modalidade: "Pregão eletrônico", sessao: dh(1, "14:00"), valorEstimado: 3150000, nossoValor: 2980000, etapa: "cadastrada", propostaStatus: "cadastrada", checklist: checklist(5) }),
      ed("e4", { numero: "PE 211/2026", orgao: "Secretaria Estadual de Saúde do Norte", uf: "AM", municipio: "Manaus", objeto: "Plantões de pediatria e neonatologia em maternidades da rede estadual.", portal: "Compras.gov.br", modalidade: "Pregão eletrônico", sessao: dh(0, "09:30"), valorEstimado: 9840000, nossoValor: 9120000, etapa: "disputa", propostaStatus: "cadastrada", checklist: checklist(5), prioridade: "alta", uasg: "925871" }),
      ed("e5", { numero: "PE 39/2026", orgao: "Consórcio Intermunicipal de Saúde Serra Azul", uf: "MG", municipio: "Serra Azul de Minas", objeto: "Consultas médicas ambulatoriais em clínica médica e especialidades.", portal: "e-compras AM", modalidade: "Pregão eletrônico", sessao: dh(-5, "09:00"), valorEstimado: 2240000, nossoValor: 1985000, etapa: "habilitacao", propostaStatus: "cadastrada", checklist: checklist(5) }),
      ed("e6", { numero: "PE 118/2026", orgao: "Hospital Universitário do Planalto Central", uf: "DF", municipio: "Brasília", objeto: "Serviços médicos de anestesiologia para o centro cirúrgico.", portal: "BLL", modalidade: "Pregão eletrônico", sessao: dh(-12, "10:00"), valorEstimado: 6700000, nossoValor: 6120000, etapa: "recurso", propostaStatus: "cadastrada", checklist: checklist(5), responsavel: "Ana Paula" }),
      ed("e7", { numero: "PE 77/2026", orgao: "Prefeitura Municipal de Lagoa Serena", uf: "SC", municipio: "Lagoa Serena", objeto: "Plantões de ortopedia e traumatologia no Hospital Municipal.", portal: "BNC", modalidade: "Pregão eletrônico", sessao: dh(-9, "09:00"), valorEstimado: 1890000, nossoValor: 1720000, etapa: "recurso", propostaStatus: "cadastrada", checklist: checklist(5) }),
      ed("e8", { numero: "CH 15/2026", orgao: "Fundo Municipal de Saúde de Boa Vista do Leste", uf: "BA", municipio: "Boa Vista do Leste", objeto: "Credenciamento de pessoas jurídicas para plantões médicos na atenção básica e UPA.", portal: "Portal de Compras Públicas", modalidade: "Credenciamento", sessao: dh(20, "08:00"), valorEstimado: null, etapa: "triagem", prioridade: "baixa" }),
      ed("e9", { numero: "DE 44/2026", orgao: "Câmara Municipal de Porto Ameno", uf: "RS", municipio: "Porto Ameno", objeto: "Médico do trabalho para exames ocupacionais (PCMSO) por 12 meses.", portal: "Licitanet", modalidade: "Dispensa eletrônica", sessao: dh(2, "17:00"), limiteProposta: dh(2, "17:00"), valorEstimado: 58000, etapa: "triagem", prioridade: "media" }),
      ed("e10", { numero: "PE 301/2026", orgao: "Prefeitura Municipal de Campo Florido do Sul", uf: "MS", municipio: "Campo Florido do Sul", objeto: "Plantões em clínica médica no Hospital Municipal.", portal: "Compras.gov.br", modalidade: "Pregão eletrônico", sessao: dh(-41, "09:00"), valorEstimado: 3600000, nossoValor: 3390000, etapa: "ganho", propostaStatus: "cadastrada" }),
      ed("e11", { numero: "PE 255/2026", orgao: "Hospital Estadual Costa Dourada", uf: "CE", municipio: "Costa Dourada", objeto: "Cirurgia geral em regime de sobreaviso.", portal: "Licitações-e", modalidade: "Pregão eletrônico", sessao: dh(-30, "10:00"), valorEstimado: 2750000, nossoValor: 2610000, etapa: "perdido", propostaStatus: "cadastrada" }),
      ed("e12", { numero: "PE 190/2026", orgao: "Secretaria Municipal de Saúde de Monte Alegre do Rio", uf: "TO", municipio: "Monte Alegre do Rio", objeto: "Equipe médica para o SAMU 192 regional.", portal: "BLL", modalidade: "Pregão eletrônico", sessao: dh(-63, "09:00"), valorEstimado: 5200000, nossoValor: 4870000, etapa: "ganho", propostaStatus: "cadastrada" }),
      ed("e13", { numero: "PE 96/2026", orgao: "Prefeitura Municipal de Vila Nova da Serra", uf: "PR", municipio: "Vila Nova da Serra", objeto: "Plantões de obstetrícia no Hospital e Maternidade Municipal.", portal: "BNC", modalidade: "Pregão eletrônico", sessao: dh(-20, "09:00"), valorEstimado: 2100000, nossoValor: 1990000, etapa: "perdido", propostaStatus: "cadastrada" })
    ];

    s.recursos = [
      { id: "r1", editalId: "e6", pregao: "PE 118/2026", papel: "recorrida", contraparte: "MedPrime Anestesia Ltda", regime: "14133", dataIntencao: du(-2), dataContrarrazoes: "", status: "intencao", tese: "Nossa proposta foi aceita e habilitada. A recorrente alega inexequibilidade, mas a planilha comprova custos acima do piso da convenção coletiva.", link: "", notas: "" },
      { id: "r2", editalId: "e7", pregao: "PE 77/2026", papel: "recorrente", contraparte: "OrtoVida Serviços Médicos", regime: "14133", dataIntencao: du(-1), dataContrarrazoes: "", status: "intencao", tese: "A vencedora apresentou atestado sem o quantitativo mínimo de 30% de plantões de ortopedia exigido no item 9.4 do edital.", link: "", notas: "" },
      { id: "r3", editalId: "e11", pregao: "PE 255/2026", papel: "recorrente", contraparte: "CirurMed Ltda", regime: "14133", dataIntencao: d(-27), dataContrarrazoes: "", status: "improvido", tese: "Desclassificação por preço inexequível sem diligência prévia.", link: "", notas: "Recurso não provido. Avaliar representação ao TCE." }
    ];

    const doc = (id, o) => Object.assign({ id, emissor: "", emissao: "", link: "", obs: "" }, o);
    s.documentos = [
      doc("d1", { nome: "CND Federal (Receita Federal e PGFN)", tipo: "cnd_federal", emissor: "Receita Federal", emissao: d(-168), validade: d(12), link: "https://servicos.receitafederal.gov.br/servico/certidoes/#/home" }),
      doc("d2", { nome: "Certificado de Regularidade do FGTS (CRF)", tipo: "fgts", emissor: "Caixa", emissao: d(-26), validade: d(4), link: "https://consulta-crf.caixa.gov.br/consultacrf/pages/consultaEmpregador.jsf" }),
      doc("d3", { nome: "Certidão Negativa de Débitos Trabalhistas", tipo: "cndt", emissor: "TST", emissao: d(-85), validade: d(95), link: "https://cndt-certidao.tst.jus.br/inicio.faces" }),
      doc("d4", { nome: "Certidão de Regularidade Fiscal Estadual", tipo: "estadual", emissor: "SEFAZ", emissao: d(-62), validade: d(-2) }),
      doc("d5", { nome: "Certidão Negativa Municipal (tributos mobiliários)", tipo: "municipal", emissor: "Prefeitura (sede)", emissao: d(-50), validade: d(40) }),
      doc("d6", { nome: "Certidão de Falência e Recuperação Judicial", tipo: "falencia", emissor: "Tribunal de Justiça", emissao: d(-70), validade: d(20) }),
      doc("d7", { nome: "Balanço patrimonial 2025", tipo: "balanco", emissor: "Contabilidade", emissao: "2026-04-28", validade: "2027-05-31" }),
      doc("d8", { nome: "Contrato social consolidado", tipo: "contrato_social", emissor: "Junta Comercial", emissao: "2025-08-14", validade: "" }),
      doc("d9", { nome: "Registro da empresa no CRM (PJ)", tipo: "conselho", emissor: "CRM", emissao: d(-300), validade: d(60) }),
      doc("d10", { nome: "Licença sanitária", tipo: "licenca_sanitaria", emissor: "Vigilância Sanitária", emissao: d(-340), validade: d(25) }),
      doc("d11", { nome: "Cadastro no CNES", tipo: "cnes", emissor: "DATASUS", emissao: "2024-02-10", validade: "", link: "https://cnes.datasus.gov.br/" }),
      doc("d12", { nome: "Certificado digital e-CNPJ A1", tipo: "certificado", emissor: "Autoridade certificadora", emissao: d(-356), validade: d(9) }),
      doc("d13", { nome: "Atestados de capacidade técnica (pasta com 14)", tipo: "atestado", emissor: "Diversos órgãos", emissao: "", validade: "" })
    ];

    const portal = (id, o) => Object.assign({ id, usuario: "licitacoes@vitalis.exemplo", cadastro: "", validadeCadastro: "", validadePlano: "", obs: "" }, o);
    s.portais = [
      portal("p1", { nome: "Compras.gov.br (SICAF)", url: "https://www.gov.br/compras/pt-br", cadastro: "SICAF níveis I a VI", validadeCadastro: d(45) }),
      portal("p2", { nome: "BLL Compras", url: "https://bllcompras.com", cadastro: "Fornecedor credenciado", validadeCadastro: d(210), validadePlano: d(6), obs: "Plano anual. Renovar pelo financeiro." }),
      portal("p3", { nome: "Portal de Compras Públicas", url: "https://www.portaldecompraspublicas.com.br", cadastro: "Fornecedor", validadeCadastro: d(120) }),
      portal("p4", { nome: "Licitações-e (Banco do Brasil)", url: "https://www.licitacoes-e.com.br", cadastro: "Licitante", validadeCadastro: d(-1), obs: "Precisa renovar o cadastro na agência ou on-line." }),
      portal("p5", { nome: "BNC Compras", url: "https://bnccompras.com", cadastro: "Fornecedor", validadeCadastro: d(200), validadePlano: d(33) }),
      portal("p6", { nome: "e-compras.AM", url: "https://www.e-compras.am.gov.br", cadastro: "Cadastro de fornecedor", validadeCadastro: d(300) }),
      portal("p7", { nome: "Licitanet", url: "https://licitanet.com.br", cadastro: "Fornecedor", validadeCadastro: d(15) })
    ];

    const msg = (min, autor, texto, lida) => ({ hora: ha(min), autor, texto, lida: lida !== false });
    s.chats = [
      {
        id: "c1", editalId: "e4", titulo: "PE 211/2026", orgao: "Secretaria Estadual de Saúde do Norte", portal: "Compras.gov.br", processo: "", auto: false, status: "Em julgamento de propostas", link: "https://www.gov.br/compras/pt-br",
        mensagens: [
          msg(140, "Sistema", "A sessão pública foi aberta pelo pregoeiro."),
          msg(138, "Pregoeiro", "Bom dia, senhores licitantes. Daremos início à fase de lances do item 1 em 5 minutos. Peço atenção ao intervalo mínimo entre lances de R$ 100,00."),
          msg(96, "Sistema", "O item 1 foi encerrado. Fase de lances concluída no modo aberto."),
          msg(80, "Pregoeiro", "Vamos analisar a proposta da primeira colocada. Solicito que permaneçam conectados."),
          msg(22, "Pregoeiro", "Convoco a empresa VITALIS SERVIÇOS MÉDICOS LTDA para envio da proposta ajustada ao último lance e da planilha de custos, no prazo de 2 (duas) horas, pela opção Anexo do sistema.", false),
          msg(21, "Sistema", "Foi solicitado o envio de anexo para o item 1 ao fornecedor 12.345.678/0001-90.", false)
        ]
      },
      {
        id: "c2", editalId: "e5", titulo: "PE 39/2026", orgao: "Consórcio Intermunicipal de Saúde Serra Azul", portal: "e-compras AM", processo: "39/26", auto: false, status: "Em habilitação", link: "https://www.e-compras.am.gov.br/publico/",
        mensagens: [
          msg(60 * 24 * 5 + 30, "Pregoeiro", "Senhores, a sessão será suspensa para análise da documentação de habilitação pela área técnica."),
          msg(60 * 24 * 5 + 29, "Sistema", "Sessão do chat fechada"),
          msg(60 * 26, "Sistema", "Sessão do chat aberta"),
          msg(60 * 26 - 2, "Pregoeiro", "Bom dia. Informo que foi realizada diligência junto ao CRM para conferir o registro da empresa arrematante. Aguardamos retorno."),
          msg(60 * 26 - 5, "Pregoeiro", "A sessão será retomada em " + U.fmtData(d(1)) + " às 10h00 para divulgação do resultado da habilitação.", false),
          msg(60 * 26 - 6, "Sistema", "Sessão do chat fechada", false)
        ]
      },
      {
        id: "c3", editalId: "e6", titulo: "PE 118/2026", orgao: "Hospital Universitário do Planalto Central", portal: "BLL", processo: "", auto: false, status: "Fase recursal", link: "https://bllcompras.com",
        mensagens: [
          msg(60 * 24 * 4, "Pregoeiro", "A empresa VITALIS SERVIÇOS MÉDICOS LTDA foi declarada vencedora do lote 1."),
          msg(60 * 24 * 4 - 3, "Sistema", "Aberto o prazo para manifestação de intenção de recurso: 30 minutos."),
          msg(60 * 24 * 4 - 20, "MEDPRIME ANESTESIA LTDA", "Manifestamos intenção de recurso contra a aceitação da proposta da vencedora, por inexequibilidade."),
          msg(60 * 24 * 4 - 40, "Pregoeiro", "Intenção registrada. Prazo para razões: 3 dias úteis. Contrarrazões em igual prazo a partir do término do prazo da recorrente.")
        ]
      }
    ];

    s.atividade = [
      { quando: U.isoDataHora(new Date(agora.getTime() - 22 * 60000)), texto: "Pregoeiro convocou a Vitalis no PE 211/2026 (2 horas para anexar a proposta).", rota: "chats" },
      { quando: U.isoDataHora(new Date(agora.getTime() - 26 * 3600000)), texto: "PE 39/2026: retomada marcada para " + U.fmtData(d(1)) + " às 10h00.", rota: "chats" },
      { quando: dh(-1, "16:20"), texto: "Proposta do PE 64/2026 cadastrada no Portal de Compras Públicas.", rota: "propostas" },
      { quando: dh(-2, "11:05"), texto: "Intenção de recurso registrada contra nós no PE 118/2026.", rota: "recursos" },
      { quando: dh(-6, "15:40"), texto: "Edital PE 87/2026 analisado: sinal verde.", rota: "editais" }
    ];
    return s;
  };

  // Edital de exemplo para a tela de análise (fictício)
  D.editalExemplo = () => {
    const sessao = U.proximoDiaUtil(U.addDias(U.hojeISO(), 12));
    const [a, m, dia] = sessao.split("-");
    return `PREFEITURA MUNICIPAL DE SANTA AURORA DO NORTE
SECRETARIA MUNICIPAL DE SAÚDE
EDITAL DE PREGÃO ELETRÔNICO Nº 112/${a}
PROCESSO ADMINISTRATIVO Nº 2026.04.1187-SMS

1. DO OBJETO
1.1. O objeto da presente licitação é a contratação de empresa especializada na prestação de serviços médicos de plantão em urgência e emergência, clínica médica e pediatria, para o Hospital Municipal e a UPA 24h, conforme condições, quantidades e exigências estabelecidas neste Edital e seus anexos.
1.2. O critério de julgamento adotado será o MENOR PREÇO POR LOTE, observadas as exigências contidas neste Edital quanto às especificações do objeto.
1.3. O modo de disputa será o aberto e fechado.

2. DA SESSÃO PÚBLICA
2.1. A sessão pública será realizada no endereço eletrônico www.gov.br/compras, no dia ${dia}/${m}/${a}, às 09h00 (horário de Brasília).
2.2. O valor total estimado da contratação é de R$ 7.284.600,00 (sete milhões, duzentos e oitenta e quatro mil e seiscentos reais).

3. DA PARTICIPAÇÃO
3.1. Não será admitida a participação de empresas reunidas em consórcio.
3.2. É vedada a subcontratação total ou parcial do objeto.

4. DA PROPOSTA
4.1. Os licitantes encaminharão, exclusivamente por meio do sistema, concomitantemente com os documentos de habilitação exigidos no edital, proposta com a descrição do objeto ofertado e o preço.
4.2. O prazo de validade da proposta não será inferior a 90 (noventa) dias, a contar da data de sua apresentação.
4.3. Após a fase de lances, o licitante melhor classificado será convocado para enviar a proposta adequada ao último lance no prazo de 2 (duas) horas.

5. DA HABILITAÇÃO
5.1. Habilitação jurídica: ato constitutivo, estatuto ou contrato social em vigor.
5.2. Regularidade fiscal e trabalhista: prova de inscrição no CNPJ; certidão conjunta relativa aos tributos federais e à Dívida Ativa da União; Certificado de Regularidade do FGTS; Certidão Negativa de Débitos Trabalhistas (CNDT); prova de regularidade com a Fazenda Estadual e Municipal do domicílio da licitante.
5.3. Qualificação econômico-financeira: certidão negativa de falência e recuperação judicial; balanço patrimonial e demonstrações contábeis dos 2 (dois) últimos exercícios sociais, comprovando índices de Liquidez Geral (LG), Solvência Geral (SG) e Liquidez Corrente (LC) superiores a 1,5; patrimônio líquido mínimo de 10% do valor estimado do lote.
5.4. Qualificação técnica: registro da empresa no Conselho Regional de Medicina (CRM); comprovação de cadastro no CNES; atestados de capacidade técnica que comprovem a execução de serviços compatíveis, em quantitativo mínimo de 60% (sessenta por cento) dos plantões estimados; indicação do responsável técnico; alvará sanitário vigente.
5.5. A visita técnica é obrigatória e deverá ser agendada com a Secretaria até 2 dias úteis antes da sessão.

6. DA EXECUÇÃO E DO PAGAMENTO
6.1. A contratada deverá iniciar a prestação dos serviços em até 5 (cinco) dias após a assinatura do contrato.
6.2. O pagamento será efetuado em até 45 (quarenta e cinco) dias após o atesto da nota fiscal.
6.3. A vigência do contrato será de 12 (doze) meses, prorrogável na forma da Lei nº 14.133/2021.
6.4. Será exigida garantia contratual de 5% (cinco por cento) do valor do contrato.
6.5. O descumprimento injustificado sujeitará a contratada à multa de até 30% (trinta por cento) sobre o valor da parcela inadimplida.

7. DA IMPUGNAÇÃO
7.1. Qualquer pessoa é parte legítima para impugnar este edital, devendo protocolar o pedido até 3 (três) dias úteis antes da data de abertura do certame.`;
  };

  g.DadosExemplo = D;
})(typeof window !== "undefined" ? window : globalThis);
