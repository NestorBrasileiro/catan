import { RESOURCE_ORDER, cardsText, type GameAction, type Resources, type TradeOffer } from '../Board/boardTypes';

interface IncomingOfferProps {
  offer: TradeOffer;
  fromName: string;
  fromColor: string;
  myId: string;
  hand: Resources;
  act: (action: GameAction) => Promise<boolean>;
}

// Shown to the other players while the current player has an offer on the table
export default function IncomingOffer({ offer, fromName, fromColor, myId, hand, act }: IncomingOfferProps) {
  const response = offer.responses[myId];
  const canPay = RESOURCE_ORDER.every(r => hand[r] >= offer.get[r]);

  return (
    <section className="panel panel-alert incoming-offer" aria-label={`Proposta de ${fromName}`}>
      <h3><span className="color-dot" style={{ backgroundColor: fromColor }} /> Proposta de {fromName}</h3>
      <div className="offer-swap">
        <div><small>Você recebe</small><strong>{cardsText(offer.give)}</strong></div>
        <span className="offer-arrow" aria-hidden>⇄</span>
        <div><small>Você dá</small><strong>{cardsText(offer.get)}</strong></div>
      </div>
      {response === 'accepted' && <p className="muted">Você aceitou. Aguardando {fromName} confirmar.</p>}
      {response === 'declined' && <p className="muted">Você recusou.</p>}
      {!canPay && <p className="muted">Você não tem as cartas pedidas.</p>}
      <div className="offer-actions">
        <button disabled={!canPay || response === 'accepted'}
          onClick={() => act({ type: 'respond_trade', accept: true })}>Aceitar</button>
        <button className="btn-secondary" disabled={response === 'declined'}
          onClick={() => act({ type: 'respond_trade', accept: false })}>Recusar</button>
      </div>
    </section>
  );
}
