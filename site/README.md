# Site público do Revezo

Pasta pronta para publicar em qualquer hospedagem de site estático (GitHub Pages, Netlify, Vercel, Cloudflare Pages).

| Arquivo | O que é |
|---|---|
| `index.html` | **Portal de grupos e comunidades** (página principal): busca por estado, cidade e especialidade; grupos de WhatsApp com regras, participantes e selo de verificado; vagas publicadas nos grupos; comunidades; serviços; formulários para receber alertas, cadastrar grupo e anunciar vaga; denúncia |
| `dados.js` | **Onde você edita** os grupos, comunidades, vagas e serviços do portal (hoje são exemplos fictícios) |
| `lista-espera.html` | Página simples de lista de espera (era a antiga página inicial) |
| `animado.html` | Versão animada da página inicial: rede de plantões ao vivo, ECG que se desenha na rolagem, celular que muda de tela conforme a rolagem, contadores e a mesma lista de espera. Para usá-la como página principal, renomeie para `index.html` |
| `vidro.html` | Versão com o template gratuito **Clinic Liquid Glass**, do AnimatedWebs, adaptado ao Revezo: degradê suave em movimento, cartões de vidro que inclinam em direção ao cursor, recursos com ícones que se desenham, carrossel de perfis, simulador de plantão em 3 passos, perguntas frequentes, cidades da primeira fase e lista de espera. Para usá-la como página principal, renomeie para `index.html` |
| `demo/index.html` | Demonstração navegável (site, app do médico, painel do hospital). Gerada por `scripts/montar-site.sh` a partir de `prototipo-plantoes/index.html` |
| `privacidade.html` | Política de privacidade (LGPD). **Preencha os trechos entre colchetes antes de publicar** |
| `og.png` | Imagem que aparece quando o link é compartilhado no WhatsApp, LinkedIn e Instagram |
| `favicon.svg`, `robots.txt` | Ícone da aba e permissão para o Google indexar |

## Como cadastrar um grupo real
Abra `dados.js` e, na lista `grupos`, copie um bloco e troque os campos. Em `convite`, cole o link `https://chat.whatsapp.com/...`: o botão vira "Entrar no grupo". Deixe vazio para o botão "Pedir convite", que envia nome, CRM/COREN e WhatsApp da pessoa para você repassar ao administrador.

## Antes de publicar
1. **Formulário:** crie uma conta gratuita em [formspree.io](https://formspree.io), crie um formulário e cole o endereço (`https://formspree.io/f/...`) em `FORM_ENDPOINT`, no `<script>` do `index.html`, do `lista-espera.html`, do `animado.html` e do `vidro.html`. No portal, os pedidos chegam com o campo `tipo` (`alerta`, `grupo`, `vaga`, `pedido_convite`, `denuncia_...`). Sem isso a página fica em modo demonstração e não salva inscrições.
2. **Privacidade:** preencha nome/CNPJ e e-mail de contato em `privacidade.html`.
3. **Imagem de compartilhamento:** depois de ter o endereço final do site, troque `content="og.png"` por `content="https://SEU-ENDERECO/og.png"` no `index.html`. O WhatsApp só mostra a imagem com o endereço completo.
4. Se mudar o protótipo, rode `./scripts/montar-site.sh` para atualizar a demonstração.

## Publicar
- **Netlify (mais rápido):** entre em app.netlify.com/drop e arraste a pasta `site`. O site fica no ar em segundos num endereço `*.netlify.app`.
- **GitHub Pages:** em um repositório só do site, coloque o conteúdo desta pasta na raiz e ative Settings → Pages → Deploy from a branch → `main` / `(root)`.
- **Domínio próprio:** registre um `.com.br` no registro.br (cerca de R$ 40 por ano) e aponte para a hospedagem escolhida.
