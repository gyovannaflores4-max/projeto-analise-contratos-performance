# Revezo Plantões: como o projeto está organizado

| Pasta | O que é | Vai para o ar? |
|---|---|---|
| `site/` | O site público. **Só esta pasta é publicada.** | Sim |
| `operacao/` | Guias internos: checklist, criação dos grupos, planilha-modelo, script do Google | Não |
| `testes/` | Testes automáticos que conferem o site inteiro | Não |
| `prototipos-antigos/` | Versões e ideias anteriores, guardadas só como referência | Não |
| `prototipo-plantoes/` | Protótipo do app do médico e do painel do hospital | Não |

## Arquivos do site
| Arquivo | Para que serve |
|---|---|
| `index.html` | Página principal: entrada do médico (estado, RQE, dados) e cadastro de coordenadores e hospitais |
| `dados.js` | **Única configuração**: para onde vão os cadastros, planilha e links dos grupos |
| `privacidade.html`, `termos.html` | Páginas legais (preencher os trechos em amarelo) |
| `404.html` | Página de "não encontrado" |
| `legal.css` | Visual das páginas legais |
| `fontes/` | Fonte do site, hospedada junto (não depende do Google) |
| `og.jpg` | Imagem que aparece quando o link é compartilhado |
| `_headers` | Segurança e cache no Netlify e no Cloudflare Pages |

## Primeira publicação
Siga `operacao/CHECKLIST-PUBLICACAO.md`.

## Tarefas do dia a dia (sem mexer em código)
| Tarefa | Onde |
|---|---|
| Grupo lotou | Planilha de grupos: marque `cheio` e acrescente uma linha com `ordem` 2 e o link novo (detalhes em `CRIAR-GRUPOS.md`) |
| Ver cadastros de médicos, contratantes e vagas | Planilha de cadastros (abas Médicos, Contratantes e Vagas) |
| Aprovar médico no grupo | WhatsApp, conferindo nome e CRM na planilha de cadastros |
| Pedido de exclusão de dados (LGPD) | Apague a linha da pessoa na planilha e remova-a do grupo, em até 15 dias |

## Se alguém for alterar o código
1. Faça a alteração.
2. Rode os testes: `cd testes && npm install && npx playwright install chromium && npm test`.
3. Só publique se todos passarem. No GitHub, os mesmos testes rodam sozinhos a cada alteração na pasta `site` (aba Actions).

Os testes conferem: HTML válido, nenhum erro de JavaScript, nenhuma rolagem lateral de 320 a 1440 px, acessibilidade, o fluxo completo do médico (incluindo grupo cheio e link malicioso), planilha fora do ar, cadastro de contratante, anúncio de vaga, envio duplicado, proteção contra robôs, modo demonstração e as regras de segurança do `_headers`.

## Cuidados que evitam surpresas
- **Não troque o nome dos campos dos formulários** (`name="..."`) sem ajustar a planilha: as colunas da planilha seguem esses nomes.
- **Planilha de grupos publicada:** o Google pode levar alguns minutos para mostrar uma mudança.
- **Formspree:** o plano gratuito tem limite mensal; se escolher ele, acompanhe o uso.
- **Não venda nem repasse a lista de médicos:** o consentimento dado no site é só para receber vagas (LGPD).
- **Backup:** no Google Planilhas, use Arquivo > Fazer uma cópia uma vez por mês.
