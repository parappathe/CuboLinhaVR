// Desafios do Cubo de Linhas: ganhe em poucas contas contra a defesa perfeita. Você começa; a
// Mestra Orquídea responde sempre com a jogada que mais atrasa a sua vitória (e ganha se você der
// chance). ★★★ = ganhar no mínimo possível de contas suas (o "par"), ★★ = uma a mais, ★ = até o
// máximo. Posição: 4 andares de baixo para cima, cada um "fileira de perto|...|fileira de longe",
// X = sua, O = dela. Sem navegador.
import { newGame, applyMove, cellsFromText, PLAYER, CPU } from './rules.js';
import { Board, forcedWin, defenderMove } from './ai.js';

const E = '....|....|....|....';
export const CHALLENGES = [
  { name: 'Primeira linha', par: 1, desc: 'Três azuis na fileira da frente, embaixo. Complete a linha.',
    floors: ['XXX.|OO..|O...|....', E, E, E] },
  { name: 'Diagonal no chão', par: 1, desc: 'Linha também vale na diagonal do andar.',
    floors: ['X.O.|OX..|O.X.|....', E, E, E] },
  { name: 'Torre', par: 1, desc: 'Em pé também conta: quatro na mesma haste.',
    floors: ['O...|.O..|..X.|...O', '....|....|..X.|....', '....|....|..X.|....', E] },
  { name: 'Ameaça dupla', par: 2, desc: 'Arme duas linhas de 3 ao mesmo tempo: ela só tapa uma.',
    floors: ['...X|XX..|..O.|X..O', '...O|XO..|..O.|....', E, E] },
  { name: 'Canto', par: 2, desc: 'Gire o cubo e procure a linha que passa pelo canto.',
    floors: ['.XX.|XOOO|.X..|XO.O', '.O..|...X|.X..|....', '.O..|....|....|....', E] },
  { name: 'Escada', par: 2, desc: 'Uma diagonal sobe de andar em andar. Use os degraus.',
    floors: ['O.X.|.X..|.X.X|OOXO', 'O...|....|....|....', E, E] },
  { name: 'Por baixo', par: 2, desc: 'Às vezes a conta certa é a que deixa a dela sem lugar.',
    floors: ['XOOO|X.XO|.O..|..XX', '.X.X|...O|.O..|....', E, E] },
  { name: 'Três jogadas', par: 3, desc: 'Agora são três contas suas. Prepare antes de ameaçar.',
    floors: ['X...|.OXX|O.O.|..XX', 'O...|.XO.|....|....', '....|.O..|....|....', E] },
  { name: 'Espiral de vidro', par: 3, desc: 'O cubo inteiro conta. Olhe de todos os lados.',
    floors: ['..O.|XXXO|...X|XO.O', '..O.|....|....|O..X', E, E] },
  { name: 'Grande final', par: 3, desc: 'A defesa dela é perfeita. Ache a única saída.',
    floors: ['.OOX|.OX.|..X.|...X', '.OOO|..X.|....|...X', E, E] },
];
for (const c of CHALLENGES) c.max = c.par + 3;

export function setupChallenge(c) {
  return newGame({ starter: PLAYER, cells: cellsFromText(c.floors) });
}
// contas suas já jogadas no desafio
export const myMoves = (st) => Math.ceil(st.moves / 2);
export function challengeOver(c, st) { return st.over || (st.turn === PLAYER && myMoves(st) >= c.max); }
export function gradeState(c, st) {
  if (st.winner !== PLAYER) return 0;
  const n = myMoves(st);
  return n <= c.par ? 3 : n <= c.par + 1 ? 2 : n <= c.max ? 1 : 0;
}
export function goalText(c) {
  return `★★★ em ${c.par} conta${c.par > 1 ? 's' : ''}   ★★ em ${c.par + 1}   ★ em até ${c.max}`;
}
// Resposta da defesa (a Mestra) no desafio
export function defend(c, st) { return defenderMove(st, PLAYER, c.max); }
// Joga uma sequência de contas suas, com a defesa respondendo; devolve a nota
export function gradeMoves(c, cols) {
  let st = setupChallenge(c);
  for (const col of cols) {
    if (challengeOver(c, st)) break;
    if (st.heights[col] >= 4) break;
    st = applyMove(st, col).st;
    if (!st.over) st = applyMove(st, defend(c, st)).st;
  }
  return gradeState(c, st);
}
// Melhor conta para você agora (vitória forçada mais curta), ou -1
export function bestColumn(st, limit = 4) {
  const b = new Board(st);
  for (let n = 1; n <= limit; n++) { const col = forcedWin(b, PLAYER, n); if (col >= 0) return { col, n }; }
  return { col: -1, n: Infinity };
}
// Robô que resolve: acha a vitória forçada e joga contra a defesa até o fim. Gerador (para no meio).
export function* bestChallengeGen(c) {
  let st = setupChallenge(c);
  const cols = [];
  while (!challengeOver(c, st)) {
    const { col } = bestColumn(st, c.max);
    yield;
    if (col < 0) break;
    cols.push(col);
    st = applyMove(st, col).st;
    if (!st.over) st = applyMove(st, defend(c, st)).st;
    yield;
  }
  return { stars: gradeState(c, st), moves: cols };
}
export function solveChallenge(c) {
  const g = bestChallengeGen(c);
  let x;
  do { x = g.next(); } while (!x.done);
  return x.value;
}
export { CPU };
