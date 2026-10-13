# Site do Gabinete Digital

Página de vendas com lista de espera para o Gabinete Digital (painel em `../painel-juridico`).

## Antes de publicar

No fim do `index.html`, preencha `LISTA`:

- `endpoint`: URL que recebe a inscrição em JSON (Formspree, Google Apps Script ou Supabase). Sem ela, o visitante vê o resumo da inscrição para enviar pelo WhatsApp ou copiar.
- `whatsapp`: seu número no formato `5521999999999`.
- `email`: endereço de contato.

Revise também os preços da seção **Planos de fundador** (R$ 97, R$ 247 e R$ 297 são sugestões para validar com os primeiros escritórios).

## Publicar

É um arquivo HTML único. Na Vercel, importe o repositório e defina `site-gabinete` como diretório raiz, ou arraste a pasta no Netlify Drop.
