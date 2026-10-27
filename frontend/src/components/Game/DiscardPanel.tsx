import { useState } from 'react';
import { NO_RESOURCES, cardCount, type Resources } from '../Board/boardTypes';
import ResourcePicker from './ResourcePicker';

interface DiscardPanelProps {
  hand: Resources;
  owed: number;
  onConfirm: (cards: Resources) => void;
}

export default function DiscardPanel({ hand, owed, onConfirm }: DiscardPanelProps) {
  const [chosen, setChosen] = useState<Resources>(NO_RESOURCES);
  const total = cardCount(chosen);

  return (
    <section className="panel panel-alert">
      <h3>Descarte {owed} cartas</h3>
      <p className="muted">Saiu 7 e você tem mais de 7 cartas: escolha metade para devolver ao banco.</p>
      <ResourcePicker label="Descartar" value={chosen} onChange={setChosen} max={hand} maxTotal={owed} />
      <button className="wide" disabled={total !== owed} onClick={() => onConfirm(chosen)}>
        Descartar {total}/{owed}
      </button>
    </section>
  );
}
