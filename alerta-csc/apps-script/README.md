# Alerta de pregões no Google Apps Script (de 1 em 1 minuto)

Versão do alerta que roda **na sua conta Google**, sem depender do agendamento do GitHub:

- **A cada 1 minuto** (seg a sex, das 8h às 18h de Manaus) lê o chat dos pregões no e-compras.AM. Fora desse horário, a cada 15 minutos.
- **Mensagem nova no chat → e-mail na hora**, com todos os pregões que tiveram movimentação num e-mail só.
- **O pregoeiro marcou a volta da sessão → evento no Google Agenda** nesse dia e horário, com lembretes 60 e 15 minutos antes no celular. Entende "retomada a partir das 14h30min do dia 15/10/2026", "adiada para o dia 19/10/2026 às 12h (horário Brasília)", "11:00H (MANAUS)" etc.
- **A cada 5 minutos** olha as resenhas do CSC e avisa quando sai uma que cita os processos. É por ela que costuma vir a "Convocação para Nova Sessão Pública" dos pregões suspensos para recurso.
- O e-mail sai pelo seu próprio Gmail: não precisa de senha de app.

Arquivo: [`Codigo.gs`](Codigo.gs).

## Como instalar (uns 5 minutos)

1. Abra https://script.google.com com a sua conta Google e clique em **Novo projeto**.
2. Apague o que estiver no editor (`function myFunction() {...}`) e **cole todo o conteúdo do `Codigo.gs`**.
3. Se quiser que outras pessoas recebam os e-mails, troque a linha `EMAILS: '',` por, por exemplo, `EMAILS: 'voce@gmail.com,colega@empresa.com.br',`. Vazio manda só para você.
4. Clique no disquete (**Salvar**). Dê um nome ao projeto, por exemplo `Alerta pregões`.
5. Na barra de cima, no seletor de função, escolha **`instalar`** e clique em **Executar**.
6. O Google pede autorização: **Revisar permissões** → escolha sua conta → aparece "O Google não verificou este app" → clique em **Avançado** → **Acessar Alerta pregões (não seguro)** → **Permitir**. O aviso aparece porque o script é seu e não foi publicado; ele só acessa o seu Gmail (para enviar), a sua Agenda (para criar os eventos) e os sites do e-compras e do CSC.
7. Em alguns segundos chega o e-mail **"[Alerta e-compras] Alerta instalado"** com a situação de cada pregão e a próxima sessão já marcada no chat. Pronto: a partir daí ele roda sozinho.

Para testar a qualquer momento: escolha a função **`testar`** e clique em **Executar**. Chega um e-mail com as últimas mensagens dos três pregões, e a agenda não é alterada.

Para parar: escolha **`desinstalar`** e clique em **Executar**.

## Para o aviso chegar no celular na hora

- Instale o app **Gmail** e deixe as notificações ligadas. Se usar a aba Principal, marque os e-mails do alerta como importantes ou crie um filtro com o assunto `[Alerta e-compras]`.
- Instale o app **Google Agenda**: os lembretes dos eventos de retomada aparecem como notificação.

## Mudar os pregões

Edite a lista `PROCESSOS: ['328/26', '400/26', '408/26'],` no começo do código, salve e rode **`instalar`** de novo.

## Limites da conta grátis do Google

- **90 minutos de execução por dia** para os gatilhos. Cada leitura do chat leva uns 4 segundos, e o horário de 1 em 1 minuto foi escolhido para ficar dentro desse limite. Se passar, o Google manda um e-mail de erro e o alerta volta a rodar no dia seguinte.
- **100 destinatários de e-mail por dia.** Cada e-mail para 3 pessoas conta 3. Num dia de sessão ao vivo, com muitas mensagens no chat, pode chegar perto disso.
