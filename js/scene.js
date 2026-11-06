// Cenário: estufa de vidro num dia de sol, piso de lajota, vasos, samambaias penduradas, orquídeas e
// um chafariz. Na bancada de envasar fica o cubo de vidro 4 x 4 x 4 com 16 hastes de latão num
// suporte; dá para pegar e girar. Contas azul-cobalto (você) e âmbar (adversário) em potes.
import * as THREE from '../vendor/three/three.module.js';
import { N, xyzOf } from './rules.js';
import { makeAvatar } from './avatar.js';

export const TABLE = { x: 0, z: -0.42, top: 0.84, w: 1.2, d: 0.8 };
export const CUBE = { s: 0.062, center: new THREE.Vector3(0, 1.06, -0.4) };   // distância entre casas, centro em repouso
CUBE.half = CUBE.s * N / 2 + 0.012;
export const BEAD = { r: 0.022 };
export const TEAM_COLOR = [0x2a5ad8, 0xf0a020];
// casa → posição local do cubo
export function cellLocal(i, out = new THREE.Vector3()) {
  const [x, y, z] = xyzOf(i);
  return out.set((x - 1.5) * CUBE.s, (y - 1.5) * CUBE.s, -(z - 1.5) * CUBE.s);
}
export function colTopLocal(col, out = new THREE.Vector3()) {
  return out.set((col % 4 - 1.5) * CUBE.s, 2.6 * CUBE.s, -(((col / 4) | 0) - 1.5) * CUBE.s);
}
// potes de contas: dois seus (direita e esquerda, na frente) e um do adversário (lá atrás)
export const BOWLS = [
  { team: 0, pos: new THREE.Vector3(0.3, 0.84, -0.18) },
  { team: 0, pos: new THREE.Vector3(-0.3, 0.84, -0.18) },
  { team: 1, pos: new THREE.Vector3(0.28, 0.84, -0.7) },
];

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}
function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

function gardenCanvas() {
  const W = 1024, H = 512, c = canvas(W, H), g = c.getContext('2d'), r = rand(7);
  const sky = g.createLinearGradient(0, 0, 0, H * 0.6); sky.addColorStop(0, '#6ab0ea'); sky.addColorStop(1, '#d8eef8');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 5; i++) { const x = r() * W, y = 40 + r() * 100; g.fillStyle = 'rgba(255,255,255,0.85)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + k * 24, y + Math.sin(k) * 6, 20 + r() * 10, 0, Math.PI * 2); g.fill(); } }
  g.fillStyle = '#8ac070'; g.fillRect(0, H * 0.62, W, H);
  for (let i = 0; i < 40; i++) { const x = r() * W, y = H * 0.5 + r() * 40, s = 30 + r() * 50; g.fillStyle = `hsl(${100 + r() * 30},45%,${30 + r() * 15}%)`; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 300; i++) { g.fillStyle = ['#ff6a8a', '#ffd84a', '#ffffff', '#c86ae8'][i % 4]; g.fillRect(r() * W, H * 0.66 + r() * H * 0.34, 4, 4); }
  return c;
}
function tileCanvas() {
  const c = canvas(256, 256), g = c.getContext('2d'), r = rand(2);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = `rgb(${190 + r() * 25},${110 + r() * 20},${80 + r() * 15})`; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); }
  g.fillStyle = '#e8d8c0'; for (let k = 0; k <= 4; k++) { g.fillRect(k * 64 - 2, 0, 4, 256); g.fillRect(0, k * 64 - 2, 256, 4); }
  return c;
}
function basePlateCanvas() {
  const S = 512, c = canvas(S, S), g = c.getContext('2d');
  g.fillStyle = '#5a3a22'; g.fillRect(0, 0, S, S);
  g.fillStyle = '#e8d8b8'; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let z = 0; z < 4; z++) for (let x = 0; x < 4; x++) {
    const px = S / 2 + (x - 1.5) * S * 0.2, py = S / 2 + (z - 1.5) * S * 0.2;   // z = 0 embaixo no canvas (perto de você)
    g.strokeStyle = 'rgba(232,216,184,0.5)'; g.lineWidth = 3; g.beginPath(); g.arc(px, S - py, 30, 0, Math.PI * 2); g.stroke();
    g.fillText(`${'ABCD'[x]}${z + 1}`, px, S - py);
  }
  return c;
}

export function buildWorld(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd8eef8);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const hemi = new THREE.HemisphereLight(0xf4fbff, 0x9a7a5a, 1.4);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff4dc, 1.7);
  sun.position.set(1.6, 3.6, 0.8);
  sun.target.position.copy(CUBE.center);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -0.7; sc.right = 0.7; sc.top = 0.7; sc.bottom = -0.7; sc.near = 1; sc.far = 7;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  // ---------- Estufa ----------
  const W = 7, D = 7, H = 2.8, cz = -0.9;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex(tileCanvas(), { repeat: [10, 10] }) }));
  floor.position.set(0, 0, cz); floor.receiveShadow = true; scene.add(floor);
  // jardim lá fora (painel grande atrás dos vidros) e vidro com caixilho branco
  const outside = new THREE.MeshBasicMaterial({ map: tex(gardenCanvas()) });
  for (const [x, z, ry, w] of [[0, cz - D / 2 - 0.6, 0, 9], [-W / 2 - 0.6, cz, Math.PI / 2, 9], [W / 2 + 0.6, cz, -Math.PI / 2, 9], [0, cz + D / 2 + 0.6, Math.PI, 9]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 4.5), outside); m.position.set(x, 1.9, z); m.rotation.y = ry; scene.add(m);
  }
  const glass = new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.12, depthWrite: false });
  const frameMat = new THREE.MeshLambertMaterial({ color: 0xf6f6f2 });
  const bars = [];
  const addBar = (x, y, z, sx, sy, sz) => bars.push([x, y, z, sx, sy, sz]);
  for (const side of [0, 1, 2, 3]) {
    const len = side < 2 ? W : D;
    for (let k = 0; k <= 7; k++) {
      const t = -len / 2 + k * len / 7;
      if (side === 0) addBar(t, H / 2, cz - D / 2, 0.05, H, 0.05);
      if (side === 1) addBar(t, H / 2, cz + D / 2, 0.05, H, 0.05);
      if (side === 2) addBar(-W / 2, H / 2, cz + t, 0.05, H, 0.05);
      if (side === 3) addBar(W / 2, H / 2, cz + t, 0.05, H, 0.05);
    }
  }
  for (const y of [0.6, H]) { addBar(0, y, cz - D / 2, W, 0.06, 0.06); addBar(0, y, cz + D / 2, W, 0.06, 0.06); addBar(-W / 2, y, cz, 0.06, 0.06, D); addBar(W / 2, y, cz, 0.06, 0.06, D); }
  // telhado de duas águas
  for (let k = 0; k <= 7; k++) { const z = cz - D / 2 + k * D / 7; for (const s of [-1, 1]) bars.push([s * W / 4, H + 0.55, z, W / 2 + 0.1, 0.05, 0.05, s * 0.3]); }
  addBar(0, H + 1.1, cz, 0.08, 0.08, D);
  const barMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), frameMat, bars.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  bars.forEach(([x, y, z, sx, sy, sz, rz], k) => { q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rz || 0); mtx.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz)); barMesh.setMatrixAt(k, mtx); });
  scene.add(barMesh);
  for (const [x, z, ry, w] of [[0, cz - D / 2, 0, W], [0, cz + D / 2, Math.PI, W], [-W / 2, cz, Math.PI / 2, D], [W / 2, cz, -Math.PI / 2, D]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), glass); m.position.set(x, H / 2, z); m.rotation.y = ry; scene.add(m);
  }
  const mureta = new THREE.MeshLambertMaterial({ color: 0xc87a5a });
  for (const [x, z, sx, sz] of [[0, cz - D / 2, W, 0.12], [0, cz + D / 2, W, 0.12], [-W / 2, cz, 0.12, D], [W / 2, cz, 0.12, D]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.6, sz), mureta); m.position.set(x, 0.3, z); scene.add(m);
  }

  // vasos e plantas (instanciados)
  const potGeo = new THREE.CylinderGeometry(0.16, 0.11, 0.26, 12);
  const pots = new THREE.InstancedMesh(potGeo, new THREE.MeshLambertMaterial({ color: 0xc8683a }), 18);
  const leafGeo = new THREE.IcosahedronGeometry(0.3, 1);
  const leaves = new THREE.InstancedMesh(leafGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), 18);
  const pr = rand(5);
  const potSpots = [];
  for (let k = 0; k < 18; k++) {
    const side = k % 3;
    let x, z;
    if (side === 0) { x = -3.1 + pr() * 0.2; z = cz - 3 + k * 0.33; }
    else if (side === 1) { x = 3.1 - pr() * 0.2; z = cz - 3 + k * 0.33; }
    else { x = -2.6 + (k / 18) * 5.2; z = cz - 3.1; }
    potSpots.push([x, z]);
    mtx.compose(new THREE.Vector3(x, 0.13, z), q.identity(), one); pots.setMatrixAt(k, mtx);
    const s = 0.7 + pr() * 0.7;
    mtx.compose(new THREE.Vector3(x, 0.4 + s * 0.25, z), q, new THREE.Vector3(s, s * (0.8 + pr() * 0.6), s)); leaves.setMatrixAt(k, mtx);
    leaves.setColorAt(k, new THREE.Color().setHSL(0.26 + pr() * 0.08, 0.5, 0.3 + pr() * 0.12));
  }
  scene.add(pots, leaves);
  // samambaias penduradas
  const fernG = new THREE.Group();
  const fernMat = new THREE.MeshLambertMaterial({ color: 0x4a9a3a });
  for (const [x, z] of [[-1.4, -1.8], [1.5, -2.0], [-2.2, 0.4], [2.2, 0.2]]) {
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.7, 4), new THREE.MeshBasicMaterial({ color: 0x5a4a3a })); cord.position.set(x, H - 0.35, z); fernG.add(cord);
    const basket = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8a5a32 })); basket.position.set(x, H - 0.72, z); fernG.add(basket);
    const fern = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.5, 9, 1, true), fernMat); fern.position.set(x, H - 0.85, z); fern.rotation.x = Math.PI; fernG.add(fern);
  }
  scene.add(fernG);
  // chafariz
  const fountain = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: 0xd8d0c0 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.65, 0.35, 24), stone); basin.position.y = 0.175; fountain.add(basin);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6ac0e8, transparent: true, opacity: 0.85 })); water.position.y = 0.33; fountain.add(water);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.7, 10), stone); column.position.y = 0.6; fountain.add(column);
  const bowl2 = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.12, 0.1, 16), stone); bowl2.position.y = 0.95; fountain.add(bowl2);
  const jet = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xcfefff, transparent: true, opacity: 0.6, depthWrite: false })); jet.position.y = 1.15; fountain.add(jet);
  fountain.position.set(2.0, 0, -2.8); scene.add(fountain);
  // orquídeas na bancada de trás
  const orch = new THREE.Group();
  for (let k = 0; k < 5; k++) {
    const x = -1.4 + k * 0.7;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.12, 10), new THREE.MeshLambertMaterial({ color: 0xf2f2ee })); pot.position.set(x, 0.96, -3.0); orch.add(pot);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.4, 4), fernMat); stem.position.set(x, 1.2, -3.0); orch.add(stem);
    for (let f = 0; f < 4; f++) { const fl = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6).scale(1, 0.5, 1), new THREE.MeshLambertMaterial({ color: [0xd84a8a, 0xf2f2f2, 0xc86ae8][k % 3] })); fl.position.set(x + 0.04 * Math.sin(f * 2), 1.25 + f * 0.04, -2.97); orch.add(fl); }
  }
  const backBench = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.06, 0.5), new THREE.MeshLambertMaterial({ color: 0x8a6a4a })); backBench.position.set(0, 0.88, -3.0); orch.add(backBench);
  scene.add(orch);

  // ---------- Bancada e potes ----------
  const benchMat = new THREE.MeshLambertMaterial({ color: 0xa87a4a });
  const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w, 0.05, TABLE.d), benchMat); top.position.set(TABLE.x, TABLE.top - 0.025, TABLE.z); top.receiveShadow = true; scene.add(top);
  for (const [x, z] of [[-0.55, -0.35], [0.55, -0.35], [-0.55, 0.35], [0.55, 0.35]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, TABLE.top - 0.05, 0.06), benchMat); l.position.set(TABLE.x + x, (TABLE.top - 0.05) / 2, TABLE.z + z); scene.add(l); }
  const bowlMeshes = BOWLS.map(b => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.05, 20, 1, true), new THREE.MeshLambertMaterial({ color: 0xe8e4d8, side: THREE.DoubleSide }));
    m.position.copy(b.pos).add(new THREE.Vector3(0, 0.025, 0)); scene.add(m);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20).rotateX(-Math.PI / 2), m.material); bottom.position.copy(b.pos).add(new THREE.Vector3(0, 0.002, 0)); scene.add(bottom);
    return m;
  });
  // regador e pazinha (enfeite)
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.14, 14), new THREE.MeshLambertMaterial({ color: 0x4a8a6a })); can.position.set(TABLE.x - 0.48, TABLE.top + 0.07, TABLE.z - 0.25); scene.add(can);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.16, 6), can.material); spout.position.set(TABLE.x - 0.4, TABLE.top + 0.1, TABLE.z - 0.25); spout.rotation.z = -0.9; scene.add(spout);

  // suporte do cubo (giratório)
  const brass = new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.65, roughness: 0.3 });
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, CUBE.center.y - CUBE.half - TABLE.top - 0.01, 16), brass);
  stand.position.set(CUBE.center.x, (CUBE.center.y - CUBE.half + TABLE.top) / 2 - 0.005, CUBE.center.z); scene.add(stand);

  // ---------- Cubo de vidro ----------
  const cube = new THREE.Group();
  cube.position.copy(CUBE.center);
  scene.add(cube);
  const L = CUBE.half * 2;
  const glassBox = new THREE.Mesh(new THREE.BoxGeometry(L, L, L), new THREE.MeshStandardMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.1, roughness: 0.05, metalness: 0, depthWrite: false }));
  glassBox.renderOrder = 5; cube.add(glassBox);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, L, L)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }));
  cube.add(edges);
  const base = new THREE.Mesh(new THREE.BoxGeometry(L + 0.01, 0.012, L + 0.01), [brass, brass, new THREE.MeshLambertMaterial({ map: tex(basePlateCanvas()) }), brass, brass, brass]);
  base.position.y = -CUBE.half - 0.006; base.castShadow = true; cube.add(base);
  const rods = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0025, 0.0025, L, 6), brass, 16);
  for (let c = 0; c < 16; c++) { mtx.compose(new THREE.Vector3((c % 4 - 1.5) * CUBE.s, 0, -(((c / 4) | 0) - 1.5) * CUBE.s), q.identity(), one); rods.setMatrixAt(c, mtx); }
  cube.add(rods);
  // andares: linhas finas para ler a altura
  const floorLines = [];
  for (let y = 0; y < 4; y++) {
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const a = (k - 1.5) * CUBE.s, e = 1.5 * CUBE.s + 0.012;
      pts.push(-e, 0, a, e, 0, a, a, 0, -e, a, 0, e);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const ln = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 }));
    ln.position.y = (y - 1.5) * CUBE.s; cube.add(ln); floorLines.push(ln);
  }
  // caixas invisíveis das hastes (para apontar e clicar)
  const colHits = [];
  const hitGeo = new THREE.BoxGeometry(CUBE.s * 0.9, L + 0.06, CUBE.s * 0.9);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  for (let c = 0; c < 16; c++) { const h = new THREE.Mesh(hitGeo, hitMat); h.position.set((c % 4 - 1.5) * CUBE.s, 0.03, -(((c / 4) | 0) - 1.5) * CUBE.s); h.userData.col = c; cube.add(h); colHits.push(h); }
  const cubeHit = new THREE.Mesh(new THREE.BoxGeometry(L + 0.02, L + 0.02, L + 0.02), hitMat); cube.add(cubeHit);
  const beadsG = new THREE.Group(); cube.add(beadsG);

  // ---------- Contas ----------
  const beadGeo = new THREE.SphereGeometry(BEAD.r, 18, 12);
  const beadMats = TEAM_COLOR.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.2, metalness: 0.1 }));
  const ghostMats = TEAM_COLOR.map(c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4, depthWrite: false }));
  function makeBead(team, ghost = false) {
    const m = new THREE.Mesh(beadGeo, ghost ? ghostMats[team] : beadMats[team]);
    m.castShadow = !ghost;
    m.userData = { team };
    return m;
  }
  // contas enfeitando os potes
  const bowlBeads = BOWLS.map(b => {
    const g = new THREE.Group();
    for (let k = 0; k < 6; k++) { const m = makeBead(b.team); m.scale.setScalar(0.8); m.position.set(Math.cos(k * 1.1) * 0.03 * (k % 3), 0.018 + (k > 3 ? 0.02 : 0), Math.sin(k * 1.1) * 0.03 * (k % 3)); g.add(m); }
    g.position.copy(b.pos); scene.add(g); return g;
  });

  // ---------- Marcas: onde a conta entra, ameaças, linha vencedora ----------
  const ghostRing = new THREE.Mesh(new THREE.TorusGeometry(BEAD.r * 1.35, 0.003, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }));
  ghostRing.renderOrder = 8; ghostRing.visible = false; cube.add(ghostRing);
  const rodGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, L, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
  rodGlow.visible = false; rodGlow.renderOrder = 6; cube.add(rodGlow);
  const threatMats = [
    new THREE.MeshBasicMaterial({ color: 0x6a9aff, transparent: true, opacity: 0.75, depthWrite: false, depthTest: false }),
    new THREE.MeshBasicMaterial({ color: 0xff7a2a, transparent: true, opacity: 0.85, depthWrite: false, depthTest: false }),
  ];
  const threatGeo = new THREE.OctahedronGeometry(BEAD.r * 0.75);
  const threatMarks = [];
  for (let k = 0; k < 24; k++) { const m = new THREE.Mesh(threatGeo, threatMats[0]); m.visible = false; m.renderOrder = 7; cube.add(m); threatMarks.push(m); }
  const winLine = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
  winLine.visible = false; winLine.renderOrder = 9; cube.add(winLine);
  function showWinLine(cells, team) {
    const a = cellLocal(cells[0]), b = cellLocal(cells[3]);
    const d = b.clone().sub(a);
    winLine.scale.set(1, d.length() + BEAD.r * 2, 1);
    winLine.position.copy(a).add(b).multiplyScalar(0.5);
    winLine.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    winLine.material.color.set(team === 0 ? 0x9ac0ff : 0xffd080);
    winLine.visible = true;
  }

  // ---------- Adversário ----------
  const avatar = makeAvatar({ headY: 1.42, build: buildParts });
  avatar.group.position.set(TABLE.x, 0, TABLE.z - 0.75);
  scene.add(avatar.group);

  // ---------- Placar: lousinha de jardim pendurada ----------
  const plC = canvas(1024, 384);
  const plTex = tex(plC);
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.45), new THREE.MeshBasicMaterial({ map: plTex }));
  placa.position.set(TABLE.x - 1.1, 1.9, TABLE.z - 1.6); placa.rotation.y = 0.35; scene.add(placa);
  function drawBoard({ names, scores, round, footer }) {
    const g = plC.getContext('2d');
    g.fillStyle = '#2f4a32'; g.fillRect(0, 0, 1024, 384);
    g.strokeStyle = '#a87a4a'; g.lineWidth = 22; g.strokeRect(11, 11, 1002, 362);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f2f0e4'; g.font = 'bold 46px Georgia, serif'; g.fillText('CUBO DE LINHAS', 512, 62);
    for (const k of [0, 1]) {
      const x = k ? 768 : 256;
      g.fillStyle = k ? '#ffd080' : '#a8c4ff'; g.font = 'bold 40px sans-serif'; g.fillText(names[k], x, 135);
      g.fillStyle = '#f2f0e4'; g.font = 'bold 120px Georgia, serif'; g.fillText(String(scores[k]), x, 240);
    }
    g.fillStyle = '#d8e0d0'; g.font = '32px sans-serif'; g.fillText(round || '', 512, 240);
    g.font = '30px sans-serif'; g.fillText(footer || '', 512, 335);
    plTex.needsUpdate = true;
  }

  function animate(dt, time) {
    jet.scale.y = 1 + Math.sin(time * 6) * 0.08;
    fernG.rotation.y = Math.sin(time * 0.4) * 0.01;
    for (const m of threatMarks) if (m.visible) { m.rotation.y = time * 2; m.scale.setScalar(m.userData.playable ? 1 + Math.sin(time * 8) * 0.25 : 0.8); }
  }

  return {
    scene, sun, cube, colHits, cubeHit, beadsG, makeBead, ghostRing, rodGlow, threatMarks, threatMats, winLine, showWinLine,
    bowlMeshes, bowlBeads, avatar, drawBoard, animate, floorLines,
  };
}

// Enfeites: chapéu de palha (arriscado), lenço e óculos (cautelosa), flor no cabelo e coque (mestra)
function buildParts() {
  const parts = {};
  parts.risky = new THREE.Group();
  const straw = new THREE.MeshLambertMaterial({ color: 0xe8c878 });
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.012, 24), straw); brim.position.y = 0.09; parts.risky.add(brim);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.09, 18), straw); crown.position.y = 0.14; parts.risky.add(crown);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.121, 0.121, 0.02, 18), new THREE.MeshLambertMaterial({ color: 0x3a7a3a })); band.position.y = 0.11; parts.risky.add(band);
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6a4a2a })); beard.position.set(0, -0.05, 0.05); parts.risky.add(beard);

  parts.careful = new THREE.Group();
  const scarf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8a6ad8 })); scarf.position.y = 0.02; scarf.rotation.x = -0.3; parts.careful.add(scarf);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), scarf.material); knot.position.set(0, -0.02, -0.13); parts.careful.add(knot);
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x3a2a1a });
  for (const x of [-0.045, 0.045]) { const g = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.004, 6, 18), glassMat); g.position.set(x, 0.02, 0.135); parts.careful.add(g); }

  parts.master = new THREE.Group();
  const hair = new THREE.MeshLambertMaterial({ color: 0x2a1a14 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.137, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair); cap.position.y = 0.015; cap.rotation.x = -0.2; parts.master.add(cap);
  const bun = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), hair); bun.position.set(0, 0.13, -0.06); parts.master.add(bun);
  const petalMat = new THREE.MeshLambertMaterial({ color: 0xd84a8a });
  for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6).scale(1, 0.5, 1), petalMat); const a = k * Math.PI * 2 / 5; p.position.set(0.1 + Math.cos(a) * 0.022, 0.1 + Math.sin(a) * 0.022, 0.05); parts.master.add(p); }
  const mid = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshLambertMaterial({ color: 0xffd84a })); mid.position.set(0.1, 0.1, 0.06); parts.master.add(mid);
  return parts;
}
