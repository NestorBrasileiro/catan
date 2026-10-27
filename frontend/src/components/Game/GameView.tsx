import { useState } from 'react';
import { useGame } from '../../contexts/useGame';
import Board from '../Board/Board';
import { BUILD_COSTS, RESOURCE_INFO, RESOURCE_ORDER, type BuildKind, type GameAction } from '../Board/boardTypes';
import './GameView.css';

const BUILD_KINDS: BuildKind[] = ['road', 'settlement', 'city'];
const BUILD_LABELS: Record<BuildKind, string> = { road: 'Estrada', settlement: 'Aldeia', city: 'Cidade' };
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function costText(kind: BuildKind): string {
  return RESOURCE_ORDER
    .filter(r => BUILD_COSTS[kind][r])
    .map(r => RESOURCE_INFO[r].emoji.repeat(BUILD_COSTS[kind][r]!))
    .join('');
}

export default function GameView() {
  const { room, user, board, gameState: game, sendAction } = useGame();
  const [buildMode, setBuildMode] = useState<BuildKind | null>(null);

  if (!room || !user || !board || !game) {
    return <div className="card"><h2>🎲 Carregando tabuleiro...</h2></div>;
  }

  const nameOf = (id: string) => room.players.find(p => p.user_id === id)?.username ?? '?';
  const me = game.players[user.id];
  const isMyTurn = game.currentPlayerId === user.id && game.phase !== 'finished';
  const legal = game.legal ?? { settlements: [], roads: [], cities: [] };
  const spots: Record<BuildKind, string[]> = { road: legal.roads, settlement: legal.settlements, city: legal.cities };

  // During setup the step decides what to place; afterwards the player picks what to build
  let mode: BuildKind | null = null;
  if (isMyTurn && game.step === 'place_settlement') mode = 'settlement';
  else if (isMyTurn && game.step === 'place_road') mode = 'road';
  else if (isMyTurn && game.step === 'main') mode = buildMode;

  const act = async (action: GameAction) => {
    try {
      await sendAction(action);
      setBuildMode(null);
    } catch { /* the error banner already shows why */ }
  };

  const status = (() => {
    const current = nameOf(game.currentPlayerId);
    if (game.phase === 'finished') return `🏆 ${nameOf(game.winnerId!)} venceu a partida!`;
    if (game.phase === 'setup') {
      const what = game.step === 'place_settlement' ? 'uma aldeia' : 'uma estrada';
      return isMyTurn
        ? `Fundação (rodada ${game.setupRound}): coloque ${what}`
        : `Fundação (rodada ${game.setupRound}): ${current} coloca ${what}`;
    }
    if (!isMyTurn) return game.step === 'roll' ? `Vez de ${current}: aguardando os dados` : `Vez de ${current}`;
    if (game.step === 'roll') return 'Sua vez: role os dados';
    return mode ? `Escolha no tabuleiro onde construir: ${BUILD_LABELS[mode].toLowerCase()}` : 'Sua vez: construa ou passe a vez';
  })();

  const diceSum = game.dice ? game.dice[0] + game.dice[1] : null;

  return (
    <div className="game-layout">
      <div className="game-main">
        <div className={`status-bar ${isMyTurn || game.phase === 'finished' ? 'highlight' : ''}`} role="status">
          {status}
        </div>
        <Board
          board={board}
          game={game}
          highlightVertices={mode === 'settlement' ? spots.settlement : mode === 'city' ? spots.city : []}
          highlightEdges={mode === 'road' ? spots.road : []}
          onVertexClick={vertexKey => act(mode === 'city' ? { type: 'build_city', vertexKey } : { type: 'build_settlement', vertexKey })}
          onEdgeClick={edgeKey => act({ type: 'build_road', edgeKey })}
        />
      </div>

      <aside className="game-side">
        <section className="panel">
          <h3>Jogadores</h3>
          <ul className="score-list">
            {game.playerOrder.map(id => {
              const p = game.players[id];
              return (
                <li key={id} className={id === game.currentPlayerId && game.phase !== 'finished' ? 'current' : ''}>
                  <span className="color-dot" style={{ backgroundColor: p.color }} />
                  <span className="player-name">{nameOf(id)}{id === user.id && ' (você)'}</span>
                  <span title="Pontos de vitória">⭐ {p.victoryPoints}</span>
                  <span title="Cartas na mão">🃏 {p.resourceCount}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {game.phase !== 'setup' && (
          <section className="panel">
            <h3>Dados</h3>
            {game.dice ? (
              <div className="dice" aria-label={`Dados: ${game.dice[0]} e ${game.dice[1]}`}>
                <span aria-hidden>{DICE_FACES[game.dice[0] - 1]}{DICE_FACES[game.dice[1] - 1]}</span>
                <strong>{diceSum}</strong>
              </div>
            ) : <p className="muted">Ainda não rolados.</p>}
            {diceSum === 7 && <p className="muted">7: ninguém produz.</p>}

            {isMyTurn && game.step === 'roll' && (
              <button className="wide" onClick={() => act({ type: 'roll_dice' })}>🎲 Rolar dados</button>
            )}
            {isMyTurn && game.step === 'main' && (
              <div className="actions">
                {BUILD_KINDS.map(kind => (
                  <button key={kind}
                    className={`build-btn ${buildMode === kind ? 'active' : ''}`}
                    aria-pressed={buildMode === kind}
                    disabled={spots[kind].length === 0}
                    title={spots[kind].length === 0 ? 'Sem recursos, peças ou lugar disponível' : undefined}
                    onClick={() => setBuildMode(buildMode === kind ? null : kind)}>
                    <span>{BUILD_LABELS[kind]}</span>
                    <span className="cost">{costText(kind)}</span>
                  </button>
                ))}
                <button className="wide btn-secondary" onClick={() => act({ type: 'end_turn' })}>Passar a vez ➜</button>
              </div>
            )}
          </section>
        )}

        {me?.resources && (
          <section className="panel">
            <h3>Sua mão</h3>
            <div className="hand">
              {RESOURCE_ORDER.map(r => (
                <div key={r} className="hand-card" title={RESOURCE_INFO[r].label}>
                  <span className="hand-emoji">{RESOURCE_INFO[r].emoji}</span>
                  <strong>{me.resources![r]}</strong>
                </div>
              ))}
            </div>
            <p className="muted pieces">
              Peças: {me.piecesLeft.road} estradas · {me.piecesLeft.settlement} aldeias · {me.piecesLeft.city} cidades
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}
