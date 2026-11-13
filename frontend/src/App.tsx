import { lazy, Suspense, useState } from 'react';
import { useGame } from './contexts/useGame';
import { demoBoard } from './components/Board3D/demoBoard';
import MapToolbar from './components/HUD/MapToolbar';
import { useHudPadding } from './components/HUD/useHudPadding';
import RegisterForm from './components/Lobby/RegisterForm';
import LobbyMenu from './components/Lobby/LobbyMenu';
import RoomView from './components/Lobby/RoomView';
import GameView from './components/Game/GameView';
import { useGraphics } from './services/graphics';
import './components/HUD/hud.css';
import './App.css';

const Board3D = lazy(() => import('./components/Board3D/Board3D'));

function App() {
  const { user, room, connected, resuming, error, clearError } = useGame();
  const { view } = useGraphics();
  const [backdrop] = useState(demoBoard);
  const inGame = !!room && room.status !== 'waiting';
  const padding = useHudPadding('lobby');

  return (
    <div className="app-shell">
      {inGame ? <GameView /> : (
        <>
          {/* The lobby floats over an island turning slowly in the sea */}
          {view === '3d'
            ? <Suspense fallback={<div className="backdrop-fallback" />}><Board3D board={backdrop} backdrop padding={padding} /></Suspense>
            : <div className="backdrop-fallback" />}

          <header className="lobby-topbar">
            <div className="brand glass">
              <span className="brand-mark" aria-hidden>⬢</span>
              <span>Catan dos Crias</span>
              <span className={`connection ${connected ? '' : 'offline'}`}>{connected ? 'online' : 'offline'}</span>
            </div>
            <MapToolbar />
          </header>

          <main className="lobby-stage">
            {resuming && <div className="lobby-card glass"><h2>Reconectando…</h2><p className="muted">Voltando para onde você estava.</p></div>}
            {!resuming && !user && <RegisterForm />}
            {!resuming && user && !room && <LobbyMenu />}
            {!resuming && user && room && <RoomView />}
          </main>
        </>
      )}

      {error && (
        <div className="toast glass" role="alert" onClick={clearError}>
          ⚠️ <span>{error}</span> <small>(toque para fechar)</small>
        </div>
      )}
    </div>
  );
}

export default App;
