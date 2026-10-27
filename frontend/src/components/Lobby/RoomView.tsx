import { useGame } from '../../contexts/useGame';
import GameView from '../Game/GameView';

export default function RoomView() {
  const { room, user, leaveRoom, startGame } = useGame();

  if (!room) return null;
  if (room.status !== 'waiting') return <GameView />;

  const isHost = user?.id === room.hostId;

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
            {!p.online && <span className="muted"> · offline</span>}
          </li>
        ))}
      </ul>
      <div className="room-actions">
        {isHost && (
          <button disabled={room.players.length < 2} onClick={() => startGame().catch(() => {})}>
            🎲 Iniciar Jogo
          </button>
        )}
        <button onClick={() => leaveRoom().catch(() => {})} className="btn-secondary">Sair da Sala</button>
      </div>
    </div>
  );
}
