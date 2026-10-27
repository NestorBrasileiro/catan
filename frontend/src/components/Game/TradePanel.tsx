import { useState } from 'react';
import {
  NO_RESOURCES, RESOURCE_INFO, RESOURCE_ORDER, cardCount, cardsText,
  type GameAction, type ResourceType, type Resources, type TradeOffer,
} from '../Board/boardTypes';
import ResourcePicker from './ResourcePicker';

interface TradePanelProps {
  hand: Resources;
  bank: Resources;
  bankRatios: Resources;
  offer: TradeOffer | null;
  opponents: string[];
  nameOf: (id: string) => string;
  act: (action: GameAction) => Promise<boolean>;
}

// The current player's trades: with the bank (4:1 or port rates) and offers to the other players
export default function TradePanel({ hand, bank, bankRatios, offer, opponents, nameOf, act }: TradePanelProps) {
  const [bankGive, setBankGive] = useState<ResourceType | null>(null);
  const [give, setGive] = useState<Resources>(NO_RESOURCES);
  const [get, setGet] = useState<Resources>(NO_RESOURCES);

  const sameOnBothSides = RESOURCE_ORDER.some(r => give[r] > 0 && get[r] > 0);
  const handCovers = RESOURCE_ORDER.every(r => give[r] <= hand[r]);
  const canPropose = cardCount(give) > 0 && cardCount(get) > 0 && !sameOnBothSides && handCovers;

  const tradeWithBank = async (r: ResourceType) => {
    if (bankGive && await act({ type: 'bank_trade', give: bankGive, get: r })) setBankGive(null);
  };

  // Start the next offer from scratch: the hand will have changed by then
  const propose = async () => {
    if (await act({ type: 'propose_trade', give, get })) {
      setGive(NO_RESOURCES);
      setGet(NO_RESOURCES);
    }
  };

  return (
    <section className="panel">
      <h3>Comércio</h3>

      <h4>Banco e portos</h4>
      <p className="muted">{bankGive
        ? `Dar ${bankRatios[bankGive]} ${RESOURCE_INFO[bankGive].emoji} por 1 de (cartas no banco):`
        : 'Escolha o que dar:'}</p>
      <div className="bank-row">
        {bankGive
          ? RESOURCE_ORDER.map(r => (
            <button key={r} className="bank-btn" disabled={r === bankGive || bank[r] === 0}
              aria-label={`Receber ${RESOURCE_INFO[r].label} (banco tem ${bank[r]})`} onClick={() => tradeWithBank(r)}>
              {RESOURCE_INFO[r].emoji}<small>{bank[r]}</small>
            </button>
          ))
          : RESOURCE_ORDER.map(r => (
            <button key={r} className="bank-btn" disabled={hand[r] < bankRatios[r]}
              aria-label={`Dar ${RESOURCE_INFO[r].label} (${bankRatios[r]} por 1)`} onClick={() => setBankGive(r)}>
              {RESOURCE_INFO[r].emoji}<small>{bankRatios[r]}:1</small>
            </button>
          ))}
      </div>
      {bankGive && <button className="link-btn" onClick={() => setBankGive(null)}>Voltar</button>}

      <h4>Jogadores</h4>
      {offer ? (
        <>
          <p>Você dá <strong>{cardsText(offer.give)}</strong> e pede <strong>{cardsText(offer.get)}</strong></p>
          <ul className="offer-responses">
            {opponents.map(id => {
              const response = offer.responses[id];
              return (
                <li key={id}>
                  <span className="player-name">{nameOf(id)}</span>
                  {response === 'accepted' && (
                    <button onClick={() => act({ type: 'confirm_trade', partnerId: id })}>Trocar ✓</button>
                  )}
                  {response === 'declined' && <span className="muted">recusou</span>}
                  {!response && <span className="muted">aguardando…</span>}
                </li>
              );
            })}
          </ul>
          <button className="wide btn-secondary" onClick={() => act({ type: 'cancel_trade' })}>Cancelar oferta</button>
        </>
      ) : (
        <>
          <ResourcePicker label="Você dá" value={give} onChange={setGive} max={hand} />
          <p className="muted picker-title">↑ você dá · ↓ você pede</p>
          <ResourcePicker label="Você pede" value={get} onChange={setGet} />
          {sameOnBothSides && <p className="muted">Não dá para trocar um recurso por ele mesmo.</p>}
          <button className="wide" disabled={!canPropose} onClick={propose}>Propor troca</button>
        </>
      )}
    </section>
  );
}
