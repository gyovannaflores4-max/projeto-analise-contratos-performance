# Segurança: como os dados ficam protegidos

## Onde está o risco de verdade
O site **não tem servidor, banco de dados nem senha de administrador**. São só arquivos entregues pelo Netlify, por isso quase não há o que invadir nele.

Os dados sigilosos (nome, CRM, WhatsApp, CNPJ) ficam na **Planilha Google de cadastros**. O risco real, e o mais comum em negócios pequenos, é alguém **entrar numa das suas contas** com uma senha vazada ou um golpe de "link falso". Proteja estas contas antes de lançar:

| Conta | Por que importa |
|---|---|
| Google (dona da planilha e do script) | Guarda todos os cadastros |
| Netlify | Quem entra pode trocar o site por uma página falsa |
| Registro do domínio (ex.: registro.br) | Quem entra pode desviar o endereço do site |
| Números de WhatsApp dos administradores | Quem clona o número toma os grupos |
| E-mail usado para tudo isso | Recupera a senha de todas as outras |

## Checklist obrigatório (antes do lançamento)
- [ ] **Verificação em duas etapas** ligada no Google, no Netlify, no registro do domínio e no e-mail. Prefira aplicativo autenticador (Google Authenticator, Microsoft Authenticator) a SMS.
- [ ] **Verificação em duas etapas no WhatsApp** de cada administrador (Configurações > Conta > Confirmação em duas etapas).
- [ ] **Senhas únicas e longas** em cada serviço, guardadas num gerenciador de senhas (Bitwarden, 1Password ou o do Google).
- [ ] **Duas planilhas separadas:** a de **grupos** (pode ser publicada, só tem links) e a de **cadastros** (nunca publicada). Nunca use "Publicar na web" nem "Qualquer pessoa com o link" na planilha de cadastros.
- [ ] Na planilha de cadastros, **compartilhe só com quem precisa**, por e-mail, e revise a lista de acesso todo mês (botão Compartilhar).
- [ ] **Não baixe a planilha** em computadores de terceiros nem envie por WhatsApp ou e-mail.
- [ ] **Backup mensal:** Arquivo > Fazer uma cópia, guardada no mesmo Google Drive protegido.

## O que já vem protegido no site
- Conexão criptografada (HTTPS), ativada automaticamente pelo Netlify.
- Regras de segurança do navegador no arquivo `site/_headers`: o site não pode ser colocado dentro de outro site (golpe de "clique falso"), só carrega código dele mesmo e dos serviços autorizados, e não acessa câmera, microfone ou localização.
- Nenhum texto digitado pelos visitantes é tratado como código (bloqueia ataques de injeção).
- Links de grupo que não são convites do WhatsApp são ignorados, mesmo se alguém alterar a planilha de grupos.
- Proteção contra robôs: campo escondido, tempo mínimo de preenchimento, limite por minuto e descarte de cadastros repetidos no script do Google.
- O script do Google **só grava**: ninguém consegue ler a planilha pelo endereço do formulário.
- Textos que tentam virar fórmula na planilha são neutralizados.
- Proteção contra ataques de excesso de acessos (DDoS): já incluída na rede do Netlify.

## Proteções extras (quando crescer)
- **Cloudflare (plano gratuito)** na frente do domínio: filtro adicional contra robôs e ataques.
- **Google Workspace** (pago) em vez de conta Gmail comum: mais controle sobre quem acessa e registros de acesso.
- **Teste de invasão (pentest)** feito por um profissional antes de passar de alguns milhares de cadastros ou de começar a cobrar.
- **Seguro de responsabilidade cibernética**, quando houver receita.

Nenhum serviço garante segurança total. O que reduz o risco de verdade é a combinação: verificação em duas etapas em tudo, poucas pessoas com acesso e dados separados.

## Se algo der errado (plano de incidente)
1. **Troque as senhas** da conta afetada e encerre as sessões abertas (no Google: Segurança > Seus dispositivos > Sair).
2. **Confira o acesso** à planilha (Compartilhar) e remova quem não deveria estar lá. No Google, veja também Arquivo > Histórico de versões.
3. **Se o site foi alterado:** no Netlify, aba Deploys, publique de novo a versão anterior.
4. **Se dados pessoais vazaram:** a LGPD exige comunicar a ANPD e as pessoas afetadas quando houver risco relevante. O prazo definido pela ANPD é curto (hoje, 3 dias úteis); procure um advogado no mesmo dia.
5. **Registre** o que aconteceu, quando e o que foi feito.

## Para quem quiser relatar uma falha
Divulgue um e-mail de contato para segurança (o mesmo da política de privacidade serve) e responda com agilidade.
