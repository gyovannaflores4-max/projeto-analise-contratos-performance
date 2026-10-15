"""Alerta do chat dos pregões no e-compras.AM.

Lê o chat público de acompanhamento de cada pregão monitorado e avisa por
e-mail quando o pregoeiro ou o sistema publica algo importante: data e hora de
retomada, suspensão, reabertura da sessão, recurso, habilitação, resultado etc.
Também avisa quando a situação do pregão muda (ex.: "Suspensão Recursal" ->
"Em Habilitação").

Usa as mesmas variáveis de ambiente de alerta_resenhas.py (PROCESSOS, SMTP_*,
EMAIL_TO, GITHUB_TOKEN). TESTE_CHAT=1 envia um e-mail de exemplo com as últimas
mensagens do primeiro pregão, sem alterar o estado.
"""

import hashlib
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from alerta_resenhas import PROCESSOS_PADRAO, USER_AGENT, abrir_issue, enviar_email, log

BASE = "https://www.e-compras.am.gov.br/publico/"
ESTADO = Path(__file__).with_name("estado_chat.json")
COLUNAS = [
    "null", "edital", "cod_ug", "objeto", "status", "processo", "rp",
    "tipo_edital", "id_edital", "id_modalidade", "id_status", "modalidade",
]
# Mensagens que disparam o alerta (comparadas sem acento e em minúsculas).
IMPORTANTE = re.compile(
    r"retom|reabert|reinici|prosseguimento|suspen|adia|prorrog|nova data|remarc"
    r"|a partir das|\d{1,2} ?h ?\d{0,2}|\d{1,2}:\d{2}|\d{2}/\d{2}/\d{4}"
    r"|sessao do chat aberta|recurso|contrarraz|habilit|vencedor|adjudic|homolog"
    r"|convoca|desclassific|diligencia|fracass|desert|revog|anula|cancel|prazo"
)
RETOMADA = re.compile(r"retom|reabert|reinici|prosseguimento|continuidade")


def sem_acento(texto):
    texto = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in texto if unicodedata.category(c) != "Mn")


def requisitar(url, dados=None, tentativas=6):
    """O e-compras derruba conexões com frequência: tenta de novo algumas vezes."""
    corpo = urllib.parse.urlencode(dados).encode() if dados else None
    req = urllib.request.Request(url, data=corpo, headers={"User-Agent": USER_AGENT})
    for tentativa in range(1, tentativas + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("cp1252", "replace")
        except OSError:
            if tentativa == tentativas:
                raise
            time.sleep(3 * tentativa)


def buscar_pregao(processo):
    """'408/26' -> {'id': '256066', 'edital': 'PE 408/26', 'status': ..., 'objeto': ...}."""
    numero, ano = processo.strip().split("/")
    numero, ano = int(numero), ano[-2:]
    dados = {
        "periodo": f"20{ano}", "draw": "1", "start": "0", "length": "50",
        "order[0][column]": "1", "order[0][dir]": "desc",
        "search[value]": f"{numero}/{ano}", "search[regex]": "false",
    }
    for i, coluna in enumerate(COLUNAS):
        dados[f"columns[{i}][data]"] = coluna
        dados[f"columns[{i}][searchable]"] = "true"
    resposta = json.loads(requisitar(BASE + "qry/qry_licitacoes_todas.asp", dados))
    for linha in resposta.get("data", []):
        if re.fullmatch(rf"PE\s+0*{numero}/(20)?{ano}", (linha.get("edital") or "").strip()):
            return {
                "id": str(linha["id_edital"]),
                "edital": linha["edital"].strip(),
                "status": (linha.get("status") or "").strip(),
                "objeto": (linha.get("objeto") or "").strip(),
            }
    return None


def ler_chat(ident):
    """Mensagens do chat, da mais nova para a mais antiga."""
    pagina = requisitar(BASE + f"qry/qry_acompanhamento_mensagem_chat.asp?ident={ident}&limite=0")
    mensagens = []
    for linha in re.findall(r"<tr.*?</tr>", pagina, re.S | re.I):
        celulas = [
            re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
            for c in re.findall(r"<td.*?</td>", linha, re.S | re.I)
        ]
        if len(celulas) < 2:
            continue
        cabecalho = re.match(r"(\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2})\s*-\s*(.*?)\s*:?$", celulas[0])
        if not cabecalho:
            continue
        hora, autor = cabecalho.groups()
        texto = celulas[1]
        chave = hashlib.sha1(f"{hora}|{autor}|{texto}".encode()).hexdigest()[:12]
        mensagens.append({"hora": hora, "autor": autor, "texto": texto, "chave": chave})
    return mensagens


def eh_importante(msg):
    if sem_acento(msg["texto"]) == "sessao do chat fechada":
        return False
    return bool(IMPORTANTE.search(sem_acento(msg["texto"])))


def resumo_retomada(mensagens):
    """Procura 'retomada ... 14h30 ... 15/10/2026' nas mensagens novas."""
    for msg in mensagens:
        texto = sem_acento(msg["texto"])
        if not RETOMADA.search(texto):
            continue
        hora = re.search(r"\b(\d{1,2})(?:h(\d{2})?(?:min)?\b|:(\d{2}))", texto)
        data = re.search(r"\d{2}/\d{2}/\d{4}", texto)
        if hora or data:
            partes = []
            if data:
                partes.append(data.group(0))
            if hora:
                partes.append(f"às {int(hora.group(1)):02d}h{hora.group(2) or hora.group(3) or '00'}")
            return "retomada " + " ".join(partes)
    return ""


def montar_alerta(pregao, novas, status_antes):
    eventos = []
    if status_antes and status_antes != pregao["status"]:
        eventos.append(f"situação mudou para {pregao['status']}")
    if any(sem_acento(m["texto"]) == "sessao do chat aberta" for m in novas):
        eventos.append("sessão reaberta agora")
    retomada = resumo_retomada([m for m in novas if eh_importante(m)])
    if retomada:
        eventos.append(retomada)
    titulo = "; ".join(eventos) or "novas mensagens no chat"
    assunto = f"[Alerta e-compras] {pregao['edital']}: {titulo}"

    link = BASE + f"licitacoes_acompanhamento.asp?ident={pregao['id']}"
    texto = [
        f"{pregao['edital']} - {pregao['objeto']}",
        f"Situação: {pregao['status']}"
        + (f" (antes: {status_antes})" if status_antes and status_antes != pregao["status"] else ""),
        f"Acompanhamento: {link}",
        "",
        "Mensagens novas no chat (horário do e-compras, da mais recente para a mais antiga):",
        "",
    ]
    md = [
        f"**{pregao['edital']}** - {pregao['objeto']}",
        "",
        f"- **Situação:** {pregao['status']}",
        f"- **Acompanhamento:** {link}",
        "",
        "Mensagens novas no chat (horário do e-compras):",
        "",
    ]
    for msg in novas:
        marca = ">> " if eh_importante(msg) else "   "
        texto.append(f"{marca}{msg['hora']} - {msg['autor']}: {msg['texto']}")
        md.append(f"- `{msg['hora']}` **{msg['autor']}:** {msg['texto']}")
    return assunto, "\n".join(texto), "\n".join(md)


def avisar(assunto, corpo, corpo_md):
    log(f"\n{assunto}\n{corpo}\n")
    try:
        if enviar_email(assunto, corpo):
            return True
    except Exception as erro:
        log(f"Falha ao enviar e-mail: {erro}")
    try:  # sem e-mail configurado (ou com erro), o aviso vai como issue
        return abrir_issue(assunto, corpo_md)
    except Exception as erro:
        log(f"Falha ao abrir issue: {erro}")
        return False


def main():
    processos = [p for p in (os.environ.get("PROCESSOS") or PROCESSOS_PADRAO).split(",") if p.strip()]
    teste = os.environ.get("TESTE_CHAT", "").strip() == "1"
    estado = json.loads(ESTADO.read_text()) if ESTADO.exists() else {"pregoes": {}}
    alterado = False

    for processo in processos:
        try:
            pregao = buscar_pregao(processo)
            if not pregao:
                log(f"PE {processo}: não encontrado no e-compras.AM.")
                continue
            mensagens = ler_chat(pregao["id"])
        except Exception as erro:
            log(f"PE {processo}: e-compras.AM indisponível agora ({erro}); tento de novo depois.")
            continue

        salvo = estado["pregoes"].get(pregao["id"])
        vistas = set(salvo["vistas"]) if salvo else {m["chave"] for m in mensagens}
        status_antes = salvo["status"] if salvo else pregao["status"]
        novas = [m for m in mensagens if m["chave"] not in vistas]
        if teste:
            novas, status_antes = mensagens[:10], pregao["status"]
        log(f"{pregao['edital']} ({pregao['status']}): {len(mensagens)} mensagens, {len(novas)} novas.")

        mudou_status = status_antes != pregao["status"]
        if mudou_status or any(eh_importante(m) for m in novas):
            if not avisar(*montar_alerta(pregao, novas, status_antes)) and not teste:
                continue  # nenhum canal funcionou: tenta de novo na próxima rodada
        if teste:
            break

        novo = {
            "edital": pregao["edital"],
            "status": pregao["status"],
            "vistas": sorted(vistas | {m["chave"] for m in mensagens}),
        }
        if novo != salvo:
            estado["pregoes"][pregao["id"]] = novo
            alterado = True

    if alterado and not teste:
        estado["atualizado_em"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
