import { useEffect, useState } from 'react';
import './Dice.css';

// How long the dice tumble before showing the result; the dice sound lasts about as long
export const DICE_ROLL_MS = 850;

// Cells of a 3×3 grid that hold a pip, for faces 1 to 6
const PIPS = [[4], [2, 6], [2, 4, 6], [0, 2, 6, 8], [0, 2, 4, 6, 8], [0, 2, 3, 5, 6, 8]];

function randomFace() {
  return 1 + Math.floor(Math.random() * 6);
}

function Die({ value, color }: { value: number; color: 'red' | 'yellow' }) {
  return (
    <span className={`die die-${color}`}>
      {Array.from({ length: 9 }, (_, cell) => (
        <span key={cell} className={PIPS[value - 1].includes(cell) ? 'pip' : undefined} />
      ))}
    </span>
  );
}

interface DiceProps {
  dice: [number, number] | null;
  rolling: boolean;
}

export default function Dice({ dice, rolling }: DiceProps) {
  const [faces, setFaces] = useState<[number, number]>(() => [randomFace(), randomFace()]);

  useEffect(() => {
    if (!rolling) return;
    const timer = setInterval(() => setFaces([randomFace(), randomFace()]), 90);
    return () => clearInterval(timer);
  }, [rolling]);

  const shown = rolling ? faces : dice;
  if (!shown) return null; // nobody has rolled yet

  const sum = shown[0] + shown[1];
  return (
    <div className={`dice-tray ${rolling ? 'rolling' : 'landed'}`} role="status">
      <Die value={shown[0]} color="red" />
      <Die value={shown[1]} color="yellow" />
      {!rolling && <span className={`dice-sum ${sum === 7 ? 'seven' : ''}`} aria-hidden>{sum}</span>}
      <span className="sr-only">{rolling ? 'Rolando os dados' : `Dados: ${shown[0]} e ${shown[1]}, soma ${sum}`}</span>
    </div>
  );
}
