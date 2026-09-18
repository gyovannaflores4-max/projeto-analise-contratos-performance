# Dicionário de Dados

Este documento descreve os principais campos utilizados no projeto.

> A base é **100% fictícia** e foi criada exclusivamente para estudo e portfólio.

## Convenção

A fonte original possui uma aba de contratos brutos. Após o tratamento no Power Query, a tabela utilizada no modelo é chamada **Contratos**.

---

## Contratos

**Granularidade:** 1 linha por contrato.

| Campo | Tipo lógico | Descrição |
|---|---|---|
| Contrato_ID | Texto | Chave única do contrato e elo com as tabelas de serviços e desempenho. |
| Numero_Contrato | Texto | Número de identificação apresentado no dashboard. |
| Ano_Contrato | Inteiro | Ano associado ao contrato. |
| Cliente | Texto | Nome fictício do contratante. |
| Tipo_Cliente | Texto | Classificação entre Público e Privado. |
| Unidade_Hospitalar | Texto | Unidade associada ao contrato. |
| Municipio | Texto | Município fictício da operação. |
| UF | Texto | Unidade federativa. |
| Regiao | Texto | Região geográfica. |
| Inicio_Vigencia | Data | Data inicial de vigência. |
| Fim_Vigencia | Data | Data final de vigência. |
| Prazo_Meses | Inteiro | Prazo estimado do contrato em meses. |
| Status_Contrato | Texto | Ativo, Vencendo ou Encerrado. |
| Especialidade_Principal | Texto | Especialidade principal vinculada ao contrato. |
| Tipo_Servico | Texto | Categoria principal do serviço contratado. |
| Valor_Mensal_Contratual | Moeda | Valor mensal do contrato. |
| Valor_Total_Contrato | Moeda | Valor global estimado do contrato. |
| Meta_Margem_Pct | Decimal | Meta percentual de margem. |
| Gestor_Conta | Texto | Responsável fictício pela conta. |
| Canal_Origem | Texto | Canal de origem do contrato. |
| Status_Validacao_Contrato | Texto | Resultado das regras de validação da linha. |

---

## Itens_Servicos

**Granularidade:** 1 linha por item/serviço associado a um contrato.

| Campo | Tipo lógico | Descrição |
|---|---|---|
| Item_ID | Texto | Identificador único do item. |
| Contrato_ID | Texto | Chave de relacionamento com Contratos. |
| Especialidade | Texto | Especialidade do serviço. |
| Descricao_Servico | Texto | Descrição do item ou serviço. |
| Unidade_Medida | Texto | Unidade utilizada para mensuração. |
| Quantidade_Mensal | Número | Quantidade prevista por mês. |
| Valor_Unitario | Moeda | Valor unitário do serviço. |
| Valor_Mensal_Item | Moeda | Valor mensal estimado do item. |
| SLA_Horas | Número | Prazo de SLA em horas. |
| Meta_Qualidade_Pct | Decimal | Meta de qualidade do serviço. |
| Nivel_Criticidade | Texto | Classificação de criticidade, como Alta, Média ou Baixa. |
| Status_Validacao_Item | Texto | Resultado das regras de validação do item. |

---

## Desempenho_Mensal

**Granularidade:** 1 linha por contrato em um determinado mês.

| Campo | Tipo lógico | Descrição |
|---|---|---|
| Performance_ID | Texto | Identificador do registro mensal. |
| Contrato_ID | Texto | Chave de relacionamento com Contratos. |
| Mes_Referencia | Data | Mês de referência da medição. |
| Receita_Realizada | Moeda | Receita realizada no mês. |
| Meta_Receita | Moeda | Meta de receita do mês. |
| Custo_Realizado | Moeda | Custo operacional realizado. |
| Margem_Valor | Moeda | Margem em valor absoluto. |
| Margem_Pct | Decimal | Margem percentual realizada. |
| Atendimentos | Inteiro | Quantidade de atendimentos no mês. |
| SLA_Cumprido_Pct | Decimal | Percentual de cumprimento do SLA. |
| Satisfacao_Cliente_1a5 | Decimal | Nota de satisfação entre 1 e 5. |
| Incidentes | Inteiro | Quantidade de incidentes registrados. |
| Absenteismo_Pct | Decimal | Percentual de absenteísmo mensal. |
| Status_Validacao_Desempenho | Texto | Resultado das regras de validação do registro. |

---

## Dim_Clientes

**Granularidade:** 1 linha por cliente.

| Campo | Descrição |
|---|---|
| Cliente | Nome fictício do cliente e chave de relacionamento. |
| Tipo_Cliente | Classificação Público ou Privado. |

Essa dimensão também foi utilizada como referência para recuperar classificações ausentes na base de contratos.

---

## Dim_Calendario

**Granularidade:** 1 linha por data.

| Campo | Descrição |
|---|---|
| Date | Data da dimensão. |
| Ano | Ano calendário. |
| Numero_Mes | Número do mês. |
| Mes | Nome do mês. |
| Mes_Ano | Rótulo para análise mensal. |
| Trimestre | Trimestre calendário. |

---

## Campos derivados e medidas

Além das colunas acima, o relatório utiliza medidas DAX para cálculos como:

- receita total;
- margem;
- ticket médio;
- contratos vencendo;
- valor exposto em 120 dias;
- concentração Top 3;
- SLA médio;
- satisfação média;
- taxa de validação.

As fórmulas estão documentadas em [Medidas DAX](medidas_dax.md).

---

## Observação sobre Data Quality

Alguns problemas foram inseridos propositalmente na base para simular um cenário real, incluindo:

- duplicidades;
- nulos;
- textos fora de padrão;
- valores inválidos;
- classificações ausentes.

O tratamento completo está descrito em [Processo de ETL e Data Quality](processo_etl.md).
