/* Equipe Comercial | utilitários: datas, dias úteis, feriados, formatação e armazenamento.
   Datas ficam como texto "AAAA-MM-DD" ou "AAAA-MM-DDTHH:MM" (horário local, sem fuso). */
(function (g) {
  "use strict";
  const U = {};
  const pad = n => String(n).padStart(2, "0");
  U.pad = pad;

  /* ---------- Datas ---------- */
  U.isoData = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  U.isoDataHora = d => U.isoData(d) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  U.hojeISO = () => U.isoData(new Date());
  U.agoraISO = () => U.isoDataHora(new Date());

  U.parse = s => {
    if (!s) return null;
    if (s instanceof Date) return new Date(s.getTime());
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/);
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
  };
  U.temHora = s => /T\d{2}:\d{2}/.test(String(s || ""));
  U.soData = s => (s ? String(s).slice(0, 10) : "");
  U.addDias = (s, n) => { const d = U.parse(s); d.setDate(d.getDate() + n); return U.isoData(d); };

  // Dias corridos entre hoje e a data (0 = hoje, 1 = amanhã, negativo = já passou)
  U.diasAte = s => {
    const d = U.parse(s);
    if (!d) return null;
    const alvo = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const h = U.parse(U.hojeISO());
    return Math.round((alvo - h) / 86400000);
  };
  // Já passou? Considera a hora quando houver; sem hora, vale até o fim do dia.
  U.passou = s => {
    const d = U.parse(s);
    if (!d) return false;
    if (!U.temHora(s)) d.setHours(23, 59, 59);
    return d.getTime() < Date.now();
  };
  U.horasAte = s => { const d = U.parse(s); return d ? (d.getTime() - Date.now()) / 3600000 : null; };

  /* ---------- Feriados e dias úteis ----------
     Nacionais fixos + Sexta-feira Santa. Carnaval e Corpus Christi (pontos facultativos)
     entram quando U.config.pontosFacultativos = true. Feriados locais: "DD/MM Nome" (todo ano)
     ou "DD/MM/AAAA Nome". */
  U.config = { pontosFacultativos: true, feriadosLocais: [] };
  let cache = {};
  U.limparCacheFeriados = () => { cache = {}; };

  function pascoa(ano) { // algoritmo de Meeus/Jones/Butcher
    const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
    const f = Math.floor((b + 8) / 25), gg = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - gg + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(ano, mes - 1, dia);
  }

  U.lerFeriadosLocais = texto => String(texto || "").split(/\n/).map(l => l.trim()).filter(Boolean).map(l => {
    const m = l.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*[-–]?\s*(.*)$/);
    return m ? { dia: +m[1], mes: +m[2], ano: m[3] ? +m[3] : null, nome: m[4] || "Feriado local" } : null;
  }).filter(Boolean);

  U.feriadosDoAno = ano => {
    if (cache[ano]) return cache[ano];
    const mapa = {};
    [["01-01", "Confraternização Universal"], ["04-21", "Tiradentes"], ["05-01", "Dia do Trabalho"],
     ["09-07", "Independência do Brasil"], ["10-12", "Nossa Senhora Aparecida"], ["11-02", "Finados"],
     ["11-15", "Proclamação da República"], ["11-20", "Consciência Negra"], ["12-25", "Natal"]]
      .forEach(([md, nome]) => { mapa[ano + "-" + md] = nome; });
    const p = pascoa(ano);
    const rel = (n, nome) => { const d = new Date(p); d.setDate(d.getDate() + n); mapa[U.isoData(d)] = nome; };
    rel(-2, "Sexta-feira Santa");
    if (U.config.pontosFacultativos) { rel(-48, "Carnaval"); rel(-47, "Carnaval"); rel(60, "Corpus Christi"); }
    (U.config.feriadosLocais || []).forEach(f => {
      if (f.ano && f.ano !== ano) return;
      mapa[ano + "-" + pad(f.mes) + "-" + pad(f.dia)] = f.nome;
    });
    cache[ano] = mapa;
    return mapa;
  };
  U.nomeFeriado = s => { const d = U.parse(s); return d ? U.feriadosDoAno(d.getFullYear())[U.isoData(d)] || null : null; };
  U.ehDiaUtil = s => {
    const d = U.parse(s);
    const w = d.getDay();
    if (w === 0 || w === 6) return false;
    return !U.feriadosDoAno(d.getFullYear())[U.isoData(d)];
  };
  U.proximoDiaUtil = s => { let d = U.soData(s); while (!U.ehDiaUtil(d)) d = U.addDias(d, 1); return d; };
  // Lei 14.133, art. 183: exclui o dia do começo e inclui o do vencimento; só conta dias úteis.
  U.somarDiasUteis = (s, n) => { let d = U.soData(s), c = 0; while (c < n) { d = U.addDias(d, 1); if (U.ehDiaUtil(d)) c++; } return d; };
  U.subtrairDiasUteis = (s, n) => { let d = U.soData(s), c = 0; while (c < n) { d = U.addDias(d, -1); if (U.ehDiaUtil(d)) c++; } return d; };
  // Dias corridos: se vencer em dia sem expediente, prorroga para o próximo dia útil.
  U.somarDiasCorridos = (s, n) => U.proximoDiaUtil(U.addDias(U.soData(s), n));
  U.diasUteisAte = s => { // dias úteis de hoje (exclusive) até a data (inclusive)
    const alvo = U.soData(s); let d = U.hojeISO(), c = 0;
    if (alvo <= d) return 0;
    while (d < alvo) { d = U.addDias(d, 1); if (U.ehDiaUtil(d)) c++; }
    return c;
  };

  /* ---------- Formatação ---------- */
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const SEMANA_LONGA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
  U.MESES_LONGOS = MESES_LONGOS;
  U.fmtData = s => { const d = U.parse(s); return d ? pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear() : "—"; };
  U.fmtDataCurta = s => { const d = U.parse(s); return d ? pad(d.getDate()) + " " + MESES[d.getMonth()] : "—"; };
  U.fmtHora = s => { const d = U.parse(s); return d && U.temHora(s) ? pad(d.getHours()) + "h" + pad(d.getMinutes()) : ""; };
  U.fmtDataHora = s => { if (!s) return "—"; const h = U.fmtHora(s); return U.fmtData(s) + (h ? " às " + h : ""); };
  U.semana = s => { const d = U.parse(s); return d ? SEMANA[d.getDay()] : ""; };
  U.semanaLonga = s => { const d = U.parse(s); return d ? SEMANA_LONGA[d.getDay()] : ""; };
  U.dataPorExtenso = s => { const d = U.parse(s); return d ? SEMANA_LONGA[d.getDay()] + ", " + d.getDate() + " de " + MESES_LONGOS[d.getMonth()] : ""; };

  U.relativo = s => {
    const n = U.diasAte(s);
    if (n === null) return "";
    if (n === 0) return "hoje";
    if (n === 1) return "amanhã";
    if (n === -1) return "ontem";
    return n > 0 ? "em " + n + " dias" : "há " + -n + " dias";
  };
  // Rótulo curto para os chips de contagem regressiva
  U.contagem = s => {
    const n = U.diasAte(s);
    if (n === null) return "";
    if (n < 0 || (n === 0 && U.passou(s))) return n === 0 ? "Encerrado" : "Vencido";
    if (n === 0) return U.temHora(s) ? "Hoje " + U.fmtHora(s) : "Hoje";
    if (n === 1) return "Amanhã";
    return "D-" + n;
  };
  U.desde = iso => { // "há 5 min", "há 2 h", "ontem"
    const d = U.parse(iso); if (!d) return "";
    const min = Math.round((Date.now() - d.getTime()) / 60000);
    if (min < 1) return "agora";
    if (min < 60) return "há " + min + " min";
    if (min < 60 * 24 && U.diasAte(iso) === 0) return "há " + Math.round(min / 60) + " h";
    const n = -U.diasAte(iso);
    if (n === 1) return "ontem";
    return n < 7 ? "há " + n + " dias" : U.fmtDataCurta(iso);
  };

  U.moeda = v => (v === null || v === undefined || v === "" || isNaN(v)) ? "—"
    : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  U.moedaCurta = v => {
    if (v === null || v === undefined || v === "" || isNaN(v)) return "—";
    v = Number(v);
    if (v >= 1e9) return "R$ " + (v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " bi";
    if (v >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
    if (v >= 1e3) return "R$ " + (v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
    return U.moeda(v);
  };
  U.lerMoeda = s => { // "R$ 1.234.567,89" -> 1234567.89
    if (s === null || s === undefined || s === "") return null;
    if (typeof s === "number") return s;
    const t = String(s).replace(/[^\d,.-]/g, "");
    if (!t) return null;
    const n = /,\d{1,2}$/.test(t) ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t.replace(/,/g, ""));
    return isNaN(n) ? null : n;
  };
  U.plural = (n, um, varios) => n + " " + (n === 1 ? um : varios);

  /* ---------- Texto ---------- */
  U.h = s => String(s === null || s === undefined ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  U.semAcento = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // Mesmo tamanho do texto original (um caractere por caractere), para recortar trechos pelo índice.
  U.normalizarMesmoTamanho = s => String(s || "").replace(/[^\u0000-\u007f]/g, c => c.normalize("NFD")[0]).toLowerCase();
  U.corta = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
  U.uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  U.hash = s => { let h = 5381; s = String(s); for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

  /* ---------- Armazenamento (sempre protegido: pode não existir em janela anônima) ---------- */
  U.ler = (chave, padrao) => { try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) : padrao; } catch (e) { return padrao; } };
  U.gravar = (chave, valor) => { try { localStorage.setItem(chave, JSON.stringify(valor)); return true; } catch (e) { return false; } };

  /* ---------- Arquivos ---------- */
  U.baixar = (nome, conteudo, tipo) => {
    try {
      const url = URL.createObjectURL(new Blob([conteudo], { type: tipo || "text/plain;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return true;
    } catch (e) { return false; }
  };
  U.copiar = async texto => {
    try { await navigator.clipboard.writeText(texto); return true; } catch (e) { return false; }
  };

  // Agenda no formato iCalendar (.ics), com lembrete 1 dia antes
  U.ics = (eventos, nomeAgenda) => {
    const esc = t => String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    const compacto = s => s.replace(/[-:]/g, "");
    const carimbo = compacto(new Date().toISOString().slice(0, 19)) + "Z";
    const linhas = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Equipe Comercial//PT-BR", "CALSCALE:GREGORIAN", "X-WR-CALNAME:" + esc(nomeAgenda || "Licitações")];
    eventos.forEach(ev => {
      linhas.push("BEGIN:VEVENT", "UID:" + ev.uid + "@pregao-em-dia", "DTSTAMP:" + carimbo);
      if (U.temHora(ev.data)) {
        const ini = U.parse(ev.data), fim = new Date(ini.getTime() + 3600000);
        linhas.push("DTSTART:" + compacto(U.isoDataHora(ini)) + "00", "DTEND:" + compacto(U.isoDataHora(fim)) + "00");
      } else {
        linhas.push("DTSTART;VALUE=DATE:" + compacto(U.soData(ev.data)), "DTEND;VALUE=DATE:" + compacto(U.addDias(ev.data, 1)));
      }
      linhas.push("SUMMARY:" + esc(ev.titulo), "DESCRIPTION:" + esc(ev.descricao || ""),
        "BEGIN:VALARM", "TRIGGER:-P1D", "ACTION:DISPLAY", "DESCRIPTION:" + esc(ev.titulo), "END:VALARM", "END:VEVENT");
    });
    linhas.push("END:VCALENDAR");
    return linhas.join("\r\n");
  };

  g.U = U;
})(typeof window !== "undefined" ? window : globalThis);
