// Liga as regras e a IA à tela, ao Quest (controles e mãos) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { N, CELLS, COLS, Match, applyMove, legalMoves, landing, threats, PLAYER, CPU, EMPTY, colName, xyzOf, colOf } from './rules.js';
import { OPPONENTS, ROBOT, rng, chooseMoveGen, Board } from './ai.js';
import { CHALLENGES, setupChallenge, challengeOver, gradeState, goalText, defend, bestColumn, myMoves } from './challenges.js';
import { buildWorld, TABLE, CUBE, BEAD, BOWLS, cellLocal, colTopLocal } from './scene.js';
import { Panel, Label } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent || '');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const VR_STAND = { x: TABLE.x, z: TABLE.z + 0.6 };
const GRAB_BOWL = 0.09;

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !IS_QUEST });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_QUEST ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildWorld(renderer);
const { scene, cube } = world;
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.03, 60);
rig.add(camera);
const UP = new THREE.Vector3(0, 1, 0);

const panel = new Panel(0.9);
const fpsLabel = new Label(0.12);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);
const statusLabel = new Label(0.62, 1024, 200);
statusLabel.mesh.position.set(TABLE.x, 1.62, TABLE.z - 0.5);
statusLabel.mesh.rotation.x = -0.15;
statusLabel.mesh.visible = false;
scene.add(statusLabel.mesh);
const previewLabel = new Label(0.3, 768, 160);
previewLabel.mesh.visible = false;
scene.add(previewLabel.mesh);

// ---------- Estado ----------
let app = 'menu';
let mode = 'match';
let match = null;
let ch = null;              // { i, st }
let oppIndex = 0;
let phase = 'idle';         // 'intro' | 'turn' | 'think' | 'anim' | 'gameEnd' | 'over'
let time = 0;
let msg = null;
let random = rng((Date.now() % 100000) + 1);
let held = null;            // { kind: 'bead'|'cube', entry, via, mesh, col, off }
let thinker = null;
let thinkT = 0;
let chResult = null;
const opponent = () => OPPONENTS[oppIndex];
const cur = () => (mode === 'match' ? match?.game : ch?.st);
const beadMeshes = new Map();   // casa → conta
const anims = [];
const timers = [];
const later = (sec, fn) => timers.push({ at: time + sec, fn });
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const cubeHome = { returning: null };

function clearBoard() {
  for (const m of beadMeshes.values()) m.parent?.remove(m);
  beadMeshes.clear();
  for (const a of anims) a.mesh.parent?.remove(a.mesh);
  anims.length = 0;
  timers.length = 0;
  world.winLine.visible = false;
}
function syncBoard(cells) {
  for (const [c, m] of beadMeshes) if (cells[c] !== m.userData.team) { m.parent?.remove(m); beadMeshes.delete(c); }
  for (let c = 0; c < CELLS; c++) {
    if (cells[c] === EMPTY || beadMeshes.has(c)) continue;
    const m = world.makeBead(cells[c]);
    cellLocal(c, m.position);
    m.userData.cell = c;
    world.beadsG.add(m);
    beadMeshes.set(c, m);
  }
}
function resetCube() {
  cube.position.copy(CUBE.center);
  cube.quaternion.setFromAxisAngle(UP, 0.35).multiply(_q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.0));
  cubeHome.returning = null;
}

// ---------- Partidas e desafios ----------
function newMatch(i) {
  mode = 'match';
  oppIndex = clamp(i, 0, OPPONENTS.length - 1);
  const o = opponent();
  world.avatar.setStyle(o.style, o.color);
  match = new Match({ starter: random() < 0.5 ? PLAYER : CPU });
  ch = null;
  startGame();
  msg = { text: match.game.starter === PLAYER ? 'Sorteio: você começa.' : `Sorteio: ${o.name} começa.`, t: 3.5 };
}
function startGame() {
  app = 'play';
  panel.hide();
  dropHeld();
  clearBoard();
  resetCube();
  syncBoard(cur().cells);
  placeForPlay();
  beginTurn();
}
function newChallenge(i, skipIntro = false) {
  mode = 'challenge';
  oppIndex = 2;
  const k = clamp(i, 0, CHALLENGES.length - 1);
  ch = { i: k, st: setupChallenge(CHALLENGES[k]) };
  match = null;
  world.avatar.setStyle('master', OPPONENTS[2].color);
  app = 'play';
  dropHeld();
  clearBoard();
  resetCube();
  syncBoard(ch.st.cells);
  msg = null; chResult = null; thinker = null;
  placeForPlay();
  if (skipIntro || dev.autoplay) { panel.hide(); beginTurn(); } else { phase = 'intro'; showScreen('chIntro'); }
}

function beginTurn() {
  const st = cur();
  thinker = null;
  if (mode === 'challenge' ? challengeOver(CHALLENGES[ch.i], st) : st.over) { endOfGame(); return; }
  if (st.turn === PLAYER) { phase = 'turn'; thinkT = 0; }
  else {
    phase = 'think';
    thinkT = 0;
    world.avatar.state.thinking = true;
    if (mode === 'challenge') thinker = { done: true, result: defend(CHALLENGES[ch.i], st) };
    else thinker = { gen: chooseMoveGen(st, CPU, opponent(), random), done: false, result: null };
  }
  updateThreats();
  updateHint();
}
function pumpThinker(budgetMs = 6) {
  if (!thinker || thinker.done) return;
  const t0 = performance.now();
  do {
    const x = thinker.gen.next();
    if (x.done) { thinker.done = true; thinker.result = x.value; return; }
  } while (performance.now() - t0 < budgetMs);
}

// Solta uma conta na haste e anima a descida (no referencial do cubo: ela desce pela haste mesmo
// com o cubo girado).
function doMove(col, from = {}) {
  const st = cur();
  if (!st || st.over || phase === 'anim' || !(col >= 0 && col < COLS) || st.heights[col] >= N) return false;
  const who = st.turn;
  let info;
  if (mode === 'match') info = match.play(col);
  else { const r = applyMove(ch.st, col); ch.st = r.st; info = r.info; }
  phase = 'anim';
  hidePreview();
  if (who === CPU) world.avatar.state.thinking = false;
  const mesh = world.makeBead(who);
  world.beadsG.add(mesh);
  const top = colTopLocal(col);
  let start = top.clone();
  if (from.pos) start = world.beadsG.worldToLocal(from.pos.clone());
  else if (who === CPU) start = world.beadsG.worldToLocal(BOWLS[2].pos.clone().add(new THREE.Vector3(0, 0.05, 0)));
  mesh.position.copy(start);
  const dest = cellLocal(info.cell);
  const toTop = start.distanceTo(top) > 0.005 ? (from.pos ? 0.12 : 0.45) : 0;
  const fall = Math.sqrt(2 * Math.max(0.01, top.y - dest.y) / 1.6);   // "gravidade" lenta do cubo
  anims.push({ mesh, t0: time, a: start, top, b: dest, toTop, fall });
  const depth = N - 1 - xyzOf(info.cell)[1];
  sfx.drop(depth, toTop);
  if (renderer.xr.isPresenting) later(toTop + fall, () => pulse(lastHandSide, 0.25, 20));
  let t = toTop + fall + 0.15;
  later(t, () => {
    world.beadsG.remove(mesh);
    syncBoard(cur().cells);
    if (info.line) {
      world.showWinLine(info.line, info.by);
      sfx.line(info.by === PLAYER);
      world.avatar.react(info.by === CPU ? 1 : -1);
      if (renderer.xr.isPresenting) pulseAll(0.5, 80);
    }
  });
  if (info.line) t += 1.4;
  later(t, () => afterMove(info));
  return true;
}
function updateAnims() {
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i];
    const e = time - a.t0;
    if (e < a.toTop) {
      const k = e / a.toTop, s = k * k * (3 - 2 * k);
      a.mesh.position.lerpVectors(a.a, a.top, s);
      a.mesh.position.y += Math.sin(Math.PI * k) * 0.05;
    } else {
      const f = Math.min(a.fall, e - a.toTop);
      a.mesh.position.copy(a.top);
      a.mesh.position.y = a.top.y - 0.8 * f * f;
      if (a.mesh.position.y <= a.b.y || f >= a.fall) { a.mesh.position.copy(a.b); anims.splice(i, 1); }
    }
  }
}
function afterMove(info) {
  const st = cur();
  msg = null;
  const thr = threats(st, info.by).filter(t => t.playable);
  if (!st.over && info.by === CPU && thr.length) { msg = { text: thr.length > 1 ? 'Ela armou duas linhas de 3: dá para tapar só uma!' : 'Cuidado: linha de 3 dela pronta para fechar.', t: 3 }; sfx.threat(); }
  else if (!st.over && info.by === PLAYER && thr.length) msg = { text: thr.length > 1 ? 'Ameaça dupla!' : 'Você tem uma linha de 3 pronta.', t: 2.5 };
  beginTurn();
}

function endOfGame() {
  if (mode === 'challenge') { finishChallenge(); return; }
  if (phase === 'gameEnd' || phase === 'over') return;
  match.closeGame();
  phase = match.over ? 'over' : 'gameEnd';
  const w = match.game.winner;
  if (match.over) {
    save.games[oppIndex]++;
    if (match.winner === PLAYER) { save.wins[oppIndex]++; sfx.fanfare(); world.avatar.react(-1); } else if (match.winner === CPU) { sfx.bad(); world.avatar.react(1); }
    storeSave(save);
    showScreen('over');
  } else { if (w === PLAYER) sfx.good(); else if (w === CPU) sfx.bad(); showScreen('gameEnd'); }
  timerAuto = 2.5;
  updateHint();
}
let timerAuto = 0;
function nextGame() {
  match.nextGame();
  startGame();
  msg = { text: match.game.starter === PLAYER ? `Jogo ${match.index + 1}: você começa.` : `Jogo ${match.index + 1}: ${opponent().name} começa.`, t: 3 };
}
function finishChallenge() {
  if (phase === 'over') return;
  phase = 'over';
  const stars = gradeState(CHALLENGES[ch.i], ch.st);
  chResult = { stars };
  save.ch[ch.i] = Math.max(save.ch[ch.i] || 0, stars);
  storeSave(save);
  for (let k = 0; k < stars; k++) later(0.25 * k, () => sfx.star(k));
  if (stars === 3) later(0.8, () => sfx.fanfare());
  timerAuto = 2.5;
  showScreen('chResult');
}
function goMenu() {
  app = 'menu';
  phase = 'idle';
  match = null; ch = null;
  dropHeld();
  clearBoard();
  resetCube();
  const demo = new Int8Array(CELLS).fill(EMPTY);
  [0, 5, 10, 21, 3].forEach(c => { demo[c] = PLAYER; });
  [1, 6, 17, 12, 15].forEach(c => { demo[c] = CPU; });
  syncBoard(demo);
  hideThreats();
  world.avatar.setStyle('master', OPPONENTS[2].color);
  world.avatar.state.thinking = false;
  if (renderer.xr.isPresenting) placeRig(VR_STAND.x, VR_STAND.z);
  showScreen('main');
  updateHint();
}
function togglePause() {
  if (app === 'play' && !panel.visible) { app = 'paused'; dropHeld(); showScreen('pause'); }
  else if (app === 'paused') { app = 'play'; panel.hide(); }
  updateHint();
}

// ---------- Ameaças de 3 ----------
function hideThreats() { for (const m of world.threatMarks) m.visible = false; }
function updateThreats() {
  hideThreats();
  const st = cur();
  if (!st || app === 'menu' || !save.preview || st.over) return;
  let k = 0;
  for (const team of [CPU, PLAYER]) for (const t of threats(st, team)) {
    if (k >= world.threatMarks.length) break;
    const m = world.threatMarks[k++];
    cellLocal(t.cell, m.position);
    m.material = world.threatMats[team];
    m.userData.playable = t.playable;
    m.visible = true;
  }
}

// ---------- Menus ----------
const challengeUnlocked = (i) => i === 0 || (save.ch[i - 1] || 0) >= 1;
function showScreen(name) {
  const vr = renderer.xr.isPresenting;
  if (vr) placePanelVR();
  panel.show((p) => {
    if (name === 'main') {
      p.title('Cubo de Linhas', 72, 60);
      p.text('Quatro em linha num cubo de vidro 4 x 4 x 4: 76 linhas, até na diagonal', 512, 132, { size: 26, color: '#b8d4b8' });
      p.button('Partida contra o computador', () => showScreen('opponents'), 212, 172, 600, 92, { size: 36 });
      p.button('Desafios', () => showScreen('challenges'), 212, 280, 600, 80);
      p.button('Como jogar', () => showScreen('help'), 212, 376, 600, 80);
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('main'); }, 212, 474, 190, 66, { size: 26 });
      p.button(`Ameaças: ${save.preview ? 'sim' : 'não'}`, () => { save.preview = !save.preview; storeSave(save); showScreen('main'); }, 417, 474, 190, 66, { size: 24 });
      p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('main'); }, 622, 474, 190, 66, { size: 26 });
      const stars = Object.values(save.ch).reduce((a, b) => a + b, 0);
      p.text(`Vitórias: ${save.wins.reduce((a, b) => a + b, 0)}   ·   Estrelas nos desafios: ${stars} de ${CHALLENGES.length * 3}`, 512, 594, { size: 26, color: '#ffd25a' });
      p.text(vr ? 'Aponte com o controle e aperte o gatilho' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 656, { size: 22, color: '#b8d4b8' });
    } else if (name === 'opponents') {
      p.title('Escolha o adversário', 62);
      OPPONENTS.forEach((o, i) => p.button(`${o.name}  ·  ${o.title}`, () => newMatch(i), 112, 116 + i * 156, 800, 136, { size: 36, sub: `${o.desc}   (vitórias: ${save.wins[i]} de ${save.games[i]})` }));
      p.text('Melhor de 3 jogos. Quem começa alterna.', 512, 600, { size: 24, color: '#b8d4b8' });
      p.button('Voltar', () => showScreen('main'), 362, 632, 300, 66, { size: 28 });
    } else if (name === 'challenges') {
      p.title('Desafios', 56);
      CHALLENGES.forEach((c, i) => p.tile(52 + (i % 5) * 186, 110 + Math.floor(i / 5) * 200, 172, 176, { num: i + 1, name: c.name, stars: save.ch[i] || 0, done: save.ch[i] != null, locked: !challengeUnlocked(i), action: () => newChallenge(i) }));
      p.text('Passe um desafio (1 estrela) para liberar o próximo.', 512, 540, { size: 24, color: '#b8d4b8' });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 600, 300, 70, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 60);
      const rows = [
        'Na sua vez, solte uma conta numa das 16 hastes: ela desce até embaixo.',
        'Vence quem fizer 4 em linha: reta, diagonal de um andar, diagonal',
        'de uma parede ou uma das 4 diagonais que cruzam o cubo inteiro.',
        'Losango azul: linha de 3 sua; laranja: dela. Pulsando = dá para fechar já.',
        'O anel branco mostra onde a conta vai parar antes de soltar.',
        'Gire o cubo para ver as linhas escondidas.',
        vr ? 'VR: aperto no cubo segura e gira; aperto no pote pega uma conta.' : 'PC: clique numa haste (de cima) para soltar; arraste o mouse para girar o cubo.',
        vr ? 'Aponte para a haste e gatilho também solta. Manche gira o cubo.' : 'Setas giram o cubo, R endireita, A/D giram a câmera. Esc: pausa.',
      ];
      rows.forEach((t, i) => p.text(t, 48, 124 + i * 54, { size: 25, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 586, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 66);
      p.text(mode === 'match' ? `Contra ${opponent().name} · Jogo ${match.index + 1}` : `Desafio ${ch.i + 1}: ${CHALLENGES[ch.i].name}`, 512, 130, { size: 28, color: '#b8d4b8' });
      p.button('Continuar', () => togglePause(), 262, 176, 500, 84);
      p.button(mode === 'match' ? 'Recomeçar a partida' : 'Recomeçar o desafio', () => (mode === 'match' ? newMatch(oppIndex) : newChallenge(ch.i, true)), 262, 276, 500, 84);
      p.button('Endireitar o cubo', () => { resetCube(); togglePause(); }, 262, 376, 245, 84, { size: 26 });
      p.button('Recentralizar', () => { togglePause(); placeForPlay(true); }, 517, 376, 245, 84, { size: 30, locked: !vr });
      p.button('Como jogar', () => showScreen('help'), 262, 476, 245, 84, { size: 30 });
      p.button('Menu principal', () => goMenu(), 517, 476, 245, 84, { size: 28 });
    } else if (name === 'gameEnd') {
      const g = match.game, w = g.winner;
      p.title(w === PLAYER ? 'Você fez a linha!' : w === CPU ? `${opponent().name} fez a linha` : 'Empate: cubo cheio', 66, 48);
      p.text(`Em ${g.moves} contas`, 512, 150, { size: 30 });
      p.text(`Placar: você ${match.wins(0)} x ${match.wins(1)} ${opponent().name} (melhor de 3)`, 512, 212, { size: 30, bold: true });
      p.button('Próximo jogo', () => nextGame(), 262, 300, 500, 96, { size: 38 });
      p.button('Menu principal', () => goMenu(), 262, 430, 500, 80);
    } else if (name === 'over') {
      const w = match.winner;
      p.title(w === PLAYER ? 'Você venceu!' : w === CPU ? `${opponent().name} venceu` : 'Empate!', 72);
      p.text(`Você ${match.wins(0)} x ${match.wins(1)} ${opponent().name}`, 512, 150, { size: 40, bold: true });
      p.text(`Contra ${opponent().name}: ${save.wins[oppIndex]} vitória(s) em ${save.games[oppIndex]} partida(s)`, 512, 222, { size: 24, color: '#b8d4b8' });
      p.button('Jogar de novo', () => newMatch(oppIndex), 262, 290, 500, 92, { size: 36 });
      p.button('Outro adversário', () => showScreen('opponents'), 262, 400, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 500, 500, 80);
    } else if (name === 'chIntro') {
      const c = CHALLENGES[ch.i];
      p.title(`Desafio ${ch.i + 1}: ${c.name}`, 66, 46);
      p.text(c.desc, 512, 150, { size: 25 });
      p.text('Você começa. A Mestra Orquídea responde com a defesa perfeita.', 512, 200, { size: 24, color: '#b8d4b8' });
      p.text(goalText(c), 512, 252, { size: 24, color: '#ffd25a' });
      p.button('Começar', () => { panel.hide(); beginTurn(); }, 262, 320, 500, 96, { size: 38 });
      p.button('Desafios', () => showScreen('challenges'), 262, 440, 500, 80);
    } else if (name === 'chResult') {
      const c = CHALLENGES[ch.i];
      p.title(chResult.stars ? 'Desafio cumprido!' : 'Não foi dessa vez', 66);
      p.stars(chResult.stars, 512, 160, 80);
      p.text(ch.st.winner === PLAYER ? `Linha em ${myMoves(ch.st)} conta(s) sua(s)` : ch.st.winner === CPU ? 'Ela fechou a linha dela' : `Acabaram as ${c.max} contas`, 512, 236, { size: 28 });
      p.text(goalText(c), 512, 280, { size: 22, color: '#b8d4b8' });
      p.button('Tentar de novo', () => newChallenge(ch.i, true), 262, 330, 245, 84, { size: 30 });
      p.button('Próximo', () => newChallenge(ch.i + 1), 517, 330, 245, 84, { size: 30, locked: ch.i >= CHALLENGES.length - 1 || !challengeUnlocked(ch.i + 1) });
      p.button('Desafios', () => showScreen('challenges'), 262, 434, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 534, 500, 80);
    }
  });
  hidePreview();
  updateHint();
}

// ---------- Painel e posição no VR ----------
function fitPC() {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (panel.mesh.parent !== camera) camera.add(panel.mesh);
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const visH = 2 * 0.8 * Math.tan(half), visW = visH * camera.aspect;
  panel.mesh.position.set(0, 0, -0.8);
  panel.mesh.quaternion.identity();
  panel.mesh.scale.setScalar(Math.min(1, visW * 0.94 / 0.9, visH * 0.92 / 0.633));
}
function placePanelVR() {
  const head = new THREE.Vector3(), hq = new THREE.Quaternion();
  camera.getWorldPosition(head);
  camera.getWorldQuaternion(hq);
  const yaw = new THREE.Euler().setFromQuaternion(hq, 'YXZ').y;
  panel.mesh.position.copy(head).addScaledVector(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), 0.95);
  panel.mesh.position.y = head.y - 0.05;
  panel.mesh.rotation.set(0, yaw, 0);
}
function placeRig(x, z) {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().setY(0).applyAxisAngle(UP, rig.rotation.y);
  rig.position.set(x - head.x, 0, z - head.z);
  rig.updateMatrixWorld(true);
}
let rigPlaced = false;
function placeForPlay(force = false) {
  if (renderer.xr.isPresenting && (force || !rigPlaced)) { placeRig(VR_STAND.x, VR_STAND.z); rigPlaced = true; }
  pcCamSnap = true;
}

// ---------- Achar a haste ----------
const raycaster = new THREE.Raycaster();
const lidPlane = new THREE.Plane();
// haste pelo raio: primeiro a tampa de cima do cubo, senão a caixa da haste
function colFromRay(ray) {
  cube.updateMatrixWorld(true);
  const n = new THREE.Vector3(0, 1, 0).applyQuaternion(cube.quaternion);
  const p = cube.localToWorld(new THREE.Vector3(0, CUBE.half, 0));
  lidPlane.setFromNormalAndCoplanarPoint(n, p);
  const hit = ray.ray.intersectPlane(lidPlane, new THREE.Vector3());
  if (hit && ray.ray.direction.dot(n) < 0) {
    const l = cube.worldToLocal(hit.clone());
    if (Math.abs(l.x) < CUBE.half && Math.abs(l.z) < CUBE.half) return colAtLocal(l.x, l.z);
  }
  const h = ray.intersectObjects(world.colHits)[0];
  return h ? h.object.userData.col : -1;
}
function colAtLocal(x, z) {
  const cx = Math.round(x / CUBE.s + 1.5), cz = Math.round(-z / CUBE.s + 1.5);
  if (cx < 0 || cz < 0 || cx > 3 || cz > 3) return -1;
  return cx + 4 * cz;
}
const canAct = () => app === 'play' && phase === 'turn' && !panel.visible && !dev.autoplay && cur()?.turn === PLAYER;

// ---------- Controles do VR ----------
const ctrls = [];
const markMat = new THREE.MeshStandardMaterial({ color: 0xffd080, roughness: 0.3, metalness: 0.5 });
let lastHandSide = 'right';
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  const hand = renderer.xr.getHand ? renderer.xr.getHand(i) : null;
  rig.add(ctrl, grip);
  if (hand) rig.add(hand);
  const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0xffd080 }));
  laser.visible = false;
  ctrl.add(laser);
  const mark = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), markMat);
  grip.add(mark);
  const pinchDot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 6), new THREE.MeshBasicMaterial({ color: 0xffd080 }));
  pinchDot.visible = false;
  scene.add(pinchDot);
  const entry = { ctrl, grip, hand, laser, mark, pinchDot, source: null, side: null, prevButtons: [], hoverIndex: -1, rayCol: -1 };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => { entry.source = e.data; entry.side = e.data.handedness; });
  ctrl.addEventListener('disconnected', () => { if (held?.entry === entry) dropHeld(); entry.source = null; entry.side = null; });
  ctrl.addEventListener('selectstart', () => onSelect(entry));
  ctrl.addEventListener('selectend', () => { if (held?.entry === entry && held.via === 'select') releaseHeld(); });
  ctrl.addEventListener('squeezestart', () => { sfx.unlock(); if (!entry.source?.hand) tryGrab(entry, 'squeeze'); });
  ctrl.addEventListener('squeezeend', () => { if (held?.entry === entry && held.via === 'squeeze') releaseHeld(); });
}
const entryFor = (side) => ctrls.find(e => e.side === side && e.source);
function pulse(side, v, ms) { try { entryFor(side)?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(clamp(v, 0, 1), ms); } catch { /* sem vibração */ } }
const pulseAll = (v, ms) => { pulse('left', v, ms); pulse('right', v, ms); };
function grabPoint(entry, out = new THREE.Vector3()) {
  if (entry.source?.hand && entry.hand?.joints) {
    const a = entry.hand.joints['index-finger-tip'], b = entry.hand.joints['thumb-tip'];
    if (a && b && a.visible !== false) { a.getWorldPosition(out); b.getWorldPosition(_v2); return out.add(_v2).multiplyScalar(0.5); }
  }
  entry.grip.getWorldPosition(out);
  if (!entry.source?.hand) out.add(new THREE.Vector3(0, -0.02, -0.04).applyQuaternion(entry.grip.getWorldQuaternion(_q)));
  return out;
}
function rayFrom(entry) {
  entry.ctrl.getWorldPosition(_v);
  entry.ctrl.getWorldQuaternion(_q);
  raycaster.set(_v, new THREE.Vector3(0, 0, -1).applyQuaternion(_q));
  return raycaster;
}
// segurar o cubo: guarda a posição dele em relação à mão
function grabCube(entry, via) {
  if (app !== 'play' || panel.visible) return false;
  entry.grip.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(entry.grip.matrixWorld).invert();
  held = { kind: 'cube', entry, via, off: inv.multiply(cube.matrixWorld.clone()) };
  cubeHome.returning = null;
  sfx.grabCube(); pulse(entry.side, 0.3, 25);
  return true;
}
function tryGrab(entry, via) {
  if (held || app !== 'play' || panel.visible || dev.autoplay) return false;
  const p = grabPoint(entry);
  // 1) pote de contas (na sua vez)
  if (canAct()) for (const b of BOWLS) {
    if (b.team !== PLAYER || b.pos.distanceTo(p) > GRAB_BOWL) continue;
    const mesh = world.makeBead(PLAYER);
    scene.add(mesh);
    held = { kind: 'bead', entry, via, mesh, col: -1 };
    lastHandSide = entry.side || lastHandSide;
    sfx.pick(); pulse(entry.side, 0.3, 25);
    return true;
  }
  // 2) o cubo (a qualquer hora)
  cube.getWorldPosition(_v);
  if (_v.distanceTo(p) < CUBE.half * 1.6 + 0.04) return grabCube(entry, via);
  return false;
}
function updateHeld() {
  if (!held || held.via === 'mouse') return;
  const e = held.entry;
  if (held.kind === 'cube') {
    e.grip.updateMatrixWorld(true);
    _m.multiplyMatrices(e.grip.matrixWorld, held.off);
    _m.decompose(cube.position, cube.quaternion, _v2);
    return;
  }
  const p = grabPoint(e);
  held.mesh.position.copy(p);
  const l = cube.worldToLocal(p.clone());
  let col = -1;
  if (Math.abs(l.x) < CUBE.half + 0.03 && Math.abs(l.z) < CUBE.half + 0.03 && l.y > -CUBE.half && l.y < CUBE.half + 0.14) col = colAtLocal(l.x, l.z);
  if (col < 0 && phase === 'turn') { col = colFromRay(rayFrom(e)); e.laser.visible = col >= 0; e.laser.scale.z = 0.8; }
  else e.laser.visible = false;
  if (col !== held.col) { held.col = col; if (col >= 0) pulse(e.side, 0.12, 12); }
  if (phase === 'turn') showPreviewFor(col); else hidePreview();
}
function releaseHeld() {
  if (!held) return;
  const h = held;
  held = null;
  h.entry && (h.entry.laser.visible = false);
  if (h.kind === 'cube') { cubeHome.returning = { t0: time, from: cube.position.clone() }; return; }
  const pos = h.mesh.position.clone();
  scene.remove(h.mesh);
  if (h.col >= 0 && canActRelease() && cur().heights[h.col] < N) doMove(h.col, { pos });
  else { msg = { text: 'Solte a conta em cima de uma haste (ou aponte para ela).', t: 2.5 }; hidePreview(); }
}
const canActRelease = () => app === 'play' && phase === 'turn' && cur()?.turn === PLAYER;
function dropHeld() {
  if (!held) return;
  if (held.entry) held.entry.laser.visible = false;
  if (held.kind === 'bead') scene.remove(held.mesh);
  if (held.kind === 'cube' && held.via !== 'mouse') cubeHome.returning = { t0: time, from: cube.position.clone() };
  held = null;
  hidePreview();
}
function onSelect(entry) {
  sfx.unlock();
  if (panel.visible) { if (entry.hoverIndex >= 0) { const a = panel.actionAt(entry.hoverIndex); if (a) { sfx.click(); a(); } } return; }
  if (held) return;
  if (entry.source?.hand && tryGrab(entry, 'select')) return;   // pinça perto do pote ou do cubo
  // de longe: aponta para a haste e solta a conta direto
  if (canAct()) { const col = colFromRay(rayFrom(entry)); if (col >= 0 && cur().heights[col] < N) { lastHandSide = entry.side || lastHandSide; doMove(col); } }
}
function pollButtons(dt) {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp || e.source.hand) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[5] && !e.prevButtons[5]) togglePause();
    if (b[4] && !e.prevButtons[4] && app === 'play' && !panel.visible) resetCube();   // A/X endireita o cubo
    e.prevButtons = b;
    // manche gira o cubo (se ninguém está segurando)
    const ax = gp.axes?.[2] ?? 0, ay = gp.axes?.[3] ?? 0;
    if (held?.kind !== 'cube' && app === 'play' && !panel.visible) {
      if (Math.abs(ax) > 0.2) rotateCube(ax * 1.8 * dt, 0);
      if (Math.abs(ay) > 0.2) rotateCube(0, ay * 1.5 * dt);
    }
  }
}
function rotateCube(yaw, pitch) {
  cube.quaternion.premultiply(_q.setFromAxisAngle(UP, yaw));
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion())).setY(0).normalize();
  if (right.lengthSq() > 0.1) cube.quaternion.premultiply(_q.setFromAxisAngle(right, pitch));
}

// ---------- Mouse e teclado (PC) ----------
const mouse = { ndc: new THREE.Vector2(-9, -9), down: false, right: false, lx: 0, ly: 0, moved: 0 };
const keys = new Set();
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  mouse.lx = e.clientX; mouse.ly = e.clientY; mouse.moved = 0;
  if (panel.visible && e.button === 0) {
    raycaster.setFromCamera(mouse.ndc, camera);
    const a = panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv));
    if (a) { sfx.click(); a(); }
    return;
  }
  if (e.button === 2) mouse.right = true; else mouse.down = true;
});
renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  const dx = e.clientX - mouse.lx, dy = e.clientY - mouse.ly;
  if ((mouse.down || mouse.right) && app === 'play' && !panel.visible) {
    mouse.moved += Math.abs(dx) + Math.abs(dy);
    if (mouse.moved > 5) rotateCube(dx * 0.008, dy * 0.008);   // arrastar gira o cubo
  }
  mouse.lx = e.clientX; mouse.ly = e.clientY;
});
window.addEventListener('pointerup', (e) => {
  const click = mouse.down && mouse.moved <= 5 && e.button === 0;
  mouse.down = false; mouse.right = false; mouse.moved = 0;
  if (!click || !canAct() || renderer.xr.isPresenting) return;
  raycaster.setFromCamera(mouse.ndc, camera);
  const col = colFromRay(raycaster);
  if (col >= 0) { if (!doMove(col)) msg = { text: 'Essa haste está cheia.', t: 2 }; }
});
renderer.domElement.addEventListener('wheel', (e) => { e.preventDefault?.(); pcOrbit.dist = clamp(pcOrbit.dist + e.deltaY * 0.0008, 0.35, 1.6); }, { passive: false });
window.addEventListener('blur', () => { keys.clear(); mouse.down = mouse.right = false; });
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  const k = (e.key || '').toLowerCase();
  if (k === 'escape' || k === 'p') { togglePause(); return; }
  if (k === 'f') { save.fps = !save.fps; storeSave(save); return; }
  if (k === 'r' && app === 'play') resetCube();
  keys.add(k);
});
window.addEventListener('keyup', (e) => { keys.delete((e.key || '').toLowerCase()); });
window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); fitPC(); });

// ---------- Prévia: onde a conta entra e o que ela faz ----------
let ghost = null, previewKey = '', previewData = null;
function hidePreview() {
  world.ghostRing.visible = false;
  world.rodGlow.visible = false;
  if (ghost) ghost.visible = false;
  previewLabel.mesh.visible = false;
  previewData = null; previewKey = '';
  previewEl.style.display = 'none';
}
function analyze(st, col) {
  const cell = landing(st, col);
  const r = applyMove(st, col).st;
  const me = st.turn, op = 1 - me;
  const b = new Board(r);
  const oppWins = r.over ? 0 : legalMoves(r).filter(c => b.winningCol(c, op)).length;
  const blocked = threats(st, op).filter(t => t.cell === cell).length;
  const mine = r.over ? 0 : threats(r, me).filter(t => t.playable).length;
  return { col, cell, win: r.winner === me, oppWins, blocked, mine, floor: xyzOf(cell)[1] };
}
function showPreviewFor(col) {
  const st = cur();
  if (!st || col < 0 || st.heights[col] >= N || st.over) { hidePreview(); return; }
  const key = `${col}:${st.moves}`;
  if (key !== previewKey) { previewKey = key; previewData = analyze(st, col); }
  const d = previewData;
  cellLocal(d.cell, world.ghostRing.position);
  world.ghostRing.quaternion.copy(camera.getWorldQuaternion(_q)).premultiply(cube.getWorldQuaternion(new THREE.Quaternion()).invert());
  world.ghostRing.material.color.set(d.win ? 0x5aff8a : d.oppWins ? 0xff5a3a : 0xffffff);
  world.ghostRing.visible = true;
  world.rodGlow.position.set((col % 4 - 1.5) * CUBE.s, 0, -(((col / 4) | 0) - 1.5) * CUBE.s);
  world.rodGlow.visible = true;
  if (!ghost) { ghost = world.makeBead(PLAYER, true); world.beadsG.add(ghost); }
  cellLocal(d.cell, ghost.position);
  ghost.visible = true;
  updatePreviewText(d);
}
function previewText(d) {
  const a = `Haste ${colName(d.col)} · entra no ${d.floor + 1}º andar`;
  let b, kind = 'ok';
  if (d.win) { b = 'Fecha a linha: você ganha!'; kind = 'good'; }
  else if (d.oppWins) { b = 'Cuidado: depois disso ela fecha uma linha'; kind = 'bad'; }
  else if (d.blocked) { b = 'Tapa uma linha de 3 dela'; kind = 'good'; }
  else if (d.mine > 1) { b = 'Arma duas linhas de 3: ameaça dupla!'; kind = 'good'; }
  else if (d.mine) b = 'Arma uma linha de 3';
  else b = 'Nenhuma linha nova';
  return [a, b, kind];
}
const previewEl = document.getElementById('preview');
function updatePreviewText(d) {
  const [a, b, kind] = previewText(d);
  const color = kind === 'bad' ? '#ff8a7a' : kind === 'good' ? '#9aff9a' : '#f4f6ee';
  if (renderer.xr.isPresenting) {
    previewLabel.set([{ text: a, size: 0.4, color: '#ffd080' }, { text: b, size: 0.36, color }]);
    previewLabel.mesh.visible = true;
    cube.localToWorld(previewLabel.mesh.position.set(0, CUBE.half + 0.1, 0));
    camera.getWorldPosition(_v);
    previewLabel.mesh.lookAt(_v.x, previewLabel.mesh.position.y, _v.z);
  } else {
    previewEl.style.display = 'block';
    const html = `<div class="txt">${a}</div><div class="txt" style="color:${color}">${b}</div>`;
    if (previewEl.dataset.last !== html) { previewEl.innerHTML = html; previewEl.dataset.last = html; }
  }
}
function updatePCHover() {
  if (renderer.xr.isPresenting || held) return;
  if (!canAct() || mouse.moved > 5) { if (previewKey) hidePreview(); return; }
  raycaster.setFromCamera(mouse.ndc, camera);
  const col = colFromRay(raycaster);
  if (col >= 0) showPreviewFor(col); else if (previewKey) hidePreview();
}

// ---------- Câmera do PC ----------
const pcOrbit = { yaw: 0, pitch: 0.62, dist: 0.62 };
const pcCam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
let pcCamSnap = true;
function updatePCCamera(dt) {
  if (renderer.xr.isPresenting) return;
  if (keys.has('a')) pcOrbit.yaw += 1.4 * dt;
  if (keys.has('d')) pcOrbit.yaw -= 1.4 * dt;
  if (keys.has('w')) pcOrbit.pitch = clamp(pcOrbit.pitch + 0.8 * dt, 0.1, 1.4);
  if (keys.has('s')) pcOrbit.pitch = clamp(pcOrbit.pitch - 0.8 * dt, 0.1, 1.4);
  if (app === 'play' && !panel.visible) {
    if (keys.has('arrowleft')) rotateCube(-1.6 * dt, 0);
    if (keys.has('arrowright')) rotateCube(1.6 * dt, 0);
    if (keys.has('arrowup')) rotateCube(0, -1.4 * dt);
    if (keys.has('arrowdown')) rotateCube(0, 1.4 * dt);
  }
  let yaw = pcOrbit.yaw, pitch = pcOrbit.pitch, dist = pcOrbit.dist;
  let look = CUBE.center.clone().add(new THREE.Vector3(0, -0.01, 0));
  if (app === 'menu') { yaw = Math.sin(time * 0.12) * 0.5; pitch = 0.3; dist = 1.3; look = new THREE.Vector3(TABLE.x, 1.15, TABLE.z - 0.3); }
  const pos = new THREE.Vector3(look.x + Math.sin(yaw) * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, look.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  if (pcCamSnap) { pcCam.pos.copy(pos); pcCam.look.copy(look); pcCamSnap = false; }
  pcCam.pos.lerp(pos, damp(6, dt));
  pcCam.look.lerp(look, damp(6, dt));
  camera.position.copy(pcCam.pos);
  camera.lookAt(pcCam.look);
}

// ---------- VR: sessão ----------
let recenterIn = 0;
renderer.xr.addEventListener('sessionstart', () => {
  recenterIn = 5; rigPlaced = false;
  if (panel.mesh.parent) panel.mesh.parent.remove(panel.mesh);
  scene.add(panel.mesh);
  panel.mesh.scale.setScalar(1);
  hidePreview(); updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
  dropHeld();
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  camera.position.set(0, 1.6, 0.5); camera.quaternion.identity();
  pcCamSnap = true;
  fitPC(); updateHint();
});

// ---------- Raios ----------
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
function updateRays() {
  const vr = renderer.xr.isPresenting;
  let hover = -1;
  let rayPreview = -1;
  for (const e of ctrls) {
    e.hoverIndex = -1;
    if (held?.entry === e) continue;
    e.laser.visible = false;
    if (!vr || !e.source) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(_q);
    rayDir.set(0, 0, -1).applyQuaternion(_q);
    raycaster.set(rayOrigin, rayDir);
    if (panel.visible) {
      const hit = raycaster.intersectObject(panel.mesh)[0];
      e.laser.visible = true;
      e.laser.scale.z = hit ? hit.distance : 2;
      e.hoverIndex = panel.pick(hit?.uv);
      if (e.hoverIndex >= 0) hover = e.hoverIndex;
    } else if (canAct() && !e.source.hand && !held) {
      const col = colFromRay(raycaster);
      if (col >= 0) { e.laser.visible = true; cube.getWorldPosition(_v); e.laser.scale.z = rayOrigin.distanceTo(_v); rayPreview = col; }
    }
  }
  if (vr && !held && canAct()) { if (rayPreview >= 0) showPreviewFor(rayPreview); else if (previewKey) hidePreview(); }
  if (!vr) {
    if (panel.visible) {
      raycaster.setFromCamera(mouse.ndc, camera);
      hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
      renderer.domElement.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
    } else renderer.domElement.style.cursor = mouse.down && mouse.moved > 5 ? 'grabbing' : previewKey ? 'pointer' : 'grab';
  }
  if (panel.visible) panel.setHover(hover);
}

// ---------- HUD ----------
const hintEl = document.getElementById('hint');
const hudEl = document.getElementById('hud');
const fpsEl = document.getElementById('fps');
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  let t;
  if (app !== 'play' || panel.visible) t = 'Clique nas opções do painel';
  else if (phase === 'turn') t = 'Clique numa haste (por cima do cubo) · arraste para girar o cubo · R endireita · Esc: pausa';
  else t = 'Arraste para girar o cubo · rodinha: zoom · Esc: pausa';
  hintEl.innerHTML = `<span>${t}</span>`;
}
function statusLines() {
  const st = cur();
  if (mode === 'challenge') {
    const c = CHALLENGES[ch.i];
    return [`Desafio ${ch.i + 1}: ${c.name} · contas suas: ${myMoves(st)} de ${c.max}`, goalText(c)];
  }
  const o = opponent();
  const head = `Você ${match.wins(0)} x ${match.wins(1)} ${o.name} · Jogo ${match.index + 1} · ${st.moves} contas no cubo`;
  let line = '';
  if (phase === 'turn') line = renderer.xr.isPresenting ? 'Sua vez: pegue uma conta no pote (botão lateral) e solte na haste, ou aponte para a haste e gatilho.' : 'Sua vez.';
  else if (phase === 'think') line = `${o.name} está pensando...`;
  return [head, line];
}
function updateHud(dt) {
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  const vr = renderer.xr.isPresenting;
  const playing = app === 'play' && cur() && !panel.visible;
  if (!vr) {
    statusLabel.mesh.visible = false;
    hudEl.style.display = playing ? 'block' : 'none';
    if (playing) {
      const [a, b] = statusLines();
      const html = `<b>${a}</b>${b ? `<br>${b}` : ''}${msg && msg.text ? `<br><em>${msg.text}</em>` : ''}`;
      if (hudEl.dataset.last !== html) { hudEl.innerHTML = html; hudEl.dataset.last = html; }
    }
    return;
  }
  hudEl.style.display = 'none';
  statusLabel.mesh.visible = playing;
  if (!playing) return;
  const [a, b] = statusLines();
  statusLabel.set([{ text: a, size: 0.34, color: '#ffd080' }, { text: msg?.text || b, size: 0.3, bold: false, color: msg?.text ? '#ffe3a0' : '#f4f6ee' }]);
}
let boardKey = '';
function updateScoreboard() {
  let data;
  const st = cur();
  if (!st || app === 'menu') data = { names: ['Você', 'Adversário'], scores: [0, 0], round: '', footer: 'Escolha uma partida ou um desafio' };
  else if (mode === 'challenge') data = { names: ['Suas contas', 'Máximo'], scores: [myMoves(st), CHALLENGES[ch.i].max], round: `Desafio ${ch.i + 1}`, footer: CHALLENGES[ch.i].name };
  else data = { names: ['Você', opponent().name], scores: [match.wins(0), match.wins(1)], round: `Jogo ${match.index + 1}`, footer: 'Melhor de 3' };
  const key = JSON.stringify(data);
  if (key !== boardKey) { boardKey = key; world.drawBoard(data); }
}

// ---------- Botão de VR ----------
const vrBtn = document.getElementById('vr');
async function setupVR() {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) { vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS'; vrBtn.disabled = true; return; }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) { vrBtn.textContent = 'Erro ao entrar em VR'; console.error(err); }
  };
}
setupVR();

// ---------- Laço ----------
let lastT = performance.now();
let fpsFrames = 0, fpsTime = 0;
function tick(dt) {
  time += dt;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) { placeRig(VR_STAND.x, VR_STAND.z); rigPlaced = true; if (panel.visible) placePanelVR(); }
  pollButtons(dt);
  rig.updateMatrixWorld(true);
  if (app !== 'paused') for (let i = 0; i < timers.length; i++) if (timers[i].at <= time) { const t = timers.splice(i, 1)[0]; i--; t.fn(); }
  if (app === 'play' && cur()) {
    if (phase === 'turn') { if (dev.autoplay) robotTurn(dt); }
    else if (phase === 'think') { thinkT += dt; pumpThinker(); if (thinkT >= (mode === 'challenge' ? 0.8 : opponent().think) && thinker?.done) doMove(thinker.result); }
    else if ((phase === 'gameEnd' || phase === 'over') && dev.autoplay) {
      timerAuto -= dt;
      if (timerAuto <= 0) { if (phase === 'gameEnd') nextGame(); else if (mode === 'match') newMatch(oppIndex); }
    }
  }
  updateHeld();
  if (cubeHome.returning) {
    const k = clamp((time - cubeHome.returning.t0) / 0.45, 0, 1);
    cube.position.lerpVectors(cubeHome.returning.from, CUBE.center, k * k * (3 - 2 * k));
    if (k >= 1) cubeHome.returning = null;
  }
  if (app === 'menu') cube.rotateOnWorldAxis(UP, dt * 0.25);
  if (app !== 'paused') updateAnims();
  updatePCHover();
  camera.getWorldPosition(_v);
  const look = phase === 'think' ? CUBE.center : held?.kind === 'bead' ? held.mesh.position : _v;
  world.avatar.update(dt, time, look);
  world.animate(dt, time);
  updatePCCamera(dt);
  updateHud(dt);
  updateRays();
  updateScoreboard();
  for (const e of ctrls) {
    e.mark.visible = vr && !!e.source && !e.source.hand;
    e.pinchDot.visible = vr && !!e.source?.hand && app === 'play';
    if (e.pinchDot.visible) grabPoint(e, e.pinchDot.position);
  }
  sfx.updateAmbience(dt);
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
}
let robotT = 0;
function robotTurn(dt) {
  robotT += dt;
  if (!thinker) {
    robotT = 0;
    if (mode === 'challenge') thinker = { done: true, result: bestColumn(ch.st, CHALLENGES[ch.i].max).col };
    else thinker = { gen: chooseMoveGen(cur(), PLAYER, ROBOT, random), done: false, result: null };
  }
  pumpThinker(12);
  if (!thinker.done || robotT < ROBOT.think) return;
  const m = thinker.result;
  thinker = null;
  if (m >= 0) doMove(m);
}
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  tick(dt);
  renderer.render(scene, camera);
}

// ---------- Depuração (console do navegador) ----------
// dev.autoplay = true | dev.advance(5) | dev.state() | dev.loadLevel(3) | dev.startMatch(2)
// dev.press('Desafios') aperta um botão do painel | dev.play(5) solta na haste 5 | dev.forceWin()
// dev.check() confere tela x regras | dev.colScreen(5) posição da tampa da haste na tela | dev.resetSave()
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; dropHeld(); if (phase === 'turn') thinker = null; },
  loadLevel(n) { newChallenge(n - 1, true); return this.state(); },
  startMatch(n = 1) { newMatch(n - 1); return this.state(); },
  press(label) { const b = panel.visible && panel.find(label); if (!b || !b.action) return false; b.action(); return true; },
  play(col) { return doMove(col); },
  forceWin() {
    const st = cur();
    if (!st || app !== 'play') return false;
    timers.length = 0; anims.length = 0;
    st.over = true; st.winner = PLAYER;
    if (mode === 'challenge') st.moves = 1;
    phase = 'anim';
    endOfGame();
    return this.state();
  },
  rotateCube(yaw, pitch) { rotateCube(yaw, pitch); return this.state(); },
  advance(sec, step = 1 / 60) {
    const frames = Math.round(sec / step);
    for (let i = 0; i < frames; i++) tick(step);
    lastT = performance.now();
    renderer.render(scene, camera);
    return this.state();
  },
  colScreen(col) {
    cube.updateMatrixWorld(true);
    const p = cube.localToWorld(new THREE.Vector3((col % 4 - 1.5) * CUBE.s, CUBE.half, -(((col / 4) | 0) - 1.5) * CUBE.s)).project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight };
  },
  check() {
    const st = cur();
    const errs = [];
    if (!st || anims.length || phase === 'anim') return errs;
    const n = st.cells.reduce((a, v) => a + (v !== EMPTY ? 1 : 0), 0);
    if (beadMeshes.size !== n) errs.push(`contas na tela ${beadMeshes.size}, nas regras ${n}`);
    for (const [c, m] of beadMeshes) {
      if (st.cells[c] !== m.userData.team) errs.push(`casa ${c} com a cor errada`);
      if (m.position.distanceTo(cellLocal(c)) > 1e-4) errs.push(`conta da casa ${c} fora do lugar`);
      const [x, y, z] = xyzOf(c);
      if (y > 0 && st.cells[colOf(c) + 16 * (y - 1)] === EMPTY) errs.push(`conta flutuando na casa ${c} (${x},${y},${z})`);
    }
    return errs;
  },
  state() {
    const base = { tela: app, modo: mode, fase: phase, painel: panel.visible };
    const st = cur();
    if (!st) return base;
    return {
      ...base,
      adversario: mode === 'match' ? opponent().name : null,
      desafio: mode === 'challenge' ? `${ch.i + 1}: ${CHALLENGES[ch.i].name}` : null,
      jogo: mode === 'match' ? match.index + 1 : null,
      vez: st.turn === PLAYER ? 'você' : 'computador',
      contas: st.moves, alturas: Array.from(st.heights).join(''),
      vitorias: mode === 'match' ? [match.wins(0), match.wins(1)] : null,
      ameacas: world.threatMarks.filter(m => m.visible).length,
      segurando: held?.kind ?? null,
      cuboGirado: +(2 * Math.acos(Math.min(1, Math.abs(cube.quaternion.w))) * 180 / Math.PI).toFixed(0),
      previa: previewData ? previewText(previewData).slice(0, 2).join(' / ') : null,
      estrelas: mode === 'challenge' && chResult ? chResult.stars : null,
      vencedorJogo: st.over ? st.winner : null,
      vencedor: mode === 'match' && match.over ? (match.winner === PLAYER ? 'você' : match.winner === CPU ? opponent().name : 'empate') : null,
      animando: anims.length + timers.length,
      salvo: { vitorias: save.wins, desafios: save.ch },
    };
  },
  resetSave() { save.wins = [0, 0, 0]; save.games = [0, 0, 0]; save.ch = {}; storeSave(save); },
};
window.dev = dev;
window.cubo = { dev, get match() { return match; }, get challenge() { return ch; }, save, camera, scene, renderer, world };

fitPC();
goMenu();
renderer.setAnimationLoop(frame);
