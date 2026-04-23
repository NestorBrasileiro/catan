import { useGame } from './contexts/GameContext';
import RegisterForm from './components/Lobby/RegisterForm';
import LobbyMenu from './components/Lobby/LobbyMenu';
import RoomView from './components/Lobby/RoomView';
import './App.css';

function App() {
  const { user, room, connected, error, clearError } = useGame();

  return (
    <div className="app">
      <header className="app-header">
        <h1>🏝️ Catan dos Crias</h1>
        <span className={`status ${connected ? 'online' : 'offline'}`}>
          {connected ? '🟢 Online' : '🔴 Offline'}
        </span>
      </header>

      {error && (
        <div className="error-banner" onClick={clearError}>
          ⚠️ {error} <small>(clique para fechar)</small>
        </div>
      )}

      <main>
        {!user && <RegisterForm />}
        {user && !room && <LobbyMenu />}
        {user && room && <RoomView />}
      </main>
    </div>
  );
}

export default App;
