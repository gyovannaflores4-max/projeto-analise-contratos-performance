#!/usr/bin/env python3
"""
Robô de movimentações do Gabinete Digital.

Consulta a API Pública do DataJud (CNJ) para cada número de processo e grava
`movimentacoes.json`, que o painel importa em Conexões > Robô DataJud.
Movimentações novas entram na linha do tempo do processo e geram prazo sugerido.

Uso:
    python3 sincronizar_datajud.py numeros-processos.txt
    python3 sincronizar_datajud.py "Controle de Processos.xlsx"   # requer openpyxl

O arquivo .txt sai do próprio painel (Conexões > Exportar lista de números).
Para rodar todo dia, agende no Agendador de Tarefas (Windows) ou no cron:
    15 7 * * 1-5  cd /caminho/robo && python3 sincronizar_datajud.py numeros-processos.txt

Documentação da API: https://datajud-wiki.cnj.jus.br/api-publica/
A chave abaixo é a chave pública divulgada pelo CNJ; se ela mudar, defina
DATAJUD_API_KEY no ambiente com a chave nova publicada na wiki.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

CHAVE_PUBLICA = "cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=="
ENDPOINT = "https://api-publica.datajud.cnj.jus.br/api_publica_{alias}/_search"
RE_CNJ = re.compile(r"(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})")

UF_TJ = {
    "01": "ac", "02": "al", "03": "ap", "04": "am", "05": "ba", "06": "ce", "07": "dft", "08": "es", "09": "go",
    "10": "ma", "11": "mt", "12": "ms", "13": "mg", "14": "pa", "15": "pb", "16": "pr", "17": "pe", "18": "pi",
    "19": "rj", "20": "rn", "21": "rs", "22": "ro", "23": "rr", "24": "sc", "25": "se", "26": "sp", "27": "to",
}


def alias_tribunal(segmento: str, tr: str) -> str | None:
    """Converte J.TR do número CNJ no alias do índice do DataJud."""
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


def ler_numeros(caminho: str) -> list[str]:
    if caminho.lower().endswith((".xlsx", ".xlsm")):
        import openpyxl  # só necessário para ler a planilha direto

        wb = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
        texto = "\n".join(
            str(c) for ws in wb.worksheets for linha in ws.iter_rows(values_only=True) for c in linha if c
        )
    else:
        with open(caminho, encoding="utf-8") as f:
            texto = f.read()
    vistos, out = set(), []
    for m in RE_CNJ.finditer(texto):
        digitos = "".join(m.groups())
        if digitos not in vistos:
            vistos.add(digitos)
            out.append(digitos)
    return out


def consultar(digitos: str, chave: str) -> list[dict]:
    seg, tr = digitos[13], digitos[14:16]
    alias = alias_tribunal(seg, tr)
    if not alias:
        raise ValueError(f"tribunal não mapeado (J={seg}, TR={tr})")
    corpo = json.dumps({"query": {"match": {"numeroProcesso": digitos}}, "size": 5}).encode()
    req = urllib.request.Request(
        ENDPOINT.format(alias=alias),
        data=corpo,
        headers={"Authorization": "APIKey " + chave, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        dados = json.load(resp)
    movimentos = []
    for hit in dados.get("hits", {}).get("hits", []):
        fonte = hit.get("_source", {})
        grau = fonte.get("grau", "")
        orgao = (fonte.get("orgaoJulgador") or {}).get("nome", "")
        for mov in fonte.get("movimentos", []):
            nome = mov.get("nome", "").strip()
            complementos = "; ".join(
                f"{c.get('nome', '')}: {c.get('descricao', '')}".strip(": ")
                for c in mov.get("complementosTabelados", []) or []
            )
            texto = nome + (f" ({complementos})" if complementos else "")
            if grau and grau != "G1":
                texto += f" [{grau}{' - ' + orgao if orgao else ''}]"
            movimentos.append({"data": (mov.get("dataHora") or "")[:10], "texto": texto})
    movimentos.sort(key=lambda m: m["data"])
    return movimentos


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    chave = os.environ.get("DATAJUD_API_KEY", CHAVE_PUBLICA)
    numeros = ler_numeros(sys.argv[1])
    saida = sys.argv[2] if len(sys.argv) > 2 else "movimentacoes.json"
    print(f"{len(numeros)} número(s) para consultar.")
    resultado = {"fonte": "datajud", "geradoEm": datetime.now(timezone.utc).isoformat(), "processos": {}, "erros": {}}
    for i, digitos in enumerate(numeros, 1):
        try:
            movs = consultar(digitos, chave)
            resultado["processos"][digitos] = movs
            print(f"[{i}/{len(numeros)}] {digitos}: {len(movs)} movimentação(ões)")
        except (urllib.error.URLError, ValueError, TimeoutError) as e:
            resultado["erros"][digitos] = str(e)
            print(f"[{i}/{len(numeros)}] {digitos}: erro - {e}")
        time.sleep(0.6)  # respeita o limite de requisições da API pública
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=1)
    print(f"Gravado {saida}. Importe no painel em Conexões > Robô DataJud.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
