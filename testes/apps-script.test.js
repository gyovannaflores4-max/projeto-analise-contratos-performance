/* Testes do script do Google Planilhas (operacao/google-apps-script.gs), sem precisar do Google. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { carregarScript } = require('./gas-harness');

const medico = (extra = {}) => ({ tipo: 'entrada_grupo', nome: 'Ana Souza', crm: '123456', crm_uf: 'SP', whatsapp: '(11) 98888-7777', uf: 'SP', grupo: 'sem-rqe', consentimento_lgpd: 'sim', ...extra });

test('grava médico na aba Médicos com cabeçalho', () => {
  const g = carregarScript();
  assert.equal(g.post(medico()), 'ok');
  const m = g.abas['Médicos'].linhas;
  assert.deepEqual(m[0].slice(0, 3), ['recebido_em', 'tipo', 'nome']);
  assert.equal(m.length, 2);
});

test('acrescenta coluna nova sem bagunçar as antigas', () => {
  const g = carregarScript();
  g.post(medico());
  g.post(medico({ whatsapp: '(11) 97777-6666', grupo: 'rqe', especialidade: 'Pediatria', rqe: '99' }));
  const [cab, l1, l2] = g.abas['Médicos'].linhas;
  assert.ok(cab.includes('rqe'));
  assert.equal(l1.length <= cab.length, true);
  assert.equal(l2[cab.indexOf('rqe')], '99');
});

test('ignora robô, tipo desconhecido e envio sem campos obrigatórios', () => {
  const g = carregarScript();
  assert.equal(g.post(medico({ site: 'spam' })), 'ok');
  assert.equal(g.post({ tipo: 'hackear', nome: 'x' }), 'ignorado');
  assert.equal(g.post({ tipo: 'entrada_grupo', nome: 'Ana' }), 'ignorado');
  assert.equal(g.abas['Médicos'], undefined, 'nada deve ser gravado');
});

test('descarta cadastro repetido em 10 minutos', () => {
  const g = carregarScript();
  g.post(medico());
  g.post(medico());
  assert.equal(g.abas['Médicos'].linhas.length, 2, 'cabeçalho + 1 linha');
});

test('impede fórmula e corta texto gigante', () => {
  const g = carregarScript();
  g.post(medico({ nome: '=IMPORTXML("http://x")', obs: 'a'.repeat(5000) }));
  const [cab, l] = g.abas['Médicos'].linhas;
  assert.ok(l[cab.indexOf('nome')].startsWith("'="));
  assert.equal(l[cab.indexOf('obs')].length, 1000);
});

test('limite por minuto segura enxurrada de envios', () => {
  let t = 1_700_000_000_000;
  const g = carregarScript({ agora: () => t });
  let gravados = 0;
  for (let i = 0; i < 400; i++) if (g.post(medico({ whatsapp: `(11) 9${String(10000000 + i)}` })) === 'ok') gravados++;
  assert.equal(gravados, 300);
  t += 61_000;
  assert.equal(g.post(medico({ whatsapp: '(21) 99999-0000' })), 'ok', 'no minuto seguinte volta a aceitar');
});

test('piloto: 30 empresas, 100 médicos e 60 vagas são todos gravados', () => {
  const g = carregarScript();
  for (let i = 0; i < 100; i++) assert.equal(g.post(medico({ whatsapp: `(11) 9${String(20000000 + i)}`, nome: 'Médico ' + i })), 'ok');
  for (let i = 0; i < 30; i++) assert.equal(g.post({ tipo: 'cadastro_contratante', nome: 'C', instituicao: 'H' + i, cnpj: String(10000000000000 + i), email: 'a@b.com', whatsapp: '(31) 99999-0000', declaracao: 'sim' }), 'ok');
  for (let i = 0; i < 60; i++) assert.equal(g.post({ tipo: 'vaga', vaga: 'PS ' + i, uf: 'MG', cidade: 'BH', valor: '1500', data: '2026-12-01', cnpj: '11.222.333/0001-81', contato: '(31) 99999-0000' }), 'ok');
  assert.equal(g.abas['Médicos'].linhas.length - 1, 100);
  assert.equal(g.abas['Contratantes'].linhas.length - 1, 30);
  assert.equal(g.abas['Vagas'].linhas.length - 1, 60);
});

test('teste de carga vai para aba separada e não manda e-mail', () => {
  const g = carregarScript();
  g.ctx.AVISAR_EMAIL = 'x@y.com';
  g.post({ tipo: 'teste_carga', perfil: 'medico', whatsapp: '(11) 90000-0001' });
  assert.ok(g.abas['Teste de carga']);
  assert.equal(g.emails.length, 0);
});

module.exports = { medico };
