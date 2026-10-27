import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBoard } from './boardGenerator';
import { buildBoardGraph } from './boardGraph';
import { longestRoad } from './longestRoad';

const graph = buildBoardGraph(generateBoard().hexes);
const CENTER = graph.hexVertices.get('0,0')!; // its corners all have a third road going outward

function edge(v1: string, v2: string): string {
  return graph.vertices.get(v1)!.adjacentEdgeKeys.find(e => graph.edges.get(e)!.vertices.includes(v2))!;
}

// Roads along the center hex's border, from corner 0 through `count` edges
function around(count: number): Map<string, string> {
  const roads = new Map<string, string>();
  for (let i = 0; i < count; i++) roads.set(edge(CENTER[i], CENTER[(i + 1) % 6]), 'A');
  return roads;
}

function spokeFrom(corner: string): string {
  const outside = graph.vertices.get(corner)!.adjacentVertexKeys.find(v => !CENTER.includes(v))!;
  return edge(corner, outside);
}

const none = new Map<string, { owner: string }>();

test('estrada reta conta cada trecho', () => {
  assert.equal(longestRoad(graph, around(5), none, 'A'), 5);
  assert.equal(longestRoad(graph, around(5), none, 'B'), 0);
});

test('laço completo vale 6 e uma cauda no laço soma', () => {
  const loop = around(6);
  assert.equal(longestRoad(graph, loop, none, 'A'), 6);
  loop.set(spokeFrom(CENTER[0]), 'A');
  assert.equal(longestRoad(graph, loop, none, 'A'), 7);
});

test('bifurcação não soma os dois galhos', () => {
  const roads = around(3); // c0-c1-c2-c3
  roads.set(spokeFrom(CENTER[1]), 'A');
  assert.equal(longestRoad(graph, roads, none, 'A'), 3);
});

test('construção adversária corta a estrada; a própria não', () => {
  const roads = around(5); // c0..c5
  assert.equal(longestRoad(graph, roads, new Map([[CENTER[2], { owner: 'B' }]]), 'A'), 3);
  assert.equal(longestRoad(graph, roads, new Map([[CENTER[2], { owner: 'A' }]]), 'A'), 5);
});
