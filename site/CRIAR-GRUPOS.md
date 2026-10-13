# Como criar os 54 grupos (27 estados × Com RQE / Sem RQE)

Tempo estimado: cerca de 2 minutos por grupo, umas 2 horas no total. É feito uma vez só.

## Antes de começar
- Use um **número de WhatsApp Business só da empresa** (chip próprio), não o pessoal de ninguém.
- Adicione **2 ou 3 pessoas da equipe como administradoras** em todos os grupos, para o grupo não ficar sem dono se um número cair.
- Tenha aberta a planilha `grupos.csv` (importada no Google Planilhas) para colar os links.

## Passo a passo para cada grupo
1. WhatsApp → **Nova conversa → Novo grupo**. Adicione um colega da equipe (o WhatsApp exige ao menos 1 pessoa).
2. **Nome:** copie da coluna `nome_do_grupo` da planilha. Exemplo: `Revezo Plantões SP · Com RQE`.
3. **Foto:** a mesma para todos (logo do Revezo). Opcional: a sigla do estado sobre o logo.
4. **Descrição:** cole o texto da seção "Descrição dos grupos" abaixo, trocando o estado e o tipo.
5. **Configurações do grupo** (toque no nome do grupo → Configurações do grupo):
   - **Editar dados do grupo:** somente administradores.
   - **Enviar mensagens:** todos os participantes. Se preferir um grupo só de vagas, deixe só administradores e publique vocês mesmos.
   - **Adicionar outros participantes:** somente administradores.
   - **Aprovar novos participantes:** **ativado**. Assim vocês conferem o CRM antes de aprovar.
6. Toque em **Convidar via link → Copiar link** e cole na coluna `link` da planilha, na linha do grupo.
7. Repita para o próximo.

## Quando um grupo lotar (limite do WhatsApp: 1.024 pessoas)
1. Crie um novo grupo com o mesmo nome e o número 2 no final. Exemplo: `Revezo Plantões SP · Com RQE 2`.
2. Na planilha, mude o `status` do grupo cheio para `cheio`.
3. Adicione uma linha nova: mesmo `uf` e `tipo`, `ordem` = 2, o link novo e `status` = `ativo`.
O site passa a mandar os novos médicos para o grupo 2 sozinho.

## Como aprovar quem pede para entrar
Cada médico deixa nome, CRM e WhatsApp no site antes de ir para o grupo. Esses dados chegam no seu e-mail e no painel do Formspree.
1. Abra o pedido pendente no grupo.
2. Confira o nome e o número no e-mail do Formspree.
3. Se quiser, confira o CRM e o RQE na consulta pública do CFM (portal.cfm.org.br → Busca por médicos).
4. Aprove. No grupo "Com RQE", aprove só quem tem RQE na especialidade informada.

## Descrição dos grupos (copiar e colar)

**Grupo Com RQE**
```
Grupo de plantões e vagas para médicos COM RQE em [ESTADO].
Regras:
1. Somente médicos com CRM ativo e RQE.
2. Toda vaga deve ter: local, data, horário, valor e contato.
3. Proibido propaganda, correntes e assuntos fora de vagas.
4. Nunca pague para conseguir plantão. Confira o CNPJ de quem contrata.
Hospitais e empresas anunciam grátis em: [ENDEREÇO DO SITE]
```

**Grupo Sem RQE**
```
Grupo de plantões e vagas para médicos SEM RQE (generalistas e recém-formados) em [ESTADO].
Regras:
1. Somente médicos com CRM ativo.
2. Toda vaga deve ter: local, data, horário, valor e contato.
3. Proibido propaganda, correntes e assuntos fora de vagas.
4. Nunca pague para conseguir plantão. Confira o CNPJ de quem contrata.
Hospitais e empresas anunciam grátis em: [ENDEREÇO DO SITE]
```

## Mensagem fixada sugerida (fixe no topo de cada grupo)
```
Bem-vindo(a) ao Revezo Plantões [UF]!
Vagas novas aparecem aqui todos os dias. Para indicar um colega, mande o link: [ENDEREÇO DO SITE]
Denúncias de golpe: fale com um administrador.
```
