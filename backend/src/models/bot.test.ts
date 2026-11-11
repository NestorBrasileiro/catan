import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateBoard } from '../utils/boardGenerator';
import { nextBotMove } from './bot';
import { GameState } from './gameState';

const PLAYERS = [
  { userId: 'A', color: 'red' },
  { userId: 'B', color: 'blue' },
  { userId: 'C', color: 'white' },
];

describe('bot', () => {
  test('só joga pelos lugares que viraram bot', () => {
    const game = new GameState(generateBoard(), PLAYERS);
    assert.equal(nextBotMove(game), null);
    game.leave('B');
    assert.equal(nextBotMove(game), null); // A's turn
    game.leave('A');
    assert.deepEqual(nextBotMove(game)?.botId, 'A');
  });

  test('bots jogam partidas inteiras só com jogadas válidas, até alguém vencer', () => {
    for (let round = 0; round < 5; round++) {
      const game = new GameState(generateBoard(), PLAYERS);
      for (const p of PLAYERS) game.leave(p.userId);
      let moves = 0;
      for (let move = nextBotMove(game); move; move = nextBotMove(game)) {
        assert.equal(game.apply(move.botId, move.action), null, JSON.stringify(move));
        assert.ok(++moves < 50_000, 'a partida não termina');
      }
      assert.equal(game.phase, 'finished');
      assert.equal(game.victoryPoints(game.winnerId!) >= 10, true);
    }
  });

  test('recusa ofertas de troca e descarta quando sai 7', () => {
    const game = new GameState(generateBoard(), PLAYERS, () => [3, 4]);
    for (const p of PLAYERS) game.leave(p.userId);
    while (game.phase === 'setup') {
      const move = nextBotMove(game)!;
      game.apply(move.botId, move.action);
    }
    game.bots.delete('A'); // A is human again and rolls a 7
    Object.assign(game.players.get('B')!.resources, { wood: 5, ore: 5 });
    assert.equal(game.apply('A', { type: 'roll_dice' }), null);
    const discard = nextBotMove(game)!;
    assert.equal(discard.botId, 'B');
    assert.equal(discard.action.type, 'discard');
    assert.equal(game.apply(discard.botId, discard.action), null);
    assert.equal(game.pendingDiscards.has('B'), false);
  });
});
