"""Garimpo de editais: procura no PNCP as licitações com proposta aberta que têm o perfil da equipe.

Uma vez por dia, para cada UF do perfil, lê no PNCP as contratações com recebimento de propostas
aberto (pregão, concorrência e dispensa), dá uma nota de aderência pelo objeto e grava as boas no
portal (aba Garimpo), com a chave do robô. Manda um e-mail curto quando aparecem editais novos.

Perfil (Ajustes → Garimpo, no portal): UFs, termos que interessam e termos que tiram o edital.
Sem perfil, usa as UFs dos editais cadastrados e termos de serviços médicos.
Variáveis: PORTAL_CHAVE_ROBO e as de e-mail de alerta_resenhas.py. TESTE_GARIMPO=1 roda fora de hora.
"""

import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from alerta_resenhas import USER_AGENT, enviar_email, log
from resumo_diario import PORTAL_URL, config_supabase, ler_portal

PNCP = "https://pncp.gov.br/api/consulta/v1/contratacoes/proposta"
MODALIDADES = {6: "Pregão eletrônico", 4: "Concorrência eletrônica", 8: "Dispensa", 12: "Credenciamento", 7: "Pregão presencial", 5: "Concorrência presencial"}
SIGLA = {6: "PE", 4: "CE", 8: "DE", 12: "CRED", 7: "PP", 5: "CC"}
BRASILIA = timezone(timedelta(hours=-3))

# Termos com peso: o objeto precisa somar pelo menos NOTA_MINIMA
# Prioridade da equipe: nefrologia (terapia renal, hemodiálise, diálise peritoneal) e mão de obra médica
TERMOS_NEFRO = {
    "hemodialise": 6, "dialise peritoneal": 7, "peritoneal": 5, "dialise": 6, "nefrolog": 7, "terapia renal": 7, "renal substitutiva": 7,
    "hemodiafiltra": 6, "insuficiencia renal": 5, "doenca renal": 5, "doente renal": 5, "pacientes renais": 5, "renal cronic": 5, "fistula arteriovenosa": 4,
}
TERMOS_MAO_OBRA = {
    "mao de obra medica": 6, "fornecimento de mao de obra": 3, "cessao de mao de obra": 3, "profissionais medicos": 5, "medicos plantonistas": 6,
    "plantonista": 4, "plantao medico": 5, "plantoes medicos": 5, "escala medica": 5, "escalas medicas": 5, "servicos medicos": 5, "servico medico": 5,
    "equipe medica": 4, "gestao de escalas": 4, "coordenacao medica": 4, "responsavel tecnico medico": 3,
}
TERMOS_PADRAO = dict({
    "plantao": 3, "plantoes": 3, "medico": 2, "medicos": 2, "medica": 2,
    "uti": 3, "terapia intensiva": 3, "pediatr": 2, "neonat": 2, "anestesi": 3, "obstetr": 2, "ortoped": 2, "cirurg": 2,
    "enfermagem": 2, "pronto atendimento": 3, "pronto socorro": 3, "upa": 2, "urgencia e emergencia": 3, "radiolog": 2,
    "gestao hospitalar": 3, "assistencia medica": 4, "atendimento medico": 4, "telemedicina": 3, "regulacao medica": 3,
}, **TERMOS_MAO_OBRA, **TERMOS_NEFRO)
EXCLUIR_PADRAO = ["aquisicao", "fornecimento de", "medicamento", "material", "materiais", "equipamento", "insumo",
                  "manutencao", "alimentacao", "combustive", "veiculo", "locacao de", "obra", "reforma", "medico do trabalho",
                  "gases medicinais", "uniforme", "limpeza"]
# Fora sempre, mesmo sendo "prestação de serviço" (seguro viagem com assistência médica, veterinária…)
SEMPRE_FORA = re.compile(r"veterinar|turismo|viagem|transporte (?:rodoviario|de passageiros|escolar)|manutencao (?:preventiva|corretiva)|locacao de veiculo")
NOTA_MINIMA = 4
UFS_BRASIL = ("AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
              "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO")
FALHAS = []  # páginas que o PNCP não devolveu


def sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", str(s or "")) if unicodedata.category(c) != "Mn").lower()


def lista(txt):
    return [sem_acento(x).strip() for x in re.split(r"[,;\n]+", str(txt or "")) if x.strip()]


def perfil(S):
    g = (S.get("ajustes") or {}).get("garimpo") or {}
    ufs = [u.upper() for u in lista(g.get("ufs"))] or list(UFS_BRASIL)  # sem escolha: o Brasil inteiro
    termos = {t: 3 for t in lista(g.get("termos"))} or TERMOS_PADRAO
    excluir = lista(g.get("excluir")) or EXCLUIR_PADRAO
    mods = [int(m) for m in re.findall(r"\d+", str(g.get("modalidades") or ""))] or [6, 12, 4, 8, 7, 5]
    return {"ufs": [u for u in dict.fromkeys(ufs) if u in UFS_BRASIL], "termos": termos, "excluir": excluir, "modalidades": mods}


# "médico" que não é serviço: material, equipamento, dispositivo médico-hospitalar…
RUIDO_MEDICO = re.compile(r"medic[oa]s?[- ]+hospitalar\w*|medico[- ]+laborator\w*|medico[- ]+odontolog\w*|"
                          r"(?:dispositivos?|equipamentos?|materia(?:l|is)|instrumenta(?:l|is)|instrumentos?|insumos?|produtos?|gases|aparelhos?)"
                          r"(?:\s+(?:e|de|para|permanentes|laboratoriais)\s+\w+){0,3}\s+medic\w*")
SERVICO = re.compile(r"prestac\w* (?:de |complementar |continuad\w* )*servic|servicos? (?:medic|de saude|assistenc|de plant|de atendimento|de (?:hemo)?dialise|de terapia|de nefrolog)|"
                     r"plant(?:ao|oes|onista)|mao de obra|profissionais|equipe medica|credenciamento|realizacao de (?:sessoes |procedimentos |tratamento )?(?:de )?(?:hemo)?dialise|"
                     r"tratamento dialitico|realizacao de terapia")
NEFRO = re.compile(r"hemodialise|dialise|dialitic|dialisador|diasafe|nefrolog|terapia renal|renal substitutiva|hemodiafiltra|insuficiencia renal|doen(?:ca|te)s? renal|pacientes renais|renal cronic")
MAO_OBRA = re.compile(r"mao de obra medica|medicos plantonistas|plantonista|plant(?:ao|oes) medic|escalas? medica|profissionais medicos|servicos? medic|equipe medica|gestao de escalas")


def categoria(objeto):
    """Prioridade da equipe: nefrologia, depois mão de obra médica."""
    o = RUIDO_MEDICO.sub(" ", sem_acento(objeto))
    return "nefrologia" if NEFRO.search(o) else "mao_obra" if MAO_OBRA.search(o) else ""


def nota(objeto, p, orgaos_conhecidos=(), cnpj=""):
    """Nota de aderência do objeto ao perfil e os termos que pesaram."""
    o = RUIDO_MEDICO.sub(" ", sem_acento(objeto))
    achados = [t for t in p["termos"] if re.search(r"(^|[^a-z])" + re.escape(t), o)]
    n = sum(p["termos"][t] for t in achados)
    servico = bool(SERVICO.search(o))
    if NEFRO.search(o) and "veterinar" not in o:
        # nefrologia é prioridade: serviço sobe; compra/locação de máquina e insumo de diálise continua na lista, mais abaixo
        return (n + 4 if servico else max(NOTA_MINIMA, n - 4)), achados
    if SEMPRE_FORA.search(o):
        return n - 10, achados
    if any(x in o for x in p["excluir"]):
        n -= 2 if servico else 8  # compra de material/medicamento/equipamento sai, mesmo com "médico" no texto
    elif not servico:
        n -= 2
    if MAO_OBRA.search(o) and servico:
        n += 3
    if cnpj and cnpj in orgaos_conhecidos:
        n += 1  # órgão com quem a equipe já disputou
    return n, achados


def ler_pagina(uf, mod, pagina, ate):
    """Uma página da consulta. O PNCP responde 429 quando chegam muitas consultas: espera e tenta de novo."""
    url = f"{PNCP}?dataFinal={ate}&codigoModalidadeContratacao={mod}&uf={uf}&pagina={pagina}&tamanhoPagina=50"
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
    for tentativa in range(6):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read() or b"{}") if r.status != 204 else {}
        except urllib.error.HTTPError as erro:
            espera = int(erro.headers.get("Retry-After") or 0) if erro.code == 429 else 0
            if tentativa == 5 or erro.code not in (429, 500, 502, 503, 504):
                log(f"Garimpo: {uf}/{mod} página {pagina}: {erro}")
                FALHAS.append(f"{uf}/{mod}/{pagina}")
                return None
            time.sleep(max(espera, 10 * (tentativa + 1)))
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as erro:
            if tentativa == 5:
                log(f"Garimpo: {uf}/{mod} página {pagina}: {erro}")
                FALHAS.append(f"{uf}/{mod}/{pagina}")
                return None
            time.sleep(5 * (tentativa + 1))


def varrer(p, ate):
    """Todas as contratações abertas das UFs e modalidades do perfil (páginas em paralelo)."""
    primeiras = {}
    with ThreadPoolExecutor(3) as ex:  # poucas consultas juntas: o PNCP bloqueia (429) acima disso
        for (uf, mod), d in zip([(u, m) for u in p["ufs"] for m in p["modalidades"]],
                                ex.map(lambda um: ler_pagina(um[0], um[1], 1, ate), [(u, m) for u in p["ufs"] for m in p["modalidades"]])):
            primeiras[(uf, mod)] = d or {}
        resto = [(uf, mod, pg) for (uf, mod), d in primeiras.items() for pg in range(2, min(int(d.get("totalPaginas") or 1), 120) + 1)]
        demais = list(ex.map(lambda x: (x, ler_pagina(*x, ate)), resto))
    for (uf, mod), d in primeiras.items():
        for c in d.get("data") or []:
            yield mod, c
    for (uf, mod, _), d in demais:
        for c in (d or {}).get("data") or []:
            yield mod, c


def item(mod, c, n, achados):
    u, o = c.get("unidadeOrgao") or {}, c.get("orgaoEntidade") or {}
    num = str(c.get("numeroCompra") or "").lstrip("0") or "?"
    return {"id": c["numeroControlePNCP"], "nota": n, "dados": {
        "numero": (SIGLA.get(mod, "") + " " + num + ("" if "/" in num else f"/{c.get('anoCompra')}")).strip(),
        "modalidade": MODALIDADES.get(mod, c.get("modalidadeNome")), "orgao": o.get("razaoSocial"), "cnpj": o.get("cnpj"),
        "unidade": u.get("nomeUnidade"), "uasg": u.get("codigoUnidade"), "municipio": u.get("municipioNome"), "uf": u.get("ufSigla"),
        "objeto": re.sub(r"\s+", " ", c.get("objetoCompra") or "").strip()[:900], "valorEstimado": c.get("valorTotalEstimado"),
        "abertura": (c.get("dataAberturaProposta") or "")[:16], "encerramento": (c.get("dataEncerramentoProposta") or "")[:16],
        "srp": c.get("srp"), "link": c.get("linkSistemaOrigem") or "",
        "linkPncp": "https://pncp.gov.br/app/editais/{}/{}/{}".format(o.get("cnpj"), c.get("anoCompra"), c.get("sequencialCompra")),
        "termos": achados[:8], "categoria": categoria(c.get("objetoCompra"))}}


def gravar(chave_robo, itens):
    url, chave = config_supabase()
    req = urllib.request.Request(url + "/rest/v1/rpc/portal_garimpo_robo", data=json.dumps({"chave": chave_robo, "itens": itens}).encode(),
                                 headers={"apikey": chave, "Authorization": "Bearer " + chave, "Content-Type": "application/json", "User-Agent": USER_AGENT},
                                 method="POST")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"null")


def main():
    chave = os.environ.get("PORTAL_CHAVE_ROBO", "").strip()
    if not chave:
        return log("Garimpo: segredo PORTAL_CHAVE_ROBO não configurado, pulando.")
    S = ler_portal(chave)
    p = perfil(S)
    conhecidos = {re.sub(r"\D", "", str(e.get("pncpId") or ""))[:14] for e in S.get("editais") or [] if e.get("pncpId")}
    ja = {str(e.get("link") or "") for e in S.get("editais") or []}
    ate = (datetime.now(BRASILIA) + timedelta(days=120)).strftime("%Y%m%d")
    log(f"Garimpo: UFs {', '.join(p['ufs'])}, modalidades {p['modalidades']}.")
    vistos, bons = set(), []
    for mod, c in varrer(p, ate):
        cid = c.get("numeroControlePNCP")
        if not cid or cid in vistos:
            continue
        vistos.add(cid)
        n, achados = nota(c.get("objetoCompra"), p, conhecidos, (c.get("orgaoEntidade") or {}).get("cnpj", ""))
        if n >= NOTA_MINIMA and (c.get("linkSistemaOrigem") or "") not in ja:
            bons.append(item(mod, c, n, achados))
    ordem = {"nefrologia": 0, "mao_obra": 1}
    bons.sort(key=lambda x: (ordem.get(x["dados"].get("categoria"), 2), -x["nota"], x["dados"]["encerramento"]))
    log(f"Garimpo: {len(vistos)} contratações abertas lidas, {len(bons)} com o perfil.")
    if FALHAS:
        log(f"Garimpo: {len(FALHAS)} página(s) não vieram do PNCP: {', '.join(FALHAS[:20])}")
    novos = gravar(chave, bons[:1500])
    if novos is None:
        return log("Garimpo: a chave do robô não foi aceita para gravar.")
    log(f"Garimpo: {novos} edital(is) novo(s).")
    if novos:
        top = bons[:12]
        linhas = [f"O garimpo achou {novos} edital(is) novo(s) com o perfil da equipe. Os melhores:", ""]
        for x in top:
            d = x["dados"]
            linhas += [f"- {d['numero']} · {d['orgao']} ({d['municipio']}/{d['uf']}) · nota {x['nota']}",
                       f"  {d['objeto'][:200]}", f"  Propostas até {d['encerramento'][8:10]}/{d['encerramento'][5:7]} · {d['linkPncp']}", ""]
        linhas.append(f"Ver todos no portal: {PORTAL_URL.rstrip('/')}/#garimpo")
        try:
            enviar_email(f"[Equipe Comercial] Garimpo: {novos} edital(is) novo(s)", "\n".join(linhas))
        except Exception as erro:
            log(f"Garimpo: falha ao enviar e-mail: {erro}")


if __name__ == "__main__":
    sys.exit(main())
