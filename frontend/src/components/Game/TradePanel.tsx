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
  onClose?: () => void;
}

// The current player's trades: with the bank (4:1 or port rates) and offers to the other players
export default function TradePanel({ hand, bank, bankRatios, offer, opponents, nameOf, act, onClose }: TradePanelProps) {
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
    <section className="panel trade-panel" aria-label="Comércio">
      <header className="trade-head">
        <h3>Comércio</h3>
        <div className="bank-stock" title="Cartas no banco">
          <span className="muted">Banco</span>
          {RESOURCE_ORDER.map(r => (
            <span key={r} className={`stock-chip res-${r} ${bank[r] === 0 ? 'out' : ''}`} title={`${RESOURCE_INFO[r].label}: ${bank[r]} no banco`}>
              {RESOURCE_INFO[r].emoji}<b>{bank[r]}</b>
            </span>
          ))}
        </div>
        {onClose && !offer && (
          <button className="icon-btn trade-close" onClick={onClose} aria-label="Fechar comércio">✕</button>
        )}
      </header>

      <div className="trade-cols">
        <div className="trade-col">
          <h4>Banco e portos</h4>
          <p className="muted">{bankGive
            ? <>Dar <strong>{bankRatios[bankGive]} {RESOURCE_INFO[bankGive].emoji}</strong> e receber 1 de:</>
            : 'O que você dá? (taxa de cada recurso)'}</p>
          <div className="bank-row">
            {bankGive
              ? RESOURCE_ORDER.map(r => (
                <button key={r} className={`bank-btn res-${r}`} disabled={r === bankGive || bank[r] === 0}
                  aria-label={`Receber ${RESOURCE_INFO[r].label} (banco tem ${bank[r]})`} onClick={() => tradeWithBank(r)}>
                  {RESOURCE_INFO[r].emoji}<small>receber</small>
                </button>
              ))
              : RESOURCE_ORDER.map(r => (
                <button key={r} className={`bank-btn res-${r} ${bankRatios[r] < 4 ? 'port' : ''}`} disabled={hand[r] < bankRatios[r]}
                  title={bankRatios[r] < 4 ? 'Taxa de porto' : 'Taxa do banco'}
                  aria-label={`Dar ${RESOURCE_INFO[r].label} (${bankRatios[r]} por 1)`} onClick={() => setBankGive(r)}>
                  {RESOURCE_INFO[r].emoji}<small>{bankRatios[r]}:1</small>
                </button>
              ))}
          </div>
          {bankGive && <button className="link-btn" onClick={() => setBankGive(null)}>Voltar</button>}
        </div>

        <div className="trade-col">
          <h4>Com jogadores</h4>
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
        </div>
      </div>
    </section>
  );
}
