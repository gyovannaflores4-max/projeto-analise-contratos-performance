# Pregão em Dia | portal de acompanhamento de licitações

Portal para a equipe de licitações acompanhar, num lugar só, tudo o que tem prazo: editais, propostas, chats dos pregões, recursos, documentos e cadastros nos portais de compras.

> Abre com **dados de exemplo 100% fictícios** (órgãos, empresas e mensagens inventados), para explorar à vontade. O botão **Começar com meus dados** apaga os exemplos.

## O que tem em cada tela

| Tela | Para que serve |
|---|---|
| **Painel** | Saudação com o resumo do dia, indicadores, prioridades, agenda dos próximos 7 dias, funil de editais, taxa de sucesso e últimas movimentações. Botão **Copiar resumo do dia** gera um texto pronto para o grupo da equipe. |
| **Editais** | Quadro (kanban) da triagem até o recurso: arraste os cartões entre as colunas. Também em lista, com busca e filtros. Cada edital tem gaveta de detalhes com datas, prazo de impugnação, checklist da proposta, anotações e histórico. Importa os dados de um edital pelo link do **PNCP**. |
| **Propostas** | Contagem regressiva para cadastrar cada proposta, com checklist (planilha de custos, proposta assinada, declarações, documentos, conferência). Fica laranja com menos de 48 h. |
| **Chats dos pregões** | Conversa de cada pregão com destaque para retomada, suspensão, convocação, recurso, habilitação, diligência, resultado e desclassificação. Avisa quando o pregoeiro **cita a empresa** (nome, apelido ou CNPJ) e mostra a data de retomada informada. Pregões do **e-compras.AM** são lidos sozinhos; dos outros portais, cole as mensagens. |
| **Análise de edital** | Cole o texto ou envie o PDF. Extrai número, órgão, objeto, sessão, critério, modo de disputa, plataforma, valor, vigência, pagamento; calcula o prazo de impugnação; compara a habilitação exigida com a pasta de documentos (válido no dia da sessão?) e lista pontos de atenção (atestado acima de 50%, visita obrigatória, índices acima de 1, garantia, multa alta, prazo curto de convocação, falta de reajuste…). Tudo roda no navegador. |
| **Recursos e contrarrazões** | Linha do tempo de cada recurso com prazos em dias úteis (Lei 14.133/2021, art. 165) ou corridos (Lei 10.520/2002), descontando feriados. Calculadora de prazos de recurso e de impugnação. |
| **Documentos** | Certidões e documentos de habilitação com validade, aviso em 30/15/7 dias (ajustável), aviso quando algo vence **antes de uma sessão marcada** e botão **Renovar**. |
| **Portais** | Cadastros nos portais (SICAF, BLL, BNC, Licitações-e, Portal de Compras Públicas…), validade do cadastro e do plano. Não guarda senhas. |
| **Central de alertas** | Todos os alertas agrupados por urgência, com "resolvido" e "lembrar amanhã", notificações do navegador, som e exportação da agenda em `.ics` (Google Agenda, Outlook). |
| **Ajustes** | Dados da empresa, antecedência dos avisos, feriados locais, integrações e backup. |

## Como usar

### No computador, sem instalar nada

Abra `index.html` no navegador. Tudo funciona, menos a leitura automática do chat e a importação do PNCP (essas precisam das funções em `api/`).

### No computador, com tudo funcionando

Com o [Node.js 18+](https://nodejs.org) instalado:

```bash
cd portal-licitacoes
```

```bash
node servidor-local.js
```

Depois abra http://localhost:3000.

### Publicado na Vercel (gratuito)

Igual ao Radar de Licitações: em **Add New… → Project**, escolha este repositório e, em **Root Directory**, a pasta `portal-licitacoes`. Framework Preset: **Other**. Sem comando de build.

## Monitorar um pregão do e-compras.AM

Em **Chats dos pregões → Monitorar pregão**: escolha o portal **e-compras AM**, marque **Ler o chat automaticamente** e informe o número/ano (por exemplo `408/26`) **ou cole o link de acompanhamento** copiado da barra de endereço (por exemplo `https://www.e-compras.am.gov.br/publico/licitacoes_acompanhamento.asp?ident=256066`).

O link precisa terminar com o número interno do pregão. Um link com `ident=undefined` está quebrado (o próprio e-compras responde com erro): abra o pregão de novo pela lista do e-compras.AM e copie o endereço, ou use o número/ano. Com o portal aberto, o chat é lido a cada 5 minutos (ajustável) e chega aviso na tela, com som e notificação do navegador, sempre que aparece mensagem nova ou a situação do pregão muda.

O portal só lê enquanto está aberto. Para receber e-mail mesmo com o computador desligado, continua valendo o robô de `../alerta-csc` (GitHub Actions).

## Mensagens do robô (as mesmas dos e-mails) dentro do portal

O robô do GitHub grava as mensagens dos chats em `alerta-csc/chats.json` a cada verificação. O portal lê esse arquivo ao abrir e a cada 5 minutos, e junta tudo nos **Chats dos pregões**, com os mesmos destaques e alertas. Os pregões do robô aparecem com a etiqueta **Robô**; mensagem nova ou mudança de situação gera aviso na tela.

O endereço do arquivo fica em **Ajustes → Integrações → Arquivo do robô**. Funciona no portal publicado na Vercel, no `servidor-local.js` e até abrindo o `index.html` direto. Na versão publicada no Claude o navegador bloqueia acesso a outros sites, então ela mostra a cópia das mensagens feita no momento da publicação.

## Onde ficam os dados

No navegador de quem usa (localStorage). Cada pessoa e cada computador têm a sua cópia. Use **Ajustes → Exportar backup** para guardar e **Importar backup** para levar a outro computador.

## Arquivos

- `index.html`: estrutura da página e ícones.
- `assets/portal.css`: visual (tema claro e escuro, celular).
- `assets/app.js`: telas, alertas, monitoramento dos chats e formulários.
- `assets/analise.js`: leitura do edital e classificação das mensagens do chat.
- `assets/util.js`: datas, dias úteis, feriados nacionais (inclui Páscoa móvel) e formatação.
- `assets/dados-exemplo.js`: dados fictícios e o edital de exemplo.
- `api/chat.js`: lê o chat público de um pregão no e-compras.AM (mesma lógica de `alerta-csc/alerta_chat.py`).
- `api/pncp.js`: importa um edital do PNCP pelo link.
- `servidor-local.js`: roda o portal e as APIs no seu computador.

## Observações

- A análise de edital é por regras de texto: ajuda a triar, mas não substitui a leitura do edital e do termo de referência.
- Prazos: a contagem exclui o dia do começo e inclui o do vencimento (art. 183 da Lei 14.133/2021). Confira sempre a regra do edital e cadastre os feriados estaduais e municipais em Ajustes.
- PDF escaneado (imagem) não tem texto para ler; nesse caso, copie o texto ou use um PDF pesquisável.
