/*
  Testes automáticos do site (pasta ../site).
  Rodar:  cd testes && npm install && npx playwright install chromium && npm test

  O que é testado:
   - HTML válido em todas as páginas e JavaScript sem erro de sintaxe
   - nenhum erro no console, nenhuma rolagem lateral de 320 a 1440 px
   - acessibilidade (axe) nos estados principais
   - fluxo do médico: em breve, grupo ativo, grupo cheio pulado, link malicioso ignorado
   - planilha CSV com link inválido e com falha de rede
   - cadastro de contratante, anúncio de vaga e validações
   - envio duplicado bloqueado, proteção contra robôs, erro de rede mostrado ao usuário
   - modo demonstração avisado quando o formulário não está configurado
*/
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('@playwright/test');

const SITE = path.resolve(__dirname, '..', 'site');
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const ENDPOINT = 'https://formspree.io/f/teste123';
const LINK = id => `https://chat.whatsapp.com/${id}${'A'.repeat(16)}`;
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain' };

const CSP = (fs.readFileSync(path.join(SITE, '_headers'), 'utf8').match(/Content-Security-Policy:\s*(.+)/) || [])[1];
let server, base, browser;

before(async () => {
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(SITE, p);
    if (!file.startsWith(SITE) || !fs.existsSync(file)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(file)] || 'application/octet-stream', ...(process.env.SEM_CSP ? {} : { 'Content-Security-Policy': CSP }) });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});
after(async () => { await browser?.close(); server?.close(); });

/* Abre a página com um dados.js de teste e intercepta o envio do formulário. */
async function abrir({ config = {}, largura = 1280, envio = 'ok', csv = null } = {}) {
  const page = await browser.newPage({ viewport: { width: largura, height: 900 } });
  const erros = [], envios = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  const cfg = { formEndpoint: ENDPOINT, planilhaCSV: '', grupos: [], ...config };
  await page.route('**/dados.js', r => r.fulfill({ contentType: 'text/javascript', body: `window.PORTAL=${JSON.stringify(cfg)};` }));
  await page.route('https://formspree.io/**', async r => {
    envios.push(JSON.parse(r.request().postData() || '{}'));
    if (envio === 'falha') return r.abort('failed');
    if (envio === 'lento') await new Promise(res => setTimeout(res, 800));
    return r.fulfill({ status: envio === 'erro500' ? 500 : 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await page.route('https://docs.google.com/spreadsheets/**', r => csv === 'falha' ? r.abort('failed') : r.fulfill({ contentType: 'text/csv', body: csv || '' }));
  await page.route('https://chat.whatsapp.com/**', r => r.fulfill({ contentType: 'text/html', body: '<title>WhatsApp</title>' }));
  await page.goto(`${base}/index.html`);
  await page.waitForTimeout(1600); // passa da proteção anti-robô (envios em menos de 1,5 s são ignorados)
  return { page, erros, envios };
}

async function axe(page, contexto) {
  await page.waitForTimeout(500); // espera as animações de entrada terminarem
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: AXE });
  const v = await page.evaluate(async () => (await axe.run(document, { resultTypes: ['violations'] })).violations
    .map(x => `${x.id} (${x.impact}): ${x.nodes.slice(0, 2).map(n => n.target.join(' ')).join(' | ')}`));
  assert.deepEqual(v, [], `Acessibilidade em "${contexto}"`);
}

async function preencheMedico(page, { uf = 'SP', tipo = 'sem-rqe' } = {}) {
  await page.click(`.st[data-uf=${uf}]`);
  await page.click(`[data-rqe=${tipo}]`);
  await page.fill('#nome', 'Ana Souza');
  await page.fill('#crm', '123456');
  if (tipo === 'rqe') { await page.selectOption('#esp', 'Pediatria'); await page.fill('#rqe', '4567'); }
  await page.fill('#wa', '11988887777');
  await page.check('#ok');
}

async function preencheContratante(page) {
  await page.click('[data-ctab=cad]');
  const f = '#cad ';
  await page.fill(f + '[name=nome]', 'Carlos Mendes');
  await page.fill(f + '[name=cargo]', 'Coordenador do PS');
  await page.fill('#c-crm', '154321');
  await page.selectOption('#c-crmuf', 'MG');
  await page.fill(f + '[name=instituicao]', 'Hospital Exemplo');
  await page.selectOption(f + '[name=tipo_instituicao]', 'Hospital');
  await page.fill('#c-cnpj', '11222333000181');
  await page.selectOption(f + '[name=vagas_mes]', '6 a 20');
  await page.fill(f + '[name=cidade]', 'Belo Horizonte');
  await page.selectOption('#c-uf', 'MG');
  await page.click('label[for=cm1]');
  await page.click('label[for=ct1]');
  await page.fill(f + '[name=email]', 'carlos@hospital.com.br');
  await page.fill('#c-wa', '31999998888');
  await page.check(f + '[name=declaracao]');
}

/* ---------------- estáticos ---------------- */

test('HTML válido em todas as páginas', () => {
  const paginas = fs.readdirSync(SITE).filter(f => f.endsWith('.html')).map(f => path.join(SITE, f));
  const cfg = path.join(__dirname, '.htmlvalidate.json');
  try { execFileSync(process.execPath, [path.join(__dirname, 'node_modules', 'html-validate', 'bin', 'html-validate.mjs'), '-c', cfg, ...paginas], { stdio: 'pipe' }); }
  catch (e) { assert.fail(String(e.stdout || e.message)); }
});

test('JavaScript do index e dados.js sem erro de sintaxe', () => {
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  assert.ok(scripts.length >= 1);
  for (const s of scripts) new Function(s);
  new Function(fs.readFileSync(path.join(SITE, 'dados.js'), 'utf8'));
});

test('arquivos obrigatórios presentes e sem dependência externa de fonte', () => {
  for (const f of ['index.html', 'dados.js', 'privacidade.html', 'termos.html', '404.html', 'legal.css', 'og.jpg', 'favicon.svg', 'robots.txt', '_headers', 'fontes/plus-jakarta-sans-latin.woff2', 'fontes/OFL.txt'])
    assert.ok(fs.existsSync(path.join(SITE, f)), `falta site/${f}`);
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  assert.ok(!html.includes('fonts.googleapis.com'), 'o index não deve carregar fontes do Google');
});

/* ---------------- layout e acessibilidade ---------------- */

test('sem erros e sem rolagem lateral de 320 a 1440 px; páginas legais também', async () => {
  for (const largura of [320, 360, 390, 768, 1024, 1440]) {
    const { page, erros } = await abrir({ largura });
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    assert.equal(sw, largura, `rolagem lateral em ${largura}px`);
    assert.deepEqual(erros, [], `erros em ${largura}px`);
    await page.close();
  }
  for (const pg of ['privacidade.html', 'termos.html', '404.html']) {
    const page = await browser.newPage({ viewport: { width: 320, height: 800 } });
    await page.goto(`${base}/${pg}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 320, `rolagem lateral em ${pg}`);
    await axe(page, pg);
    await page.close();
  }
});

test('acessibilidade nos estados principais', async () => {
  const { page } = await abrir();
  await axe(page, 'início');
  await page.click('.st[data-uf=SP]');
  await axe(page, 'passo 2');
  await page.click('[data-rqe=rqe]');
  await axe(page, 'passo 3');
  await page.click('[data-ctab=vaga]');
  await axe(page, 'aba de vaga');
  await page.close();
});

/* ---------------- fluxo do médico ---------------- */

test('médico: grupo sem link vira "em breve" e os dados são enviados', async () => {
  const { page, erros, envios } = await abrir();
  await preencheMedico(page, { uf: 'BA' });
  await page.click('#go');
  await page.waitForSelector('[data-step="4"]:not([hidden])');
  assert.match(await page.textContent('#done-title'), /BA · Sem RQE abre em breve/);
  assert.equal(envios.length, 1);
  assert.equal(envios[0].tipo, 'entrada_grupo');
  assert.equal(envios[0].uf, 'BA');
  assert.equal(envios[0].crm, '123456');
  assert.equal(envios[0].site, undefined, 'campo anti-robô não deve ser enviado');
  assert.equal(envios[0].especialidade, undefined, 'sem RQE não envia especialidade');
  assert.deepEqual(erros, []);
  await page.close();
});

test('médico: grupo cheio é pulado e o médico é levado ao grupo 2', async () => {
  const grupos = [
    { uf: 'SP', tipo: 'rqe', ordem: 1, link: LINK('CHEIO'), status: 'cheio' },
    { uf: 'SP', tipo: 'rqe', ordem: 2, link: LINK('ATIVO'), status: 'ativo' },
  ];
  const { page, envios } = await abrir({ config: { grupos } });
  await preencheMedico(page, { uf: 'SP', tipo: 'rqe' });
  assert.equal(await page.textContent('#dest-nome'), 'Revezo Plantões SP · Com RQE 2');
  await page.click('#go');
  await page.waitForURL(/chat\.whatsapp\.com\/ATIVO/, { timeout: 5000 });
  assert.equal(envios[0].link_destino, LINK('ATIVO'));
  assert.equal(envios[0].rqe, '4567');
  await page.close();
});

test('segurança: link que não é convite do WhatsApp é ignorado', async () => {
  const grupos = [{ uf: 'RJ', tipo: 'sem-rqe', ordem: 1, link: 'javascript:alert(1)', status: 'ativo' },
                  { uf: 'RJ', tipo: 'rqe', ordem: 1, link: 'https://site-falso.com/grupo', status: 'ativo' }];
  const { page } = await abrir({ config: { grupos } });
  const pills = await page.$$eval('.ufcard', cs => cs.find(c => c.textContent.includes('Rio de Janeiro')).textContent);
  assert.match(pills, /Com RQE · em breve/);
  assert.match(pills, /Sem RQE · em breve/);
  await page.close();
});

test('planilha CSV: lida, valida links e usa dados.js se falhar', async () => {
  const csv = 'uf,tipo,ordem,link,status\r\nPE,rqe,1,' + LINK('PLAN') + ',ativo\r\nPE,sem-rqe,1,https://ruim.com/x,ativo\r\nXX,rqe,1,' + LINK('UFX') + ',ativo\r\n';
  let { page } = await abrir({ config: { planilhaCSV: 'https://docs.google.com/spreadsheets/d/e/TESTE/pub?output=csv' }, csv });
  await page.waitForFunction(() => document.querySelector('#s-ativos').textContent === '1');
  await page.close();
  ({ page } = await abrir({ config: { planilhaCSV: 'https://docs.google.com/spreadsheets/d/e/TESTE/pub?output=csv', grupos: [{ uf: 'AC', tipo: 'rqe', ordem: 1, link: LINK('BACKUP'), status: 'ativo' }] }, csv: 'falha' }));
  await page.waitForTimeout(300);
  assert.equal(await page.textContent('#s-ativos'), '1', 'com a planilha fora do ar, usa os grupos do dados.js');
  await page.close();
});

test('médico: validações mostram o que falta', async () => {
  const { page, envios } = await abrir();
  await page.click('.st[data-uf=SP]');
  await page.click('[data-rqe=rqe]');
  await page.click('#go');
  const msg = await page.textContent('#err');
  for (const t of ['nome completo', 'número do CRM', 'especialidade', 'número do RQE', 'WhatsApp com DDD', 'autorização']) assert.ok(msg.includes(t), `faltou avisar: ${t}`);
  assert.equal(envios.length, 0);
  await page.close();
});

test('envio: erro de rede é mostrado e nada é duplicado', async () => {
  let { page, envios } = await abrir({ envio: 'falha' });
  await preencheMedico(page);
  await page.click('#go');
  await page.waitForSelector('#err:not([hidden])');
  assert.match(await page.textContent('#err'), /Não conseguimos enviar/);
  await page.close();

  ({ page, envios } = await abrir({ envio: 'lento' }));
  await preencheMedico(page);
  await page.click('#go');
  await page.press('#wa', 'Enter');
  await page.press('#wa', 'Enter');
  await page.waitForSelector('[data-step="4"]:not([hidden])');
  assert.equal(envios.length, 1, 'cliques e Enter repetidos não podem duplicar o cadastro');
  await page.close();
});

test('proteção contra robôs: campo escondido preenchido não envia', async () => {
  const { page, envios } = await abrir();
  await preencheMedico(page);
  await page.evaluate(() => { document.querySelector('#dados [name=site]').value = 'spam'; });
  await page.click('#go');
  await page.waitForSelector('[data-step="4"]:not([hidden])');
  assert.equal(envios.length, 0);
  await page.close();
});

test('modo demonstração: sem formEndpoint aparece aviso e nada é enviado', async () => {
  const { page, envios } = await abrir({ config: { formEndpoint: '' } });
  assert.equal(await page.isVisible('#demo-banner'), true);
  await preencheMedico(page);
  await page.click('#go');
  await page.waitForSelector('[data-step="4"]:not([hidden])');
  assert.match(await page.textContent('#done-text'), /Modo demonstração/);
  assert.equal(envios.length, 0);
  await page.close();
});

/* ---------------- contratantes ---------------- */

test('contratante: cadastro completo, depois vaga já preenchida', async () => {
  const { page, envios, erros } = await abrir();
  await preencheContratante(page);
  await page.fill('#c-cnpj', '11222333000180');
  await page.click('#cad [type=submit]');
  assert.match(await page.textContent('#cad .err'), /CNPJ informado não é válido/);
  await page.fill('#c-cnpj', '11222333000181');
  await page.click('#cad [type=submit]');
  await page.waitForSelector('#cad-done:not([hidden])');
  const c = envios.at(-1);
  assert.equal(c.tipo, 'cadastro_contratante');
  assert.equal(c.cnpj, '11.222.333/0001-81');
  assert.match(c.estados_atuacao, /MG/);
  assert.equal(c.whatsapp, '(31) 99999-8888');

  await page.click('#cad-to-vaga');
  assert.equal(await page.inputValue('#vaga [name=contratante]'), 'Hospital Exemplo');
  await page.fill('#vaga [name=vaga]', 'PS adulto noturno');
  await page.selectOption('#vaga [name=grupo]', 'sem-rqe');
  await page.fill('#vaga [name=valor]', '1500');
  await page.fill('#vaga [name=data]', '2020-01-01');
  await page.fill('#vaga [name=horario]', '19:00–07:00');
  await page.click('#vaga [type=submit]');
  assert.match(await page.textContent('#vaga .err'), /data da vaga já passou/);
  const amanha = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  await page.fill('#vaga [name=data]', amanha);
  await page.click('#vaga [type=submit]');
  await page.waitForSelector('.toast:not([hidden])');
  assert.equal(envios.at(-1).tipo, 'vaga');
  assert.equal(envios.at(-1).cadastrado, 'sim');
  assert.deepEqual(erros, []);
  await page.close();
});

test('contratante: perfil RH não pede CRM e e-mail inválido é recusado', async () => {
  const { page } = await abrir();
  await preencheContratante(page);
  await page.click('label[for=cp3]');
  assert.equal(await page.isVisible('#c-crm'), false);
  await page.fill('#cad [name=email]', 'carlos@');
  await page.click('#cad [type=submit]');
  assert.match(await page.textContent('#cad .err'), /e-mail/);
  await page.close();
});

/* ---------------- publicação ---------------- */

test('regras de segurança (CSP do _headers) não bloqueiam nada do site', async () => {
  assert.ok(CSP && CSP.includes("default-src 'self'"), 'CSP não encontrada em site/_headers');
  const { page, erros } = await abrir();
  await preencheMedico(page);
  await page.click('#go');
  await page.waitForSelector('[data-step="4"]:not([hidden])');
  const fonteOk = await page.evaluate(() => document.fonts.check('16px "Plus Jakarta Sans"'));
  assert.ok(fonteOk, 'a fonte hospedada no site deve carregar');
  assert.deepEqual(erros.filter(e => /Content Security Policy|Refused/.test(e)), []);
  assert.deepEqual(erros, []);
  await page.close();
});

test('envio pelo Google Planilhas (Apps Script) usa o formato esperado', async () => {
  const url = 'https://script.google.com/macros/s/TESTE/exec';
  const { page } = await abrir({ config: { formEndpoint: url } });
  const corpos = [];
  await page.route('https://script.google.com/**', r => { corpos.push(r.request().postData()); r.fulfill({ status: 200, body: 'ok' }); });
  await preencheMedico(page, { uf: 'GO' });
  await page.click('#go');
  await page.waitForSelector('[data-step="4"]:not([hidden])');
  assert.equal(corpos.length, 1);
  const p = new URLSearchParams(corpos[0]);
  assert.equal(p.get('tipo'), 'entrada_grupo');
  assert.equal(p.get('uf'), 'GO');
  assert.equal(p.get('site'), null);
  assert.match(await page.textContent('#done-text'), /Seus dados foram salvos/);
  await page.close();
});
