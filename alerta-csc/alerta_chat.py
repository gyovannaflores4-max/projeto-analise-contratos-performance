"""Alerta do chat dos pregões no e-compras.AM.

Lê o chat público de acompanhamento de cada pregão monitorado e avisa por
e-mail sempre que aparece mensagem nova ou a situação do pregão muda (ex.:
"Suspensão Recursal" -> "Em Habilitação"). Todos os pregões com movimentação vão
num e-mail só; as mensagens importantes (retomada, suspensão, prazos, resultado)
vêm destacadas e a data/hora de retomada vai no assunto.

Usa as mesmas variáveis de ambiente de alerta_resenhas.py (PROCESSOS, SMTP_*,
EMAIL_TO, GITHUB_TOKEN). TESTE_CHAT=1 envia um e-mail de exemplo com as últimas
mensagens de todos os pregões, sem alterar o estado.

Com PORTAL_CHAVE_ROBO (a mesma chave do resumo diário), os pregões do e-compras.AM com
proposta cadastrada no portal Pregão em Dia entram sozinhos no acompanhamento, junto com
PROCESSOS. O robô também lê o ranking de cada lote (empresas em ordem de valor, melhor lance,
habilitada, vencedora), avisa quando a posição da empresa muda e grava tudo em chats.json.
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
# Cópia das mensagens para o portal Pregão em Dia mostrar o mesmo conteúdo dos e-mails.
ARQUIVO_CHATS = Path(__file__).with_name("chats.json")
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
    texto = unicodedata.normalize("NFD", str(texto or "").lower())
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


def buscar_pregao(processo, orgao="", objeto=""):
    """'408/26', 'PE 408/26' ou 'DLE 061/26' -> {'id', 'edital', 'status', 'objeto'}.

    O mesmo número existe em vários órgãos (DLE 061/26 da FCECON, da FHAJ...): o órgão e o
    objeto do edital escolhem o certo."""
    m = re.fullmatch(r"([A-Z]{2,4})?(\d{1,5})/(\d{2,4})", re.sub(r"\s+", "", processo.upper()))
    if not m:
        return None
    pref, n_txt, ano = m.group(1) or "", m.group(2), m.group(3)[-2:]
    numero = int(n_txt)
    dados = {
        "periodo": f"20{ano}", "draw": "1", "start": "0", "length": "50",
        "order[0][column]": "1", "order[0][dir]": "desc",
        "search[value]": f"{n_txt}/{ano}", "search[regex]": "false",
    }
    for i, coluna in enumerate(COLUNAS):
        dados[f"columns[{i}][data]"] = coluna
        dados[f"columns[{i}][searchable]"] = "true"
    resposta = json.loads(requisitar(BASE + "qry/qry_licitacoes_todas.asp", dados))
    palavras = lambda t: {w for w in re.split(r"[^A-Z0-9]+", sem_acento(t).upper()) if len(w) >= 4}
    obj, org = palavras(objeto), sem_acento(orgao).upper()
    melhor, nota_melhor = None, -1
    for linha in resposta.get("data", []):
        mm = re.fullmatch(rf"([A-Z]{{2,4}})\s*0*{numero}/+(20)?{ano}", (linha.get("edital") or "").strip())
        if not mm or not str(linha.get("id_edital", "")).isdigit():
            continue
        nota = (10 if mm.group(1) == pref else -10) if pref else (2 if mm.group(1) == "PE" else 0)
        ug, nome_ug = sem_acento(linha.get("cod_ug")).upper(), sem_acento(linha.get("nome_ug")).upper()
        if org and ((ug and ug in org) or (nome_ug and (nome_ug in org or org in nome_ug))):
            nota += 6
        nota += min(len(palavras(linha.get("objeto")) & obj), 4)
        if not re.search(r"homologad|anulad|revogad|fracassad|desert", sem_acento(linha.get("status")).lower()):
            nota += 1
        if nota > nota_melhor:
            melhor, nota_melhor = linha, nota
    if not melhor or nota_melhor < 0:
        return None
    return {
        "id": str(melhor["id_edital"]),
        "edital": melhor["edital"].strip(),
        "status": (melhor.get("status") or "").strip(),
        "objeto": (melhor.get("objeto") or "").strip(),
    }


def limpar_html(trecho):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", trecho))).strip()


def ler_disputa(pagina):
    """Ranking de cada lote na página de acompanhamento (mesma leitura de portal-licitacoes/api/chat.js)."""
    situacao = (re.search(r'id="box_situacao">\s*\(([^)<]*)\)', pagina, re.I) or [None, ""])[1].strip()
    pagina = re.sub(r'<div id="ppItensLote2?-.*?</div>', "", pagina, flags=re.S | re.I)
    sinal = lambda td: {"verde": True, "vermelho": False}.get((re.search(r"sinal_(verde|vermelho|cinza)", td, re.I) or [None, ""])[1].lower())

    def valor(td):
        v = re.search(r"\d{1,3}(?:\.\d{3})*,\d{2}", limpar_html(td))
        return float(v.group(0).replace(".", "").replace(",", ".")) if v else None

    lotes = []
    for bloco in re.split(r'<div id="box_item-', pagina, flags=re.I)[1:]:
        numero = (re.search(r'class="ident_item">\s*([^<]+?)\s*<', bloco, re.I) or [None, ""])[1].strip()
        desc = [limpar_html(d) for d in re.findall(r'class="descricao_item"[^>]*>\s*(.*?)\s*</td>', bloco, re.S | re.I)]
        participantes = []
        for tr in re.findall(r'<tr[^>]*>\s*<td height="20"\s*>.*?</tr>', bloco, re.S | re.I):
            tds = re.findall(r"<td.*?</td>", tr, re.S | re.I)
            mm = re.match(r"(\d+)\s*-\s*(.+)$", limpar_html(tds[0])) if len(tds) >= 8 else None
            if not mm:
                continue
            participantes.append({
                "codigo": mm.group(1), "nome": mm.group(2).strip(), "vencedor": "trofeu" in tds[0].lower(),
                "exame1": sinal(tds[1]), "exame2": sinal(tds[2]), "valor": valor(tds[4]),
                "adjudicado": bool(re.search(r'color\s*=\s*"green"', tds[4], re.I)),
                "melhor": sinal(tds[5]), "negociado": valor(tds[6]), "habilitado": sinal(tds[7]),
            })
        lotes.append({"numero": numero, "nome": desc[0] if desc else f"Lote {numero}",
                      "situacao": desc[1] if len(desc) > 1 else "", "participantes": participantes,
                      "semLances": "Nenhuma empresa ofereceu lance" in bloco})
    return {"situacao": situacao, "lotes": lotes}


def pregao_por_ident(ident):
    pagina = requisitar(BASE + f"licitacoes_acompanhamento.asp?ident={ident}")
    texto = limpar_html(re.sub(r"<script.*?</script>|<style.*?</style>", " ", pagina, flags=re.S | re.I))
    m = re.search(r"Acompanhamento de Licita\S*\s+(.+?\d+/\d+)\s+-\s+(.+?)\s+\(([^()]+)\)\s+(.+?)\s+HOR[ÁA]RIO", texto, re.I)
    if not m:
        return None
    return {"id": str(ident), "edital": m.group(1).strip(), "objeto": m.group(2).strip(), "status": m.group(3).strip(),
            "disputa": ler_disputa(pagina)}


def termos_empresa(empresa):
    """Nomes da empresa e do grupo para achar no ranking (mesma regra do portal)."""
    termos = set()
    if empresa.get("apelido"):
        termos.add(sem_acento(empresa["apelido"]).lower().strip())
    palavras = [w for w in sem_acento(empresa.get("nome", "")).lower().split()
                if len(w) >= 5 and not re.search(r"servicos|medicos|ltda|eireli|saude|empresa|comercio|clinica|assistencia", w)]
    if palavras:
        termos.add(palavras[0])
    for linha in re.split(r"\n|;", empresa.get("grupo", "") or ""):
        linha = re.sub(r"\s+", " ", sem_acento(linha).lower()).strip()
        if len(linha) >= 3:
            termos.add(linha)
    return {t for t in termos if len(t) >= 3}


def posicao(disputa, termos):
    """'Lote 1: 6º de 13, habilitada, vencedora' para cada lote em que a empresa aparece."""
    if not disputa or not termos:
        return ""
    eh_nossa = lambda nome: any(re.search(rf"(^|[^a-z0-9]){re.escape(t)}([^a-z0-9]|$)", sem_acento(nome).lower()) for t in termos)
    partes = []
    for lote in disputa.get("lotes", []):
        ps = sorted(lote.get("participantes", []), key=lambda p: p.get("negociado") or p.get("valor") or 9e15)
        for i, p in enumerate(ps):
            if eh_nossa(p["nome"]):
                extra = [x for x in [
                    "melhor lance" if p.get("melhor") else "",
                    "habilitada" if p.get("habilitado") is True else "inabilitada" if p.get("habilitado") is False else "",
                    "vencedora" if p.get("vencedor") else "",
                ] if x]
                venc = next((x["nome"] for x in ps if x.get("vencedor") and x is not p), None)
                if venc:
                    extra.append(f"vencedora: {venc}")
                nome_lote = re.sub(r"\s+", " ", (lote.get("nome") or "Lote").split(",")[0]).strip()[:70]
                partes.append(f"{nome_lote}: {i + 1}º de {len(ps)}" + (", " + ", ".join(extra) if extra else ""))
                break
    return " · ".join(partes)


def pregoes_do_portal():
    """Pregões do e-compras.AM com proposta cadastrada no portal Pregão em Dia (ou em disputa em diante)."""
    chave = os.environ.get("PORTAL_CHAVE_ROBO", "").strip()
    if not chave:
        return [], set()
    try:
        from resumo_diario import ler_portal
        dados = ler_portal(chave)
    except Exception as erro:
        log(f"Portal: não consegui ler os editais ({erro}).")
        return [], set()
    finais = {"ganho", "perdido", "descartado"}
    chats = {c.get("editalId"): c for c in dados.get("chats") or [] if c.get("editalId")}
    saida = []
    for e in dados.get("editais") or []:
        e_compras = re.search(r"e-compras", e.get("portal") or "", re.I) or "e-compras.am.gov.br" in (e.get("link") or "")
        if not e_compras or e.get("etapa") in finais:
            continue
        if e.get("propostaStatus") != "cadastrada" and e.get("etapa") not in ("cadastrada", "disputa", "habilitacao", "recurso"):
            continue
        c = chats.get(e.get("id")) or {}
        ident = (re.search(r"ident=(\d+)", (e.get("link") or "") + " " + (c.get("processo") or "") + " " + (c.get("link") or "")) or [None, None])[1] \
            or (c.get("ident") if str(c.get("ident") or "").isdigit() else None)
        saida.append({"ident": ident, "numero": e.get("numero") or "", "orgao": e.get("orgao") or "", "objeto": e.get("objeto") or ""})
    return saida, termos_empresa(dados.get("empresa") or {})


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
    if pregao.get("posicao") and pregao.get("posicao") != pregao.get("posicao_antes"):
        saida.append("posição: " + pregao["posicao"])
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
    ] + ([f"Nossa posição: {pregao['posicao']}" + (f" (antes: {pregao['posicao_antes']})" if pregao.get("posicao_antes") and pregao.get("posicao_antes") != pregao["posicao"] else "")] if pregao.get("posicao") else []) + [
        f"Acompanhamento: {link}",
        "",
    ]
    md = [
        f"### {pregao['edital']} - {pregao['objeto']}",
        "",
        f"- **Situação:** {situacao}",
    ] + ([f"- **Nossa posição:** {pregao['posicao']}"] if pregao.get("posicao") else []) + [
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


def salvar_chats(lidos):
    """Grava chats.json (lido pelo portal). Só reescreve quando algo mudou, para não gerar commit à toa.

    lidos: {ident: (pregao, mensagens)}; pregões que não responderam nesta rodada mantêm o conteúdo anterior.
    """
    antigo = json.loads(ARQUIVO_CHATS.read_text()) if ARQUIVO_CHATS.exists() else {"pregoes": {}}
    pregoes = dict(antigo.get("pregoes", {}))
    for ident, (pregao, mensagens) in lidos.items():
        pregoes[ident] = {
            "edital": pregao["edital"],
            "status": pregao["status"],
            "objeto": pregao["objeto"],
            "disputa": pregao.get("disputa"),
            "link": BASE + f"licitacoes_acompanhamento.asp?ident={ident}",
            "mensagens": [{"hora": m["hora"], "autor": m["autor"], "texto": m["texto"]} for m in mensagens],
        }
    if pregoes == antigo.get("pregoes"):
        return False
    novo = {
        "fonte": "e-compras.AM (robô alerta-csc)",
        "atualizado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "pregoes": pregoes,
    }
    ARQUIVO_CHATS.write_text(json.dumps(novo, ensure_ascii=False, indent=1) + "\n")
    return True


def main():
    processos = [p for p in (os.environ.get("PROCESSOS") or PROCESSOS_PADRAO).split(",") if p.strip()]
    teste = os.environ.get("TESTE_CHAT", "").strip() == "1"
    so_arquivo = "--so-arquivo" in sys.argv  # só atualiza chats.json, sem e-mail e sem mexer no estado
    estado = json.loads(ESTADO.read_text()) if ESTADO.exists() else {"pregoes": {}}

    movimentos, parados, atualizacoes, lidos = [], [], {}, {}
    do_portal, termos = pregoes_do_portal()
    alvos = [{"ident": None, "numero": p.strip(), "orgao": "", "objeto": ""} for p in processos]
    for p in do_portal:  # sem repetir o que já está em PROCESSOS
        if not any(a["numero"] and re.sub(r"\D", "", a["numero"]) == re.sub(r"\D", "", p["numero"]) and not a["ident"] for a in alvos) or p["ident"]:
            alvos.append(p)
    if do_portal:
        log(f"Portal: {len(do_portal)} pregão(ões) do e-compras.AM com proposta cadastrada entram no acompanhamento.")
    vistos_ident = set()
    for alvo in alvos:
        rotulo = alvo["numero"] or f"ident {alvo['ident']}"
        try:
            ident = alvo["ident"]
            if not ident:
                achado = buscar_pregao(alvo["numero"], alvo["orgao"], alvo["objeto"])
                if not achado:
                    log(f"{rotulo}: não encontrado no e-compras.AM.")
                    continue
                ident = achado["id"]
            if ident in vistos_ident:
                continue
            vistos_ident.add(ident)
            pregao = pregao_por_ident(ident)
            if not pregao:
                log(f"{rotulo}: página de acompanhamento sem cabeçalho.")
                continue
            mensagens = ler_chat(pregao["id"])
        except Exception as erro:
            log(f"{rotulo}: e-compras.AM indisponível agora ({erro}); tento de novo depois.")
            continue
        pregao["posicao"] = posicao(pregao.get("disputa"), termos)

        lidos[pregao["id"]] = (pregao, mensagens)
        if so_arquivo:
            continue
        salvo = estado["pregoes"].get(pregao["id"])
        vistas = set(salvo["vistas"]) if salvo else {m["chave"] for m in mensagens}
        status_antes = salvo["status"] if salvo else pregao["status"]
        pregao["posicao_antes"] = salvo.get("posicao", "") if salvo else pregao["posicao"]
        novas = [m for m in mensagens if m["chave"] not in vistas]
        if teste:
            novas, status_antes = mensagens[:10], pregao["status"]
        log(f"{pregao['edital']} ({pregao['status']}): {len(mensagens)} mensagens, {len(novas)} novas.")

        if novas or status_antes != pregao["status"] or pregao["posicao"] != pregao["posicao_antes"]:
            movimentos.append((pregao, novas, status_antes))
        else:
            parados.append(pregao)
        atualizacoes[pregao["id"]] = {
            "edital": pregao["edital"],
            "status": pregao["status"],
            "posicao": pregao["posicao"],
            "vistas": sorted(vistas | {m["chave"] for m in mensagens}),
        }

    if lidos and salvar_chats(lidos):
        log("chats.json atualizado para o portal.")
    if so_arquivo:
        return 0

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
