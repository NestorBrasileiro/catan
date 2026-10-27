import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BoardData, RESOURCES, generateBoard } from '../utils/boardGenerator';
import { BANK_SIZE, GameAction, GameState, Resources } from './gameState';

const PLAYERS = [
  { userId: 'A', color: 'red' },
  { userId: 'B', color: 'blue' },
  { userId: 'C', color: 'white' },
];

// Center is the desert, hexes[1] = (0,-1) is a hill with a 6, every other hex is a field with a 12,
// so rolling a 6 only ever produces brick from that one hex.
function fixedBoard(): BoardData {
  const board = generateBoard();
  board.hexes = board.hexes.map((h, i) => {
    if (i === 0) return { ...h, terrain: 'desert', number: null };
    if (i === 1) return { ...h, terrain: 'hills', number: 6 };
    return { ...h, terrain: 'fields', number: 12 };
  });
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
