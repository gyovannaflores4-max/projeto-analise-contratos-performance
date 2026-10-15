# Gestão de Prazos

Painel interno que substitui as planilhas de controle de **contratos**, **documentos e certidões** e **licitações**, com avisos automáticos por e-mail e Telegram. Fica no mesmo site do Radar de Licitações, no endereço `/gestao.html`, e é protegido por senha.

## O que ele faz

### Contratos
- Aviso antes do **vencimento** (padrão: 120, 90, 60, 30, 15, 7 dias e no dia).
- **Prazo para pedir a renovação**, informado em dias antes do vencimento (ex.: 90) ou como data exata.
- **Prazo para pedir o reajuste**, separado da renovação: a partir da data-base (data do orçamento ou do último reajuste) o sistema calcula o aniversário de cada ano, com tolerância opcional em dias e índice (IPCA, IGP-M, convenção coletiva…).
- Antecedência dos avisos configurável por contrato. Botões "Renovação pedida" e "Reajuste pedido" param os avisos daquele ciclo; o próximo ciclo começa sozinho.

### Documentos e certidões
- Aviso antes da validade de cada documento, com **antecedência própria por tipo** (ex.: CRF do FGTS 7, 3, 1 e 0 dias; CND Federal 30, 15, 7 e 0) ou definida em cada documento.
- Ao informar a data de emissão, sugere a validade típica (CND 180 dias, FGTS 30 dias…). A data que vale é a impressa no documento.
- Botão **Renovar** para registrar a nova certidão; link "Emitir" para o site de cada emissor.

### Licitações
- **Registro** de cada licitação com status, sessão, valor, portal, responsável e **histórico completo** (mudanças de status, mensagens, novidades do PNCP, anotações). Nada é apagado automaticamente: o histórico fica disponível por quanto tempo vocês quiserem (o banco gratuito comporta milhares de licitações).
- **Adicionar pelo PNCP:** cole o link do edital e os dados vêm preenchidos.
- **Acompanhamento automático pelo PNCP** a cada 30 minutos em horário comercial: avisa quando muda a situação da compra, sai ata, resultado ou novo documento, muda a data das propostas ou é publicado o valor homologado. Funciona para qualquer portal, porque todos publicam no PNCP.
- **Prazos** de intenção de recurso, razões, contrarrazões, impugnação, esclarecimento, proposta ajustada, habilitação, assinatura etc. Recurso e contrarrazões são calculados em **3 dias úteis** (Lei 14.133, art. 165), impugnação e esclarecimento em **3 dias úteis antes da sessão** (art. 164). Só feriados nacionais são descontados, então o prazo calculado nunca fica depois do real. Avisos 72, 24, 4 e 1 hora antes.
- **Mensagens dos portais:** os e-mails que os portais mandam quando o pregoeiro escreve no chat chegam ao painel pelo script do Gmail, são ligados à licitação certa, classificados (recurso, convocação/anexo, retorno de fase, suspensão, lances, resultado) e avisados na hora. Datas citadas na mensagem ("envie até 16/10 às 17h", "prazo de 2 horas") viram prazos "a conferir". Também dá para **colar o chat** na tela da licitação.

### Lances
Assistente que calcula o próximo lance dentro do valor mínimo e das reduções definidas por item, mostra a posição e conta o tempo da etapa aberta. Veja [AVALIACAO-LANCES.md](AVALIACAO-LANCES.md) sobre a automação completa.

### Avisos
- **E-mail** (Resend) para a lista da equipe e para os e-mails extras de cada registro, e **Telegram** (grupo da equipe).
- Cada aviso é enviado **uma vez por antecedência** (ex.: aos 30 dias, depois aos 15…). Itens vencidos são lembrados uma vez por semana até serem resolvidos.
- **Agenda (.ics):** botão "Baixar agenda" gera um arquivo com todos os prazos e lembretes para importar no Google Agenda ou Outlook.

### Importar as planilhas atuais
Em cada tela, **Importar planilha** aceita Excel (.xlsx) ou CSV. O sistema procura a linha de cabeçalho e reconhece nomes comuns de coluna ("Nº Contrato", "Órgão", "Fim da vigência", "Válida até", "Data da sessão", "Status"…). Antes de importar, mostra quais colunas usou e uma amostra. Importar a mesma planilha de novo atualiza os registros em vez de duplicar. **Exportar** gera CSV para o Excel.

## Como ligar (uma vez)

O site já publicado na Vercel ganha o painel assim que esta versão for publicada. Faltam o banco de dados, as senhas e os canais de aviso.

### 1. Senha e segredo dos robôs
Na Vercel: projeto **radar-licitacoes → Settings → Environment Variables**:

| Variável | Valor |
|---|---|
| `SENHA_PAINEL` | senha que a equipe vai usar para entrar |
| `CRON_SECRET` | um texto longo e aleatório (ex.: gere em https://www.uuidgenerator.net) |

### 2. Banco de dados gratuito (Upstash Redis)
Na Vercel: **Storage → Create Database → Upstash for Redis (Marketplace) → plano Free**, região São Paulo se houver, e conecte ao projeto. A Vercel cria sozinha as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`. Sem isso o painel funciona, mas os dados somem quando o servidor reinicia (o painel avisa).

### 3. E-mail (opcional, recomendado)
1. Crie conta em https://resend.com e gere uma **API key**.
2. Para enviar a qualquer e-mail da equipe, verifique o domínio da empresa em *Domains* (sem isso, o Resend só entrega para o e-mail dono da conta).
3. Na Vercel: `RESEND_API_KEY` e `EMAIL_REMETENTE` (ex.: `Prazos <prazos@suaempresa.com.br>`).

### 4. Telegram (opcional)
1. No Telegram, fale com **@BotFather**, envie `/newbot` e guarde o token. Na Vercel: `TELEGRAM_BOT_TOKEN`.
2. Crie um grupo da equipe, adicione o robô e envie `/start` no grupo.
3. Abra `https://api.telegram.org/bot<TOKEN>/getUpdates` e copie o número de `"chat":{"id": ...}` (costuma começar com `-100`). Cole em **Configurações → Chat do Telegram** no painel.

Depois de criar ou mudar variáveis, faça **Redeploy** na Vercel. Em **Configurações**, salve os e-mails da equipe e use **Enviar aviso de teste**.

### 5. Verificação a cada 30 minutos (GitHub Actions)
O cron da Vercel no plano gratuito roda uma vez por dia (8h). Para verificar o PNCP e os prazos de licitação a cada 30 minutos em horário comercial, no GitHub: **Settings → Secrets and variables → Actions → New repository secret**:
- `GESTAO_URL`: endereço do site (ex.: `https://radar-licitacoes.vercel.app`)
- `CRON_SECRET`: o mesmo valor da Vercel

O agendamento está em `.github/workflows/rotina-prazos.yml`.

### 6. Mensagens dos portais (Gmail)
1. Nos portais, ative as notificações por e-mail de mensagens do pregoeiro e mudanças de fase (o nome da opção muda em cada portal; no Compras.gov.br, favoritar a compra ou o item também ativa notificações).
2. Instale o script [integracoes/gmail-portais.gs](integracoes/gmail-portais.gs) na conta Google que recebe esses e-mails (passo a passo no começo do arquivo). Ele lê a caixa a cada 5 minutos.
3. Em cada licitação, preencha o número da compra no Compras.gov.br (vem sozinho quando a licitação é adicionada pelo PNCP) ou "Outros textos que identificam a licitação". Mensagens que o sistema não reconhecer aparecem em **Alertas → Mensagens sem licitação ligada**, para escolher a licitação.

**Limite importante:** o chat dos portais só é acessível com o login da empresa (testei no Compras.gov.br: as consultas de mensagens respondem "acesso negado" sem login e a consulta pública de itens usa captcha). Por isso o painel depende das notificações por e-mail que os próprios portais enviam. Se um portal não enviar e-mail de algum evento, cole o chat na tela da licitação.

### Custos
Upstash, Resend (até 3.000 e-mails/mês), Telegram, GitHub Actions e Google Apps Script têm planos gratuitos suficientes para este uso. **Atenção:** os termos da Vercel limitam o plano gratuito (Hobby) a uso pessoal e não comercial; para uso da empresa, o plano adequado é o Pro.

## Para desenvolver
- `regras.js`: datas, dias úteis, alertas, leitura de planilhas, mensagens e lances (usado pela página e pelo servidor).
- `gestao.html`: o painel.
- `api/dados.js` (cadastros), `api/rotina.js` (alertas e PNCP), `api/mensagens.js` (e-mails dos portais) e `api/_lib/`.
- Testes: `node --test testes/*.test.js`.
- Rodar local: `SENHA_PAINEL=teste node testes/servidor-local.js` e abrir http://localhost:3000/gestao.html (sem Upstash, os dados ficam na memória).
