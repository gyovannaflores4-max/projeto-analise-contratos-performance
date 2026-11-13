/*
  CONFIGURAÇÃO DO SITE
  ====================
  Este é o único arquivo que você precisa editar para colocar o site para funcionar.
  Passo a passo completo: operacao/CHECKLIST-PUBLICACAO.md

  1) formEndpoint: para onde vão os cadastros (médicos, contratantes e vagas).
     Use UMA destas opções:
       - Google Planilhas (recomendado, gratuito e sem limite mensal pequeno):
         "https://script.google.com/macros/s/SEU_CODIGO/exec"
         Como criar: operacao/google-apps-script.gs
       - Formspree: "https://formspree.io/f/SEU_CODIGO"
         Atenção: o plano gratuito do Formspree tem limite mensal de envios.
     Vazio ("") = modo demonstração: o site mostra um aviso e não salva nada.

  2) planilhaCSV (opcional): endereço da planilha de grupos publicada como CSV.
     Se preenchido, os links dos grupos vêm da planilha e a lista "grupos" abaixo é ignorada.

  3) grupos: links dos grupos, se você não usar a planilha.
     Colunas:
       uf      sigla do estado (SP, RJ, ...)
       tipo    "rqe" (médicos com RQE) ou "sem-rqe" (médicos sem RQE)
       ordem   1 para o primeiro grupo; 2, 3... para os grupos criados quando o anterior lotar
       link    convite do WhatsApp (https://chat.whatsapp.com/...). Vazio = grupo ainda não criado.
               Qualquer outro tipo de link é ignorado pelo site, por segurança.
       status  "ativo" ou "cheio". O site usa o primeiro grupo ativo com link, pela ordem.

  Depois de editar, abra index.html no navegador e confira se não há aviso de erro.
*/
window.PORTAL = {
  formEndpoint: "",

  planilhaCSV: "",

  grupos: [
    // Exemplo de como fica quando você tiver os links:
    // { uf: "SP", tipo: "rqe",     ordem: 1, link: "https://chat.whatsapp.com/XXXXXXXXXXXXXXXXXXXXXX", status: "cheio" },
    // { uf: "SP", tipo: "rqe",     ordem: 2, link: "https://chat.whatsapp.com/YYYYYYYYYYYYYYYYYYYYYY", status: "ativo" },
    // { uf: "SP", tipo: "sem-rqe", ordem: 1, link: "https://chat.whatsapp.com/ZZZZZZZZZZZZZZZZZZZZZZ", status: "ativo" },
  ]
};
