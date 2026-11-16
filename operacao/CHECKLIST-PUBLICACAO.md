# Checklist de publicação

Siga na ordem. Cada item diz **onde** mexer. Só publique quando tudo estiver marcado.

## 0. Segurança das contas (obrigatório)
- [ ] Siga `operacao/SEGURANCA.md`: verificação em duas etapas no Google, Netlify, domínio, e-mail e WhatsApp dos administradores.

## 1. Onde os cadastros vão ser salvos (obrigatório)
Sem isso, o site mostra uma faixa amarela de "modo demonstração" e **não salva nenhum cadastro**.

Escolha **uma** opção:

- [ ] **Google Planilhas (recomendado):** siga as instruções no topo de `operacao/google-apps-script.gs`. São uns 10 minutos, é gratuito e cada tipo de cadastro vai para uma aba (Médicos, Contratantes, Vagas).
- [ ] **Formspree:** crie um formulário em formspree.io. Atenção: o plano gratuito tem limite mensal de envios; quando estoura, os cadastros param de ser salvos. **Não serve para o piloto de 30 empresas e 100 médicos.**

Depois:
- [ ] Cole o endereço em `formEndpoint`, no arquivo **`site/dados.js`**.
- [ ] A planilha de cadastros **não pode** ser publicada nem compartilhada por link. Use outra planilha para os links dos grupos.

## 2. Links dos grupos
- [ ] Crie os grupos seguindo `operacao/CRIAR-GRUPOS.md`.
- [ ] Coloque os links de convite **ou** na planilha (`operacao/grupos.csv` importada no Google Planilhas e publicada como CSV, com o endereço em `planilhaCSV` no `site/dados.js`) **ou** direto na lista `grupos` do `site/dados.js`.
- [ ] Só funcionam links `https://chat.whatsapp.com/...`. Qualquer outro link é ignorado de propósito, por segurança.

## 3. Dados da empresa nas páginas legais
- [ ] `site/privacidade.html`: preencha todos os trechos marcados em amarelo (razão social/CNPJ, e-mail, serviço de armazenamento usado).
- [ ] `site/termos.html`: preencha razão social/CNPJ, e-mail e cidade do foro.
- [ ] Recomendado: peça para um advogado revisar os dois textos.

## 4. Endereço do site
Depois de publicar e saber o endereço final (ex.: `https://revezo.com.br`):
- [ ] Rode, na pasta do projeto: `node operacao/definir-dominio.js https://SEU-ENDERECO`. Ele configura a imagem de prévia do WhatsApp, o endereço para o Google, o `robots.txt` e o `sitemap.xml`. Depois publique a pasta `site` de novo.
- [ ] Teste o link colando-o numa conversa do WhatsApp: deve aparecer a imagem com o título.

## 5. Teste de carga no endereço real
- [ ] `cd testes && npm install && node carga.js https://script.google.com/macros/s/SEU_CODIGO/exec 130 15` deve mostrar "Aceitos: 130 de 130". Depois apague a aba "Teste de carga" da planilha.

## 6. Teste final, antes de divulgar
- [ ] Abra o site no celular e no computador.
- [ ] Faça um cadastro de médico de teste e confira se ele chegou na planilha (ou no Formspree).
- [ ] Faça um cadastro de contratante de teste e uma vaga de teste.
- [ ] Clique num estado com grupo aberto e confira se abre o grupo certo.
- [ ] Apague os cadastros de teste da planilha.

## Onde publicar
- **Netlify (mais simples):** app.netlify.com/drop e arraste **somente a pasta `site`**. O arquivo `site/_headers` já configura segurança e cache automaticamente.
- **Cloudflare Pages:** também lê o `_headers`.
- **GitHub Pages:** funciona, mas ignora o `_headers`, então o site fica sem as proteções extras.

Nunca publique a pasta inteira do projeto: só a pasta `site`. As pastas `operacao`, `testes` e `prototipos-antigos` são internas.
