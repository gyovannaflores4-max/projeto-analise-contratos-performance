"""Alerta do chat dos pregões no e-compras.AM.

Lê o chat público de acompanhamento de cada pregão monitorado e avisa por
e-mail sempre que aparece mensagem nova ou a situação do pregão muda (ex.:
"Suspensão Recursal" -> "Em Habilitação"). Todos os pregões com movimentação vão
num e-mail só; as mensagens importantes (retomada, suspensão, prazos, resultado)
vêm destacadas e a data/hora de retomada vai no assunto.

Usa as mesmas variáveis de ambiente de alerta_resenhas.py (PROCESSOS, SMTP_*,
EMAIL_TO, GITHUB_TOKEN). TESTE_CHAT=1 envia um e-mail de exemplo com as últimas
mensagens de todos os pregões, sem alterar o estado.
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
# Mensagens destacadas no alerta (comparadas sem acento e em minúsculas).
IMPORTANTE = re.compile(
    r"retom|reabert|reinici|prosseguimento|suspen|adia|prorrog|nova data|remarc"
    r"|a partir das|\d{1,2} ?h ?\d{0,2}|\d{1,2}:\d{2}|\d{2}/\d{2}/\d{4}"
    r"|sessao do chat aberta|recurso|contrarraz|habilit|vencedor|adjudic|homolog"
    r"|convoca|desclassific|diligencia|fracass|desert|revog|anula|cancel|prazo"
)
RETOMADA = re.compile(r"retom|reabert|reinici|prosseguimento|continuidade|adiad|remarcad|nova data")


def sem_acento(texto):
    texto = unicodedata.normalize("NFD", texto.lower())
    return "".join(c for c in texto if unicodedata.category(c) != "Mn")


def requisitar(url, dados=None, tentativas=4):
    """O e-compras derruba conexões com frequência: tenta de novo algumas vezes."""
    corpo = urllib.parse.urlencode(dados).encode() if dados else None
    req = urllib.request.Request(url, data=corpo, headers={"User-Agent": USER_AGENT})
    for tentativa in range(1, tentativas + 1):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
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
        if any(m["chave"] == chave for m in mensagens):
            continue  # o e-compras às vezes repete a mesma linha no mesmo segundo
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


def eventos(pregao, novas, status_antes):
    """Resumo curto do que aconteceu, para o assunto do e-mail."""
    saida = []
    if status_antes != pregao["status"]:
        saida.append(f"situação mudou para {pregao['status']}")
    if any(sem_acento(m["texto"]) == "sessao do chat aberta" for m in novas):
        saida.append("sessão reaberta")
    retomada = resumo_retomada([m for m in novas if eh_importante(m)])
    if retomada:
        saida.append(retomada)
    if not saida and novas:
        saida.append(f"{len(novas)} mensage{'m nova' if len(novas) == 1 else 'ns novas'}")
    return saida


def secao(pregao, novas, status_antes):
    link = BASE + f"licitacoes_acompanhamento.asp?ident={pregao['id']}"
    situacao = pregao["status"] + (
        f" (antes: {status_antes})" if status_antes != pregao["status"] else ""
    )
    texto = [
        "=" * 70,
        f"{pregao['edital']} - {pregao['objeto']}",
        f"Situação: {situacao}",
        f"Acompanhamento: {link}",
        "",
    ]
    md = [
        f"### {pregao['edital']} - {pregao['objeto']}",
        "",
        f"- **Situação:** {situacao}",
        f"- **Acompanhamento:** {link}",
        "",
    ]
    if not novas:
        texto.append("Sem mensagens novas no chat.")
        md.append("Sem mensagens novas no chat.")
    for msg in novas:
        marca = ">> " if eh_importante(msg) else "   "
        texto.append(f"{marca}{msg['hora']} - {msg['autor']}: {msg['texto']}")
        md.append(f"- `{msg['hora']}` **{msg['autor']}:** {msg['texto']}")
    texto.append("")
    md.append("")
    return texto, md


def montar_alerta(movimentos, parados, teste=False):
    """Um e-mail só, com todos os pregões que tiveram movimentação."""
    resumo = []
    for pregao, novas, status_antes in movimentos:
        detalhes = eventos(pregao, novas, status_antes)
        resumo.append(pregao["edital"] + (f" ({'; '.join(detalhes)})" if detalhes else ""))
    assunto = ("[TESTE] " if teste else "") + "[Alerta e-compras] Movimentação no chat: " + ", ".join(resumo)

    texto = [
        "Movimentação no chat dos pregões monitorados no e-compras.AM.",
        "Mensagens da mais recente para a mais antiga, no horário do e-compras.",
        "As marcadas com >> são as mais importantes (retomada, suspensão, prazos, resultado...).",
        "",
    ]
    md = ["Movimentação no chat dos pregões monitorados no e-compras.AM.", ""]
    for pregao, novas, status_antes in movimentos:
        t, m = secao(pregao, novas, status_antes)
        texto += t
        md += m
    if parados:
        texto += ["=" * 70, "Sem movimentação desde o último aviso:"]
        md += ["### Sem movimentação desde o último aviso", ""]
        for pregao in parados:
            texto.append(f"- {pregao['edital']}: {pregao['status']}")
            md.append(f"- {pregao['edital']}: {pregao['status']}")
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

    movimentos, parados, atualizacoes = [], [], {}
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

        if novas or status_antes != pregao["status"]:
            movimentos.append((pregao, novas, status_antes))
        else:
            parados.append(pregao)
        atualizacoes[pregao["id"]] = {
            "edital": pregao["edital"],
            "status": pregao["status"],
            "vistas": sorted(vistas | {m["chave"] for m in mensagens}),
        }

    if movimentos:
        enviado = avisar(*montar_alerta(movimentos, parados, teste))
        if teste:
            return 0
        if not enviado:
            # Nenhum canal funcionou: não marca como visto, para avisar na próxima rodada.
            for pregao, _, _ in movimentos:
                atualizacoes.pop(pregao["id"], None)

    alterado = False
    for ident, novo in atualizacoes.items():
        if estado["pregoes"].get(ident) != novo:
            estado["pregoes"][ident] = novo
            alterado = True
    if alterado and not teste:
        estado["atualizado_em"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
