import { useState, type FormEvent } from 'react';
import { useGame } from '../../contexts/GameContext';

export default function LobbyMenu() {
  const { createRoom, joinRoom } = useGame();
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [code, setCode] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [turnTimer, setTurnTimer] = useState(120);
  const [loading, setLoading] = useState(false);
  const [createdCode, setCreatedCode] = useState('');

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const roomCode = await createRoom(maxPlayers, turnTimer);
      setCreatedCode(roomCode);
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

  if (createdCode) {
    return null; // room_state_updated will trigger room view
  }

  if (mode === 'menu') {
    return (
      <div className="card">
        <h2>Lobby</h2>
        <button onClick={() => setMode('create')}>🏗️ Criar Nova Partida</button>
        <button onClick={() => setMode('join')}>🚪 Entrar em Partida</button>
      </div>
    );
  }

  if (mode === 'create') {
    return (
      <div className="card">
        <h2>Criar Sala</h2>
        <form onSubmit={handleCreate}>
          <label>
            Jogadores (2-6):
            <select value={maxPlayers} onChange={(e) => setMaxPlayers(Number(e.target.value))}>
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <label>
            Tempo por turno (s):
            <input type="number" value={turnTimer} onChange={(e) => setTurnTimer(Number(e.target.value))} min={30} max={600} />
          </label>
          <button type="submit" disabled={loading}>{loading ? 'Criando...' : 'Criar'}</button>
          <button type="button" onClick={() => setMode('menu')}>Voltar</button>
        </form>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Entrar em Sala</h2>
      <form onSubmit={handleJoin}>
        <input
          type="text"
          placeholder="Código da sala"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={5}
          required
        />
        <button type="submit" disabled={loading}>{loading ? 'Entrando...' : 'Entrar'}</button>
        <button type="button" onClick={() => setMode('menu')}>Voltar</button>
      </form>
    </div>
  );
}

