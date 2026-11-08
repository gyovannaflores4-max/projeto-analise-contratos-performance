# Nexum — interface demonstrativa

Primeira interface visual do Nexum, mantida em uma pasta independente do portal atual.

## Executar localmente
Abra `index.html` no navegador. Esta etapa é um protótipo estático e utiliza dados fictícios.

## Publicar em preview separado na Vercel
Crie um projeto Vercel conectado a este repositório e configure:
- Root Directory: `nexum-app`
- Framework Preset: Other
- Build Command: vazio
- Output Directory: vazio (ou `.`, conforme a tela da Vercel)

A publicação deve usar a branch `nexum-mvp`. Não alterar o projeto de produção existente.

## Estado
- Interface demonstrativa e navegação entre módulos.
- Pesquisa simples na tabela de contratos.
- Cadastro temporário de contratos apenas no navegador.
- Ainda sem autenticação, persistência, upload, IA ou dados reais.
- Integração futura com o projeto Supabase Nexum: `wzstmnsxbpwvpukgtqcd`.

Não inserir chaves secretas no frontend.