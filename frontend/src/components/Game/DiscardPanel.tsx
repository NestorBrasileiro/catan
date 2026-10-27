import { useState } from 'react';
import { RESOURCE_INFO, RESOURCE_ORDER, type Resources } from '../Board/boardTypes';

interface DiscardPanelProps {
  hand: Resources;
  owed: number;
  onConfirm: (cards: Resources) => void;
}

const NONE: Resources = { wood: 0, brick: 0, wool: 0, wheat: 0, ore: 0 };

export default function DiscardPanel({ hand, owed, onConfirm }: DiscardPanelProps) {
  const [chosen, setChosen] = useState<Resources>(NONE);
  const total = RESOURCE_ORDER.reduce((sum, r) => sum + chosen[r], 0);
  const change = (r: keyof Resources, delta: number) =>
    setChosen(c => ({ ...c, [r]: Math.min(hand[r], Math.max(0, c[r] + delta)) }));

  return (
    <section className="panel panel-alert">
      <h3>Descarte {owed} cartas</h3>
      <p className="muted">Saiu 7 e você tem mais de 7 cartas: escolha metade para devolver ao banco.</p>
      <ul className="discard-list">
        {RESOURCE_ORDER.map(r => (
          <li key={r}>
            <span className="discard-label">{RESOURCE_INFO[r].emoji} {RESOURCE_INFO[r].label} <span className="muted">({hand[r]})</span></span>
            <button className="stepper" aria-label={`Devolver ${RESOURCE_INFO[r].label}`}
              disabled={chosen[r] === 0} onClick={() => change(r, -1)}>−</button>
            <strong>{chosen[r]}</strong>
            <button className="stepper" aria-label={`Descartar ${RESOURCE_INFO[r].label}`}
              disabled={chosen[r] >= hand[r] || total >= owed} onClick={() => change(r, 1)}>+</button>
          </li>
        ))}
      </ul>
      <button className="wide" disabled={total !== owed} onClick={() => onConfirm(chosen)}>
        Descartar {total}/{owed}
      </button>
    </section>
  );
}
