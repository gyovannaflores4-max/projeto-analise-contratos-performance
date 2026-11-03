"""Resumo diário do Pregão em Dia por e-mail.

Lê os dados do portal no Supabase (editais, recursos, documentos, portais e chats) e manda,
uma vez por dia útil, um e-mail com o que pede ação: sessões do dia e da semana, propostas a
cadastrar, prazos de impugnação, recursos e contrarrazões, documentos e portais vencendo e
mensagens dos chats nas últimas 24 horas. Usa as mesmas regras de prazo do portal (dias úteis
da Lei 14.133, feriados nacionais, pontos facultativos e feriados locais cadastrados em Ajustes).

Variáveis:
    PORTAL_CHAVE_ROBO   chave gerada no portal (Ajustes → Resumo diário por e-mail). Segredo do GitHub.
    HORA_RESUMO         hora de Brasília a partir da qual o resumo sai (padrão 7).
    RESUMO_FIM_DE_SEMANA=1  manda também sábado e domingo.
    TESTE_RESUMO=1      manda agora, mesmo que já tenha mandado hoje.
    PORTAL_URL          endereço do portal (link no e-mail).
    + as variáveis de e-mail de alerta_resenhas.py (SMTP_USER, SMTP_PASS, EMAIL_TO...).

Para testar sem e-mail:  python resumo_diario.py --dados dados.json --previa resumo.html
"""

import html
import json
import os
import re
import sys
import urllib.request
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from alerta_resenhas import USER_AGENT, enviar_email, log

BRASILIA = ZoneInfo("America/Sao_Paulo")
ESTADO = Path(__file__).with_name("estado_resumo.json")
CONFIG_PORTAL = Path(__file__).resolve().parent.parent / "portal-licitacoes" / "assets" / "config.js"
PORTAL_URL = os.environ.get("PORTAL_URL", "").strip() or "https://projeto-analise-contratos-performan-phi.vercel.app/"

ETAPAS = {
    "triagem": "Triagem", "analise": "Em análise", "proposta": "Proposta em elaboração", "cadastrada": "Proposta cadastrada",
    "disputa": "Em disputa", "habilitacao": "Aceitação e habilitação", "recurso": "Fase recursal",
    "ganho": "Ganho", "perdido": "Perdido", "descartado": "Não vamos participar",
}
FINAIS = {"ganho", "perdido", "descartado"}
REC_FINAL = {"provido", "parcial", "improvido", "desistencia"}
PROP_NOME = {"nao_iniciada": "não iniciada", "elaborando": "em elaboração", "revisao": "em revisão", "cadastrada": "cadastrada"}
CHECK_PROPOSTA = 5

# ---------------------------------------------------------------- datas e dias úteis

def hoje():
    return datetime.now(BRASILIA).date()


def so_data(s):
    if not s:
        return None
    try:
        return date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def hora_de(s):
    m = re.search(r"T(\d{2}:\d{2})", str(s or ""))
    return m.group(1).replace(":", "h") if m else ""


def data_br(d, com_hora=None):
    if not d:
        return "—"
    t = f"{d.day:02d}/{d.month:02d}"
    if d.year != hoje().year:
        t += f"/{d.year}"
    return t + (f" às {com_hora}" if com_hora else "")


SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"]


def pascoa(ano):
    a, b, c = ano % 19, ano // 100, ano % 100
    d, e = b // 4, b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = c // 4, c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    mes = (h + l - 7 * m + 114) // 31
    dia = (h + l - 7 * m + 114) % 31 + 1
    return date(ano, mes, dia)


class Calendario:
    def __init__(self, ajustes):
        self.facultativos = ajustes.get("pontosFacultativos", True) is not False
        self.locais = []
        for linha in str(ajustes.get("feriadosLocais") or "").splitlines():
            m = re.match(r"^\s*(\d{1,2})/(\d{1,2})(?:/(\d{4}))?", linha)
            if m:
                self.locais.append((int(m.group(1)), int(m.group(2)), int(m.group(3)) if m.group(3) else None))
        self._cache = {}

    def feriados(self, ano):
        if ano not in self._cache:
            fixos = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"]
            s = {date.fromisoformat(f"{ano}-{md}") for md in fixos}
            p = pascoa(ano)
            s.add(p - timedelta(days=2))
            if self.facultativos:
                s |= {p - timedelta(days=48), p - timedelta(days=47), p + timedelta(days=60)}
            for dia, mes, a in self.locais:
                if a in (None, ano):
                    try:
                        s.add(date(ano, mes, dia))
                    except ValueError:
                        pass
            self._cache[ano] = s
        return self._cache[ano]

    def util(self, d):
        return d.weekday() < 5 and d not in self.feriados(d.year)

    def somar_uteis(self, d, n):
        c = 0
        while c < n:
            d += timedelta(days=1)
            if self.util(d):
                c += 1
        return d

    def subtrair_uteis(self, d, n):
        c = 0
        while c < n:
            d -= timedelta(days=1)
            if self.util(d):
                c += 1
        return d

    def somar_corridos(self, d, n):
        d += timedelta(days=n)
        while not self.util(d):
            d += timedelta(days=1)
        return d


def contagem(d):
    n = (d - hoje()).days
    if n < 0:
        return f"venceu há {-n} dia{'s' if n < -1 else ''}"
    if n == 0:
        return "hoje"
    if n == 1:
        return "amanhã"
    return f"em {n} dias ({SEMANA[d.weekday()]})"


def nivel(d, critico=1, atencao=3):
    n = (d - hoje()).days
    return "crit" if n <= critico else "warn" if n <= atencao else "info"


# ---------------------------------------------------------------- dados do portal

def config_supabase():
    url = os.environ.get("SUPABASE_URL", "").strip()
    chave = os.environ.get("SUPABASE_CHAVE", "").strip()
    if (not url or not chave) and CONFIG_PORTAL.exists():
        txt = CONFIG_PORTAL.read_text(encoding="utf-8")
        url = url or (re.search(r'supabaseUrl\s*:\s*"([^"]+)"', txt) or [None, ""])[1]
        chave = chave or (re.search(r'supabaseChave\s*:\s*"([^"]+)"', txt) or [None, ""])[1]
    return url.rstrip("/"), chave


def ler_portal(chave_robo):
    url, chave = config_supabase()
    if not url or not chave:
        raise RuntimeError("Endereço ou chave pública do Supabase não encontrados (portal-licitacoes/assets/config.js).")
    req = urllib.request.Request(
        url + "/rest/v1/rpc/portal_estado_robo",
        data=json.dumps({"chave": chave_robo}).encode(),
        headers={"apikey": chave, "Authorization": "Bearer " + chave, "Content-Type": "application/json",
                 "Accept": "application/json", "User-Agent": USER_AGENT},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        resp = json.loads(r.read() or b"null")
    if not resp or not resp.get("dados"):
        raise RuntimeError("A chave do robô não foi aceita. Gere outra no portal (Ajustes → Resumo diário por e-mail) "
                           "e atualize o segredo PORTAL_CHAVE_ROBO no GitHub.")
    return resp["dados"]


# ---------------------------------------------------------------- montagem do resumo

def montar(S):
    aj = S.get("ajustes") or {}
    cal = Calendario(aj)
    H = hoje()
    resolvidos = S.get("resolvidos") or {}

    def resolvido(i):
        r = resolvidos.get(i)
        return bool(r) and (r == "sempre" or H.isoformat() < str(r))

    editais = S.get("editais") or []
    ativos = [e for e in editais if e.get("etapa") not in FINAIS]
    precisa = lambda e: e.get("etapa") in ("triagem", "analise", "proposta") and e.get("propostaStatus") != "cadastrada"
    limite = lambda e: e.get("limiteProposta") or e.get("sessao")
    secoes = []

    # Sessões: hoje e próximos 7 dias
    sessoes = []
    for e in ativos:
        d = so_data(e.get("sessao"))
        if d and 0 <= (d - H).days <= 7:
            sessoes.append((e["sessao"], {
                "nivel": "crit" if d == H else "warn" if (d - H).days == 1 else "info",
                "titulo": f"{e.get('numero', '')} · {e.get('orgao', '')}",
                "quando": (("Hoje" if d == H else "Amanhã" if (d - H).days == 1 else f"{SEMANA[d.weekday()].capitalize()} {data_br(d)}")
                           + (f" às {hora_de(e['sessao'])}" if hora_de(e["sessao"]) else "")),
                "detalhe": " · ".join(x for x in [e.get("portal"), ETAPAS.get(e.get("etapa"), "")] if x),
            }))
    secoes.append(("Sessões públicas (próximos 7 dias)", [x for _, x in sorted(sessoes, key=lambda t: t[0])]))

    # Propostas a cadastrar
    props = []
    for e in ativos:
        lim = limite(e)
        d = so_data(lim)
        if not precisa(e) or not d or not (-2 <= (d - H).days <= max(7, int(aj.get("diasProposta") or 3))):
            continue
        feitos = sum(1 for v in (e.get("checklist") or {}).values() if v)
        props.append((lim, {
            "nivel": "crit" if (d - H).days < 0 else nivel(d),
            "titulo": f"{e.get('numero', '')} · {e.get('orgao', '')}",
            "quando": ("Prazo encerrado em " + data_br(d) + " (confira se foi enviada)") if (d - H).days < 0
            else f"Limite {data_br(d, hora_de(lim))} · {contagem(d)}",
            "detalhe": f"Proposta {PROP_NOME.get(e.get('propostaStatus'), 'não iniciada')} · checklist {feitos}/{CHECK_PROPOSTA}"
                       + (f" · nossa proposta {moeda(e.get('nossoValor'))}" if e.get("nossoValor") else ""),
        }))
    secoes.append(("Propostas a cadastrar", [x for _, x in sorted(props, key=lambda t: t[0])]))

    # Impugnação e esclarecimento (3 dias úteis antes da sessão)
    imps = []
    for e in ativos:
        d = so_data(e.get("sessao"))
        if e.get("etapa") in ("triagem", "analise", "proposta") and d:
            imp = cal.subtrair_uteis(d, 3)
            if 0 <= (imp - H).days <= 3:
                imps.append((imp, {"nivel": "warn" if imp == H else "info", "titulo": f"{e.get('numero', '')} · {e.get('orgao', '')}",
                                   "quando": f"Até {data_br(imp)} · {contagem(imp)}", "detalhe": "Impugnação ou pedido de esclarecimento (3 dias úteis antes da sessão)"}))
    secoes.append(("Último dia para impugnar", [x for _, x in sorted(imps, key=lambda t: t[0])]))

    # Recursos e contrarrazões
    recs = []
    for r in S.get("recursos") or []:
        p = prazo_recurso(r, cal)
        if not p:
            continue
        tipo, d, titulo = p
        n = (d - H).days
        if tipo == "decisao" and n > 5 or n < -5:
            continue
        recs.append((d, {"nivel": "info" if tipo in ("decisao", "acompanhar") else nivel(d), "titulo": f"{r.get('pregao', '')} · {titulo}",
                         "quando": f"{data_br(d)} · {contagem(d)}", "detalhe": r.get("orgao") or ""}))
    secoes.append(("Recursos e contrarrazões", [x for _, x in sorted(recs, key=lambda t: t[0])]))

    # Documentos
    dias_doc = sorted((int(x) for x in re.findall(r"\d+", ",".join(map(str, aj.get("diasDoc"))) if isinstance(aj.get("diasDoc"), list) else str(aj.get("diasDoc") or "30,15,7")) if int(x) > 0), reverse=True)
    maior = dias_doc[0] if dias_doc else 30
    sessoes_futuras = sorted((e for e in ativos if so_data(e.get("sessao")) and so_data(e["sessao"]) >= H), key=lambda e: e["sessao"])
    docs, vencidos_antigos = [], 0
    for doc in S.get("documentos") or []:
        d = so_data(doc.get("validade"))
        if doc.get("arquivado") or not d or resolvido(f"doc:{doc.get('id')}:{doc.get('validade')}"):
            continue
        n = (d - H).days
        if n > maior:
            continue
        if n < -30:
            vencidos_antigos += 1
            continue
        afeta = next((e for e in sessoes_futuras if so_data(e["sessao"]) > d), None)
        empresa = re.sub(r"\s*[-–(]?\s*\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\)?\s*$", "", str(doc.get("empresa") or "")).strip()
        docs.append((d, {"nivel": "crit" if n <= 7 else "warn", "titulo": doc.get("nome", "") + (f" ({empresa})" if empresa else ""),
                         "quando": ("Vencido em " if n < 0 else "Vence ") + (data_br(d) if n < 0 else f"{data_br(d)} · {contagem(d)}"),
                         "detalhe": (f"Antes da sessão do {afeta.get('numero')}" if afeta else "") + (" · " if afeta and doc.get("setor") else "") + (f"Setor: {doc['setor']}" if doc.get("setor") else "")}))
    # Todos os urgentes (vencidos ou até 7 dias) e, dos demais, os 10 mais próximos; o resto vai só contado.
    itens_docs = [x for _, x in sorted(docs, key=lambda t: t[0])]
    urgentes = [x for x in itens_docs if x["nivel"] == "crit"]
    proximos = [x for x in itens_docs if x["nivel"] != "crit"]
    docs_omitidos = max(0, len(proximos) - 10)
    secoes.append(("Documentos vencendo", urgentes + proximos[:10]))

    # Portais (cadastro e plano)
    dias_portal = int(aj.get("diasPortal") or 30)
    ports = []
    for p in S.get("portais") or []:
        for campo, rot in (("validadeCadastro", "Cadastro"), ("validadePlano", "Plano")):
            d = so_data(p.get(campo))
            if not d or resolvido(f"portal:{p.get('id')}:{campo}:{p.get(campo)}"):
                continue
            n = (d - H).days
            if -30 <= n <= dias_portal:
                ports.append((d, {"nivel": "crit" if n <= 7 else "warn", "titulo": f"{rot} · {p.get('nome', '')}" + (f" ({p['empresa']})" if p.get("empresa") else ""),
                                  "quando": ("Vencido em " + data_br(d)) if n < 0 else f"Vence {data_br(d)} · {contagem(d)}", "detalhe": p.get("cadastro") or ""}))
    secoes.append(("Portais vencendo", [x for _, x in sorted(ports, key=lambda t: t[0])]))

    # Chats: mensagens das últimas 24 horas
    agora = datetime.now(BRASILIA).replace(tzinfo=None)
    chats = []
    for c in S.get("chats") or []:
        novas = []
        for m in c.get("mensagens") or []:
            try:
                t = datetime.fromisoformat(str(m.get("hora"))[:16])
            except ValueError:
                continue
            if timedelta(0) <= agora - t <= timedelta(hours=24):
                novas.append((t, m))
        if novas:
            novas.sort(key=lambda x: x[0])
            ult = novas[-1][1]
            texto = re.sub(r"\s+", " ", str(ult.get("texto") or ""))
            chats.append((novas[-1][0], {"nivel": "info", "titulo": f"{c.get('titulo', '')} · {len(novas)} mensage{'ns' if len(novas) > 1 else 'm'}",
                                         "quando": f"Última às {novas[-1][0]:%H:%M} ({ult.get('autor') or 'sistema'})",
                                         "detalhe": texto[:220] + ("…" if len(texto) > 220 else "")}))
    secoes.append(("Chats dos pregões (últimas 24 h)", [x for _, x in sorted(chats, key=lambda t: t[0], reverse=True)]))

    return {"secoes": secoes, "vencidos_antigos": vencidos_antigos, "docs_omitidos": docs_omitidos, "dias_doc": maior, "empresa": (S.get("empresa") or {}).get("nome") or ""}


def prazo_recurso(r, cal):
    if r.get("status") in REC_FINAL or not so_data(r.get("dataIntencao")):
        return None
    di = so_data(r["dataIntencao"])
    dc = so_data(r.get("dataContrarrazoes"))
    if r.get("regime") == "10520":
        razoes = cal.somar_corridos(di, 3)
        contra = cal.somar_corridos(dc or razoes, 3)
        decisao = None
    else:
        razoes = cal.somar_uteis(di, 3)
        contra = cal.somar_uteis(dc or razoes, 3)
        decisao = cal.somar_uteis(cal.somar_uteis(contra, 3), 10)
    papel, st = r.get("papel"), r.get("status")
    if papel == "recorrente" and st == "intencao":
        return ("razoes", razoes, "Protocolar as razões do recurso")
    if papel == "recorrida" and st in ("intencao", "razoes"):
        return ("contrarrazoes", contra, "Apresentar contrarrazões")
    if papel == "terceiro" and st in ("intencao", "razoes"):
        return ("acompanhar", contra, "Fim do prazo de contrarrazões")
    return ("decisao", decisao, "Decisão do recurso (estimativa)") if decisao else None


def moeda(v):
    try:
        v = float(v)
    except (TypeError, ValueError):
        return "—"
    return "R$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


# ---------------------------------------------------------------- e-mail

CORES = {"crit": ("#C2342A", "#FBE3E0"), "warn": ("#9C5A00", "#FCEFD3"), "info": ("#2D5DBA", "#E3EBFB")}


def assunto(r):
    H = hoje()
    cont = {t: len(i) for t, i in r["secoes"]}
    partes = []
    hoje_sess = sum(1 for i in r["secoes"][0][1] if i["quando"].startswith("Hoje"))
    if hoje_sess:
        partes.append(f"{hoje_sess} sessão hoje" if hoje_sess == 1 else f"{hoje_sess} sessões hoje")
    for titulo, sing, plur in (("Propostas a cadastrar", "proposta", "propostas"), ("Recursos e contrarrazões", "prazo de recurso", "prazos de recurso"),
                               ("Documentos vencendo", "documento", "documentos")):
        n = cont.get(titulo, 0) + (r["docs_omitidos"] if titulo == "Documentos vencendo" else 0)
        if n:
            partes.append(f"{n} {sing if n == 1 else plur}")
    return f"Pregão em Dia | Resumo de {SEMANA[H.weekday()]} {data_br(H)}" + (": " + ", ".join(partes) if partes else ": nada urgente")


def texto_simples(r):
    l = [f"Resumo do Pregão em Dia, {data_br(hoje())}", ""]
    for titulo, itens in r["secoes"]:
        if not itens:
            continue
        l.append(titulo.upper())
        for i in itens:
            l.append(f"• {i['titulo']}")
            l.append(f"  {i['quando']}" + (f" · {i['detalhe']}" if i["detalhe"] else ""))
        l.append("")
    if r["docs_omitidos"]:
        l.append(f"E mais {r['docs_omitidos']} documento(s) vencendo nos próximos {r['dias_doc']} dias: veja a lista completa no portal.")
        l.append("")
    if r["vencidos_antigos"]:
        l.append(f"Há ainda {r['vencidos_antigos']} documento(s) vencido(s) há mais de 30 dias. Arquive no portal os que não usa mais.")
        l.append("")
    if not any(i for _, i in r["secoes"]):
        l += ["Nada pede ação hoje. Bom trabalho!", ""]
    l.append("Abrir o portal: " + PORTAL_URL)
    return "\n".join(l)


def html_email(r):
    e = html.escape
    H = hoje()
    blocos = []
    total = 0
    for titulo, itens in r["secoes"]:
        if not itens:
            continue
        total += len(itens)
        linhas = "".join(
            f'<tr><td style="padding:10px 0;border-top:1px solid #E3E8E8;vertical-align:top;width:10px">'
            f'<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:{CORES[i["nivel"]][0]};margin-top:6px"></span></td>'
            f'<td style="padding:10px 0 10px 10px;border-top:1px solid #E3E8E8">'
            f'<div style="font-weight:600;color:#15292B">{e(i["titulo"])}</div>'
            f'<div style="font-size:13px;color:{CORES[i["nivel"]][0] if i["nivel"] != "info" else "#3E5457"};margin-top:2px">{e(i["quando"])}</div>'
            + (f'<div style="font-size:13px;color:#5B7275;margin-top:2px">{e(i["detalhe"])}</div>' if i["detalhe"] else "")
            + "</td></tr>" for i in itens)
        blocos.append(
            f'<tr><td style="padding:18px 22px 6px"><div style="font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#0D6E6A">'
            f'{e(titulo)} <span style="color:#8A9C9E">({len(itens)})</span></div>'
            f'<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px">{linhas}</table></td></tr>')
    if r["docs_omitidos"]:
        blocos.append(f'<tr><td style="padding:4px 22px 0;font-size:13px;color:#5B7275">E mais {r["docs_omitidos"]} documento(s) vencendo nos próximos {r["dias_doc"]} dias: '
                      f'veja a lista completa em <a href="{e(PORTAL_URL)}#documentos" style="color:#0D6E6A">Documentos</a>.</td></tr>')
    if r["vencidos_antigos"]:
        blocos.append(f'<tr><td style="padding:12px 22px;font-size:13px;color:#5B7275">Há ainda {r["vencidos_antigos"]} documento(s) vencido(s) há mais de 30 dias. '
                      "Arquive no portal os que não usa mais (filiais encerradas, por exemplo) para eles saírem do resumo.</td></tr>")
    if not total:
        blocos.append('<tr><td style="padding:22px;color:#3E5457">Nada pede ação hoje. Bom trabalho!</td></tr>')
    return (
        '<!doctype html><html><body style="margin:0;background:#F1F5F4;font-family:Segoe UI,Arial,sans-serif;color:#15292B">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F1F5F4;padding:20px 10px"><tr><td align="center">'
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#FFFFFF;border-radius:14px;overflow:hidden;border:1px solid #DCE4E3">'
        '<tr><td style="background:#0B3B3A;padding:18px 22px;color:#FFFFFF">'
        '<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#F28C4B;font-weight:700">Pregão em Dia</div>'
        f'<div style="font-size:21px;font-weight:700;margin-top:4px">Resumo de {SEMANA[H.weekday()]}, {data_br(H)}</div>'
        + (f'<div style="font-size:13px;opacity:.8;margin-top:2px">{e(r["empresa"])}</div>' if r["empresa"] else "")
        + "</td></tr>" + "".join(blocos)
        + f'<tr><td style="padding:18px 22px 22px"><a href="{e(PORTAL_URL)}" style="display:inline-block;background:#0D6E6A;color:#FFFFFF;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:9px">Abrir o portal</a></td></tr>'
        "</table>"
        '<div style="font-size:11.5px;color:#8A9C9E;margin-top:10px">Enviado pelo robô do Pregão em Dia (GitHub Actions). Prazos em dias úteis pela Lei 14.133/2021; confira sempre a regra do edital.</div>'
        "</td></tr></table></body></html>"
    )


# ---------------------------------------------------------------- principal

def main():
    args = sys.argv[1:]
    dados_arq = args[args.index("--dados") + 1] if "--dados" in args else None
    previa = args[args.index("--previa") + 1] if "--previa" in args else None
    teste = os.environ.get("TESTE_RESUMO", "").strip() == "1"

    if not dados_arq:
        agora = datetime.now(BRASILIA)
        estado = json.loads(ESTADO.read_text(encoding="utf-8")) if ESTADO.exists() else {}
        if not teste:
            if estado.get("ultimo") == agora.date().isoformat():
                return log("Resumo diário: já enviado hoje.")
            if agora.hour < int(os.environ.get("HORA_RESUMO", "").strip() or 7):
                return log("Resumo diário: ainda não é hora.")
            if agora.weekday() >= 5 and os.environ.get("RESUMO_FIM_DE_SEMANA", "").strip() != "1":
                return log("Resumo diário: fim de semana, não envia.")
        chave = os.environ.get("PORTAL_CHAVE_ROBO", "").strip()
        if not chave:
            return log("Resumo diário: segredo PORTAL_CHAVE_ROBO não configurado, pulando.")
        S = ler_portal(chave)
    else:
        S = json.loads(Path(dados_arq).read_text(encoding="utf-8"))

    r = montar(S)
    if previa:
        Path(previa).write_text(html_email(r), encoding="utf-8")
        print(assunto(r))
        print(texto_simples(r))
        return

    if enviar_email(assunto(r), texto_simples(r), html_email(r)):
        ESTADO.write_text(json.dumps({"ultimo": hoje().isoformat(), "enviado_em": datetime.now(BRASILIA).isoformat(timespec="minutes")}, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
