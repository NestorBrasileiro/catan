import { useState, type FormEvent } from 'react';
import { useGame } from '../../contexts/useGame';

export default function LobbyMenu() {
  const { user, createRoom, joinRoom, switchPlayer } = useGame();
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [code, setCode] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [turnTimer, setTurnTimer] = useState(120);
  const [bots, setBots] = useState(0);
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createRoom(maxPlayers, turnTimer, Math.min(bots, maxPlayers - 1));
    } catch { /* handled */ }
    setLoading(false);
  };

  // One click to a room of 4 with three bots, ready to start
  const practice = async () => {
    setLoading(true);
    try {
      await createRoom(4, 120, 3);
    } catch { /* handled */ }
    setLoading(false);
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await joinRoom(code.toUpperCase());
    } catch { /* handled */ }
    setLoading(false);
  };

  if (mode === 'menu') {
    return (
      <div className="lobby-card glass">
        <h1>Olá, {user?.username}</h1>
        <p className="lead lobby-user">
          Crie uma partida e mande o código para a galera, ou entre com um código.{' '}
          <button className="link-btn" onClick={switchPlayer}>Trocar de jogador</button>
        </p>
        <div className="lobby-actions">
          <button onClick={() => setMode('create')}>Criar nova partida</button>
          <button className="btn-secondary" onClick={() => setMode('join')}>Entrar com código</button>
          <button className="btn-secondary" disabled={loading} onClick={practice}>🤖 Treinar contra 3 bots</button>
        </div>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="lobby-card glass">
        <h2>Nova partida</h2>
        <form onSubmit={handleCreate}>
          <label>
            Jogadores
            <select value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} jogadores{n > 4 ? ' · ilha grande' : ''}</option>)}
            </select>
          </label>
          {maxPlayers > 4 && (
            <p className="muted">Com 5 ou 6 jogadores a partida usa a ilha da expansão: 30 hexágonos, 11 portos,
              banco com 24 cartas de cada recurso e 34 cartas de desenvolvimento.</p>
          )}
          <label>
            Bots
            <select value={Math.min(bots, maxPlayers - 1)} onChange={(e) => setBots(Number(e.target.value))}>
              {Array.from({ length: maxPlayers }, (_, n) => (
                <option key={n} value={n}>{n === 0 ? 'Nenhum (só pessoas)' : `${n} ${n === 1 ? 'bot' : 'bots'}`}</option>
              ))}
            </select>
          </label>
          <label>
            Tempo por turno (segundos)
            <input type="number" value={turnTimer} onChange={(e) => setTurnTimer(Number(e.target.value))} min={30} max={600} />
          </label>
          <div className="lobby-actions two">
            <button type="button" className="btn-secondary" onClick={() => setMode('menu')}>Voltar</button>
            <button type="submit" disabled={loading}>{loading ? 'Criando…' : 'Criar'}</button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="lobby-card glass">
      <h2>Entrar em partida</h2>
      <form onSubmit={handleJoin}>
        <input
          type="text"
          className="code-input"
          placeholder="CÓDIGO"
          aria-label="Código da sala"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={5}
          autoFocus
          required
        />
        <div className="lobby-actions two">
          <button type="button" className="btn-secondary" onClick={() => setMode('menu')}>Voltar</button>
          <button type="submit" disabled={loading}>{loading ? 'Entrando…' : 'Entrar'}</button>
        </div>
      </form>
    </div>
  );
}
