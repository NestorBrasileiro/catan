import { useGame } from '../../contexts/GameContext';
import Board from '../Board/Board';

export default function RoomView() {
  const { room, user, leaveRoom, startGame, board, gameState, buildSettlement, buildRoad } = useGame();

  if (!room) return null;

  const isHost = user?.id === room.hostId;
  const isPlaying = room.status === 'playing';

  if (isPlaying && board) {
    const isMyTurn = gameState?.currentPlayerId === user?.id;
    const currentPlayer = gameState ? room.players.find(p => p.user_id === gameState.currentPlayerId) : null;
    const myResources = gameState && user ? gameState.players[user.id]?.resources : null;

    return (
      <div>
        {/* Turn info banner */}
        {gameState && (
          <div className="card" style={{ marginBottom: '0.5rem', padding: '0.8rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                {gameState.phase === 'setup' && (
                  <span>
                    🏗️ Fase de Fundação (Rodada {gameState.setupRound})
                    {' — '}
                    {isMyTurn ? (
                      <strong style={{ color: '#e94560' }}>
                        Sua vez! {gameState.setupStep === 'settlement' ? 'Coloque uma aldeia' : 'Coloque uma estrada'}
                      </strong>
                    ) : (
                      <span>Vez de <strong>{currentPlayer?.username}</strong></span>
                    )}
                  </span>
                )}
                {gameState.phase === 'playing' && (
                  <span>🎲 Jogo em andamento</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {room.players.map((p) => {
                  const pState = gameState.players[p.user_id];
                  const isCurrent = p.user_id === gameState.currentPlayerId;
                  return (
                    <div key={p.user_id} style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '2px 8px', borderRadius: '6px',
                      background: isCurrent ? 'rgba(233,69,96,0.3)' : 'transparent',
                      border: isCurrent ? '1px solid #e94560' : '1px solid transparent',
                    }}>
                      <span className="color-dot" style={{ backgroundColor: p.color, width: 10, height: 10 }} />
                      <span style={{ fontSize: '0.75rem' }}>{p.username}</span>
                      {pState && <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>({pState.victoryPoints}PV)</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <Board
          board={board}
          gameState={gameState}
          myUserId={user?.id ?? null}
          onVertexClick={buildSettlement}
          onEdgeClick={buildRoad}
        />

        {/* My resources */}
        {myResources && (
          <div className="card" style={{ marginTop: '0.5rem', padding: '0.8rem 1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              {(['wood', 'brick', 'wool', 'wheat', 'ore'] as const).map(r => (
                <div key={r} style={{ textAlign: 'center', minWidth: 50 }}>
                  <div style={{ fontSize: '1.2rem' }}>{resourceEmoji(r)}</div>
                  <div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>{myResources[r]}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isPlaying) {
    return (
      <div className="card">
        <h2>🎲 Carregando tabuleiro...</h2>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Sala: <span className="room-code">{room.code}</span></h2>
      <p>Jogadores: {room.players.length} / {room.maxPlayers}</p>
      <ul className="player-list">
        {room.players.map((p) => (
          <li key={p.user_id}>
            <span className="color-dot" style={{ backgroundColor: p.color }} />
            {p.username}
            {p.user_id === room.hostId && ' 👑'}
            {p.user_id === user?.id && ' (você)'}
          </li>
        ))}
      </ul>
      <div className="room-actions">
        {isHost && (
          <button disabled={room.players.length < 2} onClick={startGame}>
            🎲 Iniciar Jogo
          </button>
        )}
        <button onClick={leaveRoom} className="btn-secondary">Sair da Sala</button>
      </div>
    </div>
  );
}

function resourceEmoji(r: string): string {
  const map: Record<string, string> = { wood: '🌲', brick: '🧱', wool: '🐑', wheat: '🌾', ore: '⛰️' };
  return map[r] || '?';
}
