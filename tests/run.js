// Testes automáticos: node tests/run.js (ou npm test). Não tocam som e saem com código 1 se algo falhar.
import { CELLS, COLS, LINES, PLAYER, CPU, cellOf, xyzOf, newGame, legalMoves, applyMove, threats, settled, Match, cellsFromText, cellsText, landing } from '../js/rules.js';
import { OPPONENTS, ROBOT, rng, chooseMove, playGame, Board, winDistance } from '../js/ai.js';
import { CHALLENGES, setupChallenge, solveChallenge, gradeMoves, gradeState, challengeOver } from '../js/challenges.js';

let fails = 0, count = 0;
function ok(cond, msg) { count++; if (!cond) { fails++; console.log('  FALHOU:', msg); } }
process.on('uncaughtException', (e) => { console.log('ERRO:', e); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log('ERRO:', e); process.exit(1); });
setTimeout(() => { console.log('ERRO: os testes passaram de 150 s'); process.exit(1); }, 150000).unref();
const E = '....|....|....|....';

console.log('Cubo e linhas');
{
  ok(CELLS === 64 && COLS === 16, '64 casas, 16 hastes');
  ok(LINES.length === 76, `76 linhas (${LINES.length})`);
  const kinds = { reta: 0, diagPlano: 0, diagCubo: 0 };
  for (const l of LINES) {
    const a = xyzOf(l[0]), b = xyzOf(l[3]);
    const axes = [0, 1, 2].filter(k => a[k] !== b[k]).length;
    if (axes === 1) kinds.reta++; else if (axes === 2) kinds.diagPlano++; else kinds.diagCubo++;
  }
  ok(kinds.reta === 48 && kinds.diagPlano === 24 && kinds.diagCubo === 4, `48 retas, 24 diagonais de plano e 4 do cubo (${JSON.stringify(kinds)})`);
  ok(cellsText(cellsFromText(['X..O|....|....|....', E, E, E]))[0] === 'X..O|....|....|....', 'texto da posição');
}

console.log('Gravidade e jogadas');
{
  let st = newGame();
  ok(legalMoves(st).length === 16, 'começo: 16 hastes');
  st = applyMove(st, 5).st;
  ok(st.cells[5] === PLAYER && st.heights[5] === 1 && st.turn === CPU, 'conta vai para o fundo da haste e passa a vez');
  st = applyMove(st, 5).st;
  ok(st.cells[5 + 16] === CPU && landing(st, 5) === 5 + 32, 'a próxima empilha em cima');
  let s = newGame();
  for (let k = 0; k < 4; k++) s = applyMove(s, 0).st;
  let threw = false;
  try { applyMove(s, 0); } catch { threw = true; }
  ok(threw && !legalMoves(s).includes(0), 'haste cheia não aceita conta');
  const win = (floors, col) => applyMove(newGame({ cells: cellsFromText(floors) }), col).st;
  ok(win(['XXX.|OO..|O...|....', E, E, E], 3).winner === PLAYER, 'reta no andar');
  ok(win(['X...|.O..|..O.|...O', 'X...|....|....|....', 'X...|....|....|....', E], 0).winner === PLAYER, 'em pé na haste');
  ok(win(['X.O.|OX..|O.X.|....', E, E, E], 15).winner === PLAYER, 'diagonal do andar');
  ok(win(['X...|.O..|..O.|...O', '....|.X..|..O.|...X', '....|....|..X.|...O', E], 15).winner === PLAYER, 'diagonal que cruza o cubo');
  const t = newGame({ cells: cellsFromText(['XXX.|OO..|O...|....', E, E, E]) });
  const th = threats(t, PLAYER);
  ok(th.length === 1 && th[0].cell === cellOf(3, 0, 0) && th[0].playable, 'acha a linha de 3 que dá para fechar já');
  const t2 = newGame({ cells: cellsFromText(['OOOX|XX..|....|....', 'OOO.|....|....|....', E, E]) });
  const th2 = threats(t2, CPU).find(x => x.cell === cellOf(3, 1, 0));
  ok(th2 && th2.playable, 'ameaça em cima de uma conta é "já"');
  const t3 = newGame({ cells: cellsFromText(['OOX.|XX..|....|....', 'OO..|X...|....|....', 'O...|....|....|....', E]) });
  const th3 = threats(t3, CPU).find(x => x.cell === cellOf(3, 3, 0) || x.cell === cellOf(2, 2, 0));
  ok(!th3 || !th3.playable || landing(t3, th3.cell % 16) === th3.cell, 'ameaça no ar (sem conta embaixo) não é "já"');
  const r = rng(4);
  let bad = 0;
  for (let g = 0; g < 300; g++) {
    let x = newGame({ starter: g % 2 });
    while (!x.over) { const ms = legalMoves(x); x = applyMove(x, ms[(r() * ms.length) | 0]).st; if (!settled(x.cells)) bad++; }
    if (x.winner === null) bad++;
  }
  ok(bad === 0, '300 jogos sorteados acabam e nenhuma conta flutua');
  const m = new Match({ starter: PLAYER });
  const starters = [];
  while (!m.over) { starters.push(m.game.starter); while (!m.gameOver) m.play(legalMoves(m.game)[0]); m.closeGame(); if (!m.over) m.nextGame(); }
  ok(m.winner !== null && starters[1] === 1 - starters[0], `melhor de 3, quem começa alterna (${m.results.map(x => x.winner).join(',')})`);
}

console.log('IA');
{
  const r = rng(7);
  const winPos = newGame({ starter: CPU, cells: cellsFromText(['OOO.|XX..|X...|....', E, E, E]) });
  const blockPos = newGame({ starter: CPU, cells: cellsFromText(['XXX.|OO..|....|....', E, E, E]) });
  for (const o of OPPONENTS) {
    ok(applyMove(winPos, chooseMove(winPos, CPU, { ...o, blunder: 0 }, r)).st.winner === CPU, `${o.name} fecha a linha quando pode`);
    if (o.missBlock) continue;
    ok(chooseMove(blockPos, CPU, { ...o, blunder: 0 }, r) === 3, `${o.name} tapa a sua linha de 3`);
  }
  let worst = 0;
  for (const o of OPPONENTS) {
    let s = newGame({ starter: CPU });
    for (let k = 0; k < 24 && !s.over; k++) {
      const t0 = performance.now();
      const m = chooseMove(s, s.turn, o, r);
      worst = Math.max(worst, performance.now() - t0);
      s = applyMove(s, m).st;
    }
  }
  ok(worst < 100, `IA pensa rápido (pior jogada: ${worst.toFixed(0)} ms)`);
}

console.log('IA contra IA');
{
  const r = rng(2026);
  const G = 10;
  const duel = (a, b) => {
    let wa = 0, wb = 0, d = 0, mv = 0;
    for (let g = 0; g < G; g++) { const st = playGame(newGame({ starter: g % 2 }), a, b, r); mv += st.moves; if (st.winner === 0) wa++; else if (st.winner === 1) wb++; else d++; }
    console.log(`  ${a.name} ${wa} x ${wb} ${b.name} (empates ${d}, ${(mv / G).toFixed(0)} contas em média)`);
    return wa;
  };
  ok(duel(OPPONENTS[2], OPPONENTS[1]) > G / 2, 'mestra vence a cautelosa na maioria');
  ok(duel(OPPONENTS[2], OPPONENTS[0]) > G / 2, 'mestra vence o arriscado na maioria');
  ok(duel(OPPONENTS[1], OPPONENTS[0]) > G / 2, 'cautelosa vence o arriscado na maioria');
  let done = 0;
  for (const o of OPPONENTS) {
    const m = new Match({ starter: CPU });
    while (!m.over) { while (!m.gameOver) m.play(chooseMove(m.game, m.game.turn, m.game.turn === CPU ? o : ROBOT, r)); m.closeGame(); if (!m.over) m.nextGame(); }
    if (m.winner !== null) done++;
  }
  ok(done === 3, 'partidas completas contra os 3 adversários terminam');
}

console.log('Desafios');
{
  ok(CHALLENGES.length >= 8 && CHALLENGES.length <= 10, `${CHALLENGES.length} desafios`);
  for (const [i, c] of CHALLENGES.entries()) {
    const st = setupChallenge(c);
    const nx = st.cells.filter(v => v === PLAYER).length, no = st.cells.filter(v => v === CPU).length;
    ok(settled(st.cells) && nx === no && !st.over, `desafio ${i + 1}: sem conta no ar e mesma quantidade de cada (${nx} x ${no})`);
    const b = new Board(st);
    ok(!legalMoves(st).some(col => b.winningCol(col, CPU)), `desafio ${i + 1}: a laranja não tem linha pronta`);
    const d = winDistance(b, PLAYER, c.max);
    ok(d === c.par, `desafio ${i + 1}: vitória forçada em exatamente ${c.par} (achou ${d})`);
    const t0 = performance.now();
    const best = solveChallenge(c);
    console.log(`  ${i + 1}. ${c.name}: ${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)}  hastes ${best.moves.join(', ')}  (${(performance.now() - t0).toFixed(0)} ms)`);
    ok(best.stars === 3 && gradeMoves(c, best.moves) === 3, `robô tira 3 estrelas no desafio ${i + 1} contra a defesa`);
    const fm = [];
    let s = setupChallenge(c);
    while (!challengeOver(c, s)) { const col = legalMoves(s)[0]; fm.push(col); s = applyMove(s, col).st; if (!s.over) s = applyMove(s, legalMoves(s)[0]).st; }
    ok(gradeMoves(c, fm) < 3, `desafio ${i + 1}: soltar sempre na primeira haste livre não dá 3 estrelas`);
  }
  ok(gradeState(CHALLENGES[0], setupChallenge(CHALLENGES[0])) === 0, 'sem jogar: 0 estrela');
}

console.log('Fumaça do main.js');
{
  const { smoke } = await import('./smoke.js');
  try { for (const [cond, msg] of await smoke()) ok(cond, msg); } catch (e) { ok(false, `main.js quebrou: ${e.stack || e}`); }
}

console.log(`\n${count - fails} de ${count} passaram`);
if (fails) { console.log(`${fails} FALHARAM`); process.exit(1); }
console.log('Tudo certo');
process.exit(0);
