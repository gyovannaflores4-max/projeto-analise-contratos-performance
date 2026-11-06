// Teste de fumaça das telas: abre cada página do portal (com os dados de exemplo e sem login)
// e falha se aparecer erro de JavaScript. Também abre a gaveta de um edital.
// Rodar: node testes/telas.test.js   (precisa do Playwright com o Chromium)

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const RAIZ = path.join(__dirname, "..");
const PORTA = 3199;
const rotas = [...fs.readFileSync(path.join(RAIZ, "index.html"), "utf8").matchAll(/data-rota="([a-z]+)"/g)].map(m => m[1]);

(async () => {
  const srv = spawn(process.execPath, ["servidor-local.js"], { cwd: RAIZ, env: Object.assign({}, process.env, { PORT: String(PORTA) }), stdio: "ignore" });
  await new Promise(r => setTimeout(r, 800));
  const nav = await chromium.launch();
  const pg = await nav.newPage({ viewport: { width: 1280, height: 900 } });
  const erros = [];
  pg.on("pageerror", e => erros.push(e.message));
  await pg.route("**/assets/config.js", r => r.fulfill({ contentType: "text/javascript", body: "window.PORTAL_CONFIG={}" }));
  await pg.route("**/api/**", r => r.fulfill({ status: 503, contentType: "application/json", body: '{"erro":"teste"}' }));
  await pg.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com/, r => r.abort());
  let falhas = 0;
  await pg.goto("http://localhost:" + PORTA + "/#painel");
  await pg.waitForTimeout(800);
  for (const rota of rotas) {
    const antes = erros.length;
    await pg.evaluate(r => { location.hash = "#" + r; }, rota);
    await pg.waitForTimeout(350);
    const texto = await pg.$eval("#pagina", el => el.innerText.trim().length);
    const ok = erros.length === antes && texto > 20;
    if (!ok) falhas++;
    console.log((ok ? "✓ " : "✗ ") + rota + (ok ? "" : " · " + (erros.slice(antes).join(" | ") || "página vazia")));
  }
  // gaveta do primeiro edital
  await pg.evaluate(() => { location.hash = "#editais"; });
  await pg.waitForTimeout(300);
  const antes = erros.length;
  const card = await pg.$('[data-acao="abrirEdital"]');
  if (card) { await card.click(); await pg.waitForTimeout(400); }
  const gaveta = !!(await pg.$(".modal-corpo"));
  if (!gaveta || erros.length > antes) { falhas++; console.log("✗ gaveta do edital · " + (erros.slice(antes).join(" | ") || "não abriu")); }
  else console.log("✓ gaveta do edital");
  await nav.close();
  srv.kill();
  console.log(falhas ? "\n" + falhas + " tela(s) com problema." : "\nTodas as telas abriram sem erro.");
  process.exit(falhas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
