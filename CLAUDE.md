# CuboLinhaVR

Cubo de Linhas: quatro em linha num cubo de vidro 4 x 4 x 4 em VR para o Meta Quest 3 no navegador
(WebXR), sem instalar nada. Numa estufa de vidro num dia de sol (vasos, samambaias penduradas,
orquídeas, chafariz e o jardim lá fora), o cubo fica num suporte de latão na bancada, com 16 hastes em
pé. Você pega o cubo e gira na mão para ver as linhas, pega contas no pote e solta nas hastes (elas
descem até embaixo). As 76 linhas valem, inclusive as diagonais 3D. Partida contra 3 adversários com
personalidade e 10 desafios de vitória forçada com 3 estrelas. Também joga no PC com mouse e teclado.
Tudo em português.

## Como rodar / jogar

**No Quest:** o endereço publicado será `https://parappathe.github.io/CuboLinhaVR/` (abrir no navegador
do óculos e apertar "Entrar em VR"). Publicar é com o Eduardo (`python publicar.py CuboLinhaVR` na
pasta `C:\claude code`).

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8863` (o painel de visualização usa
`.claude/launch.json`). O `serve.py` manda o navegador não guardar cache; `python serve.py --https`
serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Segurar e girar o cubo | Botão lateral (aperto) com a mão perto do cubo: ele acompanha a mão (posição e rotação). Soltar: ele volta para o suporte e fica com a rotação. Manche também gira; A ou X endireita | Arrastar com o mouse (qualquer botão) gira o cubo; setas também; R endireita |
| Pegar conta | Aperto perto de um dos seus potes (na frente, à direita e à esquerda) | Não precisa |
| Soltar conta | Soltar o aperto com a conta em cima de uma haste (ou dentro do cubo, na coluna dela); ou apontar o controle para a haste e soltar. Sem conta na mão: apontar para a haste e apertar o gatilho também solta | Clicar na haste, de preferência pela tampa de cima do cubo |
| Onde entra | Anel branco (verde se ganha, vermelho se dá a linha para o outro) na casa onde a conta vai parar, haste iluminada e placa "Haste B3 · entra no 2º andar / Tapa uma linha de 3 dela" | Igual, passando o mouse; texto na caixa embaixo da tela |
| Ameaças de 3 | Losango azul (sua) ou laranja (dela) na casa que fecha a linha; pulsando = dá para fechar já | Igual (Menu → Ameaças desliga) |
| Só com as mãos | Pinça perto do pote pega conta; perto do cubo segura o cubo; longe, a pinça aponta e solta na haste | |
| Câmera | Você fica em pé de frente para a bancada | A/D giram a câmera, W/S sobem e descem, rodinha: zoom |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar com o controle e gatilho | Clique |
| FPS | Menu → FPS | Tecla F |

A conta desce pela haste no referencial do cubo: com o cubo girado ela segue a haste. Na base do cubo
cada haste tem o nome (A1 = canto da frente à esquerda, D4 = canto de trás à direita). O adversário
fica em pé do outro lado da bancada e reage.

### Regras

- Cubo 4 x 4 x 4, 16 hastes. Na sua vez solte uma conta numa haste que não está cheia; ela desce até a
  casa mais baixa livre.
- Vence quem fizer 4 em linha: 48 retas (nos 3 eixos), 24 diagonais de plano (andares e paredes) e as 4
  diagonais que cruzam o cubo inteiro: 76 linhas. Cubo cheio: empate.
- Partida: melhor de 3 jogos (empate não conta, no máximo 5); quem começa alterna (sorteio no primeiro).
- Adversários (em `js/ai.js`, em ordem de dificuldade): **Seu Cacto** (arriscado: olha só a jogada dele
  e às vezes esquece de tapar a sua linha de 3), **Dona Hortênsia** (cautelosa: tapa tudo, busca de 3
  contas com defesa pesada), **Mestra Orquídea** (pensa à frente: busca de 2, 4 e 6 contas com poda,
  até uns 60 ms, e arma ameaças duplas).
- Desafios (em `js/challenges.js`): você começa numa posição pronta e a Mestra Orquídea responde com a
  defesa perfeita (a resposta que mais atrasa a sua vitória; se você der chance, ela ganha). 1 Primeira
  linha, 2 Diagonal no chão, 3 Torre, 4 Ameaça dupla, 5 Canto, 6 Escada, 7 Por baixo, 8 Três jogadas,
  9 Espiral de vidro, 10 Grande final. ★★★ = ganhar no par (o mínimo de contas suas com vitória forçada:
  1, 2 ou 3), ★★ = uma a mais, ★ = até par + 3. Passar um (1 estrela) libera o próximo.
- Progresso salvo no navegador (localStorage, chave `cubolinhavr.v1`): vitórias e partidas por
  adversário, estrelas por desafio, som, ameaças e FPS.

## Como testar

- `npm test` (ou `node tests/run.js`): 76 linhas (48 + 24 + 4), gravidade (desce, empilha, haste
  cheia), vitórias de cada tipo (reta, em pé, diagonal de andar, diagonal do cubo), ameaças ("já" só com
  conta embaixo), 300 jogos sorteados sem conta flutuando, melhor de 3, IA (fecha quando pode, tapa a sua
  linha, pior jogada abaixo de 100 ms), IA contra IA em 10 jogos por dupla (mostra placar; a mais difícil
  vence a maioria), partidas completas contra os 3, desafios (posição sem conta no ar, mesma quantidade
  de cada, laranja sem linha pronta, vitória forçada em exatamente o par, robô tira 3 estrelas contra a
  defesa, soltar sempre na primeira haste não dá 3) e fumaça do `main.js`. Tem que terminar com "Tudo
  certo"; sai com código 1 se algo falhar (e sozinho se passar de 150 s). Não toca som. Leva uns 20 s.
- A fumaça (`tests/smoke.js` + `tests/three-stub.js`) carrega o jogo no Node com navegador e WebGL de
  mentira e joga **pelo mesmo caminho do jogo**: botões do painel (Partida → Dona Hortênsia, Menu
  principal → Desafios → 1 → Próximo...), passa o mouse na tampa da haste e confere a prévia (haste e
  andar), clica, gira o cubo arrastando e confere que a haste certa é achada com o cubo girado, deixa o
  robô terminar a partida conferindo a cada meio segundo que as contas na tela batem com as regras e não
  flutuam (`dev.check()`), resolve os 10 desafios contra a defesa dentro do jogo, força vitória e pausa.
  Precisa do Node 22.15 ou mais novo.
- No navegador (console): `dev.autoplay = true`, `dev.advance(5)`, `dev.state()` (tela, fase, alturas
  das hastes, ameaças visíveis, giro do cubo, prévia), `dev.loadLevel(3)`, `dev.startMatch(2)`,
  `dev.press('Desafios')`, `dev.play(5)` (solta na haste 5), `dev.rotateCube(0.5, 0)`, `dev.forceWin()`,
  `dev.check()`, `dev.colScreen(5)` (posição na tela da tampa da haste), `dev.resetSave()`. `window.cubo`
  tem `match`, `challenge`, `save`, `camera`, `scene`, `renderer`, `world`.
- **Só dá para testar no óculos:** segurar e girar o cubo com a mão (e a volta para o suporte), pegar
  conta no pote, soltar em cima da haste e apontando, gatilho direto na haste, pinça, manche girando o
  cubo, leitura das ameaças com o vidro, placas, vibração, rastreamento de mãos e FPS.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", placar, caixa da prévia e dica do PC |
| `js/rules.js` | Cubo, 76 linhas (`LINES`), gravidade, `applyMove`, ameaças (`threats`), `Match`, texto de posição, nome das hastes. Sem navegador |
| `js/ai.js` | Adversários, robô, busca rápida (fazer e desfazer em arrays), avaliação por linhas, negamax com poda e aprofundamento, vitória forçada (`forcedWin`, `winDistance`) e a defesa dos desafios (`defenderMove`). Sem navegador |
| `js/challenges.js` | Os 10 desafios (posição, par, máximo), nota, robô que resolve. Sem navegador |
| `js/main.js` | Liga tudo: render, VR (segurar o cubo, pegar conta, soltar, apontar, manche), mouse/teclado (arrastar gira, clique solta), prévia, ameaças, animação da descida, turnos, menus, HUD, placar, `dev` |
| `js/scene.js` | Estufa (vidro com caixilho, jardim lá fora, lajotas, vasos e plantas instanciados, samambaias, chafariz, orquídeas), bancada, potes, suporte, cubo (vidro, arestas, base com nomes, hastes, linhas dos andares, caixas das hastes), contas, marcas, adversário, lousinha do placar |
| `js/avatar.js` | Boneco do adversário |
| `js/ui.js` | Painel de menu 3D em canvas e placas de texto |
| `js/audio.js` | Sons sintetizados: conta descendo e tilintando, aviso de ameaça, linha fechada, chafariz, passarinhos, fanfarras |
| `js/save.js` | Progresso e opções salvos |
| `tests/run.js`, `tests/smoke.js`, `tests/three-stub.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8863, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: casa = x + 4·z + 16·y (x = 0 a 3 da esquerda para a direita, z = 0 perto de você a 3 longe,
y = andar de baixo para cima); haste = x + 4·z. No Three.js a casa vira ((x − 1,5)·6,2 cm, (y − 1,5)·6,2
cm, −(z − 1,5)·6,2 cm) dentro de `world.cube`, que em repouso fica em (0; 1,06; −0,40). Tampo da
bancada a 0,84 m. No VR a cabeça fica em x = 0, z = 0,18.

## Regras e convenções do projeto

- `rules.js`, `ai.js` e `challenges.js` não podem usar navegador nem Three.js: os testes rodam no Node.
- Mexeu em regras, IA ou desafios: rodar `npm test`. Desafio novo ou mudado: a posição não pode ter
  conta no ar, tem que ter vitória forçada em exatamente o par e a laranja não pode ter linha pronta.
- A IA no navegador pensa em pedaços (gerador que para entre as profundidades) e no máximo uns 60 ms.
- Testes nunca tocam som.
- Desempenho no Quest: uma luz com sombra (o sol, mapa 1024 só em volta da bancada), caixilhos, vasos e
  plantas em `InstancedMesh`, vidro com transparência simples (sem `transmission`), geometria e
  materiais das contas compartilhados.

## Decisões

- Com gravidade nas hastes (não dá para pôr a conta no ar): o "onde vai entrar" fica claro e a ameaça
  "pronta" só existe quando a casa de baixo está cheia, o que dá jogo de espera. Sem gravidade quem
  começa ganha fácil.
- A gravidade é do cubo: girando o cubo na mão a conta continua descendo pela haste. Assim girar é só
  para olhar, nunca muda a regra.
- Busca da Mestra só em profundidade par (2, 4, 6): com profundidade ímpar a avaliação favorecia quem
  jogava por último e ela perdia para a Dona Hortênsia.
- Desafios de vitória forçada contra a defesa perfeita (e não "faça 4 em N contas" sozinho): é o
  quebra-cabeça de verdade desse jogo. O teste confere que o par é o mínimo.
- No PC, a haste é achada pela tampa de cima do cubo (e só se não der, pela caixa da haste): de lado, as
  hastes da frente escondiam as de trás.
- Porta do servidor local 8863.

## Pendências / problemas conhecidos

- Nada testado no Quest ainda: segurar e girar o cubo com a mão, pegar conta no pote (raio de 9 cm),
  soltar em cima da haste e apontando, pinça, manche, leitura através do vidro, placas, vibração,
  rastreamento de mãos e FPS.
- A dificuldade foi calibrada com IA contra IA; contra gente a Mestra pode estar difícil demais.
- No PC, com o tabuleiro grande na câmera padrão, do adversário aparece só o corpo atrás do cubo.
