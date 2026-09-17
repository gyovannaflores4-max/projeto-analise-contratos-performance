# Medidas DAX — Projeto 01

Este arquivo reúne as principais medidas criadas no Power BI durante o projeto.

## Financeiro

```DAX
Receita Total =
SUM(Desempenho_Mensal[Receita_Realizada])
```

```DAX
Custo Total =
SUM(Desempenho_Mensal[Custo_Realizado])
```

```DAX
Margem Total =
[Receita Total] - [Custo Total]
```

```DAX
Margem % =
DIVIDE(
    [Margem Total],
    [Receita Total],
    0
)
```

```DAX
Meta Receita Total =
SUM(Desempenho_Mensal[Meta_Receita])
```

```DAX
Atingimento da Meta % =
DIVIDE(
    [Receita Total],
    [Meta Receita Total],
    0
)
```

## Contratos

```DAX
Quantidade de Contratos =
DISTINCTCOUNT(Contratos[Contrato_ID])
```

```DAX
Ticket Médio Contrato =
DIVIDE(
    SUM(Contratos[Valor_Total_Contrato]),
    [Quantidade de Contratos],
    0
)
```

```DAX
Contratos Ativos =
CALCULATE(
    [Quantidade de Contratos],
    Contratos[Status_Contrato] = "Ativo"
)
```

```DAX
Contratos Vencendo =
CALCULATE(
    [Quantidade de Contratos],
    Contratos[Status_Contrato] = "Vencendo"
)
```

```DAX
Contratos Encerrados =
CALCULATE(
    [Quantidade de Contratos],
    Contratos[Status_Contrato] = "Encerrado"
)
```

```DAX
Valor Contratado Total =
SUM(Contratos[Valor_Total_Contrato])
```

```DAX
Contratos Vencendo 120 Dias =
CALCULATE(
    [Quantidade de Contratos],
    FILTER(
        Contratos,
        Contratos[Fim_Vigencia] >= TODAY()
            && Contratos[Fim_Vigencia] <= TODAY() + 120
    )
)
```

```DAX
Valor Exposto 120 Dias =
CALCULATE(
    SUM(Contratos[Valor_Total_Contrato]),
    FILTER(
        Contratos,
        Contratos[Fim_Vigencia] >= TODAY()
            && Contratos[Fim_Vigencia] <= TODAY() + 120
    )
)
```

```DAX
% Valor Exposto 120 Dias =
DIVIDE(
    [Valor Exposto 120 Dias],
    [Valor Contratado Total],
    0
)
```

```DAX
Dias para Vencer =
IF(
    ISINSCOPE(Contratos[Numero_Contrato]),
    DATEDIFF(
        TODAY(),
        MAX(Contratos[Fim_Vigencia]),
        DAY
    ),
    BLANK()
)
```

```DAX
Faixa de Vencimento =
VAR Dias = [Dias para Vencer]
RETURN
SWITCH(
    TRUE(),
    ISBLANK(Dias), BLANK(),
    Dias <= 30, "Urgente",
    Dias <= 60, "Atenção",
    Dias <= 120, "Monitorar",
    "Fora da janela"
)
```

## Concentração de Receita

```DAX
Receita Top 3 Clientes =
VAR Top3Clientes =
    TOPN(
        3,
        ALLSELECTED(Dim_Clientes[Cliente]),
        [Receita Total],
        DESC
    )
RETURN
    CALCULATE(
        [Receita Total],
        KEEPFILTERS(Top3Clientes)
    )
```

```DAX
Concentração Top 3 % =
DIVIDE(
    [Receita Top 3 Clientes],
    CALCULATE(
        [Receita Total],
        ALLSELECTED(Dim_Clientes[Cliente])
    ),
    0
)
```

## Serviços e Especialidades

```DAX
Quantidade de Serviços =
DISTINCTCOUNT(Itens_Servicos[Item_ID])
```

```DAX
Quantidade de Especialidades =
DISTINCTCOUNT(Itens_Servicos[Especialidade])
```

```DAX
Valor Mensal Serviços =
SUM(Itens_Servicos[Valor_Mensal_Item])
```

```DAX
Ticket Médio Serviço =
DIVIDE(
    [Valor Mensal Serviços],
    [Quantidade de Serviços],
    0
)
```

```DAX
Serviços Criticidade Alta =
CALCULATE(
    [Quantidade de Serviços],
    Itens_Servicos[Nivel_Criticidade] = "Alta"
)
```

```DAX
SLA Médio Horas =
AVERAGE(Itens_Servicos[SLA_Horas])
```

## Performance e Qualidade

```DAX
Total de Atendimentos =
SUM(Desempenho_Mensal[Atendimentos])
```

```DAX
SLA Médio % =
AVERAGE(Desempenho_Mensal[SLA_Cumprido_Pct])
```

```DAX
Satisfação Média =
AVERAGE(Desempenho_Mensal[Satisfacao_Cliente_1a5])
```

```DAX
Total de Incidentes =
COALESCE(
    SUM(Desempenho_Mensal[Incidentes]),
    0
)
```

```DAX
Absenteísmo Médio % =
AVERAGE(Desempenho_Mensal[Absenteismo_Pct])
```

## Data Quality

```DAX
Contratos Validados =
CALCULATE(
    COUNTROWS(Contratos),
    Contratos[Status_Validacao_Contrato] = "OK"
)
```

```DAX
Itens Validados =
CALCULATE(
    COUNTROWS(Itens_Servicos),
    Itens_Servicos[Status_Validacao_Item] = "OK"
)
```

```DAX
Desempenhos Validados =
CALCULATE(
    COUNTROWS(Desempenho_Mensal),
    Desempenho_Mensal[Status_Validacao_Desempenho] = "OK"
)
```

```DAX
Taxa de Validação Final % =
VAR RegistrosValidados =
    [Contratos Validados]
    + [Itens Validados]
    + [Desempenhos Validados]
VAR TotalRegistros =
    COUNTROWS(Contratos)
    + COUNTROWS(Itens_Servicos)
    + COUNTROWS(Desempenho_Mensal)
RETURN
    DIVIDE(
        RegistrosValidados,
        TotalRegistros,
        0
    )
```

```DAX
SLA Ausente Identificado =
CALCULATE(
    COUNTROWS(Desempenho_Mensal),
    FILTER(
        Desempenho_Mensal,
        ISBLANK(Desempenho_Mensal[SLA_Cumprido_Pct])
    )
)
```

```DAX
Incidentes Corrigidos =
CALCULATE(
    COUNTROWS(Desempenho_Mensal),
    FILTER(
        Desempenho_Mensal,
        ISBLANK(Desempenho_Mensal[Incidentes])
    )
)
```

## Observação

Algumas medidas adicionais foram criadas apenas para formatação de cartões com `FORMAT()`. As medidas numéricas originais foram mantidas para uso em gráficos, filtros e cálculos.
