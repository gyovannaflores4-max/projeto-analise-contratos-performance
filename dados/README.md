# Dados do Projeto

Esta pasta representa a camada de **fonte de dados** do projeto.

A base utilizada é **100% fictícia** e foi criada exclusivamente para estudo, prática de Data Quality e construção de portfólio.

## Arquivo principal

A base já está disponível nesta pasta:

[**Projeto_01_Portfolio_Dados_Ficticios.xlsx**](Projeto_01_Portfolio_Dados_Ficticios.xlsx)

## Abas da planilha

| Aba | Finalidade |
|---|---|
| `Guia_Projeto` | contexto e instruções da base |
| `Contratos_Brutos` | fonte original dos contratos, com inconsistências propositais |
| `Itens_Servicos` | itens e serviços associados aos contratos |
| `Desempenho_Mensal` | indicadores mensais financeiros e operacionais |
| `Dicionario` | apoio à interpretação dos campos |

## Por que a base contém erros?

Para simular um cenário real, foram inseridos problemas como:

- duplicidades;
- valores nulos;
- textos fora de padrão;
- classificações ausentes;
- valores incompatíveis com regras de negócio.

Esses problemas foram tratados no **Power Query** antes da criação dos dashboards.

## Do dado bruto ao modelo

```text
Excel bruto
   ↓
Power Query
   ↓
Limpeza + padronização
   ↓
Validações de negócio
   ↓
Tabelas tratadas
   ↓
Modelo Power BI
```

## Documentação relacionada

- [Processo de ETL](../documentacao/processo_etl.md)
- [Dicionário de Dados](../documentacao/dicionario_dados.md)
- [Arquitetura do Modelo](../documentacao/arquitetura_modelo.md)

> Nenhum dado real de empresa, paciente, cliente ou contrato foi utilizado neste projeto.
