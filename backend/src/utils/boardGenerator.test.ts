import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBoard, hasAdjacentRedNumbers } from './boardGenerator';
import { buildBoardGraph } from './boardGraph';

test('tabuleiro oficial de 19 hexágonos com as fichas certas', () => {
  const board = generateBoard();
  assert.deepEqual(board.hexes.map(h => h.terrain).sort(), [
    'desert', 'fields', 'fields', 'fields', 'fields', 'forest', 'forest', 'forest', 'forest',
    'hills', 'hills', 'hills', 'mountains', 'mountains', 'mountains', 'pasture', 'pasture', 'pasture', 'pasture',
  ]);
  assert.equal(board.hexes.find(h => h.terrain === 'desert')!.number, null);
  const numbers = board.hexes.map(h => h.number).filter(n => n !== null).sort((a, b) => a - b);
  assert.deepEqual(numbers, [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
});

test('6 e 8 nunca ficam vizinhos', () => {
  for (let i = 0; i < 300; i++) assert.equal(hasAdjacentRedNumbers(generateBoard().hexes), false);
});

test('54 interseções, 72 caminhos e 9 portos sem interseção em comum', () => {
  const board = generateBoard();
  const graph = buildBoardGraph(board.hexes);
  assert.equal(graph.vertices.size, 54);
  assert.equal(graph.edges.size, 72);

  assert.deepEqual(board.ports.map(p => p.type).sort(), ['3:1', '3:1', '3:1', '3:1', 'brick', 'ore', 'wheat', 'wood', 'wool']);
  const portVertices = board.ports.flatMap(p => {
    const corners = graph.hexVertices.get(`${p.hexQ},${p.hexR}`)!;
    return [corners[p.edgeDir], corners[(p.edgeDir + 1) % 6]];
  });
  assert.equal(new Set(portVertices).size, 18);
  for (const v of portVertices) assert.ok(graph.vertices.get(v)!.adjacentHexKeys.length < 3, 'porto fica no litoral');
});

test('5-6 jogadores: ilha da expansão com 30 hexágonos, 28 fichas e 11 portos', () => {
  const board = generateBoard(6);
  const count = (t: string) => board.hexes.filter(h => h.terrain === t).length;
  assert.equal(board.hexes.length, 30);
  assert.deepEqual(['forest', 'pasture', 'fields', 'hills', 'mountains', 'desert'].map(count), [6, 6, 6, 5, 5, 2]);
  assert.ok(board.hexes.filter(h => h.terrain === 'desert').every(h => h.number === null));
  const numbers = board.hexes.map(h => h.number).filter(n => n !== null).sort((a, b) => a - b);
  assert.deepEqual(numbers, [2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 11, 12, 12]);
  assert.equal(hasAdjacentRedNumbers(board.hexes), false);

  // rows of 3-4-5-6-5-4-3
  const rows = new Map<number, number>();
  for (const h of board.hexes) rows.set(h.r, (rows.get(h.r) ?? 0) + 1);
  assert.deepEqual([-3, -2, -1, 0, 1, 2, 3].map(r => rows.get(r)), [3, 4, 5, 6, 5, 4, 3]);

  const graph = buildBoardGraph(board.hexes);
  assert.equal(graph.vertices.size, 80);
  assert.equal(graph.edges.size, 109);
  assert.deepEqual(board.ports.map(p => p.type).sort(),
    ['3:1', '3:1', '3:1', '3:1', '3:1', 'brick', 'ore', 'wheat', 'wood', 'wool', 'wool']);
  const portVertices = board.ports.flatMap(p => {
    const corners = graph.hexVertices.get(`${p.hexQ},${p.hexR}`)!;
    return [corners[p.edgeDir], corners[(p.edgeDir + 1) % 6]];
  });
  assert.equal(new Set(portVertices).size, 22, 'portos não dividem interseções');
  for (const v of portVertices) assert.ok(graph.vertices.get(v)!.adjacentHexKeys.length < 3, 'porto fica no litoral');
});

test('até 4 jogadores continua a ilha base', () => {
  for (const players of [2, 3, 4]) assert.equal(generateBoard(players).hexes.length, 19);
  assert.equal(generateBoard(5).hexes.length, 30);
});
