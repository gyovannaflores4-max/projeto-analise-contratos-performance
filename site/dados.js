/*
  GRUPOS DO PORTAL
  ----------------
  Há duas formas de informar os links dos grupos. Use só uma.

  1) PLANILHA DO GOOGLE (recomendado, não precisa mexer em código depois)
     - Importe o arquivo grupos.csv no Google Planilhas.
     - Preencha a coluna "link" com o convite de cada grupo (https://chat.whatsapp.com/...).
     - Arquivo > Compartilhar > Publicar na web > escolha a aba > "Valores separados por vírgula (.csv)" > Publicar.
     - Cole o endereço gerado em planilhaCSV abaixo.

  2) DIRETO AQUI, na lista "grupos" abaixo (mesmas colunas da planilha).

  Colunas:
    uf      sigla do estado (SP, RJ, ...)
    tipo    "rqe" (médicos com RQE) ou "sem-rqe" (médicos sem RQE)
    ordem   1 para o primeiro grupo; 2, 3... para os grupos criados quando o anterior lotar
    link    convite do WhatsApp. Vazio = grupo ainda não criado
    status  "ativo" ou "cheio". O site usa o primeiro grupo ativo com link, pela ordem.
*/
window.PORTAL = {
  planilhaCSV: "",

  grupos: [
    // Exemplo de como fica quando você tiver os links:
    // { uf: "SP", tipo: "rqe",     ordem: 1, link: "https://chat.whatsapp.com/XXXX", status: "cheio" },
    // { uf: "SP", tipo: "rqe",     ordem: 2, link: "https://chat.whatsapp.com/YYYY", status: "ativo" },
    // { uf: "SP", tipo: "sem-rqe", ordem: 1, link: "https://chat.whatsapp.com/ZZZZ", status: "ativo" },
  ]
};
