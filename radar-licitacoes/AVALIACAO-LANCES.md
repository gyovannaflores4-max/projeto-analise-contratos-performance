# Avaliação: automatização dos lances nos pregões eletrônicos

**Resumo:** construí um **assistente de lances** (tela *Lances* da Gestão de Prazos), não um robô que envia lances sozinho. Ele guarda os parâmetros de cada item, calcula o próximo lance dentro dos limites, mostra a posição e o tempo da etapa aberta, mas o lance é sempre enviado por uma pessoa, no portal. Abaixo explico por quê e o que seria preciso para ir além.

## O que foi pedido e o que está pronto

| Pedido | Situação |
|---|---|
| Valor mínimo aceitável por item | **Pronto.** Cadastrado em cada item da licitação. O assistente nunca sugere lance abaixo dele e manda parar quando o melhor lance já está abaixo. |
| Limites de redução dos lances | **Pronto.** Redução por lance (R$ ou %) e redução máxima por lance, para evitar um lance muito abaixo do anterior por engano. |
| Monitorar lances dos concorrentes em tempo real | **Parcial.** A pessoa informa o melhor lance que aparece no portal (ou registra cada lance) e o assistente recalcula na hora. A leitura automática da tela do portal não foi feita (motivos abaixo). |
| Envio automático de lances dentro dos limites | **Não feito**, por decisão de risco. O assistente mostra o valor pronto para copiar e colar no portal. |
| Alertas de posição e de encerramento da etapa | **Pronto, no navegador.** Mostra se estamos em 1º lugar, conta os 10 minutos do modo aberto com as prorrogações de 2 minutos e pode tocar um som nos 2 minutos finais. |

## Por que não enviar lances automaticamente agora

1. **Não existe interface oficial para robôs.** Os portais não oferecem API para o fornecedor enviar lances. O Compras.gov.br, por exemplo, exige login gov.br (nível prata ou ouro) ou certificado digital, e a sala de disputa funciona dentro dessa sessão. Testei as consultas públicas do Compras.gov.br: o chat e a situação dos itens exigem login, e a consulta pública usa captcha.
2. **Seria preciso simular uma pessoa no navegador**, com o certificado ou a senha gov.br da empresa guardados num servidor. Isso cria risco de segurança (quem tem o certificado assina pela empresa) e quebra a cada mudança de tela do portal, justamente durante uma disputa.
3. **Regras dos portais e dos editais.** O sistema federal adotou intervalos mínimos entre lances do mesmo licitante e em relação ao melhor lance justamente para reduzir a vantagem de robôs, e o TCU já tratou do uso dessas ferramentas. Alguns editais e termos de uso dos portais trazem regras próprias. Antes de qualquer automação, o jurídico precisa conferir os termos do portal e do edital.
4. **O lance não pode ser desfeito.** Um erro de digitação ou de parâmetro num robô vira proposta da empresa. Com valor mínimo mal calculado, o robô pode levar a um preço inexequível, que depois terá de ser justificado ou honrado.

## Regras de disputa usadas no assistente

Baseadas na IN SEGES/ME nº 73/2022 (pregão eletrônico no sistema federal). **Confira sempre o modo de disputa e os intervalos no edital**, porque cada órgão e portal pode ter regras próprias.

- **Modo aberto:** etapa de 10 minutos, prorrogada automaticamente por 2 minutos sempre que houver lance nos 2 minutos finais. O cronômetro do assistente segue essa regra a partir dos lances registrados.
- **Modo aberto e fechado:** etapa aberta seguida de encerramento aleatório e de um lance final fechado. O cronômetro serve só como referência; o encerramento aleatório não é previsível.
- **Intervalo mínimo de diferença entre lances:** quando o edital fixar, use esse valor como "redução por lance" do item.

## Como usar o assistente

1. Na licitação, em **Itens e estratégia de lances**, cadastre cada item com valor de referência, **valor mínimo aceitável** (custo + impostos + margem mínima) e redução por lance.
2. Na sessão, abra **Lances**, escolha a licitação e o item e clique em **Iniciar contagem** quando a disputa do item abrir.
3. Digite o melhor lance que aparece no portal. O assistente mostra o próximo lance (ou "Manter" / "Parar"). Use **Copiar valor**, cole no portal e envie.
4. Registre o lance enviado. A posição e o cronômetro se atualizam.

## Caminho se a empresa quiser automatizar de verdade

1. **Medir antes:** usar o assistente por alguns pregões e registrar quantos itens foram perdidos por tempo de reação (e não por preço). Se forem poucos, o robô não compensa o risco.
2. **Avaliar fornecedores especializados** de robô de lances que já operam nos portais usados pela empresa, verificando: aceitação pelos termos de uso de cada portal, onde fica guardado o certificado, registro (log) de cada lance, trava de valor mínimo por item e responsabilidade contratual em caso de erro.
3. **Parecer jurídico** sobre termos de uso e cláusulas dos editais mais frequentes.
4. **Piloto controlado:** um portal, poucos itens, valor mínimo conferido por duas pessoas e alguém acompanhando a sessão.

O que já existe aqui (parâmetros por item, histórico e registro dos lances) continua útil em qualquer desses caminhos.
