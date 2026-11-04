# Pregão em Dia | portal de acompanhamento de licitações

Portal para a equipe de licitações acompanhar, num lugar só, tudo o que tem prazo: editais, propostas, chats dos pregões, recursos, documentos e cadastros nos portais de compras.

> Abre com **dados de exemplo 100% fictícios** (órgãos, empresas e mensagens inventados), para explorar à vontade. O botão **Começar com meus dados** apaga os exemplos.

## O que tem em cada tela

| Tela | Para que serve |
|---|---|
| **Painel** | Saudação com o resumo do dia, indicadores, prioridades, agenda dos próximos 7 dias, funil de editais, taxa de sucesso e últimas movimentações. Botão **Copiar resumo do dia** gera um texto pronto para o grupo da equipe. |
| **Editais** | Quadro (kanban) da triagem até o recurso: arraste os cartões entre as colunas. Também em lista, com busca e filtros. Cada edital tem gaveta de detalhes com datas, prazo de impugnação, checklist da proposta, anotações e histórico. Importa os dados de um edital por **qualquer link**: PNCP, Compras.gov.br (acompanhamento da compra), e-compras.AM, link direto do PDF ou ZIP do edital, ou a página do edital em outros portais. |
| **Propostas** | Contagem regressiva para cadastrar cada proposta, com checklist (planilha de custos, proposta assinada, declarações, documentos, conferência). Fica laranja com menos de 48 h. |
| **Formação de preço** | Planilha de custos de cada edital: itens (plantão, hora, mês, consulta…), profissionais × horas × valor da hora, outros custos por unidade, encargos, BDI no formato do TCU e tributos (lucro presumido, Simples ou lucro real). Mostra preço unitário e global, margem, desconto sobre o estimado, **alerta de inexequibilidade** (abaixo de 50% do estimado para serviços, IN SEGES 73/2022; os 75% da Lei 14.133 valem para obras e engenharia), **lance mínimo** (com o lucro mínimo que você define), ponto de equilíbrio, tabela de lances com a margem de cada degrau e simulador de lance. Traz os itens da última análise de edital, copia a planilha para o Excel e grava o valor como "nossa proposta". |
| **Chats dos pregões** | Conversa de cada pregão com destaque para retomada, suspensão, convocação, recurso, habilitação, diligência, resultado e desclassificação. Avisa quando o pregoeiro **cita a empresa** (nome, apelido ou CNPJ) e mostra a data de retomada informada. Pregões do **e-compras.AM** são lidos sozinhos; dos outros portais, cole as mensagens. |
| **Análise de edital** | Cole o texto ou envie o PDF. Extrai número, órgão, objeto, sessão, critério, modo de disputa, plataforma, valor, vigência, pagamento; calcula o prazo de impugnação; compara a habilitação exigida com a pasta de documentos (válido no dia da sessão?) e lista pontos de atenção (atestado acima de 50%, visita obrigatória, índices acima de 1, garantia, multa alta, prazo curto de convocação, falta de reajuste…). Tudo roda no navegador. |
| **Conferência automática** (dentro da Análise de edital) | A cada análise, o portal confere a própria leitura e mostra, antes do resumo, o que parece errado: data da sessão que não bate com outra data de "sessão/disputa" do edital, limite da proposta depois da sessão, tabela de itens que não foi lida ou que veio misturada com assinaturas e cronogramas, soma dos itens diferente do valor estimado, portal escolhido diferente do mais citado, e o que não foi encontrado. Os mesmos avisos aparecem ao importar um edital por link. |
| **Resumo para e-mail** (dentro da Análise de edital) | Monta o resumo no formato da equipe ("Dra. Cláudia, Boa tarde, Este processo trata-se da…"): modalidade e objeto; cidade, capital, distância por rodovia e tempo de viagem até a capital, e população (IBGE, estimativa mais recente); local e horários de execução; tabela de itens (item, descrição/equipe mínima, unidade, quantidade, valor unitário); valor global; data e hora; prazo de impugnação; portal. O texto é editável, o que não foi achado fica em amarelo, e o botão **Copiar resumo** cola no Outlook ou Gmail com a tabela formatada. |
| **Recursos e contrarrazões** | Linha do tempo de cada recurso com prazos em dias úteis (Lei 14.133/2021, art. 165) ou corridos (Lei 10.520/2002), descontando feriados. Calculadora de prazos de recurso e de impugnação. |
| **Documentos** | Certidões e documentos de cada empresa e filial, com validade, setor responsável, aviso em 30/15/7 dias (ajustável), aviso quando algo vence **antes de uma sessão marcada** e botão **Renovar**. Filtro por empresa, busca e documentos arquivados (filiais encerradas não geram alerta). **Importar planilha** lê o "Controle de Certidões" (.xlsx/.xlsm, uma aba por empresa): vale a coluna **Vencimento** ("IND" = sem vencimento) e, quando o mesmo documento aparece duas vezes na aba, fica a linha mais recente. Inscrições e referências bancárias não são lidas. |
| **Portais** | Cadastros nos portais de cada empresa e filial, com usuário, responsável e vencimento; resumo de vencidos e filtro por empresa. **Importar planilha** lê o controle de acessos (.xlsx, uma aba por empresa) e **ignora as colunas de senha, pergunta e resposta secreta**. O portal não guarda senhas. |
| **Central de alertas** | Todos os alertas agrupados por urgência, com "resolvido" e "lembrar amanhã", notificações do navegador, som e exportação da agenda em `.ics` (Google Agenda, Outlook). |
| **Resumo diário por e-mail** (em Ajustes) | Todo dia útil, a partir das 7h, o robô do GitHub manda um e-mail com as sessões da semana, propostas a cadastrar, último dia para impugnar, prazos de recurso e contrarrazões, documentos e portais vencendo e as mensagens dos chats nas últimas 24 h. Usa as mesmas regras de prazo do portal. Para ligar: **Gerar chave do robô** e cadastrar a chave no GitHub como segredo `PORTAL_CHAVE_ROBO`. |
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

Pregões do **Compras.gov.br** não têm chat público (o site pede captcha ou login gov.br), então o portal não lê as mensagens do pregoeiro sozinho. O robô acompanha esses pregões pelo **PNCP**: situação, documentos publicados e resultado de cada item entram no chat do pregão, marcados como "PNCP", e chegam por e-mail. As mensagens do pregoeiro continuam entrando por **Colar mensagens**.

O robô do GitHub grava as mensagens dos chats em `alerta-csc/chats.json` a cada verificação. O portal lê esse arquivo ao abrir e a cada 5 minutos, e junta tudo nos **Chats dos pregões**, com os mesmos destaques e alertas. Os pregões do robô aparecem com a etiqueta **Robô**; mensagem nova ou mudança de situação gera aviso na tela.

O endereço do arquivo fica em **Ajustes → Integrações → Arquivo do robô**. Funciona no portal publicado na Vercel, no `servidor-local.js` e até abrindo o `index.html` direto. Na versão publicada no Claude o navegador bloqueia acesso a outros sites, então ela mostra a cópia das mensagens feita no momento da publicação.

## Login e onde ficam os dados

O portal tem **login com e-mail e senha** (Supabase, projeto "Pregão em Dia"). Só e-mails da lista de autorizados conseguem criar conta; hoje, somente gyovannaflores4@gmail.com.

- **Primeiro acesso:** na tela de entrada, clique em **Primeiro acesso? Criar senha**, use o e-mail autorizado e escolha uma senha (mínimo 8 caracteres). Depois escolha começar vazio, com dados de exemplo ou levando o que já estava no navegador.
- **Vários computadores ao mesmo tempo:** antes de salvar, o portal confere se a nuvem tem algo mais novo e junta as duas versões (itens unidos pelo id, exclusões respeitadas, mensagens de chat unidas), em vez de sobrescrever.
- **Dados na nuvem:** editais, chats, recursos, documentos, portais e ajustes ficam no banco, na sua conta, e aparecem em qualquer computador ou celular em que você entrar. Cada conta só lê e grava os próprios dados (regras de segurança do banco). Uma cópia fica no navegador para abrir rápido.
- **API protegida:** `/api/chat` e `/api/pncp` só respondem para quem está logado.
- **Liberar outra pessoa:** no Supabase, SQL Editor: `insert into public.portal_permitidos (email) values ('nome@empresa.com.br');`
- **Esqueci a senha:** o link de recuperação usa o endereço configurado no Supabase em **Authentication → URL Configuration → Site URL**. Coloque ali o endereço do portal na Vercel.
- A estrutura do banco está em `supabase/estrutura.sql`. Sem o arquivo `assets/config.js`, o portal volta a funcionar sem login, só com o navegador.

O backup (Ajustes → Exportar backup) continua disponível como cópia extra.

## Arquivos

- `index.html`: estrutura da página e ícones.
- `assets/portal.css`: visual (tema claro e escuro, celular).
- `assets/app.js`: telas, alertas, monitoramento dos chats e formulários.
- `assets/analise.js`: leitura do edital e classificação das mensagens do chat.
- `assets/preco.js`: cálculo da formação de preço (BDI, tributos, lance mínimo, exequibilidade).
- `assets/util.js`: datas, dias úteis, feriados nacionais (inclui Páscoa móvel) e formatação.
- `assets/dados-exemplo.js`: dados fictícios e o edital de exemplo.
- `api/chat.js`: lê o chat público de um pregão no e-compras.AM (mesma lógica de `alerta-csc/alerta_chat.py`).
- `api/pncp.js`: importa um edital do PNCP pelo link.
- `api/importar.js`: importa por qualquer link (PNCP, Compras.gov.br pela UASG e número da compra, e-compras.AM, PDF/ZIP do edital ou página de outros portais). Só acessa endereços públicos.
- `api/municipio.js` e `api/_municipios.json`: dados da cidade do órgão para o resumo (população pelo IBGE/SIDRA, rota até a capital pelo OSRM, coordenadas dos 5.571 municípios).
- `servidor-local.js`: roda o portal e as APIs no seu computador.
- `testes/analise.test.js`: teste de regressão da Análise de edital com editais reais.
- `assets/config.js`: endereço e chave pública do Supabase (login e dados na nuvem).
- `api/_auth.js`: confere o login antes de responder nas APIs.
- `supabase/estrutura.sql`: tabelas e regras de segurança do banco.

## Teste da Análise de edital

Os editais que já deram problema ficam em `testes/editais/` (sem nomes e CPFs das assinaturas), com o resultado certo em `testes/esperado.json`. Antes de publicar qualquer mudança no leitor:

```bash
node testes/analise.test.js
```

Ao corrigir um edital novo, salve o texto dele em `testes/editais/`, rode `node testes/analise.test.js --atualizar`, confira o `esperado.json` e faça o commit junto.

## Observações

- A análise de edital é por regras de texto: ajuda a triar, mas não substitui a leitura do edital e do termo de referência.
- Prazos: a contagem exclui o dia do começo e inclui o do vencimento (art. 183 da Lei 14.133/2021). Confira sempre a regra do edital e cadastre os feriados estaduais e municipais em Ajustes.
- Formação de preço: os percentuais padrão (lucro presumido, ISS de 5%, BDI) são ponto de partida. Confira com a contabilidade da empresa e ajuste o ISS ao município.
- PDF escaneado (imagem) não tem texto para ler; nesse caso, copie o texto ou use um PDF pesquisável.
