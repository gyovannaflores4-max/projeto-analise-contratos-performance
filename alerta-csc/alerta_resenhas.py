"""Alerta de resenhas do CSC/AM.

Lê https://www.csc.am.gov.br/site/resenhas, abre o PDF de cada resenha nova e,
quando ela cita um dos processos monitorados, avisa por e-mail (SMTP) e abre
uma issue no GitHub com o trecho da resenha sobre o processo.

Variáveis de ambiente:
  PROCESSOS        processos monitorados, separados por vírgula (ex.: "328/26,400/26")
  SMTP_USER        conta que envia o e-mail (ex.: um Gmail)
  SMTP_PASS        senha de app dessa conta
  EMAIL_TO         destinatário(s), separados por vírgula (padrão: SMTP_USER)
  SMTP_HOST        padrão: smtp.gmail.com
  SMTP_PORT        padrão: 465 (SSL); 587 usa STARTTLS
  GITHUB_TOKEN     para abrir a issue (o Actions já fornece)
  GITHUB_REPOSITORY, GITHUB_REPOSITORY_OWNER (o Actions já fornece)
  TESTE            "1" reenvia o alerta da resenha mais recente que cita algum
                   processo monitorado, mesmo que ela já tenha sido vista
"""

import html
import io
import json
import os
import re
import smtplib
import ssl
import sys
import time
import urllib.request
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

from pdfminer.high_level import extract_text

BASE = "https://www.csc.am.gov.br"
PAGINA = BASE + "/site/resenhas"
ESTADO = Path(__file__).with_name("estado.json")
PROCESSOS_PADRAO = "328/26,400/26,408/26"
USER_AGENT = "Mozilla/5.0 (alerta-resenhas-csc; +https://github.com)"

# Rodapé repetido em cada página do PDF: fica fora do trecho do alerta.
RODAPE = re.compile(
    r"^(Publicado em:|https?://www\.csc\.am\.gov\.br/portal|csc@csc\.am\.gov\.br|Fone:"
    r"|Rua Belo Horizonte|Manaus\s*-\s*AM$|CEP:)",
    re.I,
)
MARCADOR_ITEM = re.compile(r"^\d+(\.\d+)?\)")
# Títulos de seção das resenhas: "Aviso de Licitação", "Marcação de Nova Data"...
PALAVRAS_TITULO = re.compile(
    r"^(Aviso|Marcação|Reabertura|Convocação|Suspensão|Revogação|Adiamento|Anulação"
    r"|Retificação|Errata|Resultado|Homologação|Adjudicação|Republicação|Prorrogação"
    r"|Cancelamento|Retomada|Alteração|Licitações?|\w+(ção|são))\b",
    re.I,
)


def log(msg):
    print(msg, flush=True)


def baixar(url, tentativas=3):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for tentativa in range(1, tentativas + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read()
        except OSError:
            if tentativa == tentativas:
                raise
            time.sleep(5 * tentativa)


def limpar_html(trecho):
    texto = re.sub(r"<[^>]+>", " ", trecho)
    return re.sub(r"\s+", " ", html.unescape(texto)).strip()


def ler_resenhas(pagina_html):
    """Devolve as resenhas da página, da mais nova para a mais antiga."""
    resenhas = []
    for bloco in pagina_html.split("<h3")[1:]:
        titulo = re.search(r">(.*?)</h3>", bloco, re.S)
        pdf = re.search(r'href="([^"]+\.pdf)"', bloco, re.I)
        if not titulo or "resenha" not in titulo.group(1).lower():
            continue
        data = re.search(r"<span[^>]*>(.*?)</span>", bloco, re.S)
        resumo = re.search(r"<p[^>]*>(.*?)</p>", bloco, re.S)
        pdf_url = urllib.request.urljoin(BASE, html.unescape(pdf.group(1))) if pdf else ""
        resenhas.append(
            {
                "titulo": limpar_html(titulo.group(1)),
                "data": limpar_html(data.group(1)) if data else "",
                "resumo": limpar_html(resumo.group(1)) if resumo else "",
                "pdf": pdf_url,
                "chave": pdf_url or limpar_html(titulo.group(1)),
            }
        )
    return resenhas


def padroes(processos):
    """'408/26' -> regex que aceita 408/26, 408/2026, 0408/2026, 408 / 2026."""
    saida = {}
    for proc in processos:
        numero, ano = proc.strip().split("/")
        ano = ano[-2:]
        saida[f"{int(numero)}/20{ano}"] = re.compile(
            rf"(?<![\d.,/])0*{int(numero)}\s*/\s*(?:20)?{ano}(?!\d)"
        )
    return saida


def texto_pdf(url):
    texto = extract_text(io.BytesIO(baixar(url)))
    linhas = []
    for linha in texto.splitlines():
        linha = re.sub(r"\s+", " ", linha).strip()
        # Corrige marcadores quebrados na extração, como ".- Limite" ou "ta- Limite".
        linha = re.sub(r"^[.\w]{0,3}-\s+(?=[A-ZÀ-Ú])", "- ", linha)
        if linha and not RODAPE.match(linha):
            linhas.append(linha)
    return linhas


def eh_titulo_secao(linhas, i):
    """Títulos como 'Marcação de Nova Data' ou 'Convocação para Nova Sessão Pública'."""
    linha = linhas[i]
    if len(linha) > 60 or linha[-1] in ";,.:)–-" or re.search(r"\d", linha):
        return False
    return bool(PALAVRAS_TITULO.match(linha))


def trecho_do_processo(linhas, i):
    """Junta o título da seção, o item que cita o processo e os prazos da seção."""
    secoes = [j for j in range(len(linhas)) if eh_titulo_secao(linhas, j)]
    fim_bloco = lambda j: (
        j in secoes or MARCADOR_ITEM.match(linhas[j]) or linhas[j].startswith("-")
    )

    inicio = i
    while inicio > 0 and not MARCADOR_ITEM.match(linhas[inicio]) and i - inicio < 3:
        if fim_bloco(inicio - 1) and not MARCADOR_ITEM.match(linhas[inicio - 1]):
            break
        inicio -= 1
    if not MARCADOR_ITEM.match(linhas[inicio]):
        inicio = i

    fim = i + 1
    while fim < len(linhas) and not fim_bloco(fim):
        fim += 1
    partes = [" ".join(linhas[inicio:fim])]

    # Prazos e observações ("- Limite para Recebimento...") que valem para a seção.
    j = fim
    while j < len(linhas) and j not in secoes and not linhas[j].startswith("-"):
        j += 1
    while j < len(linhas) and j not in secoes and not MARCADOR_ITEM.match(linhas[j]):
        if linhas[j].startswith("- Será sempre considerado"):
            partes.append(None)  # aviso padrão de horário de Brasília: fica de fora
        elif linhas[j].startswith("-"):
            partes.append(linhas[j])
        elif partes[1:] and partes[-1] is not None:
            partes[-1] += " " + linhas[j]
        j += 1
    partes = [p for p in partes if p]

    anteriores = [s for s in secoes if s < i]
    titulo = linhas[anteriores[-1]] if anteriores else ""
    return titulo, partes


def analisar(resenha, regras):
    linhas = texto_pdf(resenha["pdf"]) if resenha["pdf"] else []
    achados = {}
    for processo, regra in regras.items():
        trechos = []
        for i, linha in enumerate(linhas):
            if regra.search(linha):
                trecho = trecho_do_processo(linhas, i)
                if trecho not in trechos:
                    trechos.append(trecho)
        if not trechos and regra.search(resenha["resumo"]):
            trechos.append(("Resumo publicado no site", [resenha["resumo"]]))
        if trechos:
            achados[processo] = trechos
    return achados, "\n".join(linhas)


def montar_mensagem(resenha, achados, texto_completo):
    processos = ", ".join(achados)
    assunto = f"[Alerta CSC] {resenha['titulo']} cita {processos}"
    texto = [
        f"Nova resenha publicada pelo CSC/AM citando: {processos}",
        "",
        f"Resenha: {resenha['titulo']}",
        f"Data: {resenha['data']}",
        f"PDF: {resenha['pdf']}",
        f"Página: {PAGINA}",
        "",
    ]
    md = [
        f"Nova resenha publicada pelo CSC/AM citando **{processos}**.",
        "",
        f"- **Resenha:** {resenha['titulo']}",
        f"- **Data:** {resenha['data']}",
        f"- **PDF:** {resenha['pdf']}",
        "",
    ]
    for processo, trechos in achados.items():
        texto.append(f"=== {processo} ===")
        md.append(f"### {processo}")
        for titulo, partes in trechos:
            if titulo:
                texto.append(f"[{titulo}]")
                md.append(f"**{titulo}**")
            texto.extend(partes)
            md.extend(f"> {p}  " for p in partes)
            texto.append("")
            md.append("")
    texto += ["=== Texto completo da resenha ===", texto_completo or resenha["resumo"]]
    md += [
        "<details><summary>Texto completo da resenha</summary>",
        "",
        "```",
        texto_completo or resenha["resumo"],
        "```",
        "</details>",
    ]
    return assunto, "\n".join(texto), "\n".join(md)


def enviar_email(assunto, corpo):
    usuario = os.environ.get("SMTP_USER", "").strip()
    senha = os.environ.get("SMTP_PASS", "").strip()
    if not usuario or not senha:
        log("E-mail: SMTP_USER/SMTP_PASS não configurados, pulando.")
        return False
    destino = os.environ.get("EMAIL_TO", "").strip() or usuario
    host = os.environ.get("SMTP_HOST", "").strip() or "smtp.gmail.com"
    porta = int(os.environ.get("SMTP_PORT", "").strip() or 465)

    msg = EmailMessage()
    msg["Subject"] = assunto
    msg["From"] = usuario
    msg["To"] = destino
    msg.set_content(corpo)

    contexto = ssl.create_default_context()
    if porta == 465:
        servidor = smtplib.SMTP_SSL(host, porta, context=contexto, timeout=60)
    else:
        servidor = smtplib.SMTP(host, porta, timeout=60)
        servidor.starttls(context=contexto)
    with servidor:
        servidor.login(usuario, senha)
        servidor.send_message(msg)
    log(f"E-mail enviado para {destino}.")
    return True


def abrir_issue(assunto, corpo_md):
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    if not token or not repo:
        log("Issue: GITHUB_TOKEN/GITHUB_REPOSITORY ausentes, pulando.")
        return False
    dono = os.environ.get("GITHUB_REPOSITORY_OWNER", "").strip()
    if dono:
        corpo_md = f"@{dono}\n\n{corpo_md}"
    req = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/issues",
        data=json.dumps({"title": assunto, "body": corpo_md[:60000]}).encode(),
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        log(f"Issue aberta: {json.load(resp)['html_url']}")
    return True


def avisar(resenha, achados, texto_completo):
    assunto, corpo, corpo_md = montar_mensagem(resenha, achados, texto_completo)
    log(f"\n{assunto}\n{corpo}\n")
    enviado = False
    for canal in (lambda: enviar_email(assunto, corpo), lambda: abrir_issue(assunto, corpo_md)):
        try:
            enviado = canal() or enviado
        except Exception as erro:  # um canal falhar não impede o outro
            log(f"Falha ao avisar: {erro}")
    return enviado


def main():
    processos = (os.environ.get("PROCESSOS") or PROCESSOS_PADRAO).split(",")
    regras = padroes(p for p in processos if p.strip())
    teste = os.environ.get("TESTE", "").strip() == "1"

    try:
        pagina = baixar(PAGINA).decode("utf-8", "replace")
    except Exception as erro:
        log(f"Site do CSC indisponível agora ({erro}); tento de novo na próxima rodada.")
        return 0
    resenhas = ler_resenhas(pagina)
    if not resenhas:
        log("Nenhuma resenha encontrada na página: o layout do site pode ter mudado.")
        return 1

    estado = json.loads(ESTADO.read_text()) if ESTADO.exists() else None
    if estado is None:
        estado = {"vistos": {r["chave"]: r["titulo"] for r in resenhas}}
        log(f"Primeira execução: {len(resenhas)} resenhas atuais marcadas como vistas.")
    novas = [r for r in resenhas if r["chave"] not in estado["vistos"]]
    if teste:
        novas = resenhas
    log(f"Monitorando {', '.join(regras)}; {len(resenhas)} resenhas na página, {len(novas)} a verificar.")

    # Da mais antiga para a mais nova, para os alertas chegarem em ordem
    # (no teste, da mais nova para trás, até achar uma que cite os processos).
    for resenha in novas if teste else reversed(novas):
        try:
            achados, texto_completo = analisar(resenha, regras)
        except Exception as erro:
            log(f"Não consegui ler {resenha['titulo']} ({erro}); tento de novo depois.")
            continue
        if achados and not avisar(resenha, achados, texto_completo):
            if not teste:
                continue  # nenhum canal funcionou: não marca como vista
        log(f"{resenha['titulo']}: {', '.join(achados) or 'nenhum processo monitorado'}.")
        estado["vistos"][resenha["chave"]] = resenha["titulo"]
        if teste and achados:
            break

    estado["atualizado_em"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
    vistos_antes = json.loads(ESTADO.read_text())["vistos"] if ESTADO.exists() else {}
    if estado["vistos"] != vistos_antes:
        ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
