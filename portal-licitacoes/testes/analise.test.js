// Teste de regressão da Análise de edital: lê os editais reais em testes/editais/ e confere
// se número, sessão, prazos, órgão, portal, itens, local e horários continuam saindo certos,
// e se a conferência automática não acusa erro onde a leitura está certa.
//
// Rodar:      node testes/analise.test.js
// Atualizar o esperado (só depois de conferir que a nova leitura está certa):
//             node testes/analise.test.js --atualizar
//
// Ao corrigir um edital novo: salve o texto em testes/editais/<nome>.txt (sem nomes e CPFs das
// assinaturas), rode com --atualizar, confira o esperado.json e faça o commit junto.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.join(__dirname, "..");
const ctx = { window: {}, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(RAIZ, "assets/util.js"), "utf8"), ctx);
ctx.U = ctx.window.U;
vm.runInContext(fs.readFileSync(path.join(RAIZ, "assets/analise.js"), "utf8"), ctx);
const A = ctx.window.Analise;

const CAMPOS = ["numero", "modalidade", "orgao", "sessao", "limiteProposta", "plataforma", "valorEstimado", "municipio", "uf", "local", "horarios", "vigencia"];
const ARQ_ESPERADO = path.join(__dirname, "esperado.json");
const atualizar = process.argv.includes("--atualizar");

const resultado = {};
for (const arq of fs.readdirSync(path.join(__dirname, "editais")).filter(f => f.endsWith(".txt")).sort()) {
  const r = A.analisarEdital(fs.readFileSync(path.join(__dirname, "editais", arq), "utf8"));
  const c = r.campos, out = {};
  CAMPOS.forEach(k => { out[k] = c[k] === undefined ? null : c[k]; });
  out.itens = c.itens.map(it => ({ item: it.item, descricao: it.descricao.slice(0, 80), unidade: it.unidade, qtd: it.qtd, valorUnit: it.valorUnit }));
  out.conferenciaCrit = r.conferencia.filter(x => x.nivel === "crit").map(x => x.texto);
  resultado[arq.replace(/\.txt$/, "")] = out;
}

if (atualizar) {
  fs.writeFileSync(ARQ_ESPERADO, JSON.stringify(resultado, null, 2) + "\n");
  console.log("esperado.json atualizado com " + Object.keys(resultado).length + " editais. Confira o arquivo antes do commit.");
  process.exit(0);
}

const esperado = JSON.parse(fs.readFileSync(ARQ_ESPERADO, "utf8"));
let falhas = 0;
for (const nome of Object.keys(esperado)) {
  const e = esperado[nome], g = resultado[nome];
  if (!g) { console.log("✗ " + nome + ": arquivo do edital sumiu de testes/editais/"); falhas++; continue; }
  const dif = Object.keys(e).filter(k => JSON.stringify(e[k]) !== JSON.stringify(g[k]));
  if (dif.length) {
    falhas++;
    console.log("✗ " + nome);
    dif.forEach(k => console.log("    " + k + "\n      esperado: " + JSON.stringify(e[k]).slice(0, 300) + "\n      saiu:     " + JSON.stringify(g[k]).slice(0, 300)));
  } else console.log("✓ " + nome);
}
for (const nome of Object.keys(resultado)) if (!esperado[nome]) console.log("• " + nome + ": edital novo sem esperado (rode com --atualizar depois de conferir)");
console.log(falhas ? "\n" + falhas + " edital(is) com diferença." : "\nTodos os editais saíram como esperado.");
process.exit(falhas ? 1 : 0);
