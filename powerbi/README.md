# Power BI

Esta pasta é destinada ao arquivo principal do relatório Power BI.

## Arquivo esperado

`Projeto_Analise_Contratos.pbix`

## Estrutura do relatório

O projeto possui cinco páginas:

1. **Visão Executiva**  
   Indicadores financeiros, concentração de receita, margem, clientes, UF e evolução mensal.

2. **Análise de Contratos**  
   Status da carteira, vencimentos, valor exposto, contratos críticos e priorização.

3. **Especialidades e Serviços**  
   Volume, valor mensal, SLA e criticidade por especialidade.

4. **Performance e Qualidade**  
   Absenteísmo, incidentes, satisfação, SLA e atendimentos.

5. **Qualidade dos Dados**  
   Auditoria do processo de limpeza e validação.

## Componentes técnicos

O arquivo utiliza:

- Power Query para ETL;
- relacionamentos 1:N;
- dimensão calendário;
- dimensão de clientes;
- medidas DAX;
- segmentações e filtros;
- formatação condicional;
- gráficos de dispersão, linhas, colunas e barras;
- KPIs financeiros e operacionais.

## Como abrir

1. Instale o **Power BI Desktop**.
2. Baixe o arquivo `.pbix`, quando disponível nesta pasta.
3. Abra o relatório no Power BI Desktop.
4. Caso a origem da planilha esteja em um caminho local diferente, ajuste-a em **Transformar Dados → Configurações da fonte de dados**.
5. Atualize os dados.

## Para entender a construção

- [Arquitetura do Modelo](../documentacao/arquitetura_modelo.md)
- [Medidas DAX](../documentacao/medidas_dax.md)
- [Processo de ETL](../documentacao/processo_etl.md)
- [Dicionário de Dados](../documentacao/dicionario_dados.md)

> O projeto usa dados fictícios e não contém informações confidenciais.
