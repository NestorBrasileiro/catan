import { useState } from 'react';
import { isMuted, playSound, setMuted } from '../../services/sound';

export default function SoundToggle() {
  const [muted, setMutedState] = useState(isMuted);

  const toggle = () => {
    setMuted(!muted);
    setMutedState(!muted);
    if (muted) playSound('card'); // a sample, so the player hears it's back on
  };

  const label = muted ? 'Ligar som' : 'Desligar som';
  return (
    <button className="sound-toggle btn-secondary" onClick={toggle} aria-label={label} title={label}>
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
