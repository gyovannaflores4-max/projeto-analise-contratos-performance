"""Acompanha no PNCP as movimentações oficiais de pregões que não têm chat público
(por exemplo, os do Compras.gov.br, cujo chat exige captcha ou login gov.br).

A cada verificação compara com o que já foi visto e, quando algo muda, avisa por e-mail
e grava a movimentação em chats.json, para aparecer no chat do pregão no portal Pregão em Dia:

- situação da compra (divulgada, suspensa, revogada, anulada, homologada...);
- documentos novos publicados (retificação, esclarecimento, impugnação, decisão, ata, homologação...);
- situação e resultado de cada item (vencedor, CNPJ, valor homologado).

Pregões monitorados: variável PNCP_COMPRAS, separada por vírgula, no formato
"CNPJ-ANO-SEQUENCIAL=Nome", por exemplo
    24039073000155-2026-664=PE 90086/2026
Sem a variável, vale a lista PADRAO abaixo.

Usa as mesmas variáveis de e-mail de alerta_resenhas.py. --so-arquivo grava só o chats.json
(sem e-mail); TESTE_PNCP=1 manda um e-mail de teste com a situação atual.
"""

import json
import os
import sys
import time
import urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from pathlib import Path

from alerta_resenhas import USER_AGENT, abrir_issue, enviar_email, log

PADRAO = "24039073000155-2026-664=PE 90086/2026"
PNCP = "https://pncp.gov.br"
ESTADO = Path(__file__).with_name("estado_pncp.json")
ARQUIVO_CHATS = Path(__file__).with_name("chats.json")


def get_json(url, tentativas=3):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    for i in range(1, tentativas + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                corpo = r.read()
                return json.loads(corpo) if corpo else None
        except urllib.error.HTTPError as e:
            if e.code in (204, 404):
                return None
            if i == tentativas:
                raise
        except OSError:
            if i == tentativas:
                raise
        time.sleep(3 * i)


def data_br(iso):
    """'2026-07-13T07:03' -> '13/07/2026'"""
    return f"{iso[8:10]}/{iso[5:7]}/{iso[:4]}" if iso and len(iso) >= 10 else ""


def moeda(v):
    if v is None:
        return "—"
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def ler_compra(cnpj, ano, seq):
    base_c = f"{PNCP}/api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{seq}"
    base_p = f"{PNCP}/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{seq}"
    compra = get_json(base_c) or {}
    arquivos = get_json(base_p + "/arquivos") or []
    itens = get_json(base_p + "/itens?pagina=1&tamanhoPagina=200") or []
    foto = {
        "situacao": compra.get("situacaoCompraNome") or "",
        "valorHomologado": compra.get("valorTotalHomologado"),
        "arquivos": {},
        "itens": {},
    }
    for a in arquivos:
        if a.get("statusAtivo") is False:
            continue
        chave = str(a.get("sequencialDocumento"))
        foto["arquivos"][chave] = {
            "titulo": a.get("titulo") or "Documento",
            "tipo": a.get("tipoDocumentoNome") or "",
            "data": (a.get("dataPublicacaoPncp") or "")[:16],
            "url": a.get("url") or f"{base_p}/arquivos/{chave}",
        }
    for it in itens:
        n = str(it.get("numeroItem"))
        item = {"descricao": it.get("descricao") or "", "situacao": it.get("situacaoCompraItemNome") or "", "resultados": []}
        if it.get("temResultado"):
            for res in get_json(f"{base_p}/itens/{n}/resultados") or []:
                item["resultados"].append({
                    "fornecedor": res.get("nomeRazaoSocialFornecedor") or "",
                    "cnpj": res.get("niFornecedor") or "",
                    "valor": res.get("valorTotalHomologado"),
                    "situacao": res.get("situacaoCompraItemResultadoNome") or "",
                })
        foto["itens"][n] = item
    return compra, foto


def diferencas(nome, antes, agora):
    """Lista de textos com o que mudou (antes=None: primeira leitura)."""
    msgs = []
    if antes is None:
        msgs.append(f"Acompanhamento pelo PNCP iniciado. Situação atual: {agora['situacao']}.")
        for a in sorted(agora["arquivos"].values(), key=lambda x: x["data"]):
            msgs.append(f"Documento publicado: {a['tipo']} – {a['titulo']} ({data_br(a['data'])}). {a['url']}")
        for n, it in agora["itens"].items():
            msgs.append(f"Item {n} ({it['descricao']}): {it['situacao']}.")
            for r in it["resultados"]:
                msgs.append(f"Item {n}: resultado – {r['fornecedor']} ({r['cnpj']}), {moeda(r['valor'])}, {r['situacao']}.")
        return msgs
    if antes["situacao"] != agora["situacao"]:
        msgs.append(f"Situação da compra mudou de \"{antes['situacao']}\" para \"{agora['situacao']}\".")
    if antes.get("valorHomologado") != agora.get("valorHomologado") and agora.get("valorHomologado"):
        msgs.append(f"Valor total homologado: {moeda(agora['valorHomologado'])}.")
    for chave, a in agora["arquivos"].items():
        if chave not in antes["arquivos"]:
            msgs.append(f"Novo documento publicado: {a['tipo']} – {a['titulo']} ({data_br(a['data'])}). {a['url']}")
    for n, it in agora["itens"].items():
        velho = antes["itens"].get(n)
        if not velho or velho["situacao"] != it["situacao"]:
            msgs.append(f"Item {n} ({it['descricao']}): situação {'mudou para' if velho else 'é'} \"{it['situacao']}\".")
        vistos = {(r["cnpj"], r["valor"], r["situacao"]) for r in (velho or {}).get("resultados", [])}
        for r in it["resultados"]:
            if (r["cnpj"], r["valor"], r["situacao"]) not in vistos:
                msgs.append(f"Item {n}: resultado publicado – {r['fornecedor']} ({r['cnpj']}), {moeda(r['valor'])}, {r['situacao']}.")
    return msgs


def gravar_chats(entradas):
    """Acrescenta as movimentações ao chats.json lido pelo portal (sem mexer nos pregões do e-compras)."""
    dados = json.loads(ARQUIVO_CHATS.read_text()) if ARQUIVO_CHATS.exists() else {"pregoes": {}}
    mudou = False
    for chave, (nome, link, situacao, novas) in entradas.items():
        p = dados["pregoes"].setdefault(chave, {"edital": nome, "status": "", "objeto": "", "link": link, "mensagens": [], "fonte": "PNCP"})
        if p.get("status") != situacao:
            p["status"] = situacao
            mudou = True
        if novas:
            p["mensagens"] = novas + p["mensagens"]  # mais nova primeiro, como no e-compras
            mudou = True
    if mudou:
        dados["atualizado_em"] = datetime.now(timezone.utc).isoformat(timespec="seconds")
        ARQUIVO_CHATS.write_text(json.dumps(dados, ensure_ascii=False, indent=1) + "\n")
    return mudou


def main():
    so_arquivo = "--so-arquivo" in sys.argv
    teste = os.environ.get("TESTE_PNCP", "").strip() == "1"
    compras = [c.strip() for c in (os.environ.get("PNCP_COMPRAS") or PADRAO).split(",") if c.strip()]
    estado = json.loads(ESTADO.read_text()) if ESTADO.exists() else {"compras": {}}
    agora_txt = datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%d/%m/%Y %H:%M:%S")  # horário de Brasília
    entradas, avisos = {}, []

    for item in compras:
        ident, _, nome = item.partition("=")
        try:
            cnpj, ano, seq = ident.split("-")
            compra, foto = ler_compra(cnpj, ano, seq)
        except Exception as erro:
            log(f"{ident}: PNCP indisponível agora ({erro}); tento de novo depois.")
            continue
        nome = nome or f"Compra {seq}/{ano}"
        antes = estado["compras"].get(ident)
        msgs = diferencas(nome, antes, foto)
        log(f"{nome}: {foto['situacao']} · {len(foto['arquivos'])} documento(s) · {len(msgs)} movimentação(ões).")
        link = f"{PNCP}/app/editais/{cnpj}/{ano}/{seq}"
        entradas["pncp-" + ident] = (nome, link, foto["situacao"],
                                     [{"hora": agora_txt, "autor": "PNCP", "texto": m} for m in reversed(msgs)])
        if (msgs and antes is not None) or teste:
            avisos.append((nome, link, compra, foto, msgs))
        if not teste:
            estado["compras"][ident] = foto

    def salvar():
        if gravar_chats(entradas):
            log("chats.json atualizado com as movimentações do PNCP.")
        ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=1) + "\n")

    if so_arquivo:
        salvar()
        return 0

    if avisos:
        assunto = ("[TESTE] " if teste else "") + "[Alerta PNCP] " + ", ".join(f"{n}: {len(m)} movimentação(ões)" if m else n for n, _, _, _, m in avisos)
        linhas, md = [], []
        for nome, link, compra, foto, msgs in avisos:
            linhas += ["=" * 70, f"{nome} – {compra.get('orgaoEntidade', {}).get('razaoSocial', '')}", f"Situação: {foto['situacao']}", f"PNCP: {link}", ""]
            md += [f"### {nome}", "", f"- **Situação:** {foto['situacao']}", f"- **PNCP:** {link}", ""]
            for m in msgs or ["Sem mudanças desde a última verificação."]:
                linhas.append(">> " + m)
                md.append("- " + m)
            linhas.append("")
            md.append("")
        corpo = "Movimentações oficiais publicadas no PNCP.\n\n" + "\n".join(linhas)
        enviado = False
        try:
            enviado = enviar_email(assunto, corpo)
        except Exception as erro:
            log(f"Falha ao enviar e-mail: {erro}")
        if not enviado:
            try:
                enviado = abrir_issue(assunto, "Movimentações oficiais publicadas no PNCP.\n\n" + "\n".join(md))
            except Exception as erro:
                log(f"Falha ao abrir issue: {erro}")
        if teste:
            return 0
        if not enviado:
            log("Nenhum aviso saiu; as movimentações ficam para a próxima rodada.")
            return 0  # não grava nada, para avisar de novo sem repetir no portal

    if not teste:
        salvar()
    return 0


if __name__ == "__main__":
    sys.exit(main())
