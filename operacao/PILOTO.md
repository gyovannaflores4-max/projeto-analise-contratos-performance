# Piloto: 30 empresas e 100 médicos

Objetivo: confirmar, com pessoas reais, que o site aguenta, que os cadastros chegam e que o fluxo é fácil, antes de divulgar em grande escala.

## O que já foi testado (automático)
| Teste | Resultado |
|---|---|
| 130 pessoas usando o site ao mesmo tempo (26 de cada vez), em navegadores reais | 130 cadastros recebidos, nenhuma falha |
| Piloto simulado no script do Google: 100 médicos, 30 empresas e 60 vagas | Todos gravados na aba certa |
| Enxurrada de 400 envios no mesmo minuto | Limite segurou em 300; voltou a aceitar no minuto seguinte |
| Teste de carga contra um servidor que imita o Google: 130 envios, 15 ao mesmo tempo | 130 de 130 aceitos |
| 28 testes do site e do script (layout, acessibilidade, segurança, validações) | Todos passando |

**Sobre "o site cair":** o site é um conjunto de arquivos estáticos entregue pela rede do Netlify, feita para milhares de acessos simultâneos. 130 pessoas é um volume muito pequeno para ela. O ponto que precisa de atenção é onde os cadastros são salvos:
- **Use a Planilha Google** (operacao/google-apps-script.gs). Ela aguenta tranquilamente o volume do piloto.
- **Não use o Formspree gratuito no piloto:** o limite mensal de envios fica abaixo do que 30 empresas, 100 médicos e as vagas geram, e os cadastros parariam de ser salvos no meio do teste.

## Antes do piloto
1. Siga `CHECKLIST-PUBLICACAO.md` e `SEGURANCA.md` (verificação em duas etapas em tudo).
2. Publique o site e rode o teste de carga **no endereço real** do script:
   ```
   cd testes
   npm install
   node carga.js https://script.google.com/macros/s/SEU_CODIGO/exec 130 15
   ```
   O resultado deve ser "Aceitos: 130 de 130". Confira a aba "Teste de carga" na planilha e depois apague essa aba.
3. Faça você mesma um cadastro de médico, um de empresa e uma vaga, pelo celular. Apague depois.

## Durante o piloto (2 a 3 semanas)
- Mande o link com origem marcada, para saber de onde vem cada cadastro (veja `DIVULGACAO.md`), por exemplo `?ref=piloto-medicos` e `?ref=piloto-empresas`.
- Olhe a planilha de cadastros todo dia e aprove as entradas nos grupos.
- Peça para 5 médicos e 5 empresas contarem, por mensagem, o que foi difícil ou confuso.
- Anote quantas vagas foram publicadas nos grupos e quantas foram preenchidas.

## O que observar
| Pergunta | Onde ver |
|---|---|
| Os cadastros estão chegando? | Planilha (abas Médicos, Contratantes e Vagas) |
| Quantos visitaram e quantos se cadastraram? | GoatCounter, se ativado |
| De onde veio cada cadastro? | Coluna "origem" na planilha |
| Alguém teve erro? | Mensagens dos participantes; faixa amarela no site indica envio não configurado |
| Robôs ou spam? | Linhas estranhas na planilha (o script já filtra a maioria) |

## Sinais de que deu certo
Os números são sugestões para você ajustar:
- Pelo menos 8 em cada 10 médicos que abriram o site concluíram o cadastro.
- Nenhum cadastro perdido (quem disse que se cadastrou aparece na planilha).
- As empresas publicaram vagas e receberam contato de médicos.
- Nenhuma reclamação de site fora do ar ou lento.
