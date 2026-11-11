/* Diretas — lógica do jogo */
(() => {
'use strict';

const CFG = window.DIRETAS;
const $ = (s) => document.querySelector(s);
const UID = CFG.uid;
let estado = CFG.estado;           // { fase_atual, total, estrelas, tempos }
let S = null;                      // estado da fase em andamento

/* ── Armazenamento local (tolerante a falhas) ─────────────── */
const ls = {
  get(k, def = null) { try { const v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignora */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } },
};
const kBoard = (f) => `dir:${UID}:b${f}`;

/* ── Utilidades ────────────────────────────────────────────── */
const fmtTempo = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const normaliza = (ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
let toastT = 0;
function toast(msg, ms = 1900) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), ms);
}

/* ── Sons ──────────────────────────────────────────────────── */
let ac = null;
let somLigado = ls.get('dir:som', '1') === '1';
function bip(freq, dur = .08, tipo = 'sine', vol = .06, atraso = 0) {
  if (!somLigado) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain();
    const t0 = ac.currentTime + atraso;
    o.type = tipo; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + .02);
  } catch (e) { /* sem áudio */ }
}
const somTecla = () => bip(520, .05, 'triangle', .05);
const somErro = () => { bip(180, .18, 'sawtooth', .05); bip(150, .2, 'sawtooth', .04, .09); };
const somOk = () => { bip(660, .1, 'triangle'); bip(880, .14, 'triangle', .06, .08); };
const somVitoria = () => [523, 659, 784, 1047, 1319].forEach((f, i) => bip(f, .22, 'triangle', .07, i * .11));

/* ── Tema ──────────────────────────────────────────────────── */
function aplicaTema(t) {
  document.body.dataset.tema = t;
  $('#btn-tema').textContent = t === 'escuro' ? '☀️' : '🌙';
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.content = t === 'escuro' ? '#14141c' : '#eef0f6';
}
function aplicaSom() { $('#btn-som').textContent = somLigado ? '🔊' : '🔇'; }

/* ── Montagem da fase ──────────────────────────────────────── */
async function carregarFase(n) {
  let dados;
  try {
    const r = await fetch(`fases/fase_${n}.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    dados = await r.json();
  } catch (e) {
    toast('Não foi possível carregar a fase. Verifique a conexão.', 3200);
    return;
  }
  ls.set(`dir:${UID}:ultima`, String(n));
  montar(n, dados);
}

function montar(n, d) {
  const R = d.dimensoes.linhas, C = d.dimensoes.colunas;
  const mapa = {};
  d.elementos.forEach((e) => { mapa[`${e.linha}_${e.coluna}`] = e; });

  S = { fase: n, titulo: d.titulo, R, C, cel: {}, pistas: [], sel: null, dir: 'h', dicas: 0, conf: 0, t: 0, ini: false, fim: false, dicaEl: {} };

  d.elementos.forEach((e) => {
    if (e.tipo === 'letra') {
      S.cel[`${e.linha}_${e.coluna}`] = { r: e.linha, c: e.coluna, ans: normaliza(e.letra_correta), val: '', est: '', rev: false, pal: {}, el: null };
    }
  });

  // pistas: cada casa de dica abre uma palavra à direita e/ou abaixo
  d.elementos.filter((e) => e.tipo === 'dica').forEach((e) => {
    const dupla = e.texto_dica.includes('/');
    const partes = dupla ? e.texto_dica.split('/') : [e.texto_dica];
    const dirs = dupla ? ['h', 'v'] : [e.seta === 'horizontal' ? 'h' : 'v'];
    dirs.forEach((dir, i) => {
      const dr = dir === 'h' ? 0 : 1, dc = dir === 'h' ? 1 : 0;
      const cells = [];
      let r = e.linha + dr, c = e.coluna + dc;
      while (S.cel[`${r}_${c}`]) { cells.push(`${r}_${c}`); r += dr; c += dc; }
      if (!cells.length) return;
      const p = { dir, r: e.linha, c: e.coluna, txt: partes[i].trim(), cells, chave: `${e.linha}_${e.coluna}` };
      S.pistas.push(p);
    });
  });
  S.pistas.sort((a, b) => a.r - b.r || a.c - b.c || (a.dir === 'h' ? -1 : 1));
  S.pistas.forEach((p, i) => p.cells.forEach((k) => { S.cel[k].pal[p.dir] = i; }));

  // DOM da grade
  const g = $('#grid-diretas');
  g.innerHTML = '';
  g.style.setProperty('--cols', C);
  g.style.setProperty('--rows', R);
  const dicasPorCasa = {};
  S.pistas.forEach((p) => { (dicasPorCasa[p.chave] = dicasPorCasa[p.chave] || []).push(p); });
  const frag = document.createDocumentFragment();
  for (let r = 1; r <= R; r++) {
    for (let c = 1; c <= C; c++) {
      const k = `${r}_${c}`;
      let el;
      if (S.cel[k]) {
        el = document.createElement('button');
        el.className = 'cel letra';
        el.dataset.k = k;
        el.setAttribute('role', 'gridcell');
        el.setAttribute('aria-label', `Linha ${r}, coluna ${c}`);
        el.innerHTML = '<span class="v"></span>';
        S.cel[k].el = el;
      } else if (dicasPorCasa[k]) {
        const ps = dicasPorCasa[k];
        el = document.createElement('div');
        el.className = 'cel dica' + (ps.length > 1 ? ' dupla' : ps[0].dir === 'h' ? ' so-h' : ' so-v');
        el.dataset.d = k;
        el.innerHTML = ps.map((p) => `<div class="t"><span>${esc(p.txt)}</span></div>`).join('') +
          ps.map((p) => `<i class="seta ${p.dir}"></i>`).join('');
        S.dicaEl[k] = el;
      } else {
        el = document.createElement('div');
        el.className = 'cel preto';
      }
      frag.appendChild(el);
    }
  }
  g.appendChild(frag);

  restaurar();
  $('#num-fase').textContent = n;
  $('#titulo-fase').textContent = d.titulo;
  montaTeclado();

  // seleciona a primeira casa vazia da primeira pista
  const p0 = S.pistas.find((p) => p.cells.some((k) => !S.cel[k].val)) || S.pistas[0];
  if (p0) {
    const k = p0.cells.find((x) => !S.cel[x].val) || p0.cells[0];
    S.dir = p0.dir; S.sel = k;
  }
  render();
}

/* ── Persistência do tabuleiro ─────────────────────────────── */
function salvarLocal() {
  if (!S || S.fim) return;
  const v = {}, rv = [];
  Object.entries(S.cel).forEach(([k, c]) => { if (c.val) v[k] = c.val; if (c.rev) rv.push(k); });
  ls.set(kBoard(S.fase), JSON.stringify({ v, rv, d: S.dicas, c: S.conf, t: S.t }));
}
function restaurar() {
  let b = null;
  try { b = JSON.parse(ls.get(kBoard(S.fase), 'null')); } catch (e) { b = null; }
  if (!b) return;
  Object.entries(b.v || {}).forEach(([k, v]) => { if (S.cel[k]) S.cel[k].val = v; });
  (b.rv || []).forEach((k) => { if (S.cel[k]) S.cel[k].rev = true; });
  S.dicas = b.d | 0; S.conf = b.c | 0; S.t = b.t | 0;
  S.ini = S.t > 0 || Object.keys(b.v || {}).length > 0;
}

/* ── Renderização ──────────────────────────────────────────── */
function pistaAtiva() {
  const c = S && S.cel[S.sel];
  if (!c) return null;
  const i = c.pal[S.dir] !== undefined ? c.pal[S.dir] : (c.pal.h !== undefined ? c.pal.h : c.pal.v);
  return S.pistas[i] || null;
}

function render() {
  if (!S) return;
  const p = pistaAtiva();
  const noPalavra = new Set(p ? p.cells : []);
  let preenchidas = 0, total = 0;
  Object.entries(S.cel).forEach(([k, c]) => {
    total++;
    if (c.val) preenchidas++;
    const el = c.el;
    el.className = 'cel letra' + (noPalavra.has(k) ? ' palavra' : '') + (k === S.sel ? ' sel' : '') +
      (c.est ? ' ' + c.est : '') + (c.rev ? ' rev' : '');
    el.firstChild.textContent = c.val;
  });
  Object.entries(S.dicaEl).forEach(([k, el]) => el.classList.toggle('ativa', !!p && p.chave === k));
  // barra de pista
  if (p) {
    $('#pista-dir').textContent = p.dir === 'h' ? '→' : '↓';
    $('#pista-txt').textContent = p.txt;
  } else {
    $('#pista-dir').textContent = '';
    $('#pista-txt').textContent = 'Toque numa casa para começar';
  }
  $('#barra').style.width = `${total ? (100 * preenchidas / total) : 0}%`;
  $('#tempo').textContent = fmtTempo(S.t);
  $('#b-dica').querySelector('em').textContent = 'Letra';
  atualizaRol();
  atualizaTeclasUsadas();
}

/* ── Teclado e rol de letras ───────────────────────────────── */
let modo = ls.get('dir:modo', 'teclado');
function montaTeclado() {
  const t = $('#teclado');
  if (t.childElementCount) return;
  ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].forEach((fila, i) => {
    const d = document.createElement('div');
    d.className = 'fila';
    [...fila].forEach((ch) => {
      const b = document.createElement('button');
      b.className = 'tecla'; b.textContent = ch; b.dataset.ch = ch;
      b.setAttribute('aria-label', ch);
      d.appendChild(b);
    });
    if (i === 2) {
      const b = document.createElement('button');
      b.className = 'tecla larga'; b.textContent = '⌫'; b.dataset.ch = '⌫'; b.setAttribute('aria-label', 'Apagar');
      d.appendChild(b);
    }
    t.appendChild(d);
  });
  t.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('.tecla');
    if (!b) return;
    e.preventDefault();
    if (b.dataset.ch === '⌫') apagar(); else digitar(b.dataset.ch);
  });
}
function atualizaTeclasUsadas() { /* reservado: todas as teclas ficam sempre ativas */ }

function atualizaRol() {
  const rol = $('#rol');
  const teclado = $('#teclado');
  const ehRol = modo === 'rol';
  rol.hidden = !ehRol;
  teclado.hidden = ehRol;
  $('#modo-nome').textContent = ehRol ? 'Rol' : 'Teclado';
  if (!ehRol || !S) return;
  const sobra = {};
  Object.values(S.cel).forEach((c) => { sobra[c.ans] = (sobra[c.ans] || 0) + 1; });
  Object.values(S.cel).forEach((c) => { if (c.val) sobra[c.val] = (sobra[c.val] || 0) - 1; });
  const letras = [];
  Object.keys(sobra).sort().forEach((l) => { for (let i = 0; i < sobra[l]; i++) letras.push(l); });
  rol.innerHTML = letras.length
    ? letras.map((l) => `<button class="bloco" data-ch="${l}">${l}</button>`).join('') +
      '<button class="bloco" data-ch="⌫" aria-label="Apagar">⌫</button>'
    : '<span class="vazio">Todas as letras foram usadas</span>';
}
$('#rol').addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.bloco');
  if (!b) return;
  e.preventDefault();
  if (b.dataset.ch === '⌫') apagar(); else digitar(b.dataset.ch);
});

/* ── Seleção e navegação ───────────────────────────────────── */
function selecionar(k, dir) {
  const c = S.cel[k];
  if (!c) return;
  if (dir && c.pal[dir] !== undefined) S.dir = dir;
  else if (c.pal[S.dir] === undefined) S.dir = c.pal.h !== undefined ? 'h' : 'v';
  S.sel = k;
  render();
}
function cliqueGrade(e) {
  if (!S || S.fim) return;
  const l = e.target.closest('.letra');
  if (l) {
    const k = l.dataset.k, c = S.cel[k];
    if (k === S.sel && c.pal.h !== undefined && c.pal.v !== undefined) S.dir = S.dir === 'h' ? 'v' : 'h';
    selecionar(k);
    somTecla();
    return;
  }
  const d = e.target.closest('.dica');
  if (d) {
    const ps = S.pistas.filter((p) => p.chave === d.dataset.d);
    const atual = pistaAtiva();
    let alvo = ps[0];
    if (atual && ps.length > 1 && atual.chave === d.dataset.d) alvo = ps.find((p) => p !== atual) || ps[0];
    irParaPista(alvo);
  }
}
$('#grid-diretas').addEventListener('click', cliqueGrade);

function irParaPista(p) {
  if (!p) return;
  const k = p.cells.find((x) => !S.cel[x].val) || p.cells[0];
  S.dir = p.dir; S.sel = k;
  render();
}
function pistaDelta(delta) {
  if (!S || !S.pistas.length) return;
  const atual = pistaAtiva();
  let i = atual ? S.pistas.indexOf(atual) : -1;
  i = (i + delta + S.pistas.length) % S.pistas.length;
  irParaPista(S.pistas[i]);
}
$('#ant').addEventListener('click', () => pistaDelta(-1));
$('#prox').addEventListener('click', () => pistaDelta(1));

function mover(dr, dc) {
  if (!S || !S.sel) return;
  const c = S.cel[S.sel];
  let r = c.r + dr, cc = c.c + dc;
  while (r >= 1 && r <= S.R && cc >= 1 && cc <= S.C) {
    const k = `${r}_${cc}`;
    if (S.cel[k]) { S.dir = dr ? 'v' : 'h'; selecionar(k, S.dir); return; }
    r += dr; cc += dc;
  }
}

/* ── Entrada de letras ─────────────────────────────────────── */
function iniciaRelogio() { if (!S.ini) S.ini = true; }

function digitar(ch) {
  if (!S || S.fim || !S.sel) { if (S && !S.sel) toast('Escolha uma casa primeiro.'); return; }
  const letra = normaliza(ch);
  if (!/^[A-Z]$/.test(letra)) return;
  iniciaRelogio();
  const c = S.cel[S.sel];
  if (!c.rev) { c.val = letra; c.est = ''; }
  somTecla();
  c.el.classList.add('pop');
  avancar();
  salvarLocal();
  render();
  verificarCompleto();
}
function avancar() {
  const p = pistaAtiva();
  if (!p) return;
  const i = p.cells.indexOf(S.sel);
  const seguintes = p.cells.slice(i + 1);
  const vazia = seguintes.find((k) => !S.cel[k].val);
  const prox = vazia || seguintes[0];
  if (prox) S.sel = prox;
}
function apagar() {
  if (!S || S.fim || !S.sel) return;
  const p = pistaAtiva();
  let c = S.cel[S.sel];
  if (!c.val || c.rev) {
    const i = p ? p.cells.indexOf(S.sel) : -1;
    if (i > 0) { S.sel = p.cells[i - 1]; c = S.cel[S.sel]; }
  }
  if (c.val && !c.rev) { c.val = ''; c.est = ''; }
  salvarLocal();
  render();
}

function verificarCompleto() {
  const todas = Object.values(S.cel);
  if (todas.some((c) => !c.val)) return;
  const erradas = todas.filter((c) => c.val !== c.ans);
  if (!erradas.length) { vitoria(); return; }
  erradas.forEach((c) => { c.est = 'erro'; });
  S.conf++;
  somErro();
  salvarLocal();
  render();
  toast(erradas.length === 1 ? 'Falta só 1 letra no lugar certo!' : `${erradas.length} letras estão erradas. Corrija as marcadas.`, 2600);
}

/* ── Ferramentas ───────────────────────────────────────────── */
function revelar(keys) {
  keys.forEach((k) => {
    const c = S.cel[k];
    if (c.rev && c.val === c.ans) return;
    c.val = c.ans; c.rev = true; c.est = '';
  });
}
$('#b-dica').addEventListener('click', () => {
  if (!S || S.fim) return;
  if (!S.sel) { toast('Escolha uma casa para receber a dica.'); return; }
  const c = S.cel[S.sel];
  if (c.rev && c.val === c.ans) { toast('Essa letra já foi revelada.'); return; }
  iniciaRelogio();
  revelar([S.sel]); S.dicas++;
  somOk(); avancar(); salvarLocal(); render(); verificarCompleto();
});
$('#b-palavra').addEventListener('click', () => {
  if (!S || S.fim) return;
  const p = pistaAtiva();
  if (!p) { toast('Escolha uma casa primeiro.'); return; }
  iniciaRelogio();
  revelar(p.cells); S.dicas += 2;
  somOk(); salvarLocal(); render(); verificarCompleto();
});
$('#b-conferir').addEventListener('click', () => {
  if (!S || S.fim) return;
  const preenchidas = Object.values(S.cel).filter((c) => c.val);
  if (!preenchidas.length) { toast('Preencha algumas letras antes de conferir.'); return; }
  const erradas = preenchidas.filter((c) => c.val !== c.ans);
  S.conf++;
  erradas.forEach((c) => { c.est = 'erro'; });
  if (erradas.length) { somErro(); toast(erradas.length === 1 ? '1 letra errada.' : `${erradas.length} letras erradas.`); }
  else { somOk(); toast('Tudo certo até aqui! 👏'); }
  salvarLocal(); render();
});
$('#b-modo').addEventListener('click', () => {
  modo = modo === 'rol' ? 'teclado' : 'rol';
  ls.set('dir:modo', modo);
  atualizaRol();
});

/* ── Vitória ───────────────────────────────────────────────── */
function calculaEstrelas() {
  const pen = S.dicas + S.conf;
  return pen === 0 ? 3 : pen <= 4 ? 2 : 1;
}
async function vitoria() {
  S.fim = true;
  const estrelas = calculaEstrelas();
  const letras = {};
  Object.entries(S.cel).forEach(([k, c]) => { letras[k] = c.val; });
  Object.values(S.cel).forEach((c) => { c.est = 'ok'; });
  ls.del(kBoard(S.fase));
  render();
  somVitoria();
  confete();
  const payload = { acao: 'concluir', fase: S.fase, letras, estrelas, tempo: Math.max(1, S.t), csrf: CFG.csrf };
  const fase = S.fase, tempo = S.t;
  const salvou = await enviar(payload);
  if (!salvou) ls.set(`dir:${UID}:pend`, JSON.stringify(payload));
  setTimeout(() => modalVitoria(fase, estrelas, tempo, salvou), 750);
}
async function enviar(payload) {
  try {
    const r = await fetch('jogo.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (j.status === 'sucesso') { estado = j.estado; return true; }
    if (r.status >= 400 && r.status < 500) return true;   // recusado de vez; não adianta reenviar
  } catch (e) { /* offline */ }
  return false;
}
async function reenviaPendente() {
  const p = ls.get(`dir:${UID}:pend`);
  if (!p) return;
  try {
    const payload = JSON.parse(p);
    payload.csrf = CFG.csrf;
    if (await enviar(payload)) ls.del(`dir:${UID}:pend`);
  } catch (e) { ls.del(`dir:${UID}:pend`); }
}

function confete() {
  const d = document.createElement('div');
  d.className = 'confete';
  const cores = ['#19e3b6', '#ffcf4a', '#ff6b8b', '#7aa8ff', '#c79bff'];
  for (let i = 0; i < 70; i++) {
    const s = document.createElement('i');
    s.style.left = `${Math.random() * 100}%`;
    s.style.background = cores[i % cores.length];
    s.style.animationDuration = `${1.8 + Math.random() * 1.8}s`;
    s.style.animationDelay = `${Math.random() * .5}s`;
    s.style.transform = `rotate(${Math.random() * 360}deg)`;
    d.appendChild(s);
  }
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 4200);
}

/* ── Modais ────────────────────────────────────────────────── */
function abrirModal(html) {
  $('#cartao').innerHTML = html;
  $('#modal').hidden = false;
  const f = $('#cartao').querySelector('.pri, .btn');
  if (f) f.focus({ preventScroll: true });
}
function fecharModal() { $('#modal').hidden = true; }
$('#modal').addEventListener('pointerdown', (e) => { if (e.target.id === 'modal') fecharModal(); });

function estrelasHtml(n) {
  return `<div class="estrelas" aria-label="${n} de 3 estrelas">${[1, 2, 3].map((i) => `<span class="${i <= n ? 'on' : 'vaz'}">★</span>`).join('')}</div>`;
}
function modalVitoria(fase, estrelas, tempo, salvou) {
  const ultima = fase >= estado.total;
  const msg = estrelas === 3 ? 'Perfeito, sem nenhuma ajuda!' : estrelas === 2 ? 'Muito bem! Quase sem ajuda.' : 'Concluída! Dá para melhorar sem dicas.';
  abrirModal(`
    <h2>Fase ${fase} concluída!</h2>
    ${estrelasHtml(estrelas)}
    <p>${msg}</p>
    <div class="stats"><div><b>${fmtTempo(tempo)}</b>tempo</div><div><b>${S ? S.dicas : 0}</b>dicas</div><div><b>${S ? S.conf : 0}</b>conferências</div></div>
    ${salvou ? '' : '<p>Sem conexão agora: o progresso será enviado quando voltar.</p>'}
    <div class="acoes">
      ${ultima ? '<p><b>Você terminou todas as fases! 🏆</b></p>' : '<button class="btn pri" data-a="prox">Próxima fase</button>'}
      <button class="btn" data-a="refazer">Jogar de novo</button>
      <button class="btn" data-a="fases">Escolher fase</button>
    </div>`);
}

function modalFases() {
  const total = estado.total, max = Math.min(estado.fase_atual, total);
  const btns = [];
  for (let i = 1; i <= total; i++) {
    const est = estado.estrelas[i] | 0;
    const bloq = i > max;
    const cls = (bloq ? 'bloq' : '') + (i === estado.fase_atual ? ' atual' : (est ? ' feita' : '')) + (S && i === S.fase ? ' aberta' : '');
    btns.push(`<button class="${cls}" data-f="${i}" ${bloq ? 'disabled' : ''}>${bloq ? '🔒' : i}<small>${est ? '★'.repeat(est) : ''}</small></button>`);
  }
  const feitas = Object.keys(estado.estrelas).length;
  const somaEst = Object.values(estado.estrelas).reduce((a, b) => a + (b | 0), 0);
  abrirModal(`
    <h2>Fases</h2>
    <p>${feitas} de ${total} concluídas · ${somaEst} ★ de ${total * 3}</p>
    <div class="mapa-wrap"><div class="mapa">${btns.join('')}</div></div>
    <div class="acoes"><button class="btn" data-a="fechar">Fechar</button></div>`);
  const aberta = $('#cartao').querySelector('.aberta');
  if (aberta) aberta.scrollIntoView({ block: 'center' });
}

function modalMenu() {
  abrirModal(`
    <h2>Menu</h2>
    <div class="acoes">
      <button class="btn" data-a="comojogar">Como jogar</button>
      <button class="btn" data-a="refazer">Recomeçar esta fase</button>
      <button class="btn perigo" data-a="zerar">Zerar todo o progresso</button>
      <a class="btn" href="login.php?logout=1" style="text-decoration:none;color:inherit">Sair da conta</a>
      <button class="btn pri" data-a="fechar">Voltar ao jogo</button>
    </div>`);
}
function modalAjuda() {
  abrirModal(`
    <h2>Como jogar</h2>
    <p style="text-align:left">Cada casa azul traz uma <b>pista</b>. A seta mostra para onde a resposta segue: para a <b>direita (→)</b> ou para <b>baixo (↓)</b>. Uma casa pode ter duas pistas.<br><br>
    Toque numa casa branca e digite as letras (no celular, use o teclado da tela). Tocar de novo na mesma casa troca entre palavra na horizontal e na vertical. As setas ‹ › passam de pista em pista.<br><br>
    <b>💡 Letra</b> e <b>🔤 Palavra</b> revelam a resposta, <b>✔️ Conferir</b> marca o que está errado. Menos ajuda, mais estrelas: ★★★ é fase sem dicas e sem conferir.<br><br>
    No modo <b>Rol</b> você só toca nas letras que sobraram, sem digitar.</p>
    <div class="acoes"><button class="btn pri" data-a="fechar">Entendi</button></div>`);
}
function modalZerar() {
  abrirModal(`
    <h2>Zerar o progresso?</h2>
    <p>Você volta para a fase 1 e perde as estrelas conquistadas. Isso não pode ser desfeito.</p>
    <div class="acoes"><button class="btn perigo" data-a="zerar-ok">Sim, zerar tudo</button><button class="btn pri" data-a="fechar">Cancelar</button></div>`);
}

function limparFase(n) {
  ls.del(kBoard(n));
}
$('#cartao').addEventListener('click', async (e) => {
  const f = e.target.closest('[data-f]');
  if (f) { fecharModal(); await carregarFase(+f.dataset.f); return; }
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a;
  if (a === 'fechar') fecharModal();
  else if (a === 'fases') modalFases();
  else if (a === 'prox') { fecharModal(); await carregarFase(Math.min(S.fase + 1, estado.total)); }
  else if (a === 'refazer') { const n = S.fase; limparFase(n); fecharModal(); await carregarFase(n); }
  else if (a === 'comojogar') modalAjuda();
  else if (a === 'zerar') modalZerar();
  else if (a === 'zerar-ok') {
    try {
      const r = await fetch('jogo.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ acao: 'reiniciar', csrf: CFG.csrf }) });
      const j = await r.json();
      if (j.status === 'sucesso') {
        estado = j.estado;
        for (let i = 1; i <= estado.total; i++) limparFase(i);
        fecharModal();
        await carregarFase(1);
        toast('Progresso zerado. Boa sorte!');
      } else toast(j.msg || 'Não foi possível zerar.');
    } catch (err) { toast('Sem conexão. Tente novamente.'); }
  }
});

$('#btn-fases').addEventListener('click', modalFases);
$('#btn-menu').addEventListener('click', modalMenu);
$('#btn-tema').addEventListener('click', () => {
  const t = document.body.dataset.tema === 'escuro' ? 'claro' : 'escuro';
  ls.set('tema', t); aplicaTema(t);
});
$('#btn-som').addEventListener('click', () => {
  somLigado = !somLigado; ls.set('dir:som', somLigado ? '1' : '0'); aplicaSom();
  if (somLigado) somTecla();
});

/* ── Teclado físico ────────────────────────────────────────── */
document.addEventListener('keydown', (e) => {
  if (!$('#modal').hidden) { if (e.key === 'Escape') fecharModal(); return; }
  if (!S || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key;
  if (k.length === 1 && /\p{L}/u.test(k)) { e.preventDefault(); digitar(k); return; }
  switch (k) {
    case 'Backspace': case 'Delete': e.preventDefault(); apagar(); break;
    case 'ArrowRight': e.preventDefault(); mover(0, 1); break;
    case 'ArrowLeft': e.preventDefault(); mover(0, -1); break;
    case 'ArrowDown': e.preventDefault(); mover(1, 0); break;
    case 'ArrowUp': e.preventDefault(); mover(-1, 0); break;
    case 'Tab': e.preventDefault(); pistaDelta(e.shiftKey ? -1 : 1); break;
    case ' ': case 'Enter': {
      e.preventDefault();
      const c = S.sel && S.cel[S.sel];
      if (c && c.pal.h !== undefined && c.pal.v !== undefined) { S.dir = S.dir === 'h' ? 'v' : 'h'; render(); }
      break;
    }
    default:
  }
});

/* ── Relógio ───────────────────────────────────────────────── */
let salvaT = 0;
setInterval(() => {
  if (!S || S.fim || !S.ini || document.hidden) return;
  S.t++;
  $('#tempo').textContent = fmtTempo(S.t);
  if (++salvaT % 5 === 0) salvarLocal();
}, 1000);
document.addEventListener('visibilitychange', () => { if (document.hidden) salvarLocal(); });
window.addEventListener('pagehide', salvarLocal);

/* ── Início ────────────────────────────────────────────────── */
function registraSW() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
function inicio() {
  aplicaTema(ls.get('tema', 'escuro'));
  aplicaSom();
  registraSW();
  reenviaPendente();
  let f = Math.min(estado.fase_atual, estado.total);
  const ult = parseInt(ls.get(`dir:${UID}:ultima`, '0'), 10);
  if (ult >= 1 && ult <= f) f = ult;
  carregarFase(f).then(() => { if (!S) toast('Tente recarregar a página.'); });
  window.__diretas = { get S() { return S; }, digitar, estado: () => estado };
}
inicio();
})();
