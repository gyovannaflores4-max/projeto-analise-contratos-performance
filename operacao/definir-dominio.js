#!/usr/bin/env node
/*
  Configura o endereço definitivo do site em todos os lugares de uma vez:
   - imagem de prévia do WhatsApp/Instagram/LinkedIn (precisa de endereço completo)
   - endereço oficial da página para o Google (canonical) e dados estruturados
   - robots.txt e sitemap.xml (mapa do site para o Google)

  Rodar na pasta do projeto, depois de saber o endereço:
    node operacao/definir-dominio.js https://revezo.com.br

  Pode rodar de novo quantas vezes quiser (por exemplo, se trocar de domínio).
*/
const fs = require('node:fs');
const path = require('node:path');

const SITE = process.env.SITE_DIR || path.resolve(__dirname, '..', 'site');
const entrada = String(process.argv[2] || '').trim().replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(entrada)) {
  console.error('Informe o endereço completo, começando com https://  (ex.: https://revezo.com.br)');
  process.exit(2);
}
const URL_SITE = entrada.toLowerCase();
const hoje = new Date().toISOString().slice(0, 10);

/* 1. index.html: bloco entre os marcadores dominio:inicio e dominio:fim */
const idxPath = path.join(SITE, 'index.html');
let idx = fs.readFileSync(idxPath, 'utf8');
const ini = idx.indexOf('<!-- dominio:inicio'), fim = idx.indexOf('<!-- dominio:fim -->');
if (ini < 0 || fim < 0) { console.error('Marcadores dominio:inicio/dominio:fim não encontrados em site/index.html'); process.exit(1); }
const ld = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', name: 'Revezo Plantões', url: URL_SITE + '/', inLanguage: 'pt-BR' },
    { '@type': 'Organization', name: 'Revezo Plantões', url: URL_SITE + '/', logo: URL_SITE + '/favicon.svg' },
  ],
};
const bloco = `<!-- dominio:inicio (preenchido por: node operacao/definir-dominio.js ${URL_SITE}) -->
<link rel="canonical" href="${URL_SITE}/">
<meta property="og:url" content="${URL_SITE}/">
<meta property="og:image" content="${URL_SITE}/og.jpg">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
`;
idx = idx.slice(0, ini) + bloco + idx.slice(fim);
fs.writeFileSync(idxPath, idx);

/* 2. robots.txt */
fs.writeFileSync(path.join(SITE, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /404.html\n\nSitemap: ${URL_SITE}/sitemap.xml\n`);

/* 3. sitemap.xml */
const paginas = [['/', '1.0'], ['/termos.html', '0.3'], ['/privacidade.html', '0.3']];
fs.writeFileSync(path.join(SITE, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  paginas.map(([p, pr]) => `  <url><loc>${URL_SITE}${p}</loc><lastmod>${hoje}</lastmod><priority>${pr}</priority></url>`).join('\n') +
  `\n</urlset>\n`);

console.log(`Pronto. Endereço configurado: ${URL_SITE}`);
console.log('Arquivos atualizados: site/index.html, site/robots.txt, site/sitemap.xml');
console.log('Próximo passo: publique de novo a pasta site e teste o link colando-o numa conversa do WhatsApp.');
