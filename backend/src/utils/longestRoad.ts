import { BoardGraph } from './boardGraph';

// Length of a player's longest continuous road: a route that never reuses a road segment
// (loops and forks are fine) and cannot pass through an opponent's settlement or city.
export function longestRoad(
  graph: BoardGraph,
  roads: ReadonlyMap<string, string>,               // edgeKey → owner
  buildings: ReadonlyMap<string, { owner: string }>, // vertexKey → building
  userId: string,
): number {
  const used = new Set<string>();
  const cutsRoad = (vertexKey: string) => {
    const owner = buildings.get(vertexKey)?.owner;
    return owner !== undefined && owner !== userId;
  };

  const walk = (vertexKey: string): number => {
    let best = 0;
    for (const edgeKey of graph.vertices.get(vertexKey)!.adjacentEdgeKeys) {
      if (roads.get(edgeKey) !== userId || used.has(edgeKey)) continue;
      const [a, b] = graph.edges.get(edgeKey)!.vertices;
      const next = a === vertexKey ? b : a;
      used.add(edgeKey);
      best = Math.max(best, 1 + (cutsRoad(next) ? 0 : walk(next)));
      used.delete(edgeKey);
    }
    return best;
  };

  let longest = 0;
  for (const [edgeKey, owner] of roads) {
    if (owner !== userId) continue;
    for (const start of graph.edges.get(edgeKey)!.vertices) longest = Math.max(longest, walk(start));
  }
  return longest;
}
