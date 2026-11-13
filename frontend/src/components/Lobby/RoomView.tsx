import { useGame } from '../../contexts/useGame';

// The waiting room; once the game starts the app swaps to the game map
export default function RoomView() {
  const { room, user, leaveRoom, startGame, addBot, removeBot } = useGame();

  if (!room) return null;

  const isHost = user?.id === room.hostId;
  const empty = Math.max(0, room.maxPlayers - room.players.length);

  return (
    <div className="lobby-card glass">
      <div className="room-header">
        <h2>Sala de espera</h2>
        <span className="room-code" title="Mande este código para quem vai jogar">{room.code}</span>
      </div>
      <p className="muted">{room.players.length} de {room.maxPlayers} jogadores · compartilhe o código</p>
      <ul className="player-list">
        {room.players.map((p) => (
          <li key={p.user_id}>
            <span className="color-dot" style={{ backgroundColor: p.color }} />
            <span>{p.username}{p.user_id === user?.id && <span className="muted"> (você)</span>}</span>
            <span className="tag">
              {p.user_id === room.hostId && '👑 anfitrião'}
              {p.bot && '🤖 bot'}
              {!p.online && ' · offline'}
            </span>
            {p.bot && isHost && (
              <button className="icon-btn seat-remove" onClick={() => removeBot(p.user_id).catch(() => {})}
                aria-label={`Tirar ${p.username}`} title="Tirar o bot">✕</button>
            )}
          </li>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <li key={`empty-${i}`} className="empty">
            Aguardando jogador…
            {isHost && (
              <button className="btn-secondary add-bot" onClick={() => addBot().catch(() => {})}>+ Bot</button>
            )}
          </li>
        ))}
      </ul>
      <div className="room-actions">
        <button onClick={() => leaveRoom().catch(() => {})} className="btn-secondary">Sair</button>
        {isHost && (
          <button disabled={room.players.length < 2} onClick={() => startGame().catch(() => {})}>
            Iniciar jogo
          </button>
        )}
      </div>
      {isHost
        ? <p className="muted room-hint">Lugares vazios podem ser preenchidos por bots, que jogam sozinhos do começo ao fim.</p>
        : <p className="muted room-hint">O anfitrião começa a partida quando todos entrarem.</p>}
    </div>
  );
}
