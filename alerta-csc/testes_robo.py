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
confere("perfil sem UF escolhida busca os 27 estados", len(p["ufs"]) == 27)
confere("credenciamento não entra nas modalidades", 12 not in p["modalidades"])
confere("hemodiálise é prioridade (nefrologia)", garimpo.categoria("Credenciamento para realização de hemodiálise") == "nefrologia")
confere("plantonistas é prioridade (mão de obra médica)", garimpo.categoria("Contratação de médicos plantonistas para a UPA") == "mao_obra")
servico_nefro = garimpo.nota("Prestação de serviços de terapia renal substitutiva (hemodiálise)", p)[0]
compra_nefro = garimpo.nota("Aquisição de insumos de hemodiálise", p)[0]
confere("serviço de nefrologia fica acima da compra de insumo", servico_nefro > compra_nefro >= garimpo.NOTA_MINIMA)
confere("perfil com UFs escolhidas usa só elas", garimpo.perfil({"ajustes": {"garimpo": {"ufs": "go, sp; XX"}}})["ufs"] == ["GO", "SP"])
casos = [
    ("Prestação de serviço técnico especializado em atendimento médico pré-hospitalar, por meio de Central de Regulação Médica", True),
    ("Contratação de empresa para prestação de serviços de plantões médicos em UTI neonatal e pediátrica", True),
    ("Contratação de empresa especializada em terapia renal substitutiva (hemodiálise)", True),
    ("AQUISIÇÃO DE MEDICAMENTOS GERAIS.", False),
    ("Contratação de empresa para fornecimento de mão de obra de médico do trabalho presencial", False),
    ("Aquisição de 58 cardioversores para unidades de terapia intensiva", False),
    ("Contratação de serviços de alimentação coletiva para hospitais", False),
    ("Prestação de serviços continuados de natureza assistencial, com predominância de mão de obra especializada, destinados à prestação de serviços médicos", True),
    ("CONTRATAÇÃO DE PRESTAÇÃO DE SERVIÇOS MÉDICOS NA ESPECIALIDADE DE ANESTESIOLOGIA", True),
    ("Registro de Preços para aquisição de MATERIAIS MÉDICO-HOSPITALARES (bolsa coletora de urina), destinados às Unidades de Pronto Atendimento", False),
    ("Registro de Preços para futura e eventual aquisição de materiais de diálise e hemodiálise grupo 1", True),  # nefrologia entra, abaixo dos serviços
    ("CREDENCIAMENTO DE EMPRESAS ESPECIALIZADAS NA REALIZAÇÃO DE HEMODIÁLISE EM PACIENTES ADULTOS, INCLUINDO OS EXAMES LABORATORIAIS", True),
    ("Credenciamento de clínicas para tratamento dialítico: diálise peritoneal e hemodiálise", True),
    ("Contratação de empresa para fornecimento de mão de obra médica (médicos plantonistas) para o hospital municipal", True),
    ("Registro de preços para aquisição de medicamentos para a farmácia municipal na Unidade de Saúde e plantão 24 horas", False),
    ("Contratação de clínica veterinária para serviços de castração por médico-veterinário, com anestesia", False),
    ("Agência de turismo para transporte rodoviário de passageiros e seguro viagem com assistência médica", False),
    ("Aquisição de Equipamentos Médicos", False),
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
