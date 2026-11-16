/*
  Simula o ambiente do Google Apps Script para testar operacao/google-apps-script.gs
  sem precisar do Google: planilha, trava, cache, e-mail e respostas em memória.
*/
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

function carregarScript({ agora = () => Date.now() } = {}) {
  const abas = {};
  const emails = [];
  const cache = new Map();
  function novaAba(nome) {
    const linhas = [];
    return {
      nome, linhas,
      getLastColumn: () => (linhas[0] ? linhas[0].length : 0),
      getRange: (r, c, nr, nc) => ({
        getValues: () => [(linhas[r - 1] || []).slice(c - 1, c - 1 + nc)],
        setValues: v => { linhas[r - 1] = linhas[r - 1] || []; v[0].forEach((x, i) => { linhas[r - 1][c - 1 + i] = x; }); },
      }),
      appendRow: l => linhas.push(l),
      setFrozenRows: () => {},
    };
  }
  const ctx = {
    console,
    Date: class extends Date { static now() { return agora(); } },
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ({ getSheetByName: n => abas[n], insertSheet: n => (abas[n] = novaAba(n)) }),
      flush: () => {},
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: (alg, s) => [...crypto.createHash('sha256').update(s).digest()],
      base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'),
    },
    MailApp: { sendEmail: (...a) => emails.push(a) },
    ContentService: { createTextOutput: t => ({ texto: t, setMimeType() { return this; } }), MimeType: { TEXT: 'text' } },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '..', 'operacao', 'google-apps-script.gs'), 'utf8'), ctx);
  const post = parameter => ctx.doPost({ parameter }).texto;
  return { post, abas, emails, ctx };
}

module.exports = { carregarScript };
