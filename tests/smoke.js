// Fumaça do main.js: carrega o jogo inteiro no Node com um navegador de mentira (sem WebGL, sem som)
// e confere que menu, partida (com o robô), clique do PC com prévia e desafios funcionam, pelo
// mesmo caminho que o jogo usa (botões do painel, funções que carregam partida e desafio).
import * as nodeModule from 'node:module';

// ---- navegador de mentira ----
function fakeCtx() {
  const fn = () => proxy;
  const proxy = new Proxy(fn, {
    get(_, k) {
      if (k === 'measureText') return (t) => ({ width: String(t).length * 12 });
      if (k === 'canvas') return null;
      return fn;
    },
    set() { return true; },
    apply() { return proxy; },
  });
  return proxy;
}
function fakeElement(tag = 'div') {
  const listeners = {};
  return {
    tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', width: 300, height: 150,
    listeners,
    addEventListener(t, f) { (listeners[t] ||= []).push(f); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    getContext() { return fakeCtx(); },
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    dispatch(t, e) { for (const f of listeners[t] || []) f(e); },
  };
}
function installDom() {
  const els = {};
  const winListeners = {};
  const store = new Map();
  const doc = {
    createElement: (t) => fakeElement(t),
    createElementNS: (_, t) => fakeElement(t),
    getElementById: (id) => (els[id] ||= fakeElement('div')),
    body: fakeElement('body'),
    addEventListener() {},
  };
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, isSecureContext: false,
    addEventListener(t, f) { (winListeners[t] ||= []).push(f); },
    removeEventListener() {},
    dispatch(t, e) { for (const f of winListeners[t] || []) f(e); },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.self = win;
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-teste' }, configurable: true, writable: true });
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  return { els, win, store };
}

// Troca só o WebGLRenderer do Three.js por um de mentira (o resto do Three.js é o de verdade).
function installThreeStub() {
  const stub = new URL('./three-stub.js', import.meta.url).href;
  const resolve = (spec, ctx, next) => {
    if (spec.endsWith('vendor/three/three.module.js') && !String(ctx.parentURL || '').endsWith('three-stub.js')) return { url: stub, shortCircuit: true };
    return next(spec, ctx);
  };
  if (nodeModule.registerHooks) nodeModule.registerHooks({ resolve });
  else throw new Error('Node sem module.registerHooks (precisa do Node 22.15 ou mais novo)');
}

export async function smoke() {
  const out = [];
  const ok = (c, m) => out.push([!!c, m]);
  const { els, win, store } = installDom();
  installThreeStub();
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    await import('../js/main.js');
    const dev = window.dev;
    const R = await import('../js/rules.js');
    ok(dev && typeof dev.advance === 'function', 'main.js carregou e criou window.dev');
    let s = dev.advance(0.5);
    ok(s.tela === 'menu' && s.painel, 'abre no menu principal');
    ok(els.vr.textContent.includes('VR'), `botão de VR avisa que não tem VR aqui ("${els.vr.textContent}")`);
    ok(dev.press('Partida contra o computador') && dev.press('Dona Hortênsia'), 'partida pelo menu: Dona Hortênsia');
    s = dev.state();
    ok(s.tela === 'play' && s.adversario === 'Dona Hortênsia', 'partida começou');
    const waitTurn = () => { for (let i = 0; i < 80 && !(dev.state().fase === 'turn'); i++) dev.advance(0.25); return dev.advance(0.1); };
    s = waitTurn();
    ok(s.fase === 'turn' && s.vez === 'você', 'chega a sua vez');
    const canvasEl = window.cubo.renderer.domElement;
    const click = (p) => { canvasEl.dispatch('pointermove', { clientX: p.x, clientY: p.y }); dev.advance(0.05); canvasEl.dispatch('pointerdown', { clientX: p.x, clientY: p.y, button: 0 }); win.dispatch('pointerup', { clientX: p.x, clientY: p.y, button: 0 }); };
    // passar o mouse por cima da haste: prévia diz qual haste e em que andar
    const g0 = window.cubo.match.game;
    const col = [6, 5, 9, 10].find(c => g0.heights[c] < 4);
    const p = dev.colScreen(col);
    canvasEl.dispatch('pointermove', { clientX: p.x, clientY: p.y });
    s = dev.advance(0.05);
    ok(s.previa && s.previa.startsWith(`Haste ${R.colName(col)} · entra no ${g0.heights[col] + 1}º andar`), `prévia mostra a haste e o andar ("${s.previa}")`);
    const before = g0.moves;
    click(p);
    s = dev.state();
    ok(s.fase === 'anim' && s.contas === before + 1, 'clicar solta a conta');
    for (let i = 0; i < 20 && dev.state().animando; i++) dev.advance(0.1);
    ok(window.cubo.match.game.cells[col + 16 * g0.heights[col]] === 0, 'a conta parou no fundo da haste certa');
    ok(dev.check().length === 0, `tela bate com as regras (${dev.check().join('; ')})`);
    // girar o cubo arrastando o mouse e jogar de novo com ele girado
    s = waitTurn();
    const g1 = window.cubo.match.game;
    if (!g1.over) {
      const a0 = s.cuboGirado;
      canvasEl.dispatch('pointerdown', { clientX: 200, clientY: 300, button: 0 });
      for (let k = 1; k <= 10; k++) canvasEl.dispatch('pointermove', { clientX: 200 + k * 12, clientY: 300 + k * 2 });
      win.dispatch('pointerup', { clientX: 320, clientY: 320, button: 0 });
      s = dev.advance(0.05);
      ok(s.cuboGirado !== a0 && s.contas === g1.moves, `arrastar gira o cubo sem soltar conta (${a0}° → ${s.cuboGirado}°)`);
      const col2 = [9, 10, 5, 6, 0].find(c => g1.heights[c] < 4);
      const q = dev.colScreen(col2);
      canvasEl.dispatch('pointermove', { clientX: q.x, clientY: q.y });
      s = dev.advance(0.05);
      ok(s.previa && s.previa.startsWith(`Haste ${R.colName(col2)}`), `com o cubo girado a prévia acha a haste certa ("${s.previa}")`);
      click(q);
      for (let i = 0; i < 20 && dev.state().animando; i++) dev.advance(0.1);
      ok(window.cubo.match.game.cells[col2 + 16 * g1.heights[col2]] === 0, 'conta entrou na haste certa com o cubo girado');
      ok(dev.check().length === 0, `tela bate com as regras com o cubo girado (${dev.check().join('; ')})`);
    }
    dev.autoplay = true;
    let guard = 0;
    const bad = [];
    while (!dev.state().vencedor && guard++ < 1500) { dev.advance(0.5); bad.push(...dev.check()); }
    s = dev.state();
    ok(s.vencedor, `partida terminou sozinha (${s.vitorias?.join(' x ')}, vencedor: ${s.vencedor})`);
    ok(bad.length === 0, `tela sempre bateu com as regras (${bad.slice(0, 3).join('; ')})`);
    const m = window.cubo.match;
    ok(m.results.length >= 2 && (m.wins(0) === 2 || m.wins(1) === 2 || m.results.length === 5), `melhor de 3 (${m.results.map(r => r.winner).join(',')})`);
    ok(JSON.parse(store.get('cubolinhavr.v1')).games[1] === 1, 'resultado salvo no localStorage');
    ok(dev.press('Menu principal') && dev.press('Desafios') && dev.press('1 '), 'abre o desafio 1 pelo menu');
    const stars = [];
    for (let n = 1; n <= 10; n++) {
      let k = 0;
      while (dev.state().estrelas == null && k++ < 200) dev.advance(0.5);
      stars.push(dev.state().estrelas);
      if (n < 10) dev.press('Próximo');
    }
    ok(stars.every(x => x === 3), `robô tira 3 estrelas nos 10 desafios dentro do jogo, contra a defesa (${stars.join(' ')})`);
    ok(Object.keys(JSON.parse(store.get('cubolinhavr.v1')).ch).length === 10, 'estrelas dos desafios salvas');
    dev.autoplay = false;
    dev.startMatch(3);
    dev.advance(0.2);
    s = dev.forceWin();
    ok(s.fase === 'gameEnd' && s.vitorias[0] === 1, 'dev.forceWin dá o jogo para você');
    dev.press('Próximo jogo');
    ok(dev.state().jogo === 2, 'próximo jogo pelo botão');
    win.dispatch('keydown', { key: 'Escape' });
    ok(dev.state().tela === 'paused', 'Esc pausa');
    win.dispatch('keydown', { key: 'Escape' });
    ok(dev.state().tela === 'play', 'Esc de novo continua');
    const loop = window.cubo.renderer._loop;
    for (let i = 0; i < 5; i++) loop?.(performance.now() + i * 16);
    ok(typeof loop === 'function', 'laço de animação ligado');
  } finally {
    console.error = origErr;
  }
  ok(errors.length === 0, `sem erros no console (${errors.slice(0, 2).join(' | ')})`);
  return out;
}
