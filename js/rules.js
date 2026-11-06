// Regras do Cubo de Linhas. Sem navegador e sem Three.js (os testes rodam no Node).
//
// Cubo de vidro 4 x 4 x 4 com 16 hastes em pé. Na sua vez você solta uma conta numa haste e ela
// desce até a mais baixa livre (gravidade do cubo). Vence quem fizer 4 em linha: são 76 linhas
// (retas nos 3 eixos, diagonais nos planos e as 4 diagonais do cubo inteiro). Cubo cheio: empate.

export const N = 4, CELLS = 64, COLS = 16;
export const PLAYER = 0, CPU = 1, EMPTY = -1;
// casa = x + 4·z + 16·y (y = andar, 0 = embaixo); haste = x + 4·z
export const cellOf = (x, y, z) => x + N * z + N * N * y;
export const xyzOf = (i) => [i % N, (i / (N * N)) | 0, ((i / N) | 0) % N];
export const colOf = (i) => i % (N * N);

// As 76 linhas: todas as direções (dx, dy, dz) com começo e fim dentro do cubo, sem repetir
export const LINES = (() => {
  const out = [], seen = new Set();
  const dirs = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) if (dx || dy || dz) dirs.push([dx, dy, dz]);
  for (let x = 0; x < N; x++) for (let y = 0; y < N; y++) for (let z = 0; z < N; z++) for (const [dx, dy, dz] of dirs) {
    const ex = x + 3 * dx, ey = y + 3 * dy, ez = z + 3 * dz;
    if (ex < 0 || ey < 0 || ez < 0 || ex >= N || ey >= N || ez >= N) continue;
    const cells = [0, 1, 2, 3].map(k => cellOf(x + k * dx, y + k * dy, z + k * dz));
    const key = cells.slice().sort((a, b) => a - b).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cells);
  }
  return out;
})();
export const LINES_AT = Array.from({ length: CELLS }, () => []);
LINES.forEach((l, k) => l.forEach(c => LINES_AT[c].push(k)));

export function newGame({ starter = PLAYER, cells = null, solo = false, maxMoves = CELLS } = {}) {
  const st = { cells: cells ? Int8Array.from(cells) : new Int8Array(CELLS).fill(EMPTY), heights: new Int8Array(COLS), turn: starter, starter, moves: 0, over: false, winner: null, line: null, solo, maxMoves, last: -1 };
  for (let c = 0; c < COLS; c++) { let h = 0; while (h < N && st.cells[c + 16 * h] !== EMPTY) h++; st.heights[c] = h; }
  return st;
}
export function cloneState(st) { return { ...st, cells: Int8Array.from(st.cells), heights: Int8Array.from(st.heights) }; }

// a posição respeita a gravidade (sem conta flutuando)?
export function settled(cells) {
  for (let c = 0; c < COLS; c++) { let gap = false; for (let y = 0; y < N; y++) { const v = cells[c + 16 * y]; if (v === EMPTY) gap = true; else if (gap) return false; } }
  return true;
}
export const landing = (st, col) => (st.heights[col] < N ? col + 16 * st.heights[col] : -1);
export function legalMoves(st) {
  if (st.over) return [];
  const out = [];
  for (let c = 0; c < COLS; c++) if (st.heights[c] < N) out.push(c);
  return out;
}
export function lineAt(cells, cell) {
  const v = cells[cell];
  if (v === EMPTY) return null;
  for (const k of LINES_AT[cell]) { const l = LINES[k]; if (cells[l[0]] === v && cells[l[1]] === v && cells[l[2]] === v && cells[l[3]] === v) return l; }
  return null;
}
export function findLine(cells, who) {
  for (const l of LINES) if (cells[l[0]] === who && cells[l[1]] === who && cells[l[2]] === who && cells[l[3]] === who) return l;
  return null;
}

// Aplica uma jogada (a haste). Devolve { st, info } sem mexer no estado de entrada.
export function applyMove(st0, col) {
  if (st0.over) throw new Error('jogo acabou');
  if (!(col >= 0 && col < COLS) || st0.heights[col] >= N) throw new Error(`haste cheia ou inválida: ${col}`);
  const st = cloneState(st0);
  const who = st.turn;
  const cell = col + 16 * st.heights[col];
  st.cells[cell] = who;
  st.heights[col]++;
  st.moves++;
  st.last = cell;
  const line = lineAt(st.cells, cell);
  if (line) { st.over = true; st.winner = who; st.line = line; }
  else if (st.moves >= st.maxMoves || st.heights.every(h => h >= N)) { st.over = true; st.winner = -1; }
  if (!st.over && !st.solo) st.turn = 1 - who;
  return { st, info: { by: who, col, cell, line, winner: st.winner } };
}

// Ameaças: linhas com 3 de um jogador e a 4ª casa livre. playable = a 4ª é onde a próxima conta
// daquela haste entra (dá para fechar já).
export function threats(st, who) {
  const out = [];
  const seen = new Set();
  for (const l of LINES) {
    let n = 0, e = -1, bad = false;
    for (const c of l) { const v = st.cells[c]; if (v === who) n++; else if (v === EMPTY) e = c; else bad = true; }
    if (bad || n !== 3 || seen.has(e)) continue;
    seen.add(e);
    out.push({ cell: e, line: l, playable: landing(st, colOf(e)) === e });
  }
  return out;
}

// Partida: melhor de 3 jogos (empate não conta, no máximo 5), quem começa alterna.
export class Match {
  constructor({ starter = PLAYER } = {}) { this.firstStarter = starter; this.results = []; this.index = 0; this.game = newGame({ starter }); }
  get gameOver() { return this.game.over; }
  play(col) { const r = applyMove(this.game, col); this.game = r.st; return r.info; }
  closeGame() { this.results.push({ winner: this.game.winner, moves: this.game.moves }); }
  nextGame() { this.index++; this.game = newGame({ starter: (this.firstStarter + this.index) % 2 }); }
  wins(who) { return this.results.filter(r => r.winner === who).length; }
  get over() { return this.wins(0) >= 2 || this.wins(1) >= 2 || this.results.length >= 5; }
  get winner() { if (!this.over) return null; const a = this.wins(0), b = this.wins(1); return a > b ? PLAYER : b > a ? CPU : -1; }
}

// Posição em texto: 4 andares (de baixo para cima), cada um com 4 fileiras (z = 0 a 3, z = 0 perto de
// você) de 4 letras (x = 0 a 3). X = sua, O = do outro. Ex.: ['X...|....|....|....', ...]
export function cellsFromText(floors) {
  const cells = new Int8Array(CELLS).fill(EMPTY);
  floors.forEach((f, y) => f.split('|').forEach((row, z) => [...row].forEach((ch, x) => {
    if (ch === 'X') cells[cellOf(x, y, z)] = PLAYER; else if (ch === 'O') cells[cellOf(x, y, z)] = CPU;
  })));
  return cells;
}
export function cellsText(cells) {
  const out = [];
  for (let y = 0; y < N; y++) {
    const rows = [];
    for (let z = 0; z < N; z++) { let s = ''; for (let x = 0; x < N; x++) { const v = cells[cellOf(x, y, z)]; s += v === PLAYER ? 'X' : v === CPU ? 'O' : '.'; } rows.push(s); }
    out.push(rows.join('|'));
  }
  return out;
}
const COL_NAMES = 'ABCD';
export const colName = (c) => `${COL_NAMES[c % 4]}${((c / 4) | 0) + 1}`;   // A1 = canto da frente à esquerda
