# Guia de Leitura dos Dashboards

Este documento explica **como interpretar cada página** do relatório e o que observar em cada visual.

---

## 1. Visão Executiva

### Pergunta principal
**Como está a saúde financeira e comercial da carteira?**

### O que observar
- **Receita Total:** dimensão financeira da operação.
- **Custo Total:** custo necessário para entregar os serviços.
- **Margem Total e Margem %:** resultado financeiro após os custos.
- **Quantidade de Contratos:** tamanho da carteira.
- **Ticket Médio:** valor médio dos contratos.
- **Atingimento da Meta:** distância entre receita realizada e planejada.
- **Concentração Top 3:** dependência financeira dos maiores clientes.

### Visuais
- **Receita x Rentabilidade por Cliente:** mostra que faturamento alto não significa necessariamente margem alta.
- **Receita por UF:** identifica concentração geográfica.
- **Receita por Cliente:** destaca os maiores clientes.
- **Receita Realizada x Meta:** acompanha evolução ao longo do tempo.
- **Receita por Especialidade:** mostra quais áreas geram maior receita.
- **Margem por Cliente:** evidencia rentabilidade.

---

## 2. Análise de Contratos

### Pergunta principal
**Quais contratos exigem atenção agora?**

### O que observar
- quantidade de contratos ativos, vencendo e encerrados;
- valor contratado total;
- valor exposto nos próximos 120 dias;
- percentual da carteira sob risco de vencimento.

### Tabela de contratos críticos
A tabela permite priorizar ações por:
- data de vencimento;
- dias restantes;
- faixa de risco;
- valor financeiro.

### Faixas
- **Urgente:** até 30 dias;
- **Atenção:** 31 a 60 dias;
- **Monitorar:** 61 a 120 dias.

---

## 3. Especialidades e Serviços

### Pergunta principal
**Onde estão os serviços mais relevantes para a operação?**

### O que observar
- número de serviços;
- número de especialidades;
- valor mensal;
- ticket médio;
- quantidade de serviços críticos;
- SLA médio.

### Visual de dispersão
O gráfico **Valor Mensal x Criticidade** ajuda a localizar especialidades com:
- alto valor e alta criticidade;
- alto valor e menor risco;
- menor valor e alta criticidade;
- menor impacto financeiro e operacional.

Esse cruzamento ajuda a priorizar gestão e acompanhamento.

---

## 4. Performance e Qualidade

### Pergunta principal
**A operação está entregando volume com qualidade?**

### Indicadores
- margem;
- absenteísmo;
- incidentes;
- satisfação;
- atendimentos;
- SLA.

### Como interpretar
O ideal é analisar esses indicadores em conjunto.

Exemplo:
- aumento de absenteísmo;
- aumento de incidentes;
- queda de SLA;
- queda de satisfação.

Essa sequência pode sinalizar deterioração operacional.

---

## 5. Qualidade dos Dados

### Pergunta principal
**Os dados usados nas decisões são confiáveis?**

### O que a página demonstra
- volume de registros validados;
- taxa de validação;
- ocorrências encontradas;
- tratamentos aplicados.

### Por que essa página existe
O projeto não considera a limpeza dos dados como uma etapa invisível. A qualidade é apresentada como parte da solução analítica.

Isso demonstra que um dashboard confiável depende de:
1. dados tratados;
2. regras de negócio claras;
3. validações antes dos cálculos;
4. rastreabilidade das correções.

---

## Sequência recomendada de leitura

Para entender o projeto completo:

```text
Visão Executiva
      ↓
Análise de Contratos
      ↓
Especialidades e Serviços
      ↓
Performance e Qualidade
      ↓
Qualidade dos Dados
```

A sequência vai do **resultado executivo** até a **confiabilidade da base que sustenta esse resultado**.
