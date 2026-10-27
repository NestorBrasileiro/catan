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
