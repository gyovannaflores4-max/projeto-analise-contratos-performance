# Site público do Revezo

Pasta pronta para publicar em qualquer hospedagem de site estático (GitHub Pages, Netlify, Vercel, Cloudflare Pages).

| Arquivo | O que é |
|---|---|
| `index.html` | Página inicial com a lista de espera |
| `demo/index.html` | Demonstração navegável (site, app do médico, painel do hospital). Gerada por `scripts/montar-site.sh` a partir de `prototipo-plantoes/index.html` |
| `privacidade.html` | Política de privacidade (LGPD). **Preencha os trechos entre colchetes antes de publicar** |
| `og.png` | Imagem que aparece quando o link é compartilhado no WhatsApp, LinkedIn e Instagram |
| `favicon.svg`, `robots.txt` | Ícone da aba e permissão para o Google indexar |

## Antes de publicar
1. **Formulário:** crie uma conta gratuita em [formspree.io](https://formspree.io), crie um formulário e cole o endereço (`https://formspree.io/f/...`) em `FORM_ENDPOINT`, no `<script>` do `index.html`. Sem isso a página fica em modo demonstração e não salva inscrições.
2. **Privacidade:** preencha nome/CNPJ e e-mail de contato em `privacidade.html`.
3. **Imagem de compartilhamento:** depois de ter o endereço final do site, troque `content="og.png"` por `content="https://SEU-ENDERECO/og.png"` no `index.html`. O WhatsApp só mostra a imagem com o endereço completo.
4. Se mudar o protótipo, rode `./scripts/montar-site.sh` para atualizar a demonstração.

## Publicar
- **Netlify (mais rápido):** entre em app.netlify.com/drop e arraste a pasta `site`. O site fica no ar em segundos num endereço `*.netlify.app`.
- **GitHub Pages:** em um repositório só do site, coloque o conteúdo desta pasta na raiz e ative Settings → Pages → Deploy from a branch → `main` / `(root)`.
- **Domínio próprio:** registre um `.com.br` no registro.br (cerca de R$ 40 por ano) e aponte para a hospedagem escolhida.
