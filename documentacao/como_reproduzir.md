# Como Reproduzir o Projeto

Este guia descreve a sequência utilizada para construir a solução.

## Pré-requisitos

- Power BI Desktop;
- Excel;
- conhecimento básico de Power Query e DAX.

---

## 1. Carregar os dados

Importe para o Power BI as tabelas da planilha fictícia:

- Contratos_Brutos;
- Itens_Servicos;
- Desempenho_Mensal.

Crie ou importe também a classificação de clientes utilizada em `Dim_Clientes`.

---

## 2. Tratar os dados no Power Query

Aplique:

- tipos corretos;
- limpeza de textos;
- remoção de duplicidades;
- tratamento de nulos;
- recuperação de campos via tabelas de referência;
- regras de validação;
- checagem de integridade de chaves.

Consulte [Processo de ETL](processo_etl.md) para detalhes.

---

## 3. Criar o modelo

Estruture os relacionamentos:

- Dim_Clientes 1:N Contratos;
- Contratos 1:N Itens_Servicos;
- Contratos 1:N Desempenho_Mensal;
- Dim_Calendario 1:N Desempenho_Mensal.

Evite relacionamentos muitos-para-muitos quando não forem necessários.

---

## 4. Criar a Dim_Calendario

Crie uma tabela calendário com:

- data;
- ano;
- número do mês;
- nome do mês;
- mês/ano;
- trimestre.

Use a coluna de data para relacionar o calendário ao desempenho mensal.

---

## 5. Criar medidas DAX

Comece pelos indicadores-base:

- Receita Total;
- Custo Total;
- Margem;
- Quantidade de Contratos;
- Ticket Médio;
- SLA;
- Satisfação;
- Incidentes;
- Absenteísmo.

Depois crie indicadores derivados, como:

- Atingimento da Meta;
- Concentração Top 3;
- Valor Exposto em 120 dias;
- Faixa de Vencimento;
- Taxa de Validação Final.

As fórmulas estão em [Medidas DAX](medidas_dax.md).

---

## 6. Montar os dashboards

Ordem recomendada:

1. Visão Executiva;
2. Análise de Contratos;
3. Especialidades e Serviços;
4. Performance e Qualidade;
5. Qualidade dos Dados.

Cada página deve responder uma pergunta de negócio diferente.

---

## 7. Validar o resultado

Antes de considerar o projeto concluído:

- compare totais com a fonte;
- teste filtros;
- verifique relacionamentos;
- valide medidas com casos simples;
- revise datas e ordenação temporal;
- confira unidades monetárias e percentuais;
- teste linhas com nulos.

---

## 8. Documentar

Registre:

- regras de transformação;
- modelo de dados;
- principais medidas;
- decisões de negócio;
- limitações;
- principais insights.

A documentação ajuda outra pessoa a entender o projeto sem depender de quem o construiu.
