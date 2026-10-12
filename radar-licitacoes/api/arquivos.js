// Função da Vercel: lista os documentos publicados de um edital no PNCP (edital, termo de referência, anexos)
// GET /api/arquivos?id=<cnpj>-<ano>-<sequencial>
const { getJson } = require("./editais.js");

module.exports = async (req, res) => {
  const id = String((req.query && req.query.id) || "");
  const m = id.match(/^(\d{14})-(\d{4})-(\d{1,7})$/);
  if (!m) { res.status(400).json({ erro: "Edital inválido." }); return; }
  const [, cnpj, ano, seq] = m;
  try {
    const lista = await getJson("https://pncp.gov.br/api/pncp/v1/orgaos/" + cnpj + "/compras/" + ano + "/" + seq + "/arquivos", 12000, 3);
    const arquivos = (Array.isArray(lista) ? lista : [])
      .filter(a => a && a.statusAtivo !== false)
      .map(a => ({
        titulo: String(a.titulo || a.tipoDocumentoNome || "Documento"),
        tipo: String(a.tipoDocumentoNome || a.tipoDocumentoDescricao || ""),
        url: String(a.url || a.uri || "https://pncp.gov.br/pncp-api/v1/orgaos/" + cnpj + "/compras/" + ano + "/" + seq + "/arquivos/" + a.sequencialDocumento),
        publicadoEm: a.dataPublicacaoPncp || null
      }))
      .filter(a => /^https:\/\/pncp\.gov\.br\//.test(a.url));
    res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json({ id, arquivos });
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ erro: "O PNCP não respondeu agora." });
  }
};
