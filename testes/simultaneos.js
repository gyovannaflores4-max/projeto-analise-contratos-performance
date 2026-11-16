/*
  Simula muitas pessoas usando o site AO MESMO TEMPO, em navegadores reais,
  e confere se todos os cadastros saem do navegador sem erro.
  O envio é interceptado (nada vai para a internet).

  Rodar:  cd testes && node simultaneos.js [medicos=100] [empresas=30] [lote=26]
*/
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

const [MEDICOS, EMPRESAS, LOTE] = [100, 30, 26].map((d, i) => Number(process.argv[2 + i]) || d);
const SITE = path.resolve(__dirname, '..', 'site');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };
const UFS = ['SP', 'RJ', 'MG', 'BA', 'PR', 'RS', 'PE', 'CE', 'GO', 'SC'];

(async () => {
  const server = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(SITE, p); if (!f.startsWith(SITE) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': TIPOS[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const recebidos = [], falhas = [], tempos = [];

  async function pessoa(i, tipo) {
    const t0 = Date.now();
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const erros = [];
    page.on('pageerror', e => erros.push(e.message));
    await page.route('**/dados.js', r => r.fulfill({ contentType: 'text/javascript', body: 'window.PORTAL={formEndpoint:"https://formspree.io/f/carga",grupos:[]};' }));
    await page.route('https://formspree.io/**', async r => {
      await new Promise(res => setTimeout(res, 150 + Math.random() * 350)); // latência de rede simulada
      recebidos.push(JSON.parse(r.request().postData()));
      r.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    });
    try {
      await page.goto(base + '/');
      await page.waitForTimeout(1600);
      if (tipo === 'medico') {
        await page.click(`.st[data-uf=${UFS[i % UFS.length]}]`);
        await page.click(i % 2 ? '[data-rqe=rqe]' : '[data-rqe=sem-rqe]');
        await page.fill('#nome', `Médico Teste ${i}`);
        await page.fill('#crm', String(100000 + i));
        if (i % 2) { await page.selectOption('#esp', 'Pediatria'); await page.fill('#rqe', String(5000 + i)); }
        await page.fill('#wa', `119${String(80000000 + i)}`);
        await page.check('#ok');
        await page.click('#go');
        await page.waitForSelector('[data-step="4"]:not([hidden])', { timeout: 20000 });
      } else {
        await page.click('[data-ctab=cad]');
        await page.fill('#cad [name=nome]', `Coordenador ${i}`);
        await page.fill('#cad [name=cargo]', 'Coordenação');
        await page.fill('#c-crm', String(200000 + i));
        await page.fill('#cad [name=instituicao]', `Hospital Teste ${i}`);
        await page.selectOption('#cad [name=tipo_instituicao]', 'Hospital');
        await page.fill('#c-cnpj', '11222333000181');
        await page.selectOption('#cad [name=vagas_mes]', '1 a 5');
        await page.fill('#cad [name=cidade]', 'São Paulo');
        await page.selectOption('#c-uf', 'SP');
        await page.click('label[for=cm2]');
        await page.fill('#cad [name=email]', `rh${i}@hospital.com.br`);
        await page.fill('#c-wa', `119${String(70000000 + i)}`);
        await page.check('#cad [name=declaracao]');
        await page.click('#cad [type=submit]');
        await page.waitForSelector('#cad-done:not([hidden])', { timeout: 20000 });
      }
      if (erros.length) throw new Error(erros.join('; '));
      tempos.push(Date.now() - t0);
    } catch (e) { falhas.push(`${tipo} ${i}: ${e.message.split('\n')[0]}`); }
    finally { await ctx.close(); }
  }

  const fila = [...Array(MEDICOS)].map((_, i) => () => pessoa(i, 'medico')).concat([...Array(EMPRESAS)].map((_, i) => () => pessoa(i, 'empresa')));
  const t0 = Date.now();
  for (let i = 0; i < fila.length; i += LOTE) await Promise.all(fila.slice(i, i + LOTE).map(f => f()));
  await browser.close(); server.close();

  const med = recebidos.filter(r => r.tipo === 'entrada_grupo').length, emp = recebidos.filter(r => r.tipo === 'cadastro_contratante').length;
  tempos.sort((a, b) => a - b);
  console.log(`Pessoas simuladas: ${fila.length} (${MEDICOS} médicos, ${EMPRESAS} empresas), ${LOTE} ao mesmo tempo`);
  console.log(`Cadastros recebidos: ${med} médicos, ${emp} empresas`);
  console.log(`Falhas: ${falhas.length}`); falhas.slice(0, 10).forEach(f => console.log('  - ' + f));
  console.log(`Tempo por pessoa (abrir, preencher e enviar): mediana ${tempos[Math.floor(tempos.length / 2)]} ms, pior ${tempos.at(-1)} ms`);
  console.log(`Duração total: ${Math.round((Date.now() - t0) / 1000)} s`);
  process.exit(falhas.length || med !== MEDICOS || emp !== EMPRESAS ? 1 : 0);
})();
