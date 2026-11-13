import { useState, type FormEvent } from 'react';
import { useGame } from '../../contexts/useGame';

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
    <div className="lobby-card glass">
      <h1>Bem-vindo à ilha</h1>
      <p className="lead">Colonize, troque e construa até 10 pontos. Escolha um nome para entrar.</p>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Seu nome"
          aria-label="Seu nome"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={2}
          maxLength={20}
          autoFocus
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
