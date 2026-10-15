# Alerta de resenhas do CSC/AM

Verifica a página de [resenhas do CSC/AM](https://www.csc.am.gov.br/site/resenhas) a cada 5 minutos. Quando sai uma resenha nova que cita um dos processos monitorados, ele:

1. **envia um e-mail** com o trecho da resenha sobre o processo (seção, objeto, prazos), o link do PDF e o texto completo;
2. **abre uma issue** neste repositório com o mesmo conteúdo. O GitHub manda um e-mail dessa issue para a dona do repositório, então o aviso chega mesmo antes de configurar o SMTP.

Processos monitorados hoje: **PE 328/2026, PE 400/2026 e PE 408/2026**.

- `alerta_resenhas.py`: lê a página, baixa o PDF de cada resenha nova e procura os processos.
- `estado.json`: resenhas já verificadas (o robô atualiza sozinho).
- `../.github/workflows/alerta-resenhas-csc.yml`: agenda a verificação no GitHub Actions.

## Como ativar

1. **Leve estes arquivos para a branch `main`** (faça o merge do pull request). O GitHub só roda agendamentos que estão na branch principal.
2. **Crie uma senha de app no Gmail** (precisa da verificação em duas etapas ativa): https://myaccount.google.com/apppasswords. Copie a senha de 16 letras.
3. No GitHub, abra **Settings → Secrets and variables → Actions → New repository secret** e crie:
   - `SMTP_USER`: o Gmail que vai enviar (ex.: `seuemail@gmail.com`);
   - `SMTP_PASS`: a senha de app do passo 2;
   - `EMAIL_TO` (opcional): quem recebe. Pode ser mais de um, separados por vírgula. Se ficar vazio, vai para o próprio `SMTP_USER`.
4. **Teste:** em **Actions → Alerta de resenhas do CSC → Run workflow**, marque *Reenviar o alerta...* e clique em **Run workflow**. Chega o e-mail da resenha mais recente que cita os processos.

Para usar outro provedor de e-mail, crie também `SMTP_HOST` e `SMTP_PORT` (465 para SSL, 587 para STARTTLS).

## Para mudar os processos

Em **Settings → Secrets and variables → Actions → Variables**, crie a variável `PROCESSOS` com a lista separada por vírgula, por exemplo `328/26,400/26,408/26,450/26`. Sem a variável, valem os três processos acima.

## Observações

- O GitHub pode atrasar alguns minutos as execuções agendadas em horários de pico.
- Se o repositório ficar 60 dias sem nenhum commit, o GitHub pausa o agendamento e avisa por e-mail; basta reativar em **Actions**.
- O processo é encontrado em qualquer formato usado nas resenhas: `408/2026`, `408/26`, `PE nº 408/2026–CSC` etc.
