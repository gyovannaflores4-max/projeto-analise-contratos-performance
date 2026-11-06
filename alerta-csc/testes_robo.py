"""Testes rápidos do robô (rodam no GitHub a cada PR): python alerta-csc/testes_robo.py"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import garimpo  # noqa: E402
import resumo_diario  # noqa: E402

falhas = 0


def confere(nome, ok):
    global falhas
    print(("✓ " if ok else "✗ ") + nome)
    falhas += 0 if ok else 1


p = garimpo.perfil({"editais": [{"uf": "PR"}]})
confere("perfil padrão junta UFs dos editais com AM e RJ", p["ufs"] == ["AM", "PR", "RJ"])
casos = [
    ("Prestação de serviço técnico especializado em atendimento médico pré-hospitalar, por meio de Central de Regulação Médica", True),
    ("Contratação de empresa para prestação de serviços de plantões médicos em UTI neonatal e pediátrica", True),
    ("Contratação de empresa especializada em terapia renal substitutiva (hemodiálise)", True),
    ("AQUISIÇÃO DE MEDICAMENTOS GERAIS.", False),
    ("Contratação de empresa para fornecimento de mão de obra de médico do trabalho presencial", False),
    ("Aquisição de 58 cardioversores para unidades de terapia intensiva", False),
    ("Contratação de serviços de alimentação coletiva para hospitais", False),
]
for objeto, esperado in casos:
    n, _ = garimpo.nota(objeto, p)
    confere(f"garimpo {'pega' if esperado else 'ignora'}: {objeto[:60]} (nota {n})", (n >= garimpo.NOTA_MINIMA) == esperado)

r = resumo_diario.montar({"portais": [], "editais": [], "documentos": [], "recursos": [], "chats": [], "ajustes": {}})
titulos = [t for t, _ in r["secoes"]]
confere("resumo diário começa por propostas e recursos", titulos[:2] == ["Propostas a cadastrar", "Recursos e contrarrazões"])
confere("resumo diário termina nos portais (informativo)", titulos[-1].startswith("Portais"))
resumo_diario.html_email(r)
resumo_diario.texto_simples(r)
confere("e-mail do resumo monta sem erro", True)

print("\n" + (f"{falhas} teste(s) com problema." if falhas else "Todos os testes do robô passaram."))
sys.exit(1 if falhas else 0)
