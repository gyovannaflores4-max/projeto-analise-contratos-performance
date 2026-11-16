# Divulgação

## 1. Links com origem marcada
Acrescente `?ref=` ao endereço para saber de onde veio cada cadastro. A origem aparece na coluna **origem** da planilha.

| Onde você vai postar | Link |
|---|---|
| Grupos de WhatsApp de médicos | `https://SEU-ENDERECO/?ref=whatsapp` |
| Instagram (bio) | `https://SEU-ENDERECO/?ref=instagram` |
| Anúncio no Instagram | `https://SEU-ENDERECO/?ref=anuncio-ig` |
| LinkedIn (para coordenadores) | `https://SEU-ENDERECO/?ref=linkedin` |
| Indicação de um parceiro | `https://SEU-ENDERECO/?ref=nome-do-parceiro` |
| Piloto | `?ref=piloto-medicos` e `?ref=piloto-empresas` |

Use só letras minúsculas, números e hífen no `ref`.

## 2. Antes de divulgar
- [ ] Rode `node operacao/definir-dominio.js https://SEU-ENDERECO` e publique de novo. Sem isso, a imagem de prévia não aparece no WhatsApp.
- [ ] Cole o link numa conversa sua do WhatsApp e confira se aparecem a imagem e o título.
- [ ] (Opcional) Ative o contador de visitas: crie uma conta em goatcounter.com e coloque o código em `goatcounter` no `site/dados.js`.
- [ ] Cadastre o site no Google Search Console (search.google.com/search-console) e envie o endereço `https://SEU-ENDERECO/sitemap.xml`. Isso ajuda o Google a encontrar o site.

## 3. Textos prontos

**Para médicos (WhatsApp)**
```
Criamos grupos de plantão por estado, separados para médicos com RQE e sem RQE.
Gratuito, entrada aprovada só para médicos com CRM, e só vagas com valor, local e contato.
Escolha seu estado aqui: https://SEU-ENDERECO/?ref=whatsapp
```

**Para coordenadores e hospitais (WhatsApp ou LinkedIn)**
```
Está precisando cobrir escala? Cadastre sua instituição e anuncie vagas nos grupos de médicos do estado certo, com e sem RQE.
O anúncio básico é gratuito: https://SEU-ENDERECO/?ref=linkedin#hospitais
```

**Bio do Instagram**
```
Grupos de plantão médico por estado | Com e sem RQE | Grátis para médicos
👇 Escolha seu estado
```

## 4. Cuidados
- Não adicione pessoas em grupos sem elas pedirem, e não mande mensagem em massa: o WhatsApp pode banir o número, e isso também conflita com a LGPD.
- Poste nos grupos de terceiros só com permissão do administrador.
- Evite prometer números ("milhares de vagas") que ainda não existem.
