# Dicionário de Dados

Este documento descreve os principais campos utilizados no projeto. A base é **100% fictícia** e foi criada para fins de estudo e portfólio.

| Tabela | Campo | Descrição |
|---|---|---|
| Contratos_Brutos | Contrato_ID | Identificador único do contrato. A base bruta continha duplicatas intencionais para exercício de limpeza. |
| Contratos_Brutos | Cliente | Nome fictício do contratante. |
| Contratos_Brutos | Tipo_Cliente | Classificação Público ou Privado; a base bruta continha nulos intencionais. |
| Contratos_Brutos | Municipio / UF | Localização da operação; a base bruta continha variações de padronização intencionais. |
| Contratos_Brutos | Status_Contrato | Status do contrato: Ativo, Vencendo ou Encerrado. |
| Contratos_Brutos | Valor_Mensal_Contratual | Valor mensal do contrato; alguns valores nulos foram reconstruídos por regra de negócio. |
| Contratos_Brutos | Valor_Total_Contrato | Valor global estimado para a vigência. |
| Contratos_Brutos | Meta_Margem_Pct | Meta percentual de margem do contrato. |
| Itens_Servicos | Contrato_ID | Chave de relacionamento com Contratos. |
| Itens_Servicos | Especialidade | Especialidade associada ao item/serviço. |
| Itens_Servicos | Valor_Mensal_Item | Quantidade mensal x valor unitário. |
| Desempenho_Mensal | Mes_Referencia | Mês de referência do indicador operacional/financeiro. |
| Desempenho_Mensal | Receita_Realizada | Receita fictícia efetivamente realizada no mês. |
| Desempenho_Mensal | Margem_Pct | Margem realizada no mês. |
| Desempenho_Mensal | SLA_Cumprido_Pct | Percentual de cumprimento de SLA; havia nulos intencionais. |
| Desempenho_Mensal | Satisfacao_Cliente_1a5 | Nota de satisfação entre 1 e 5. |
| Desempenho_Mensal | Incidentes | Quantidade de incidentes; a base bruta continha valores inválidos intencionais. |
| Desempenho_Mensal | Absenteismo_Pct | Percentual de absenteísmo mensal. |

## Granularidade das tabelas

- **Contratos:** 1 linha = 1 contrato.
- **Itens_Servicos:** 1 linha = 1 item/serviço associado a um contrato.
- **Desempenho_Mensal:** 1 linha = desempenho de um contrato em um determinado mês.
- **Dim_Clientes:** 1 linha = 1 cliente.
- **Dim_Calendario:** 1 linha = 1 data.

## Observação sobre Data Quality

Alguns problemas foram inseridos propositalmente na base para simular um cenário real de tratamento de dados, incluindo duplicidades, nulos, textos fora de padrão e valores incompatíveis com regras de negócio.
