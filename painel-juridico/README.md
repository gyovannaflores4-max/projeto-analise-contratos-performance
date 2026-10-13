# Gabinete Digital

Software interno para o advogado acompanhar a carteira de processos da planilha
**Controle de Processos Judiciais e Atividades** com login, pauta automática,
prazos em dias úteis, ateliê de atas e recursos administrativos e conexões com
Google Agenda, Gmail, Outlook, WhatsApp, DJEN, tribunais e DataJud (CNJ).

> Este repositório é público: aqui fica só o código. A planilha e os dados dos
> clientes nunca são enviados para o GitHub; eles são importados no navegador
> do advogado (e, se ele usar o painel pelo claude.ai, ficam na conta dele).

## Como usar

1. Abra `index.html` no Chrome ou Edge (ou sirva a pasta: `python3 -m http.server`).
2. No primeiro acesso, crie a senha. O usuário padrão é **Flávio**.
3. Em **Conexões › Planilha Excel**, importe o arquivo `.xlsx`. Reimporte sempre
   que a planilha mudar: andamentos, tarefas e horas registrados no painel são preservados.

## O que o painel faz

| Área | Automação |
|---|---|
| **Hoje** | Pauta do dia com prazos atrasados, de hoje e da semana; próximos passos da planilha que ainda não têm data; indicadores; ideias e alertas (processos parados há mais de 45 dias, processos que parecem encerrados, teses repetidas como a exclusão da DIMPI-SCP do polo passivo, processos conexos do mesmo pregão). |
| **Processos** | Lista e quadro por fase, filtro por advogado, busca em andamentos. A ficha mostra o número CNJ decomposto (segmento, tribunal, origem, dígito verificador), links diretos para Comunica PJe, TJRJ, TJAM, PJe-JT e Jusbrasil, linha do tempo e e-mail/WhatsApp de atualização ao cliente já escritos. |
| **Registrar movimentação** | Ao descrever o que aconteceu, o painel atualiza a data, lê o texto e sugere o prazo: sentença (15 dias úteis ou 8 na Justiça do Trabalho), ED (5), contrarrazões, citação, recurso administrativo da Lei 14.133 (3 dias úteis), audiência, arquivamento (sugere encerrar). |
| **Prazos** | Contagem em dias úteis (CPC art. 219 e 224) com feriados nacionais, Carnaval, Sexta-feira Santa, Corpus Christi e recesso de 20/12 a 20/01 (art. 220). Calendário do mês e exportação `.ics`. Feriados locais e suspensões do tribunal precisam ser conferidos. |
| **Ateliê** | Ata de audiência/reunião (ditado por voz no navegador ou arquivo `.txt`, `.vtt`, `.srt`, `.docx` do Teams/Meet/Zoom), recurso administrativo, contrarrazões, impugnação ao edital, chamar o feito à ordem, embargos de declaração e relatório ao cliente. Minuta pronta offline ou redigida pelo Claude; extrai prazos da ata para a pauta; baixa em `.doc`. |
| **Horas** | Cronômetro por processo e lançamento manual, horas por cliente no mês (aba "Controle de atividades" da planilha). |
| **Conexões** | Importar/exportar a planilha atualizada, backup, Google Agenda, Gmail, Outlook, WhatsApp, DJEN, tribunais, Google Drive e o robô DataJud. |

## Robô de movimentações (DataJud/CNJ)

O navegador não pode consultar a API do CNJ diretamente, então o robô roda à parte:

```bash
# 1. No painel: Conexões › Exportar lista de números  → numeros-processos.txt
python3 robo/sincronizar_datajud.py numeros-processos.txt
# 2. No painel: Conexões › Importar movimentações     → movimentacoes.json
```

Movimentações novas entram na linha do tempo com a marca "robô DataJud", o
processo ganha o ponto de novidade e a mais recente vira tarefa com prazo sugerido.
Para rodar todo dia útil, agende o comando no Agendador de Tarefas ou no cron.

## Claude

Aberto pelo claude.ai, o painel usa o Claude para redigir atas e peças, analisar
um processo e sugerir ideias para a carteira, e sincroniza processos, tarefas,
peças e horas na conta do usuário. Aberto direto do arquivo, tudo funciona com
os modelos prontos e os dados ficam no navegador.

## Segurança

O login protege o uso no aparelho (senha com hash SHA-256 e sal no navegador).
Ele não substitui a proteção da conta: quem tem acesso ao computador desbloqueado
e às ferramentas do navegador pode ler os dados locais. Para uso em equipe, o
caminho é um backend com autenticação real.

## Testes

```bash
node --test painel-juridico/testes/nucleo.test.js
```

## Arquivos

- `index.html` – telas e estilo
- `nucleo.js` – regras puras: leitura da planilha, número CNJ, prazos, sugestões, ideias, links e `.ics`
- `app.js` – login, telas, armazenamento e integrações
- `robo/sincronizar_datajud.py` – consulta a API pública do DataJud
- `testes/` – testes do núcleo com dados fictícios
