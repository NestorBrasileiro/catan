import { useEffect, useState } from 'react';
import type { GameView } from '../Board/boardTypes';
import { DICE_ROLL_MS } from './Dice';

// While the dice tumble, the table keeps showing how it was before the roll, so the outcome
// (cards handed out, the robber) appears when the dice land rather than before them
export function useRollReveal(game: GameView | null): { view: GameView | null; rolling: boolean } {
  const [seen, setSeen] = useState(game);
  const [held, setHeld] = useState<GameView | null>(null); // the table before the roll

  // Adjusting state while rendering (instead of in an effect) avoids flashing the outcome for a frame
  if (game !== seen) {
    setSeen(game);
    if (game && seen && !held && game.rollCount > seen.rollCount) setHeld(seen);
  }

  useEffect(() => {
    if (!held) return;
    const timer = setTimeout(() => setHeld(null), DICE_ROLL_MS);
    return () => clearTimeout(timer);
  }, [held]);

  return held && game ? { view: held, rolling: true } : { view: game, rolling: false };
}
