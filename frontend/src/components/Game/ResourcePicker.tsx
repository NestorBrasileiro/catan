import { RESOURCE_INFO, RESOURCE_ORDER, cardCount, type Resources } from '../Board/boardTypes';

interface ResourcePickerProps {
  label: string;                 // what is being picked, for screen readers
  value: Resources;
  onChange: (next: Resources) => void;
  max?: Resources;               // per-resource cap, shown under each column (e.g. the player's hand)
  maxTotal?: number;             // cap on the sum
}

// One column per resource: + / count / −
export default function ResourcePicker({ label, value, onChange, max, maxTotal }: ResourcePickerProps) {
  const full = maxTotal !== undefined && cardCount(value) >= maxTotal;

  return (
    <div className="picker" role="group" aria-label={label}>
      {RESOURCE_ORDER.map(r => {
        const name = RESOURCE_INFO[r].label;
        const cap = max ? max[r] : Infinity;
        return (
          <div key={r} className="picker-col">
            <span className="picker-emoji" title={name}>{RESOURCE_INFO[r].emoji}</span>
            <button className="stepper" aria-label={`${label}: mais ${name}`}
              disabled={full || value[r] >= cap} onClick={() => onChange({ ...value, [r]: value[r] + 1 })}>+</button>
            <strong aria-label={`${value[r]} ${name}`}>{value[r]}</strong>
            <button className="stepper" aria-label={`${label}: menos ${name}`}
              disabled={value[r] === 0} onClick={() => onChange({ ...value, [r]: value[r] - 1 })}>−</button>
            {max && <span className="picker-cap">de {max[r]}</span>}
          </div>
        );
      })}
    </div>
  );
}
