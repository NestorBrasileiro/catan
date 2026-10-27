import { RESOURCE_ORDER, cardsText, type GameAction, type Resources, type TradeOffer } from '../Board/boardTypes';

interface IncomingOfferProps {
  offer: TradeOffer;
  fromName: string;
  myId: string;
  hand: Resources;
  act: (action: GameAction) => Promise<boolean>;
}

// Shown to the other players while the current player has an offer on the table
export default function IncomingOffer({ offer, fromName, myId, hand, act }: IncomingOfferProps) {
  const response = offer.responses[myId];
  const canPay = RESOURCE_ORDER.every(r => hand[r] >= offer.get[r]);

  return (
    <section className="panel panel-alert">
      <h3>Proposta de {fromName}</h3>
      <p>Dá <strong>{cardsText(offer.give)}</strong></p>
      <p>Pede <strong>{cardsText(offer.get)}</strong></p>
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
