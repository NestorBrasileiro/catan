import { useState, type FormEvent } from 'react';
import { useGame } from '../../contexts/GameContext';

export default function RegisterForm() {
  const { register } = useGame();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(username);
    } catch { /* error handled by context */ }
    setLoading(false);
  };

  return (
    <div className="card">
      <h2>🏝️ Catan dos Crias</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Seu nome"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={2}
          maxLength={20}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}

