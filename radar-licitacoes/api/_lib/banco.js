// Armazenamento da Gestão de Prazos no Upstash Redis, pela API REST (sem dependências).
// Sem as variáveis do Upstash, os dados ficam na memória do servidor: serve só para testes, some a cada reinício.
const P = "gp:";
const COLECOES = ["contratos", "documentos", "licitacoes"];
const MAX_MENSAGENS = 500, MAX_HISTORICO = 1000;

const urlRedis = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const tokenRedis = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const tipoArmazenamento = () => (urlRedis() ? "upstash" : "memoria");

// Memória (testes e primeiro uso sem Upstash): implementa só os comandos usados aqui.
function memoria(cmds) {
  const m = (globalThis.__gpMemoria = globalThis.__gpMemoria || new Map());
  const hash = k => { if (!m.has(k)) m.set(k, new Map()); return m.get(k); };
  return cmds.map(([c, k, ...a]) => {
    switch (c) {
      case "HGETALL": return m.has(k) ? [...m.get(k)].flat() : [];
      case "HGET": return m.has(k) ? m.get(k).get(a[0]) ?? null : null;
      case "HSET": { const h = hash(k); let n = 0; for (let i = 0; i < a.length; i += 2) { if (!h.has(a[i])) n++; h.set(a[i], a[i + 1]); } return n; }
      case "HSETNX": { const h = hash(k); if (h.has(a[0])) return 0; h.set(a[0], a[1]); return 1; }
      case "HDEL": { const h = hash(k); let n = 0; for (const f of a) if (h.delete(f)) n++; return n; }
      case "GET": return m.has(k) ? m.get(k) : null;
      case "SET": m.set(k, a[0]); return "OK";
      case "LPUSH": { const l = m.get(k) || []; l.unshift(...a.slice().reverse()); m.set(k, l); return l.length; }
      case "LTRIM": { const l = m.get(k) || []; m.set(k, l.slice(Number(a[0]), Number(a[1]) + 1)); return "OK"; }
      case "LRANGE": { const l = m.get(k) || []; return l.slice(Number(a[0]), Number(a[1]) === -1 ? undefined : Number(a[1]) + 1); }
      default: throw new Error("Comando não suportado na memória: " + c);
    }
  });
}

async function pipeline(cmds) {
  if (!urlRedis()) return memoria(cmds);
  const r = await fetch(urlRedis().replace(/\/$/, "") + "/pipeline", {
    method: "POST",
    headers: { authorization: "Bearer " + tokenRedis(), "content-type": "application/json" },
    body: JSON.stringify(cmds)
  });
  if (!r.ok) throw new Error("O banco de dados (Upstash) respondeu HTTP " + r.status);
  return (await r.json()).map(x => { if (x.error) throw new Error("Upstash: " + x.error); return x.result; });
}

const json = s => { try { return JSON.parse(s); } catch { return null; } };
function hashParaLista(plano) {
  const out = [];
  for (let i = 0; i < (plano || []).length; i += 2) { const v = json(plano[i + 1]); if (v) out.push(v); }
  return out;
}

async function lerTudo() {
  const [c, d, l, cfg, caixa, log] = await pipeline([
    ["HGETALL", P + "contratos"], ["HGETALL", P + "documentos"], ["HGETALL", P + "licitacoes"],
    ["GET", P + "config"], ["HGETALL", P + "caixa"], ["LRANGE", P + "log", "0", "99"]
  ]);
  return {
    contratos: hashParaLista(c), documentos: hashParaLista(d), licitacoes: hashParaLista(l),
    config: json(cfg) || {},
    caixa: hashParaLista(caixa).sort((a, b) => String(b.em).localeCompare(String(a.em))),
    log: (log || []).map(json).filter(Boolean)
  };
}

async function ler(colecao, id) { const [v] = await pipeline([["HGET", P + colecao, id]]); return json(v); }

// Licitações recebem histórico e mensagens do servidor enquanto alguém edita na página:
// ao salvar, junta o que chegou no meio do caminho em vez de apagar.
function mesclarLicitacao(antigo, novo) {
  if (!antigo) return novo;
  const juntar = (a, b, max) => {
    const porId = new Map((a || []).map(x => [x.id, x]));
    for (const x of b || []) porId.set(x.id, x);
    return [...porId.values()].sort((x, y) => String(x.em).localeCompare(String(y.em))).slice(-max);
  };
  const monitor = (antigo.monitor && novo.monitor && String(antigo.monitor.verificadoEm) > String(novo.monitor.verificadoEm)) || !novo.monitor ? antigo.monitor : novo.monitor;
  return { ...novo, historico: juntar(antigo.historico, novo.historico, MAX_HISTORICO), mensagens: juntar(antigo.mensagens, novo.mensagens, MAX_MENSAGENS), monitor };
}

async function salvar(colecao, itens, { mesclar = true } = {}) {
  if (!COLECOES.includes(colecao)) throw new Error("Coleção inválida.");
  itens = Array.isArray(itens) ? itens : [itens];
  if (!itens.length) return [];
  if (colecao === "licitacoes" && mesclar) {
    const antigos = await pipeline(itens.map(i => ["HGET", P + colecao, i.id]));
    itens = itens.map((i, n) => mesclarLicitacao(json(antigos[n]), i));
  }
  const args = [];
  for (const i of itens) args.push(i.id, JSON.stringify(i));
  await pipeline([["HSET", P + colecao, ...args]]);
  return itens;
}
async function remover(colecao, id) {
  if (!COLECOES.includes(colecao)) throw new Error("Coleção inválida.");
  await pipeline([["HDEL", P + colecao, id]]);
}
async function salvarConfig(cfg) { await pipeline([["SET", P + "config", JSON.stringify(cfg)]]); }

// Avisos já enviados: chave -> data do envio
async function enviados() {
  const [plano] = await pipeline([["HGETALL", P + "enviados"]]);
  const out = {};
  for (let i = 0; i < (plano || []).length; i += 2) out[plano[i]] = plano[i + 1];
  return out;
}
async function marcarEnviados(chaves, quando) {
  if (!chaves.length) return;
  await pipeline([["HSET", P + "enviados", ...chaves.flatMap(k => [k, quando])]]);
}
async function limparEnviados(antesDe) {
  const todos = await enviados();
  const velhos = Object.keys(todos).filter(k => String(todos[k]) < antesDe);
  if (velhos.length) await pipeline([["HDEL", P + "enviados", ...velhos]]);
  return velhos.length;
}

// Mensagens já recebidas (evita duplicar quando o mesmo e-mail chega de novo). true = nova.
async function mensagemNova(idExterno, quando) {
  const [n] = await pipeline([["HSETNX", P + "msgids", String(idExterno).slice(0, 200), quando]]);
  return n === 1;
}

async function caixaGuardar(msg) { await pipeline([["HSET", P + "caixa", msg.id, JSON.stringify(msg)]]); }
async function caixaRemover(id) { await pipeline([["HDEL", P + "caixa", id]]); }
async function caixaLer(id) { const [v] = await pipeline([["HGET", P + "caixa", id]]); return json(v); }

async function registrar(evento) {
  await pipeline([["LPUSH", P + "log", JSON.stringify(evento)], ["LTRIM", P + "log", "0", "199"]]);
}

module.exports = {
  COLECOES, MAX_MENSAGENS, tipoArmazenamento, pipeline, lerTudo, ler, salvar, remover, salvarConfig, mesclarLicitacao,
  enviados, marcarEnviados, limparEnviados, mensagemNova, caixaGuardar, caixaRemover, caixaLer, registrar
};
