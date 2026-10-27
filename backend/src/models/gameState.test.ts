import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BoardData, RESOURCES, generateBoard } from '../utils/boardGenerator';
import { BANK_SIZE, DevCardType, GameAction, GameState, Resources } from './gameState';

const PLAYERS = [
  { userId: 'A', color: 'red' },
  { userId: 'B', color: 'blue' },
  { userId: 'C', color: 'white' },
];

// Center is the desert, hexes[1] = (0,-1) is a hill with a 6, every other hex is a field with a 12,
// so rolling a 6 only ever produces brick from that one hex. Two known ports: 3:1 and wool 2:1.
function fixedBoard(): BoardData {
  const board = generateBoard();
  board.hexes = board.hexes.map((h, i) => {
    if (i === 0) return { ...h, terrain: 'desert', number: null };
    if (i === 1) return { ...h, terrain: 'hills', number: 6 };
    return { ...h, terrain: 'fields', number: 12 };
  });
  board.ports = [
    { hexQ: 0, hexR: -2, edgeDir: 4, type: '3:1' },
    { hexQ: 2, hexR: -2, edgeDir: 0, type: 'wool' },
  ];
  return board;
}
const HILL = '0,-1';

function newGame(board = fixedBoard()) {
  let nextDice: [number, number] = [2, 3]; // 5: produces nothing on the fixed board
  const game = new GameState(board, PLAYERS, () => nextDice);
  return { game, setDice: (d: [number, number]) => { nextDice = d; } };
}

function ok(game: GameState, userId: string, action: GameAction) {
  assert.equal(game.apply(userId, action), null);
}

function playSetup(game: GameState) {
  while (game.phase === 'setup') {
    const p = game.currentPlayerId;
    ok(game, p, { type: 'build_settlement', vertexKey: game.legalMoves(p).settlements[0] });
    ok(game, p, { type: 'build_road', edgeKey: game.legalMoves(p).roads[0] });
  }
}

// A started game with an empty board and empty hands, A to play and dice already rolled (a 5)
function emptyMainPhase() {
  const g = newGame();
  playSetup(g.game);
  g.game.buildings.clear();
  g.game.roads.clear();
  for (const p of g.game.players.values()) p.resources = { wood: 0, brick: 0, wool: 0, wheat: 0, ore: 0 };
  for (const r of RESOURCES) g.game.bank[r] = BANK_SIZE;
  ok(g.game, 'A', { type: 'roll_dice' });
  return g;
}

function give(game: GameState, userId: string, hand: Partial<Resources>) {
  Object.assign(game.players.get(userId)!.resources, hand);
}

function edgeBetween(game: GameState, v1: string, v2: string): string {
  return game.graph.vertices.get(v1)!.adjacentEdgeKeys.find(e => game.graph.edges.get(e)!.vertices.includes(v2))!;
}

// Walks from a vertex along edges: returns [v0, v1, v2, ...]
function path(game: GameState, start: string, length: number): string[] {
  const vs = [start];
  while (vs.length <= length) {
    const last = vs[vs.length - 1];
    vs.push(game.graph.vertices.get(last)!.adjacentVertexKeys.find(v => !vs.includes(v))!);
  }
  return vs;
}

describe('fase de fundação', () => {
  test('ordem em serpente e depois o primeiro jogador rola os dados', () => {
    const { game } = newGame();
    const order: string[] = [];
    while (game.phase === 'setup') {
      const p = game.currentPlayerId;
      order.push(p);
      ok(game, p, { type: 'build_settlement', vertexKey: game.legalMoves(p).settlements[0] });
      ok(game, p, { type: 'build_road', edgeKey: game.legalMoves(p).roads[0] });
    }
    assert.deepEqual(order, ['A', 'B', 'C', 'C', 'B', 'A']);
    assert.equal(game.phase, 'playing');
    assert.equal(game.step, 'roll');
    assert.equal(game.currentPlayerId, 'A');
  });

  test('a segunda aldeia rende 1 carta por terreno vizinho, tiradas do banco', () => {
    const board = generateBoard();
    const { game } = newGame(board);
    playSetup(game);
    let dealt = 0;
    for (const [id, p] of game.players) {
      const [, second] = [...game.buildings].filter(([, b]) => b.owner === id).map(([k]) => k);
      const productiveNeighbors = game.graph.vertices.get(second)!.adjacentHexKeys
        .filter(k => board.hexes.find(h => `${h.q},${h.r}` === k)!.terrain !== 'desert').length;
      const hand = RESOURCES.reduce((s, r) => s + p.resources[r], 0);
      assert.equal(hand, productiveNeighbors);
      assert.equal(game.victoryPoints(id), 2);
      assert.equal(game.toView(id).players[id].piecesLeft.road, 13);
      dealt += hand;
    }
    const bankTotal = RESOURCES.reduce((s, r) => s + game.bank[r], 0);
    assert.equal(bankTotal + dealt, BANK_SIZE * 5);
  });

  test('regra de distância, estrada colada na aldeia e vez de cada um', () => {
    const { game } = newGame();
    const [v0, v1, v2, v3] = path(game, game.legalMoves('A').settlements[0], 3);

    assert.equal(game.apply('B', { type: 'build_settlement', vertexKey: v0 }), 'Não é a sua vez.');
    assert.equal(game.apply('A', { type: 'roll_dice' }), 'Coloque uma aldeia primeiro.');
    ok(game, 'A', { type: 'build_settlement', vertexKey: v0 });
    assert.equal(game.apply('A', { type: 'build_road', edgeKey: edgeBetween(game, v2, v3) }),
      'A estrada deve ser adjacente à aldeia que acabou de colocar.');
    ok(game, 'A', { type: 'build_road', edgeKey: edgeBetween(game, v0, v1) });

    assert.equal(game.apply('B', { type: 'build_settlement', vertexKey: v1 }),
      'Viola a regra de distância (construção adjacente).');
    ok(game, 'B', { type: 'build_settlement', vertexKey: v2 });
  });
});

describe('turno', () => {
  test('precisa rolar antes de construir ou passar, e só uma vez', () => {
    const { game } = newGame();
    playSetup(game);
    assert.equal(game.apply('A', { type: 'end_turn' }), 'Role os dados primeiro.');
    assert.equal(game.apply('A', { type: 'build_city', vertexKey: 'x' }), 'Role os dados primeiro.');
    ok(game, 'A', { type: 'roll_dice' });
    assert.deepEqual(game.dice, [2, 3]);
    assert.equal(game.apply('A', { type: 'roll_dice' }), 'Os dados já foram rolados.');
    ok(game, 'A', { type: 'end_turn' });
    assert.equal(game.currentPlayerId, 'B');
    assert.equal(game.step, 'roll');
    assert.equal(game.apply('A', { type: 'roll_dice' }), 'Não é a sua vez.');
  });

  test('ação desconhecida é recusada', () => {
    const { game } = newGame();
    assert.equal(game.apply('A', { type: 'cheat' } as unknown as GameAction), 'Ação inválida.');
    assert.equal(game.apply('A', null as unknown as GameAction), 'Ação inválida.');
  });
});

describe('produção', () => {
  function withBuildingsOnHill() {
    const g = emptyMainPhase();
    const corners = g.game.graph.hexVertices.get(HILL)!;
    g.game.buildings.set(corners[0], { owner: 'A', type: 'settlement' });
    g.game.buildings.set(corners[3], { owner: 'A', type: 'city' });
    g.game.buildings.set(corners[1], { owner: 'B', type: 'settlement' });
    ok(g.game, 'A', { type: 'end_turn' });
    g.setDice([3, 3]);
    return { ...g, corners };
  }

  test('aldeia rende 1, cidade rende 2, e o banco paga', () => {
    const { game } = withBuildingsOnHill();
    ok(game, 'B', { type: 'roll_dice' });
    assert.equal(game.players.get('A')!.resources.brick, 3);
    assert.equal(game.players.get('B')!.resources.brick, 1);
    assert.equal(game.bank.brick, BANK_SIZE - 4);
  });

  test('o hexágono com o ladrão não produz', () => {
    const { game } = withBuildingsOnHill();
    game.robberHex = HILL;
    ok(game, 'B', { type: 'roll_dice' });
    assert.equal(game.players.get('A')!.resources.brick, 0);
  });

  test('banco sem cartas para todos: ninguém recebe aquele recurso', () => {
    const { game } = withBuildingsOnHill();
    game.bank.brick = 3;
    ok(game, 'B', { type: 'roll_dice' });
    assert.equal(game.players.get('A')!.resources.brick, 0);
    assert.equal(game.players.get('B')!.resources.brick, 0);
    assert.equal(game.bank.brick, 3);
  });

  test('banco sem cartas e só um jogador a receber: leva o que sobrou', () => {
    const { game, corners } = withBuildingsOnHill();
    game.buildings.delete(corners[1]);
    game.bank.brick = 2;
    ok(game, 'B', { type: 'roll_dice' });
    assert.equal(game.players.get('A')!.resources.brick, 2);
    assert.equal(game.bank.brick, 0);
  });

  test('7 não produz nada e chama o ladrão', () => {
    const { game, setDice } = withBuildingsOnHill();
    setDice([3, 4]);
    ok(game, 'B', { type: 'roll_dice' });
    assert.equal(game.players.get('A')!.resources.brick, 0);
    assert.equal(game.step, 'move_robber');
  });
});

describe('ladrão', () => {
  // A's turn, about to roll a 7
  function beforeSeven() {
    const g = newGame();
    playSetup(g.game);
    g.game.buildings.clear();
    g.game.roads.clear();
    for (const p of g.game.players.values()) p.resources = { wood: 0, brick: 0, wool: 0, wheat: 0, ore: 0 };
    for (const r of RESOURCES) g.game.bank[r] = BANK_SIZE;
    g.setDice([3, 4]);
    return g.game;
  }

  test('quem tem mais de 7 cartas descarta metade, todos ao mesmo tempo', () => {
    const game = beforeSeven();
    give(game, 'A', { wood: 9 });
    give(game, 'B', { ore: 5, wheat: 3 });
    give(game, 'C', { wool: 7 });
    ok(game, 'A', { type: 'roll_dice' });

    assert.equal(game.step, 'discard');
    assert.deepEqual(game.toView('C').discards, { A: 4, B: 4 });
    assert.equal(game.apply('A', { type: 'move_robber', hexKey: HILL }), 'Aguardando os jogadores descartarem.');
    assert.equal(game.apply('A', { type: 'end_turn' }), 'Aguardando os jogadores descartarem.');
    assert.equal(game.apply('C', { type: 'discard', resources: { wool: 3 } }), 'Você não precisa descartar.');

    // B discards outside their own turn
    assert.equal(game.apply('B', { type: 'discard', resources: { ore: 3 } }), 'Descarte exatamente 4 cartas.');
    assert.equal(game.apply('B', { type: 'discard', resources: { wheat: 4 } }), 'Você não tem essas cartas.');
    assert.equal(game.apply('B', { type: 'discard', resources: { ore: -1, wheat: 5 } }), 'Cartas inválidas.');
    assert.equal(game.apply('B', { type: 'discard', resources: { ore: '4' } as unknown as Resources }), 'Cartas inválidas.');
    ok(game, 'B', { type: 'discard', resources: { ore: 2, wheat: 2 } });
    assert.deepEqual(game.players.get('B')!.resources, { wood: 0, brick: 0, wool: 0, wheat: 1, ore: 3 });
    assert.equal(game.bank.ore, BANK_SIZE + 2);
    assert.equal(game.apply('B', { type: 'discard', resources: { ore: 1 } }), 'Você não precisa descartar.');

    assert.equal(game.step, 'discard');
    ok(game, 'A', { type: 'discard', resources: { wood: 4 } });
    assert.equal(game.step, 'move_robber');
    assert.equal(game.apply('B', { type: 'discard', resources: {} }), 'Não há descarte pendente.');
  });

  test('o ladrão tem que mudar de hexágono e só o jogador da vez move', () => {
    const game = beforeSeven();
    ok(game, 'A', { type: 'roll_dice' });
    assert.equal(game.step, 'move_robber');
    const legal = game.legalMoves('A');
    assert.equal(legal.robberHexes.length, 18);
    assert.ok(!legal.robberHexes.includes(game.robberHex));

    assert.equal(game.apply('B', { type: 'move_robber', hexKey: HILL }), 'Não é a sua vez.');
    assert.equal(game.apply('A', { type: 'move_robber', hexKey: game.robberHex }), 'O ladrão precisa mudar de lugar.');
    assert.equal(game.apply('A', { type: 'move_robber', hexKey: '9,9' }), 'Hexágono inválido.');
    assert.equal(game.apply('A', { type: 'build_road', edgeKey: 'x' }), 'Mova o ladrão primeiro.');

    ok(game, 'A', { type: 'move_robber', hexKey: HILL });
    assert.equal(game.robberHex, HILL);
    assert.equal(game.step, 'main'); // nobody to rob
    assert.equal(game.lastRobbery, null);
  });

  test('com uma só vítima o roubo é automático e só ladrão e vítima veem a carta', () => {
    const game = beforeSeven();
    const corners = game.graph.hexVertices.get(HILL)!;
    game.buildings.set(corners[0], { owner: 'A', type: 'settlement' });
    game.buildings.set(corners[2], { owner: 'B', type: 'settlement' });
    game.buildings.set(corners[4], { owner: 'C', type: 'city' }); // C has no cards: not a victim
    give(game, 'B', { brick: 2 });
    ok(game, 'A', { type: 'roll_dice' });
    ok(game, 'A', { type: 'move_robber', hexKey: HILL });

    assert.equal(game.step, 'main');
    assert.equal(game.players.get('A')!.resources.brick, 1);
    assert.equal(game.players.get('B')!.resources.brick, 1);
    assert.deepEqual(game.toView('A').lastRobbery, { thiefId: 'A', victimId: 'B', resource: 'brick' });
    assert.deepEqual(game.toView('B').lastRobbery, { thiefId: 'A', victimId: 'B', resource: 'brick' });
    assert.deepEqual(game.toView('C').lastRobbery, { thiefId: 'A', victimId: 'B', resource: null });

    ok(game, 'A', { type: 'end_turn' });
    assert.equal(game.lastRobbery, null);
  });

  test('com mais de uma vítima o jogador escolhe de quem roubar', () => {
    const game = beforeSeven();
    const corners = game.graph.hexVertices.get(HILL)!;
    game.buildings.set(corners[0], { owner: 'B', type: 'settlement' });
    game.buildings.set(corners[3], { owner: 'C', type: 'settlement' });
    give(game, 'B', { ore: 1 });
    give(game, 'C', { wool: 3 });
    ok(game, 'A', { type: 'roll_dice' });
    ok(game, 'A', { type: 'move_robber', hexKey: HILL });

    assert.equal(game.step, 'steal');
    assert.deepEqual(game.legalMoves('A').victims.sort(), ['B', 'C']);
    assert.equal(game.apply('A', { type: 'end_turn' }), 'Escolha de quem roubar primeiro.');
    assert.equal(game.apply('A', { type: 'steal', victimId: 'A' }), 'Não é possível roubar desse jogador.');
    ok(game, 'A', { type: 'steal', victimId: 'C' });
    assert.equal(game.players.get('A')!.resources.wool, 1);
    assert.equal(game.players.get('C')!.resources.wool, 2);
    assert.equal(game.step, 'main');
  });
});

describe('construção', () => {
  test('estrada ligada à rede, paga 1 madeira e 1 tijolo', () => {
    const { game } = emptyMainPhase();
    const [v0, v1, v2, v3] = path(game, game.graph.hexVertices.get(HILL)![0], 3);
    game.buildings.set(v0, { owner: 'A', type: 'settlement' });

    assert.equal(game.apply('A', { type: 'build_road', edgeKey: edgeBetween(game, v0, v1) }), 'Recursos insuficientes.');
    give(game, 'A', { wood: 2, brick: 2 });
    assert.equal(game.apply('A', { type: 'build_road', edgeKey: edgeBetween(game, v2, v3) }),
      'A estrada precisa estar ligada a uma estrada ou construção sua.');
    ok(game, 'A', { type: 'build_road', edgeKey: edgeBetween(game, v0, v1) });
    ok(game, 'A', { type: 'build_road', edgeKey: edgeBetween(game, v1, v2) });
    assert.deepEqual(game.players.get('A')!.resources, { wood: 0, brick: 0, wool: 0, wheat: 0, ore: 0 });
    assert.equal(game.bank.wood, BANK_SIZE + 2);
  });

  test('aldeia adversária corta a estrada', () => {
    const { game } = emptyMainPhase();
    const [v0, v1, v2] = path(game, game.graph.hexVertices.get(HILL)![0], 2);
    game.buildings.set(v0, { owner: 'A', type: 'settlement' });
    game.roads.set(edgeBetween(game, v0, v1), 'A');
    game.buildings.set(v1, { owner: 'B', type: 'settlement' });
    give(game, 'A', { wood: 1, brick: 1 });
    assert.equal(game.apply('A', { type: 'build_road', edgeKey: edgeBetween(game, v1, v2) }),
      'A estrada precisa estar ligada a uma estrada ou construção sua.');
  });

  test('aldeia precisa de estrada própria e respeita a distância', () => {
    const { game } = emptyMainPhase();
    const [v0, v1, v2] = path(game, game.graph.hexVertices.get(HILL)![0], 2);
    game.buildings.set(v0, { owner: 'A', type: 'settlement' });
    game.roads.set(edgeBetween(game, v0, v1), 'A');
    give(game, 'A', { wood: 2, brick: 2, wool: 2, wheat: 2 });

    assert.equal(game.apply('A', { type: 'build_settlement', vertexKey: v1 }),
      'Viola a regra de distância (construção adjacente).');
    assert.equal(game.apply('A', { type: 'build_settlement', vertexKey: v2 }),
      'A aldeia precisa estar ligada a uma estrada sua.');
    game.roads.set(edgeBetween(game, v1, v2), 'A');
    assert.deepEqual(game.legalMoves('A').settlements, [v2]);
    ok(game, 'A', { type: 'build_settlement', vertexKey: v2 });
    assert.equal(game.victoryPoints('A'), 2);
    assert.deepEqual(game.players.get('A')!.resources, { wood: 1, brick: 1, wool: 1, wheat: 1, ore: 0 });
  });

  test('cidade substitui aldeia própria e vale 2 pontos', () => {
    const { game } = emptyMainPhase();
    const [mine, , theirs] = path(game, game.graph.hexVertices.get(HILL)![0], 2);
    game.buildings.set(mine, { owner: 'A', type: 'settlement' });
    game.buildings.set(theirs, { owner: 'B', type: 'settlement' });
    give(game, 'A', { wheat: 2, ore: 3 });

    assert.equal(game.apply('A', { type: 'build_city', vertexKey: theirs }), 'A cidade deve substituir uma aldeia sua.');
    ok(game, 'A', { type: 'build_city', vertexKey: mine });
    assert.equal(game.victoryPoints('A'), 2);
    assert.equal(game.toView('A').players.A.piecesLeft.settlement, 5);
    assert.equal(game.apply('A', { type: 'build_city', vertexKey: mine }), 'A cidade deve substituir uma aldeia sua.');
  });

  test('limite de 5 aldeias', () => {
    const { game } = emptyMainPhase();
    const [v0, v1, v2] = path(game, game.graph.hexVertices.get(HILL)![0], 2);
    game.buildings.set(v0, { owner: 'A', type: 'settlement' });
    game.roads.set(edgeBetween(game, v0, v1), 'A');
    game.roads.set(edgeBetween(game, v1, v2), 'A');
    const nearV2 = [v0, v1, v2, ...game.graph.vertices.get(v2)!.adjacentVertexKeys];
    const elsewhere = [...game.graph.vertices.keys()].filter(v => !nearV2.includes(v)).slice(0, 4);
    for (const v of elsewhere) game.buildings.set(v, { owner: 'A', type: 'settlement' });
    give(game, 'A', { wood: 1, brick: 1, wool: 1, wheat: 1 });

    assert.equal(game.apply('A', { type: 'build_settlement', vertexKey: v2 }), 'Você não tem mais aldeias disponíveis.');
    assert.deepEqual(game.legalMoves('A').settlements, []);
  });
});

describe('vitória e informação escondida', () => {
  test('10 pontos no próprio turno encerra o jogo', () => {
    const { game } = emptyMainPhase();
    const spots = [...game.graph.vertices.keys()].filter((_, i) => i % 8 === 0).slice(0, 6);
    spots.forEach((v, i) => game.buildings.set(v, { owner: 'A', type: i < 3 ? 'city' : 'settlement' }));
    assert.equal(game.victoryPoints('A'), 9);
    give(game, 'A', { wheat: 2, ore: 3 });

    ok(game, 'A', { type: 'build_city', vertexKey: spots[3] });
    assert.equal(game.phase, 'finished');
    assert.equal(game.winnerId, 'A');
    assert.equal(game.apply('A', { type: 'end_turn' }), 'O jogo já terminou.');
    assert.equal(game.toView('A').legal, null);
  });

  test('cada jogador só vê a própria mão e só o jogador da vez recebe jogadas válidas', () => {
    const { game } = emptyMainPhase();
    give(game, 'B', { ore: 2, wool: 1 });
    const viewA = game.toView('A');
    assert.equal(viewA.players.B.resources, null);
    assert.equal(viewA.players.B.resourceCount, 3);
    assert.ok(viewA.legal);
    const viewB = game.toView('B');
    assert.deepEqual(viewB.players.B.resources, { wood: 0, brick: 0, wool: 1, wheat: 0, ore: 2 });
    assert.equal(viewB.legal, null);
  });
});

describe('comércio com o banco', () => {
  test('4:1 sem porto, só depois de rolar', () => {
    const { game } = newGame();
    playSetup(game);
    game.buildings.clear();
    for (const p of game.players.values()) p.resources = { wood: 0, brick: 0, wool: 0, wheat: 0, ore: 0 };
    give(game, 'A', { wood: 5 });
    assert.equal(game.apply('A', { type: 'bank_trade', give: 'wood', get: 'brick' }), 'Role os dados primeiro.');
    ok(game, 'A', { type: 'roll_dice' });

    assert.equal(game.apply('A', { type: 'bank_trade', give: 'wood', get: 'wood' }), 'Escolha recursos diferentes.');
    assert.equal(game.apply('A', { type: 'bank_trade', give: 'gold' as never, get: 'wood' }), 'Recurso inválido.');
    ok(game, 'A', { type: 'bank_trade', give: 'wood', get: 'brick' });
    assert.deepEqual(game.players.get('A')!.resources, { wood: 1, brick: 1, wool: 0, wheat: 0, ore: 0 });
    assert.equal(game.apply('A', { type: 'bank_trade', give: 'wood', get: 'ore' }), 'Você precisa de 4 cartas para essa troca.');
  });

  test('porto 3:1 vale para todos os recursos e porto de ovelha faz 2:1 só de ovelha', () => {
    const { game } = emptyMainPhase();
    const generic = game.graph.hexVertices.get('0,-2')![4];
    const wool = game.graph.hexVertices.get('2,-2')![1];
    assert.deepEqual(game.tradeRatios('A'), { wood: 4, brick: 4, wool: 4, wheat: 4, ore: 4 });

    game.buildings.set(generic, { owner: 'A', type: 'settlement' });
    assert.deepEqual(game.tradeRatios('A'), { wood: 3, brick: 3, wool: 3, wheat: 3, ore: 3 });
    game.buildings.set(wool, { owner: 'A', type: 'city' });
    assert.deepEqual(game.tradeRatios('A'), { wood: 3, brick: 3, wool: 2, wheat: 3, ore: 3 });
    assert.deepEqual(game.tradeRatios('B'), { wood: 4, brick: 4, wool: 4, wheat: 4, ore: 4 });

    give(game, 'A', { wool: 2, ore: 3 });
    ok(game, 'A', { type: 'bank_trade', give: 'wool', get: 'wheat' });
    ok(game, 'A', { type: 'bank_trade', give: 'ore', get: 'wheat' });
    assert.deepEqual(game.players.get('A')!.resources, { wood: 0, brick: 0, wool: 0, wheat: 2, ore: 0 });
    assert.deepEqual(game.legalMoves('A').bankRatios, game.tradeRatios('A'));
  });

  test('banco sem o recurso pedido recusa a troca', () => {
    const { game } = emptyMainPhase();
    give(game, 'A', { wood: 4 });
    game.bank.ore = 0;
    assert.equal(game.toView('B').bank.ore, 0);
    assert.equal(game.apply('A', { type: 'bank_trade', give: 'wood', get: 'ore' }), 'O banco não tem mais esse recurso.');
  });
});

describe('comércio entre jogadores', () => {
  function withHands() {
    const g = emptyMainPhase();
    give(g.game, 'A', { wood: 3 });
    give(g.game, 'B', { brick: 2 });
    give(g.game, 'C', { ore: 1 });
    return g.game;
  }

  test('proposta, respostas e confirmação com quem aceitou', () => {
    const game = withHands();
    ok(game, 'A', { type: 'propose_trade', give: { wood: 2 }, get: { brick: 1 } });
    assert.deepEqual(game.toView('C').tradeOffer, {
      give: { wood: 2, brick: 0, wool: 0, wheat: 0, ore: 0 },
      get: { wood: 0, brick: 1, wool: 0, wheat: 0, ore: 0 },
      responses: {},
    });

    assert.equal(game.apply('A', { type: 'respond_trade', accept: true }), 'A oferta é sua.');
    assert.equal(game.apply('C', { type: 'respond_trade', accept: true }), 'Você não tem as cartas pedidas.');
    ok(game, 'C', { type: 'respond_trade', accept: false });
    ok(game, 'B', { type: 'respond_trade', accept: true });
    assert.deepEqual(game.toView('A').tradeOffer!.responses, { C: 'declined', B: 'accepted' });

    assert.equal(game.apply('B', { type: 'confirm_trade', partnerId: 'B' }), 'Não é a sua vez.');
    assert.equal(game.apply('A', { type: 'confirm_trade', partnerId: 'C' }), 'Esse jogador não aceitou a troca.');
    ok(game, 'A', { type: 'confirm_trade', partnerId: 'B' });
    assert.deepEqual(game.players.get('A')!.resources, { wood: 1, brick: 1, wool: 0, wheat: 0, ore: 0 });
    assert.deepEqual(game.players.get('B')!.resources, { wood: 2, brick: 1, wool: 0, wheat: 0, ore: 0 });
    assert.equal(game.tradeOffer, null);
  });

  test('ofertas inválidas são recusadas', () => {
    const game = withHands();
    assert.equal(game.apply('B', { type: 'propose_trade', give: { brick: 1 }, get: { wood: 1 } }), 'Não é a sua vez.');
    assert.equal(game.apply('A', { type: 'propose_trade', give: { wood: 1 }, get: {} }), 'A troca precisa ter cartas dos dois lados.');
    assert.equal(game.apply('A', { type: 'propose_trade', give: {}, get: { ore: 1 } }), 'A troca precisa ter cartas dos dois lados.');
    assert.equal(game.apply('A', { type: 'propose_trade', give: { wood: 1 }, get: { wood: 2 } }), 'Não dá para trocar um recurso por ele mesmo.');
    assert.equal(game.apply('A', { type: 'propose_trade', give: { wood: 4 }, get: { ore: 1 } }), 'Você não tem essas cartas.');
    assert.equal(game.apply('A', { type: 'propose_trade', give: { wood: 1.5 }, get: { ore: 1 } }), 'Cartas inválidas.');
    assert.equal(game.apply('A', { type: 'propose_trade', give: 'tudo' as never, get: { ore: 1 } }), 'Cartas inválidas.');
    assert.equal(game.apply('B', { type: 'respond_trade', accept: true }), 'Não há oferta de troca.');
    assert.equal(game.apply('A', { type: 'cancel_trade' }), 'Não há oferta de troca.');
  });

  test('a confirmação revalida as mãos', () => {
    const game = withHands();
    ok(game, 'A', { type: 'propose_trade', give: { wood: 2 }, get: { brick: 1 } });
    ok(game, 'B', { type: 'respond_trade', accept: true });
    game.players.get('B')!.resources.brick = 0;
    assert.equal(game.apply('A', { type: 'confirm_trade', partnerId: 'B' }), 'O outro jogador não tem mais as cartas pedidas.');
    game.players.get('B')!.resources.brick = 1;
    game.players.get('A')!.resources.wood = 1;
    assert.equal(game.apply('A', { type: 'confirm_trade', partnerId: 'B' }), 'Você não tem mais as cartas oferecidas.');
  });

  test('nova proposta zera as respostas; cancelar e passar a vez encerram a oferta', () => {
    const game = withHands();
    ok(game, 'A', { type: 'propose_trade', give: { wood: 1 }, get: { brick: 1 } });
    ok(game, 'B', { type: 'respond_trade', accept: true });
    ok(game, 'A', { type: 'propose_trade', give: { wood: 1 }, get: { ore: 1 } });
    assert.deepEqual(game.toView('A').tradeOffer!.responses, {});
    ok(game, 'A', { type: 'cancel_trade' });
    assert.equal(game.tradeOffer, null);

    ok(game, 'A', { type: 'propose_trade', give: { wood: 1 }, get: { ore: 1 } });
    ok(game, 'A', { type: 'end_turn' });
    assert.equal(game.tradeOffer, null);
    assert.equal(game.apply('C', { type: 'respond_trade', accept: true }), 'Não há oferta de troca.');
  });
});

// Rolls (a 5) and ends the turn for whoever is playing, n times
function passTurns(game: GameState, n: number) {
  for (let i = 0; i < n; i++) {
    const p = game.currentPlayerId;
    if (game.step === 'roll') ok(game, p, { type: 'roll_dice' });
    ok(game, p, { type: 'end_turn' });
  }
}

function holdCards(game: GameState, userId: string, cards: Partial<Record<DevCardType, number>>) {
  Object.assign(game.players.get(userId)!.devCards, cards);
}

// Moves the robber to a hex nobody touches
function parkRobber(game: GameState) {
  const p = game.currentPlayerId;
  const quiet = game.legalMoves(p).robberHexes.find(h =>
    game.graph.hexVertices.get(h)!.every(v => !game.buildings.has(v)))!;
  ok(game, p, { type: 'move_robber', hexKey: quiet });
}

describe('cartas de desenvolvimento', () => {
  test('comprar custa ⛰️🐑🌾, tira do topo do baralho e só depois de rolar', () => {
    const { game } = newGame();
    playSetup(game);
    assert.equal(game.apply('A', { type: 'buy_dev_card' }), 'Role os dados primeiro.');
    ok(game, 'A', { type: 'roll_dice' });
    for (const p of game.players.values()) p.resources = { wood: 0, brick: 0, wool: 0, wheat: 0, ore: 0 };
    assert.equal(game.devDeck.length, 25);
    assert.equal(game.apply('A', { type: 'buy_dev_card' }), 'Recursos insuficientes.');

    game.devDeck = ['monopoly', 'knight'];
    give(game, 'A', { ore: 1, wool: 1, wheat: 1 });
    const bankOre = game.bank.ore;
    ok(game, 'A', { type: 'buy_dev_card' });
    assert.equal(game.players.get('A')!.devCards.knight, 1);
    assert.equal(game.bank.ore, bankOre + 1);
    assert.deepEqual(game.toView('B').players.A.devCards, null);
    assert.equal(game.toView('B').players.A.devCardCount, 1);
    assert.equal(game.toView('B').devDeckCount, 1);

    game.devDeck = [];
    give(game, 'A', { ore: 1, wool: 1, wheat: 1 });
    assert.equal(game.apply('A', { type: 'buy_dev_card' }), 'Não há mais cartas de desenvolvimento.');
  });

  test('carta comprada só joga no próximo turno, e uma carta por turno', () => {
    const { game } = emptyMainPhase();
    game.devDeck = ['knight', 'knight'];
    give(game, 'A', { ore: 2, wool: 2, wheat: 2 });
    ok(game, 'A', { type: 'buy_dev_card' });
    assert.equal(game.apply('A', { type: 'play_knight' }), 'Cartas compradas neste turno só podem ser jogadas a partir do próximo.');
    assert.deepEqual(game.legalMoves('A').devCardsToPlay, []);
    ok(game, 'A', { type: 'buy_dev_card' });
    passTurns(game, 3);

    assert.equal(game.currentPlayerId, 'A');
    assert.deepEqual(game.legalMoves('A').devCardsToPlay, ['knight']);
    assert.equal(game.apply('A', { type: 'play_monopoly', resource: 'ore' }), 'Você não tem essa carta.');
    ok(game, 'A', { type: 'play_knight' });
    parkRobber(game);
    assert.equal(game.apply('A', { type: 'play_knight' }), 'Só dá para jogar uma carta de desenvolvimento por turno.');
  });

  test('cavaleiro antes de rolar: move o ladrão sem descarte e volta para a rolagem', () => {
    const { game } = emptyMainPhase();
    passTurns(game, 3); // back to A, before rolling
    holdCards(game, 'A', { knight: 1 });
    const corner = game.graph.hexVertices.get(HILL)![0];
    game.buildings.set(corner, { owner: 'B', type: 'settlement' });
    give(game, 'B', { wool: 12 });

    ok(game, 'A', { type: 'play_knight' });
    assert.equal(game.step, 'move_robber');
    assert.deepEqual(game.toView('A').discards, {});
    ok(game, 'A', { type: 'move_robber', hexKey: HILL });
    assert.equal(game.players.get('A')!.resources.wool, 1);
    assert.equal(game.step, 'roll');
    assert.equal(game.players.get('A')!.knightsPlayed, 1);
    ok(game, 'A', { type: 'roll_dice' });
  });

  test('cavaleiro depois de rolar volta para a construção', () => {
    const { game } = emptyMainPhase();
    holdCards(game, 'A', { knight: 1 });
    ok(game, 'A', { type: 'play_knight' });
    parkRobber(game);
    assert.equal(game.step, 'main');
  });

  test('Construção de Estradas: 2 estradas grátis e o turno continua de onde parou', () => {
    const { game } = emptyMainPhase();
    holdCards(game, 'A', { road_building: 1 });
    assert.equal(game.apply('A', { type: 'play_road_building' }), 'Não há onde construir estradas.');

    const [v0, v1, v2] = path(game, game.graph.hexVertices.get(HILL)![0], 2);
    game.buildings.set(v0, { owner: 'A', type: 'settlement' });
    ok(game, 'A', { type: 'play_road_building' });
    assert.equal(game.step, 'road_building');
    assert.equal(game.toView('B').freeRoadsLeft, 2);
    assert.equal(game.apply('A', { type: 'end_turn' }), 'Coloque as estradas grátis primeiro.');

    ok(game, 'A', { type: 'build_road', edgeKey: edgeBetween(game, v0, v1) });
    ok(game, 'A', { type: 'build_road', edgeKey: edgeBetween(game, v1, v2) });
    assert.equal(game.step, 'main');
    assert.deepEqual(game.players.get('A')!.resources, { wood: 0, brick: 0, wool: 0, wheat: 0, ore: 0 });
    assert.equal(game.toView('A').players.A.piecesLeft.road, 13);
  });

  test('Construção de Estradas com uma só peça sobrando coloca uma estrada', () => {
    const { game } = emptyMainPhase();
    holdCards(game, 'A', { road_building: 1 });
    const [v0, v1] = path(game, game.graph.hexVertices.get(HILL)![0], 1);
    game.buildings.set(v0, { owner: 'A', type: 'settlement' });
    const elsewhere = [...game.graph.edges.keys()].filter(e => !game.graph.edges.get(e)!.vertices.some(v => v === v0 || v === v1));
    for (const e of elsewhere.slice(0, 14)) game.roads.set(e, 'A');

    ok(game, 'A', { type: 'play_road_building' });
    assert.equal(game.freeRoadsLeft, 1);
    ok(game, 'A', { type: 'build_road', edgeKey: edgeBetween(game, v0, v1) });
    assert.equal(game.step, 'main');
  });

  test('Invenção: 2 recursos quaisquer do banco', () => {
    const { game } = emptyMainPhase();
    holdCards(game, 'A', { year_of_plenty: 2 });
    assert.equal(game.apply('A', { type: 'play_year_of_plenty', resources: ['ore'] as never }), 'Escolha 2 recursos.');
    assert.equal(game.apply('A', { type: 'play_year_of_plenty', resources: ['ore', 'gold'] as never }), 'Escolha 2 recursos.');
    game.bank.ore = 1;
    assert.equal(game.apply('A', { type: 'play_year_of_plenty', resources: ['ore', 'ore'] }), 'O banco não tem esses recursos.');
    game.bank.ore = BANK_SIZE;
    ok(game, 'A', { type: 'play_year_of_plenty', resources: ['ore', 'ore'] });
    assert.equal(game.players.get('A')!.resources.ore, 2);
    assert.equal(game.bank.ore, BANK_SIZE - 2);
  });

  test('Monopólio: todos entregam aquele recurso', () => {
    const { game } = emptyMainPhase();
    holdCards(game, 'A', { monopoly: 1 });
    give(game, 'B', { wheat: 3, ore: 1 });
    give(game, 'C', { wheat: 2 });
    assert.equal(game.apply('A', { type: 'play_monopoly', resource: 'gold' as never }), 'Recurso inválido.');
    ok(game, 'A', { type: 'play_monopoly', resource: 'wheat' });
    assert.equal(game.players.get('A')!.resources.wheat, 5);
    assert.equal(game.players.get('B')!.resources.wheat, 0);
    assert.equal(game.players.get('B')!.resources.ore, 1);
    assert.equal(game.players.get('C')!.resources.wheat, 0);
  });
});

describe('Maior Exército', () => {
  test('3 cavaleiros dão 2 pontos; só tira quem tiver mais', () => {
    const { game } = emptyMainPhase();
    game.players.get('A')!.knightsPlayed = 2;
    holdCards(game, 'A', { knight: 1 });
    ok(game, 'A', { type: 'play_knight' });
    parkRobber(game);
    assert.equal(game.largestArmyHolder, 'A');
    assert.equal(game.victoryPoints('A'), 2);

    ok(game, 'A', { type: 'end_turn' });
    game.players.get('B')!.knightsPlayed = 2;
    holdCards(game, 'B', { knight: 2 });
    ok(game, 'B', { type: 'play_knight' }); // 3 = tie: A keeps it
    parkRobber(game);
    assert.equal(game.largestArmyHolder, 'A');

    passTurns(game, 3);
    ok(game, 'B', { type: 'play_knight' }); // 4 beats 3
    parkRobber(game);
    assert.equal(game.largestArmyHolder, 'B');
    assert.equal(game.victoryPoints('A'), 0);
  });
});

describe('Maior Estrada', () => {
  // Roads along a hex's border from corner 0 through `count` edges
  function roadsAround(game: GameState, hexKey: string, owner: string, count: number) {
    const c = game.graph.hexVertices.get(hexKey)!;
    for (let i = 0; i < count; i++) game.roads.set(edgeBetween(game, c[i], c[(i + 1) % 6]), owner);
  }

  test('primeira de 5 ganha, empate mantém, aldeia que corta passa o prêmio', () => {
    const { game } = emptyMainPhase();
    const top = game.graph.hexVertices.get('0,-2')!;
    const south = game.graph.hexVertices.get('0,1')!;

    // B: 5 roads around the south hex. A: settlement + 4 roads around the top hex, then builds a 5th
    roadsAround(game, '0,1', 'B', 5);
    game.buildings.set(top[0], { owner: 'A', type: 'settlement' });
    roadsAround(game, '0,-2', 'A', 3);
    give(game, 'A', { wood: 3, brick: 3, wool: 1, wheat: 1 });
    ok(game, 'A', { type: 'build_road', edgeKey: edgeBetween(game, top[3], top[4]) });
    assert.equal(game.longestRoadHolder, 'B'); // A has 4, B has 5
    ok(game, 'A', { type: 'build_road', edgeKey: edgeBetween(game, top[4], top[5]) });
    assert.equal(game.longestRoadHolder, 'B'); // 5 vs 5: holder keeps it
    assert.equal(game.toView('C').players.B.victoryPoints, 2);

    // A reaches the middle of B's road from outside and settles there, cutting it 2 + 3
    const outside = game.graph.vertices.get(south[2])!.adjacentVertexKeys.find(v => !south.includes(v))!;
    game.roads.set(edgeBetween(game, outside, south[2]), 'A');
    ok(game, 'A', { type: 'build_settlement', vertexKey: south[2] });
    assert.equal(game.roadLength('B'), 3);
    assert.equal(game.longestRoadHolder, 'A');
    assert.equal(game.toView('C').players.A.roadLength, 5);
  });

  test('se o dono perde a liderança e outros empatam, ninguém fica com o prêmio', () => {
    const { game } = emptyMainPhase();
    const south = game.graph.hexVertices.get('0,1')!;
    roadsAround(game, '0,1', 'B', 5);
    give(game, 'A', { wood: 1, brick: 1, wool: 1, wheat: 1 });
    const outside = game.graph.vertices.get(south[2])!.adjacentVertexKeys.find(v => !south.includes(v))!;
    game.roads.set(edgeBetween(game, outside, south[2]), 'A');
    game.longestRoadHolder = 'B';
    roadsAround(game, '0,-2', 'A', 5);
    roadsAround(game, '2,-2', 'C', 5);

    ok(game, 'A', { type: 'build_settlement', vertexKey: south[2] });
    assert.equal(game.longestRoadHolder, null);
  });
});

describe('pontos escondidos e vitória', () => {
  test('carta de ponto conta só para o dono até o fim do jogo', () => {
    const { game } = emptyMainPhase();
    holdCards(game, 'A', { victory_point: 1 });
    game.buildings.set(game.graph.hexVertices.get(HILL)![0], { owner: 'A', type: 'settlement' });
    assert.equal(game.toView('A').players.A.victoryPoints, 2);
    assert.equal(game.toView('B').players.A.victoryPoints, 1);
    assert.deepEqual(game.legalMoves('A').devCardsToPlay, []); // point cards are never played
  });

  test('comprar o ponto que faz 10 vence na hora e revela os pontos', () => {
    const { game } = emptyMainPhase();
    const spots = [...game.graph.vertices.keys()].filter((_, i) => i % 8 === 0).slice(0, 5);
    spots.forEach((v, i) => game.buildings.set(v, { owner: 'A', type: i < 4 ? 'city' : 'settlement' }));
    assert.equal(game.victoryPoints('A'), 9);
    game.devDeck = ['victory_point'];
    give(game, 'A', { ore: 1, wool: 1, wheat: 1 });

    ok(game, 'A', { type: 'buy_dev_card' });
    assert.equal(game.winnerId, 'A');
    assert.equal(game.toView('B').players.A.victoryPoints, 10);
  });

  test('quem começa o turno com 10 pontos vence', () => {
    const { game } = emptyMainPhase();
    const spots = [...game.graph.vertices.keys()].filter((_, i) => i % 8 === 0).slice(0, 5);
    spots.forEach((v, i) => game.buildings.set(v, { owner: 'B', type: i < 4 ? 'city' : 'settlement' }));
    holdCards(game, 'B', { victory_point: 1 });
    assert.equal(game.phase, 'playing'); // B has 10, but it's A's turn

    ok(game, 'A', { type: 'end_turn' });
    assert.equal(game.winnerId, 'B');
  });
});

describe('jogador que sai', () => {
  test('sair na própria vez passa a vez, devolve a mão ao banco e o jogador é pulado depois', () => {
    const { game, setDice } = emptyMainPhase();
    const corners = game.graph.hexVertices.get(HILL)!;
    game.buildings.set(corners[0], { owner: 'B', type: 'settlement' });
    game.buildings.set(corners[3], { owner: 'C', type: 'settlement' });
    ok(game, 'A', { type: 'end_turn' });
    ok(game, 'B', { type: 'roll_dice' });
    give(game, 'B', { ore: 4, wood: 1 });
    const bankOre = game.bank.ore;

    assert.equal(game.leave('B'), null);
    assert.equal(game.currentPlayerId, 'C');
    assert.equal(game.step, 'roll');
    assert.equal(game.bank.ore, bankOre + 4);
    assert.deepEqual(game.players.get('B')!.resources, { wood: 0, brick: 0, wool: 0, wheat: 0, ore: 0 });
    assert.deepEqual(game.toView('C').leftPlayers, ['B']);

    setDice([3, 3]); // the hill: B no longer produces
    ok(game, 'C', { type: 'roll_dice' });
    assert.equal(game.players.get('B')!.resources.brick, 0);
    assert.equal(game.players.get('C')!.resources.brick, 1);
    ok(game, 'C', { type: 'end_turn' });
    assert.equal(game.currentPlayerId, 'A');
    ok(game, 'A', { type: 'roll_dice' });
    ok(game, 'A', { type: 'end_turn' });
    assert.equal(game.currentPlayerId, 'C');
    assert.equal(game.apply('B', { type: 'roll_dice' }), 'Você saiu da partida.');
  });

  test('quem sai devendo descarte libera o ladrão', () => {
    const { game, setDice } = emptyMainPhase();
    passTurns(game, 3);
    give(game, 'B', { wool: 8 });
    give(game, 'C', { ore: 8 });
    setDice([3, 4]);
    ok(game, 'A', { type: 'roll_dice' });
    assert.deepEqual(game.toView('A').discards, { B: 4, C: 4 });
    ok(game, 'B', { type: 'discard', resources: { wool: 4 } });
    game.leave('C');
    assert.equal(game.step, 'move_robber');
  });

  test('o último que sobra vence', () => {
    const { game } = emptyMainPhase();
    game.leave('B');
    assert.equal(game.phase, 'playing');
    game.leave('A');
    assert.equal(game.phase, 'finished');
    assert.equal(game.winnerId, 'C');
  });

  test('quem sai durante a fundação é pulado na serpente', () => {
    const { game } = newGame();
    const order: string[] = [];
    let left = false;
    while (game.phase === 'setup') {
      const p = game.currentPlayerId;
      order.push(p);
      ok(game, p, { type: 'build_settlement', vertexKey: game.legalMoves(p).settlements[0] });
      if (p === 'B' && !left) {
        game.leave('B'); // leaves before placing the road
        left = true;
        continue;
      }
      ok(game, p, { type: 'build_road', edgeKey: game.legalMoves(p).roads[0] });
    }
    assert.deepEqual(order, ['A', 'B', 'C', 'C', 'A']);
    assert.equal(game.currentPlayerId, 'A');
    assert.equal(game.step, 'roll');
  });
});
