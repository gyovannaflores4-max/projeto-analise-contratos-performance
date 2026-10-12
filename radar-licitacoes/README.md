# Radar de Licitações (site)

Site para buscar editais de serviços médicos com prazo aberto no PNCP. Qualquer pessoa com o link entra, atualiza e confere os editais, sem precisar de login.

- `index.html`: o site.
- `api/editais.js`: servidor que consulta o PNCP (busca pública + detalhe de cada compra) e devolve os editais.
- `editais-base.json`: última lista salva, mostrada na hora em que o site abre e quando o PNCP não responde.
- `versao-claude.html`: versão publicada como artifact no Claude (não é usada pela Vercel).
- `prototipos.html`: protótipos A, B e C.

## Como publicar na Vercel (gratuito)

1. Entre em https://vercel.com e clique em **Sign Up → Continue with GitHub**.
2. Clique em **Add New… → Project** e escolha o repositório `projeto-analise-contratos-performance`.
3. Em **Root Directory**, clique em **Edit** e escolha a pasta `radar-licitacoes`.
4. Em **Framework Preset**, deixe **Other**. Não precisa preencher comando de build.
5. Clique em **Deploy**. Em cerca de 1 minuto a Vercel mostra o endereço do site, algo como `radar-licitacoes.vercel.app`.

## Como a atualização funciona

- Ao abrir, o site mostra a última lista salva e busca a versão nova no PNCP em seguida.
- A resposta do PNCP fica guardada por 15 minutos, então o site abre rápido para todos.
- O botão **Atualizar agora** pede uma busca nova. Para não sobrecarregar o PNCP, cliques de pessoas diferentes no mesmo intervalo de 5 minutos usam a mesma busca.
- Os editais salvos e a conferência do edital ficam no navegador de cada pessoa.

## Para mudar os termos buscados

Edite a lista `TERMOS` no começo de `api/editais.js` e faça o commit. A Vercel publica de novo sozinha.
