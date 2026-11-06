// Adversários do Cubo de Linhas e a busca rápida (fazer e desfazer em arrays). Sem navegador.
import { LINES, LINES_AT, COLS, N, EMPTY, legalMoves, applyMove } from './rules.js';

export const OPPONENTS = [
  {
    id: 'arriscado', name: 'Seu Cacto', title: 'Arriscado',
    desc: 'Vai direto para as linhas dele e às vezes esquece de tapar as suas',
    style: 'risky', depth: 1, atk: 1.5, def: 0.6, noise: 6, blunder: 0.05, missBlock: 0.35, color: 0x5a9a3a, think: 0.8,
  },
  {
    id: 'cautelosa', name: 'Dona Hortênsia', title: 'Cautelosa',
    desc: 'Tapa toda linha de 3 que você começa antes de pensar na dela',
    style: 'careful', depth: 3, atk: 0.9, def: 1.5, noise: 3, blunder: 0.02, color: 0x8a6ad8, think: 1.1,
  },
  {
    id: 'estrategista', name: 'Mestra Orquídea', title: 'Pensa à frente',
    desc: 'Calcula até seis contas à frente e arma ameaças duplas',
    style: 'master', depth: 6, atk: 1.0, def: 1.1, noise: 0.5, blunder: 0, color: 0xd84a8a, think: 1.5,
  },
];
export const ROBOT = { id: 'robo', name: 'Robô', style: 'master', depth: 6, atk: 1, def: 1.1, noise: 0, blunder: 0, think: 0.35 };

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());
const WIN = 100000;
const W = [0, 1, 6, 40, 0];
// ordem das hastes: as do meio primeiro (ajudam o corte)
const ORDER = [5, 6, 9, 10, 0, 3, 12, 15, 1, 2, 4, 7, 8, 11, 13, 14];

// ---------- núcleo rápido ----------
export class Board {
  constructor(st) { this.c = Int8Array.from(st.cells); this.h = Int8Array.from(st.heights); this.n = st.cells.reduce((a, v) => a + (v !== EMPTY), 0); }
  play(col, who) { const cell = col + 16 * this.h[col]; this.c[cell] = who; this.h[col]++; this.n++; return cell; }
  undo(col) { this.h[col]--; this.c[col + 16 * this.h[col]] = EMPTY; this.n--; }
  wins(cell) {
    const v = this.c[cell], c = this.c;
    for (const k of LINES_AT[cell]) { const l = LINES[k]; if (c[l[0]] === v && c[l[1]] === v && c[l[2]] === v && c[l[3]] === v) return true; }
    return false;
  }
  // jogar nesta haste ganha na hora para "who"?
  winningCol(col, who) {
    if (this.h[col] >= N) return false;
    const cell = this.play(col, who);
    const w = this.wins(cell);
    this.undo(col);
    return w;
  }
  full() { return this.n >= 64; }
}

export function evalBoard(b, me, o) {
  const c = b.c;
  let s = 0;
  for (const l of LINES) {
    let m = 0, t = 0;
    for (let k = 0; k < 4; k++) { const v = c[l[k]]; if (v === me) m++; else if (v !== EMPTY) t++; }
    if (t === 0) s += W[m] * o.atk; else if (m === 0) s -= W[t] * o.def;
  }
  return s;
}

function negamax(b, who, depth, alpha, beta, o, stats) {
  stats.n++;
  if (b.full()) return 0;
  // ganha agora?
  for (const col of ORDER) if (b.winningCol(col, who)) return WIN + depth;
  if (depth <= 0) return evalBoard(b, who, o);
  // o outro ameaça ganhar: só vale tapar
  const forced = [];
  for (const col of ORDER) if (b.winningCol(col, 1 - who)) forced.push(col);
  if (forced.length > 1) return -(WIN + depth - 1);
  const cols = forced.length ? forced : ORDER;
  let best = -Infinity;
  for (const col of cols) {
    if (b.h[col] >= N) continue;
    b.play(col, who);
    const v = -negamax(b, 1 - who, depth - 1, -beta, -alpha, o, stats);
    b.undo(col);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
    if (stats.stop && performance.now() > stats.stop) break;
  }
  return best === -Infinity ? 0 : best;
}

// Escolha em passos (gerador): aprofunda de 1 em 1 até a profundidade do adversário ou até ~60 ms.
export function* chooseMoveGen(st, who, o, rand = Math.random) {
  const moves = legalMoves(st);
  if (!moves.length) return null;
  const b = new Board(st);
  for (const col of moves) if (b.winningCol(col, who)) return col;   // ganha na hora: todo mundo vê
  const blocks = moves.filter(col => b.winningCol(col, 1 - who));
  if (blocks.length && !(o.missBlock && rand() < o.missBlock)) { if (blocks.length === 1 || o.depth < 2) return blocks[0]; }
  if (o.blunder && rand() < o.blunder) return moves[Math.floor(rand() * moves.length)];
  const t0 = performance.now();
  const stats = { n: 0, stop: 0 };
  let vals = new Map();
  let reached = 0;
  // profundidades pares (2, 4, 6...) para a mais funda: com ímpar a avaliação puxa para quem joga por último
  const depths = o.depth <= 3 ? [o.depth] : [2, 4, 6, 8].filter(d => d <= o.depth);
  for (const d of depths) {
    stats.stop = d > 2 ? t0 + 60 : 0;
    const cur = new Map();
    let alpha = -Infinity, aborted = false;
    const order = !vals.size ? moves : [...moves].sort((a, c) => vals.get(c) - vals.get(a));
    for (const col of order) {
      b.play(col, who);
      const v = -negamax(b, 1 - who, d - 1, -Infinity, -alpha + 1e-6 + (o.noise ? 30 : 0), o, stats);
      b.undo(col);
      cur.set(col, v);
      if (v > alpha) alpha = v;
      if (stats.stop && performance.now() > stats.stop) { aborted = true; break; }
    }
    if (!aborted) { vals = cur; reached = d; }   // profundidade pela metade não vale (mistura par e ímpar)
    yield;
    if (aborted || Math.abs(alpha) >= WIN / 2) break;
  }
  let best = null, bs = -Infinity;
  for (const col of moves) {
    const v0 = vals.get(col) ?? -Infinity;
    const v = v0 + (o.noise && Math.abs(v0) < WIN / 2 ? gauss(rand) * o.noise : 0) + rand() * 1e-6;
    if (v > bs) { bs = v; best = col; }
  }
  return best;
}
export function chooseMove(st, who, o, rand) {
  const g = chooseMoveGen(st, who, o, rand);
  let x;
  do { x = g.next(); } while (!x.done);
  return x.value;
}
export function playGame(st, a, b, rand) {
  let k = 0;
  while (!st.over) { st = applyMove(st, chooseMove(st, st.turn, st.turn === 0 ? a : b, rand)).st; if (++k > 70) throw new Error('jogo não terminou'); }
  return st;
}

// ---------- vitória forçada (para os desafios) ----------
// "who" consegue ganhar em até n contas dele, contra qualquer resposta? Devolve a haste ou -1.
export function forcedWin(b, who, n, budget = { n: 0 }) {
  if (n <= 0) return -1;
  for (const col of ORDER) if (b.winningCol(col, who)) return col;
  if (n === 1) return -1;
  for (const col of ORDER) {
    if (b.h[col] >= N) continue;
    budget.n++;
    b.play(col, who);
    let all = !b.full();
    if (all) {
      for (const r of ORDER) {
        if (b.h[r] >= N) continue;
        if (b.winningCol(r, 1 - who)) { all = false; break; }
        b.play(r, 1 - who);
        const ok = forcedWin(b, who, n - 1, budget) >= 0;
        b.undo(r);
        if (!ok) { all = false; break; }
      }
    }
    b.undo(col);
    if (all) return col;
  }
  return -1;
}
// Menor n (até max) com vitória forçada, ou Infinity
export function winDistance(b, who, max) {
  for (let n = 1; n <= max; n++) if (forcedWin(b, who, n) >= 0) return n;
  return Infinity;
}
// Defesa dos desafios: a resposta que mais atrasa a sua vitória (ganha se você der chance)
export function defenderMove(st, attacker, max) {
  const b = new Board(st);
  const def = 1 - attacker;
  let best = -1, bd = -1;
  for (const r of ORDER) {
    if (b.h[r] >= N) continue;
    if (b.winningCol(r, def)) return r;
    b.play(r, def);
    const d = b.full() ? Infinity : winDistance(b, attacker, max);
    b.undo(r);
    if (d > bd) { bd = d; best = r; }
  }
  return best;
}
