"""Acompanha os pregões suspensos cadastrados no portal Equipe Comercial (aba Pregões suspensos).

Lê a lista no portal (com a chave do robô) e, para cada pregão, consulta a API do portal
(/api/suspensos), que junta PNCP e Portal de Compras Públicas. Manda e-mail quando:
- o pregão sai da suspensão ou muda de situação;
- aparece uma nova data;
- sai documento novo;
- o mesmo órgão publica edital com objeto parecido (possível republicação com outro número).

Roda junto com os outros alertas, mas consulta no máximo de hora em hora (INTERVALO_SUSPENSOS,
em minutos). Variáveis: PORTAL_CHAVE_ROBO, PORTAL_URL e as de e-mail de alerta_resenhas.py.
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from alerta_resenhas import USER_AGENT, abrir_issue, enviar_email, log
from resumo_diario import PORTAL_URL, ler_portal

ESTADO = Path(__file__).with_name("estado_suspensos.json")


def consultar(chave, item):
    pn = (item.get("dados") or {}).get("pncp") or {}
    q = {"ref": item["link"]}
    if pn.get("cnpj"):
        q["pncp"] = f"{pn['cnpj']}-{pn['ano']}-{pn['seq']}"
    url = PORTAL_URL.rstrip("/") + "/api/suspensos?" + urllib.parse.urlencode(q)
    req = urllib.request.Request(url, headers={"x-chave-robo": chave, "Accept": "application/json", "User-Agent": USER_AGENT})
    for tentativa in range(1, 3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (400, 401, 404):
                raise RuntimeError(json.loads(e.read() or b"{}").get("erro") or f"HTTP {e.code}")
            if tentativa == 2:
                raise
        except OSError:
            if tentativa == 2:
                raise
        time.sleep(5)


def data_br(iso):
    return f"{iso[8:10]}/{iso[5:7]}/{iso[:4]}" + (f" às {iso[11:16]}" if len(iso) >= 16 else "") if iso else ""


def mudancas(antes, d):
    """Lista do que mudou desde a última leitura (vazia na primeira, exceto republicação)."""
    saida = []
    suspenso = lambda x: "suspens" in (x.get("situacao") or "").lower()
    if antes:
        if suspenso(antes) and not suspenso(d):
            saida.append(f"SAIU DA SUSPENSÃO: agora está \"{d.get('situacao')}\"")
        elif antes.get("situacao") != d.get("situacao"):
            saida.append(f"situação mudou: {antes.get('situacao')} → {d.get('situacao')}")
        nova = (d.get("novaData") or {}).get("data")
        if nova and nova != antes.get("novaData"):
            saida.append(f"NOVA DATA: {data_br(nova)} ({(d.get('novaData') or {}).get('origem', '')})")
        docs_antes = set(antes.get("docs", []))
        for doc in d.get("documentos") or []:
            if f"{doc.get('titulo')}|{doc.get('data')}" not in docs_antes:
                saida.append(f"documento novo: {doc.get('titulo')} ({data_br(doc.get('data') or '')})")
    vistos = set((antes or {}).get("parecidos", []))
    for p in d.get("parecidos") or []:
        if p.get("linkPncp") not in vistos:
            saida.append(f"POSSÍVEL REPUBLICAÇÃO: {p.get('numero')} ({p.get('semelhanca')}% parecido), publicado em "
                         f"{data_br(p.get('publicacao') or '')}" + (f", sessão {data_br(p['sessao'])}" if p.get("sessao") else "")
                         + f" — {p.get('link')}")
    return saida


def main():
    chave = os.environ.get("PORTAL_CHAVE_ROBO", "").strip()
    if not chave:
        return log("Suspensos: segredo PORTAL_CHAVE_ROBO não configurado, pulando.")
    estado = json.loads(ESTADO.read_text(encoding="utf-8")) if ESTADO.exists() else {}
    intervalo = int(os.environ.get("INTERVALO_SUSPENSOS", "").strip() or 60) * 60
    ultima = estado.get("ultima_leitura")
    if ultima and time.time() - datetime.fromisoformat(ultima).timestamp() < intervalo and os.environ.get("TESTE_SUSPENSOS", "") != "1":
        return log("Suspensos: lidos há menos de uma hora.")
    try:
        lista = ler_portal(chave).get("suspensos") or []
    except Exception as erro:
        return log(f"Suspensos: não consegui ler o portal ({erro}).")
    if not lista:
        return log("Suspensos: nenhum pregão na aba Pregões suspensos.")

    pregoes = estado.get("pregoes", {})
    blocos = []
    for item in lista:
        try:
            d = consultar(chave, item)
        except Exception as erro:
            log(f"Suspensos: {item.get('link')}: {erro}")
            continue
        antes = pregoes.get(item["id"])
        novidades = mudancas(antes, d)
        log(f"{d.get('numero')} ({d.get('situacao')}): {len(novidades)} novidade(s).")
        if novidades:
            blocos.append((d, novidades, item))
        pregoes[item["id"]] = {
            "situacao": d.get("situacao"), "novaData": (d.get("novaData") or {}).get("data"),
            "docs": [f"{x.get('titulo')}|{x.get('data')}" for x in d.get("documentos") or []][-200:],
            "parecidos": sorted(set((antes or {}).get("parecidos", [])) | {p.get("linkPncp") for p in d.get("parecidos") or []}),
        }

    if blocos:
        assunto = "[Equipe Comercial] Pregões suspensos: " + "; ".join(
            f"{d.get('numero')} ({'republicação' if any('REPUBLICA' in n for n in nov) else 'saiu da suspensão' if any('SAIU' in n for n in nov) else 'nova data' if any('NOVA DATA' in n for n in nov) else 'movimentação'})"
            for d, nov, _ in blocos)
        linhas = ["Novidades nos pregões suspensos que a equipe acompanha:", ""]
        for d, nov, item in blocos:
            linhas += ["=" * 70, f"{d.get('numero')} - {d.get('orgao')} ({d.get('municipio')}/{d.get('uf')})",
                       f"Objeto: {(d.get('objeto') or '')[:220]}", f"Situação: {d.get('situacao')}"]
            if d.get("motivo"):
                linhas.append(f"Motivo da suspensão: {d['motivo'][:300]}")
            linhas += [f"- {n}" for n in nov] + [f"Link: {item.get('link')}", ""]
        linhas.append(f"Ver no portal: {PORTAL_URL.rstrip('/')}/#suspensos")
        corpo = "\n".join(linhas)
        enviado = False
        try:
            enviado = enviar_email(assunto, corpo)
        except Exception as erro:
            log(f"Falha ao enviar e-mail: {erro}")
        if not enviado:
            try:
                enviado = abrir_issue(assunto, corpo)
            except Exception as erro:
                log(f"Falha ao abrir issue: {erro}")
        if not enviado:  # não marca como visto: avisa de novo na próxima rodada
            return log("Suspensos: aviso não enviado; tento de novo depois.")

    estado = {"ultima_leitura": datetime.now(timezone.utc).isoformat(timespec="seconds"), "pregoes": pregoes}
    ESTADO.write_text(json.dumps(estado, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    sys.exit(main())
