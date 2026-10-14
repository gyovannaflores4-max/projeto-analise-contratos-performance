#!/usr/bin/env python3
"""
Robô de movimentações do Gabinete Digital.

Busca, para os processos da carteira:
  1. intimações publicadas no DJEN (Comunica PJe), pelo número da OAB e por número de processo;
  2. movimentações públicas do DataJud (CNJ), por número de processo.

Grava, na pasta do painel:
  - movimentacoes.json  (para importar à mão em Conexões, se preferir)
  - movimentacoes.js    (o painel carrega sozinho ao abrir, quando aberto pelo index.html)

Configuração: copie config.exemplo.json para config.json e preencha a OAB.
Uso:
    python3 robo.py                 # usa config.json
    python3 robo.py --dias 15       # olha 15 dias para trás no DJEN
Agendamento diário: veja agendar-windows.bat ou o README.

A API do DJEN só responde a acessos feitos do Brasil. O DataJud usa a chave pública
divulgada pelo CNJ; se ela mudar, defina DATAJUD_API_KEY com a chave nova da wiki.
"""
import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

PASTA = os.path.dirname(os.path.abspath(__file__))
CHAVE_DATAJUD = os.environ.get("DATAJUD_API_KEY", "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==")
URL_DATAJUD = "https://api-publica.datajud.cnj.jus.br/api_publica_{alias}/_search"
URL_DJEN = "https://comunicaapi.pje.jus.br/api/v1/comunicacao"
RE_CNJ = re.compile(r"(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})")
UF_TJ = {
    "01": "ac", "02": "al", "03": "ap", "04": "am", "05": "ba", "06": "ce", "07": "dft", "08": "es", "09": "go",
    "10": "ma", "11": "mt", "12": "ms", "13": "mg", "14": "pa", "15": "pb", "16": "pr", "17": "pe", "18": "pi",
    "19": "rj", "20": "rn", "21": "rs", "22": "ro", "23": "rr", "24": "sc", "25": "se", "26": "sp", "27": "to",
}


def log(msg: str) -> None:
    print(datetime.now().strftime("%H:%M:%S"), msg, flush=True)


def alias_tribunal(segmento: str, tr: str) -> str | None:
    """J.TR do número CNJ -> índice do DataJud."""
    if segmento == "8":
        return "tj" + UF_TJ[tr] if tr in UF_TJ else None
    if segmento == "5":
        return f"trt{int(tr)}"
    if segmento == "4":
        return f"trf{int(tr)}"
    if segmento == "3":
        return "stj"
    if segmento == "6":
        return "tre-" + UF_TJ[tr] if tr in UF_TJ else None
    return None


def numeros_do_texto(texto: str) -> list[str]:
    vistos, out = set(), []
    for m in RE_CNJ.finditer(texto):
        d = "".join(m.groups())
        if d not in vistos:
            vistos.add(d)
            out.append(d)
    return out


def ler_numeros(caminho: str) -> list[str]:
    if not caminho or not os.path.exists(caminho):
        return []
    if caminho.lower().endswith((".xlsx", ".xlsm")):
        import openpyxl  # pip install openpyxl

        wb = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
        texto = "\n".join(str(c) for ws in wb.worksheets for row in ws.iter_rows(values_only=True) for c in row if c)
    else:
        with open(caminho, encoding="utf-8") as f:
            texto = f.read()
    return numeros_do_texto(texto)


def http_json(url: str, corpo: dict | None = None, cabecalhos: dict | None = None, tentativas: int = 3):
    dados = json.dumps(corpo).encode() if corpo is not None else None
    h = {"Accept": "application/json", "User-Agent": "GabineteDigital-Robo/1.0"}
    if corpo is not None:
        h["Content-Type"] = "application/json"
    h.update(cabecalhos or {})
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, data=dados, headers=h, method="POST" if dados else "GET")
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code in (429, 502, 503, 504) and i < tentativas - 1:
                time.sleep(2 ** (i + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if i < tentativas - 1:
                time.sleep(2 ** (i + 1))
                continue
            raise


# ---------------------------------------------------------------- DataJud
def datajud(digitos: str) -> list[dict]:
    alias = alias_tribunal(digitos[13], digitos[14:16])
    if not alias:
        return []
    resp = http_json(
        URL_DATAJUD.format(alias=alias),
        {"query": {"match": {"numeroProcesso": digitos}}, "size": 5},
        {"Authorization": "APIKey " + CHAVE_DATAJUD},
    )
    out = []
    for hit in resp.get("hits", {}).get("hits", []):
        fonte = hit.get("_source", {})
        grau = fonte.get("grau", "")
        for mov in fonte.get("movimentos", []) or []:
            comp = "; ".join(
                f"{c.get('nome', '')}: {c.get('descricao', '')}".strip(": ")
                for c in mov.get("complementosTabelados", []) or []
            )
            texto = (mov.get("nome") or "").strip() + (f" ({comp})" if comp else "")
            if grau and grau != "G1":
                texto += f" [{grau}]"
            out.append({"data": (mov.get("dataHora") or "")[:10], "texto": texto, "origem": "datajud"})
    return out


# ---------------------------------------------------------------- DJEN
def _campo(item: dict, *nomes, padrao=""):
    for n in nomes:
        if item.get(n) not in (None, ""):
            return item[n]
    return padrao


def _limpa_html(t: str) -> str:
    t = re.sub(r"<br\s*/?>|</p>", "\n", t or "", flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"[ \t]+", " ", t)
    return re.sub(r"\n{2,}", "\n", t).strip()


def djen_itens(params: dict) -> list[dict]:
    itens, pagina = [], 1
    while True:
        q = dict(params, pagina=pagina, itensPorPagina=100)
        resp = http_json(URL_DJEN + "?" + urllib.parse.urlencode(q))
        lote = resp.get("items") or resp.get("itens") or []
        itens.extend(lote)
        total = resp.get("count") or resp.get("total") or len(itens)
        if not lote or len(itens) >= int(total) or pagina >= 20:
            return itens
        pagina += 1
        time.sleep(0.5)


def djen_para_mov(item: dict) -> tuple[str, dict]:
    numero = re.sub(r"\D", "", str(_campo(item, "numero_processo", "numeroProcesso", "numeroprocessocommascara")))
    data = str(_campo(item, "data_disponibilizacao", "dataDisponibilizacao", "datadisponibilizacao"))[:10]
    if re.match(r"\d{2}/\d{2}/\d{4}", data):
        d, m, a = data.split("/")
        data = f"{a}-{m}-{d}"
    tipo = _campo(item, "tipoComunicacao", "tipo_comunicacao", padrao="Comunicação")
    orgao = _campo(item, "nomeOrgao", "nome_orgao", padrao="")
    tribunal = _campo(item, "siglaTribunal", "sigla_tribunal", padrao="")
    texto = _limpa_html(str(_campo(item, "texto", "conteudo", padrao="")))
    if len(texto) > 700:
        texto = texto[:700].rsplit(" ", 1)[0] + "…"
    cab = " · ".join(x for x in (tipo, tribunal, orgao) if x)
    link = _campo(item, "link", padrao="")
    return numero, {"data": data, "texto": f"{cab}: {texto}" if texto else cab, "origem": "djen", "link": link}


def main() -> int:
    ap = argparse.ArgumentParser(description="Busca movimentações no DJEN e no DataJud.")
    ap.add_argument("--config", default=os.path.join(PASTA, "config.json"))
    ap.add_argument("--dias", type=int, help="dias para trás na busca do DJEN")
    ap.add_argument("--sem-datajud", action="store_true")
    ap.add_argument("--sem-djen", action="store_true")
    a = ap.parse_args()

    cfg = {}
    if os.path.exists(a.config):
        with open(a.config, encoding="utf-8") as f:
            cfg = json.load(f)
    else:
        log(f"Sem {a.config}: usando só os números de processo encontrados.")
    rel = lambda p: p if not p or os.path.isabs(p) else os.path.join(PASTA, p)
    dias = a.dias or int(cfg.get("dias_djen", 7))
    saida = rel(cfg.get("pasta_saida", ".."))
    numeros = ler_numeros(rel(cfg.get("numeros", "numeros-processos.txt"))) + ler_numeros(rel(cfg.get("planilha", "")))
    numeros = list(dict.fromkeys(numeros))
    carteira = set(numeros)

    resultado = {"fonte": "robo", "geradoEm": datetime.now(timezone.utc).isoformat(), "processos": {}, "novos": {}, "erros": []}
    add = lambda d, m: resultado["processos"].setdefault(d, []).append(m)

    # 1) DJEN pela OAB: pega também processos que ainda não estão na carteira
    if not a.sem_djen:
        fim, inicio = date.today(), date.today() - timedelta(days=dias)
        periodo = {"dataDisponibilizacaoInicio": inicio.isoformat(), "dataDisponibilizacaoFim": fim.isoformat()}
        oabs = cfg.get("oabs") or ([{"numero": cfg["oab"], "uf": cfg.get("uf", "")}] if cfg.get("oab") else [])
        for oab in oabs:
            try:
                itens = djen_itens(dict(periodo, numeroOab=re.sub(r"\D", "", str(oab["numero"])), ufOab=oab.get("uf", "").upper()))
                log(f"DJEN OAB {oab['numero']}/{oab.get('uf', '')}: {len(itens)} comunicação(ões) em {dias} dias")
                for it in itens:
                    num, mov = djen_para_mov(it)
                    if not num:
                        continue
                    add(num, mov)
                    if num not in carteira:
                        resultado["novos"].setdefault(num, {"tribunal": _campo(it, "siglaTribunal", padrao=""), "orgao": _campo(it, "nomeOrgao", padrao=""), "partes": _campo(it, "destinatarios", padrao="")})
            except Exception as e:  # noqa: BLE001 - registrar e seguir
                resultado["erros"].append(f"DJEN OAB {oab}: {e}")
                log(f"DJEN OAB {oab}: erro {e}")

    # 2) por número de processo (DJEN e DataJud)
    for i, d in enumerate(numeros, 1):
        if not a.sem_djen and not cfg.get("oab") and not cfg.get("oabs"):
            try:
                for it in djen_itens({"numeroProcesso": d}):
                    add(d, djen_para_mov(it)[1])
            except Exception as e:  # noqa: BLE001
                resultado["erros"].append(f"DJEN {d}: {e}")
        if not a.sem_datajud:
            try:
                for m in datajud(d):
                    add(d, m)
            except Exception as e:  # noqa: BLE001
                resultado["erros"].append(f"DataJud {d}: {e}")
        log(f"[{i}/{len(numeros)}] {d}: {len(resultado['processos'].get(d, []))} registro(s)")
        time.sleep(0.6)

    # remove repetidos dentro do mesmo processo
    for d, movs in resultado["processos"].items():
        vistos, unicos = set(), []
        for m in sorted(movs, key=lambda x: x["data"]):
            k = (m["data"], m["texto"][:120].lower())
            if k not in vistos:
                vistos.add(k)
                unicos.append(m)
        resultado["processos"][d] = unicos

    os.makedirs(saida, exist_ok=True)
    texto = json.dumps(resultado, ensure_ascii=False, indent=1)
    with open(os.path.join(saida, "movimentacoes.json"), "w", encoding="utf-8") as f:
        f.write(texto)
    with open(os.path.join(saida, "movimentacoes.js"), "w", encoding="utf-8") as f:
        f.write("// Gerado pelo robô em " + resultado["geradoEm"] + ". Não edite.\nwindow.GD_MOVIMENTACOES = " + texto + ";\n")
    total = sum(len(v) for v in resultado["processos"].values())
    log(f"Pronto: {total} registro(s) em {len(resultado['processos'])} processo(s), {len(resultado['novos'])} processo(s) fora da carteira, {len(resultado['erros'])} erro(s).")
    log("Abra o painel: as novidades entram sozinhas.")
    return 0 if not resultado["erros"] or total else 1


if __name__ == "__main__":
    sys.exit(main())
