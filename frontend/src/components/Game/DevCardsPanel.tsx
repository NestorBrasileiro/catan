import { useState } from 'react';
import {
  DEV_CARD_INFO, DEV_CARD_ORDER, NO_RESOURCES, RESOURCE_INFO, RESOURCE_ORDER, cardCount,
  type DevCards, type GameAction, type PlayableDevCard, type ResourceType, type Resources,
} from '../Board/boardTypes';
import ResourcePicker from './ResourcePicker';

interface DevCardsPanelProps {
  cards: DevCards;
  newCards: DevCards;
  playable: PlayableDevCard[]; // what the server allows right now
  alreadyPlayed: boolean;
  bank: Resources;
  act: (action: GameAction) => Promise<boolean>;
}

// The player's own development cards, with the choices Invenção and Monopólio need
export default function DevCardsPanel({ cards, newCards, playable, alreadyPlayed, bank, act }: DevCardsPanelProps) {
  const [choosing, setChoosing] = useState<'year_of_plenty' | 'monopoly' | null>(null);
  const [picks, setPicks] = useState<Resources>(NO_RESOURCES);

  const play = async (card: PlayableDevCard) => {
    if (card === 'knight') await act({ type: 'play_knight' });
    else if (card === 'road_building') await act({ type: 'play_road_building' });
    else setChoosing(choosing === card ? null : card);
  };

  const takeFromBank = async () => {
    const chosen = RESOURCE_ORDER.flatMap(r => Array<ResourceType>(picks[r]).fill(r)) as [ResourceType, ResourceType];
    if (await act({ type: 'play_year_of_plenty', resources: chosen })) {
      setChoosing(null);
      setPicks(NO_RESOURCES);
    }
  };

  const monopolize = async (resource: ResourceType) => {
    if (await act({ type: 'play_monopoly', resource })) setChoosing(null);
  };

  return (
    <section className="panel">
      <h3>Cartas de desenvolvimento</h3>
      <ul className="dev-cards">
        {DEV_CARD_ORDER.filter(card => cards[card] > 0).map(card => {
          const info = DEV_CARD_INFO[card];
          const canPlay = card !== 'victory_point' && playable.includes(card);
          return (
            <li key={card}>
              <span className="dev-emoji" aria-hidden>{info.emoji}</span>
              <div className="dev-text">
                <strong>{info.label}{cards[card] > 1 && ` ×${cards[card]}`}</strong>
                <span className="muted">{info.hint}</span>
                {newCards[card] > 0 && <span className="muted">{newCards[card]} comprada(s) agora: só no próximo turno</span>}
              </div>
              {canPlay && (
                <button className={`play-btn ${choosing === card ? 'active' : ''}`}
                  onClick={() => play(card as PlayableDevCard)}>Jogar</button>
              )}
            </li>
          );
        })}
      </ul>
      {alreadyPlayed && <p className="muted">Você já jogou uma carta neste turno.</p>}

      {choosing === 'year_of_plenty' && (
        <div className="dev-choice">
          <p>Escolha 2 recursos do banco:</p>
          <ResourcePicker label="Pegar do banco" value={picks} onChange={setPicks} max={bank} maxTotal={2} />
          <button className="wide" disabled={cardCount(picks) !== 2} onClick={takeFromBank}>Pegar</button>
        </div>
      )}
      {choosing === 'monopoly' && (
        <div className="dev-choice">
          <p>Qual recurso todos vão te entregar?</p>
          <div className="bank-row">
            {RESOURCE_ORDER.map(r => (
              <button key={r} className="bank-btn" aria-label={RESOURCE_INFO[r].label} onClick={() => monopolize(r)}>
                {RESOURCE_INFO[r].emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
