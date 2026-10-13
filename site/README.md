# Site público do Revezo

Pasta pronta para publicar em qualquer hospedagem de site estático (GitHub Pages, Netlify, Vercel, Cloudflare Pages).

| Arquivo | O que é |
|---|---|
| `index.html` | **Página principal: grupos de WhatsApp por estado**, separados em *Com RQE* e *Sem RQE* (54 grupos). O médico escolhe o estado, diz se tem RQE, deixa nome, CRM e WhatsApp, e é levado ao grupo certo. Grupo cheio é pulado automaticamente. Hospitais anunciam vagas grátis. As bandeiras dos 27 estados (Wikimedia Commons, domínio público) ficam embutidas no próprio arquivo, então elas aparecem mesmo se o `index.html` for aberto sozinho |
| `dados.js` | Onde ficam os links dos grupos, ou o endereço da planilha do Google com eles |
| `grupos.csv` | Planilha-modelo com os 54 grupos. Importe no Google Planilhas e preencha a coluna `link` |
| `CRIAR-GRUPOS.md` | Passo a passo para criar os 54 grupos: nomes, descrições, configurações e o que fazer quando um grupo lotar |
| `lista-espera.html` | Página simples de lista de espera (era a antiga página inicial) |
| `animado.html` | Versão animada da página inicial: rede de plantões ao vivo, ECG que se desenha na rolagem, celular que muda de tela conforme a rolagem, contadores e a mesma lista de espera. Para usá-la como página principal, renomeie para `index.html` |
| `vidro.html` | Versão com o template gratuito **Clinic Liquid Glass**, do AnimatedWebs, adaptado ao Revezo: degradê suave em movimento, cartões de vidro que inclinam em direção ao cursor, recursos com ícones que se desenham, carrossel de perfis, simulador de plantão em 3 passos, perguntas frequentes, cidades da primeira fase e lista de espera. Para usá-la como página principal, renomeie para `index.html` |
| `demo/index.html` | Demonstração navegável (site, app do médico, painel do hospital). Gerada por `scripts/montar-site.sh` a partir de `prototipo-plantoes/index.html` |
| `privacidade.html` | Política de privacidade (LGPD). **Preencha os trechos entre colchetes antes de publicar** |
| `og.png` | Imagem que aparece quando o link é compartilhado no WhatsApp, LinkedIn e Instagram |
| `favicon.svg`, `robots.txt` | Ícone da aba e permissão para o Google indexar |

## Como ligar os grupos ao site
1. Crie os grupos seguindo `CRIAR-GRUPOS.md`.
2. Importe `grupos.csv` no Google Planilhas e cole o link de convite de cada grupo na coluna `link`.
3. Na planilha: Arquivo → Compartilhar → Publicar na web → escolha a aba → formato CSV → Publicar. Copie o endereço.
4. Cole esse endereço em `planilhaCSV`, dentro de `dados.js`. A partir daí, qualquer mudança na planilha aparece no site sozinha (pode levar alguns minutos para o Google atualizar).
5. Quando um grupo lotar: marque `cheio` na coluna `status` e adicione uma linha com `ordem` 2 e o link do grupo novo.

Enquanto um grupo não tiver link, o site mostra "em breve" e guarda os dados do médico para você mandar o convite depois.

## Antes de publicar
1. **Formulário:** crie uma conta gratuita em [formspree.io](https://formspree.io), crie um formulário e cole o endereço (`https://formspree.io/f/...`) em `FORM_ENDPOINT`, no `<script>` do `index.html`, do `lista-espera.html`, do `animado.html` e do `vidro.html`. No portal, os pedidos chegam com o campo `tipo` (`alerta`, `grupo`, `vaga`, `pedido_convite`, `denuncia_...`). Sem isso a página fica em modo demonstração e não salva inscrições.
2. **Privacidade:** preencha nome/CNPJ e e-mail de contato em `privacidade.html`.
3. **Imagem de compartilhamento:** depois de ter o endereço final do site, troque `content="og.png"` por `content="https://SEU-ENDERECO/og.png"` no `index.html`. O WhatsApp só mostra a imagem com o endereço completo.
4. Se mudar o protótipo, rode `./scripts/montar-site.sh` para atualizar a demonstração.

## Publicar
- **Netlify (mais rápido):** entre em app.netlify.com/drop e arraste a pasta `site`. O site fica no ar em segundos num endereço `*.netlify.app`.
- **GitHub Pages:** em um repositório só do site, coloque o conteúdo desta pasta na raiz e ative Settings → Pages → Deploy from a branch → `main` / `(root)`.
- **Domínio próprio:** registre um `.com.br` no registro.br (cerca de R$ 40 por ano) e aponte para a hospedagem escolhida.
