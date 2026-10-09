# Revezo: protótipo de plataforma de plantões médicos

Protótipo navegável de uma plataforma no estilo Hub2Med / Quero Plantão. Ela tem as mesmas funções principais e cinco diferenciais.
Arquivos:
- `index.html`: protótipo navegável (site, app do médico, painel do hospital). Abra no navegador; não precisa de build.
- `lista-de-espera.html`: página real de lista de espera, pronta para publicar (veja abaixo).

## Telas

| Tela | O que mostra |
|---|---|
| **Site** | Página pública com proposta de valor, diferenciais, passo a passo, comparativo e chamadas para médico e hospital |
| **App do médico** | Vagas com % de match, filtros por turno, raio e ordenação; confirmação com checagem de descanso; bolsa de trocas; agenda semanal; carteira |
| **Painel do hospital** | Abas de gestão de escalas (detalhadas abaixo) |

### Painel do hospital (gestão de escalas)
Inspirado nas funções de gestão de escalas do Pega Plantão:

| Aba | Funções |
|---|---|
| Escala | Grade semanal por setor e turno, plantões sem cobertura, anúncio de plantão (individual ou em lote), estimativa de profissionais compatíveis, candidaturas para aprovar |
| Escala fixa | Regras recorrentes por profissional (dia da semana, 12×36, 24 h) e geração do mês inteiro, com feriados e conflitos de descanso sinalizados |
| Equipe e documentos | Médicos, enfermeiros e técnicos, registro CRM/COREN, horas no mês, documentos vencidos ou a vencer, cobrança de documento |
| Presença | Check-in por GPS ou QR code, atrasos, ausências e acionamento de substituto com urgência |
| Trocas | Fila de aprovação, aprovação automática por regra e histórico com data e hora para auditoria |
| Financeiro | Fechamento mensal por profissional (plantões, horas, valor, situação), pagamento via Pix e exportação para a contabilidade |
| Comunicados | Avisos por setor ou para toda a equipe, prioridade alta (push/SMS) e confirmação de leitura |

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

## Lista de espera (`lista-de-espera.html`)
Página para validar o interesse antes de construir o produto. Coleta perfil, nome, e-mail, WhatsApp, cidade/UF, especialidade, a maior dificuldade com plantões e o consentimento LGPD. Também gera um link de indicação (`?ref=`).

Para colocar no ar:
1. Crie um formulário gratuito em [formspree.io](https://formspree.io) e copie o endereço (`https://formspree.io/f/...`).
2. Cole esse endereço em `FORM_ENDPOINT`, no início do `<script>` da página. Enquanto estiver vazio, a página funciona em modo demonstração e não envia nada.
3. Publique a pasta no GitHub Pages, Netlify ou Vercel (todos têm plano gratuito).
4. As inscrições chegam no e-mail e no painel do Formspree, de onde podem ser exportadas em CSV.

## Próximos passos sugeridos
- Validar os diferenciais com 5–10 plantonistas e 2–3 coordenadores
- Definir a stack (ex.: Next.js + Supabase/Postgres, app em React Native)
- Integração de pagamento com custódia (subconta/split Pix) e emissão de NFS-e
- Consulta de CRM/RQE na base do CFM

> "Revezo" é um nome provisório. Hospitais, médicos e valores do protótipo são fictícios.
