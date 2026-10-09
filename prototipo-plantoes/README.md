# Revezo: protótipo de plataforma de plantões médicos

Protótipo navegável de uma plataforma no estilo Hub2Med / Quero Plantão. Ela tem as mesmas funções principais e cinco diferenciais.
Tudo está em um único arquivo (`index.html`). Abra o arquivo no navegador; não precisa de build.

## Telas

| Tela | O que mostra |
|---|---|
| **Site** | Página pública com proposta de valor, diferenciais, passo a passo, comparativo e chamadas para médico e hospital |
| **App do médico** | Vagas com % de match, filtros por turno, raio e ordenação; confirmação com checagem de descanso; bolsa de trocas; agenda semanal; carteira |
| **Painel do hospital** | Indicadores (cobertura, vagas abertas, trocas), escala semanal por setor, publicação de vagas com estimativa de médicos compatíveis e fila de trocas com aprovação automática |

## Funções em comum com Hub2Med e Quero Plantão
- Cadastro do médico com CRM/RQE
- Busca e candidatura a plantões
- Gestão de escala pelo hospital
- Troca de plantões
- Pagamento e histórico financeiro

## Diferenciais
1. **Pagamento garantido em conta-custódia**: o hospital deposita antes do turno e o médico recebe via Pix em D+1 após o check-out.
2. **Match por compatibilidade (0–100%)**: considera especialidade, RQE, distância, valor/hora e histórico no setor, e explica por que a vaga combina com o médico.
3. **Bolsa de trocas**: médicos repassam plantões a colegas habilitados, com aprovação automática opcional pelo coordenador.
4. **Guardião de descanso**: limite semanal de horas e descanso mínimo entre turnos, com alerta antes de confirmar.
5. **Avaliação de mão dupla**: hospitais também são avaliados, inclusive no índice de pagamento em dia.

## Próximos passos sugeridos
- Validar os diferenciais com 5–10 plantonistas e 2–3 coordenadores
- Definir a stack (ex.: Next.js + Supabase/Postgres, app em React Native)
- Integração de pagamento com custódia (subconta/split Pix) e emissão de NFS-e
- Consulta de CRM/RQE na base do CFM

> "Revezo" é um nome provisório. Hospitais, médicos e valores do protótipo são fictícios.
