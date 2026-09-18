# Insights de Negócio

Este documento resume as principais leituras geradas pelos dashboards.

> Os dados são fictícios. Os insights representam apenas o cenário simulado do projeto.

## 1. Receita próxima da meta

A receita realizada atingiu **97,7% da meta**.

### Interpretação

O resultado indica desempenho próximo do planejado, mas ainda existe uma diferença a recuperar.

### Uso gerencial

- investigar contratos abaixo da meta;
- comparar desempenho entre clientes e especialidades;
- identificar períodos de maior queda.

---

## 2. Concentração de receita

Os três maiores clientes representam **38,3% da receita total**.

### Interpretação

A carteira possui concentração relevante nos principais clientes, porém sem dependência extrema de um único contrato.

### Uso gerencial

- monitorar retenção dos maiores clientes;
- acompanhar risco de concentração;
- buscar crescimento em clientes intermediários.

---

## 3. Exposição a vencimentos

**12,2% do valor contratado** está associado a contratos com vencimento em até 120 dias.

O valor financeiro exposto é de aproximadamente **R$ 79,51 Mi**.

### Uso gerencial

A carteira pode ser priorizada por faixas:

- até 30 dias → **Urgente**;
- 31 a 60 dias → **Atenção**;
- 61 a 120 dias → **Monitorar**.

Esse indicador ajuda a organizar ações de renovação e negociação.

---

## 4. Receita não é igual a rentabilidade

O gráfico de dispersão entre receita e margem mostra que clientes de maior faturamento nem sempre possuem a maior rentabilidade.

### Uso gerencial

- analisar custo de operação por cliente;
- revisar contratos com receita alta e margem abaixo da média;
- priorizar crescimento sustentável, e não apenas volume.

---

## 5. Especialidades críticas

O cruzamento entre **valor mensal** e **quantidade de serviços de alta criticidade** permite localizar especialidades com maior impacto operacional.

### Uso gerencial

Especialidades de alto valor e alta criticidade podem receber:

- acompanhamento de SLA mais próximo;
- revisão de capacidade operacional;
- planos de contingência;
- análise de custo e margem.

---

## 6. Qualidade operacional

A satisfação média é de aproximadamente **4,3 / 5**, enquanto o SLA médio está em **92,8%**.

O absenteísmo médio fica próximo de **5%**.

### Uso gerencial

Esses indicadores devem ser analisados em conjunto. Uma deterioração em absenteísmo ou incidentes pode anteceder queda de SLA ou satisfação.

---

## 7. Data Quality como parte da análise

A etapa de qualidade identificou duplicidades, dados ausentes e valores inválidos antes da construção dos indicadores.

### Conclusão

Um dashboard visualmente correto pode gerar conclusões erradas quando a base não é validada. Por isso, o projeto trata Data Quality como uma etapa do processo analítico, e não como uma atividade separada.
