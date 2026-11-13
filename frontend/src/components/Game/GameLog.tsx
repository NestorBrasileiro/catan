import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  DEV_CARD_INFO, RESOURCE_INFO, RESOURCE_ORDER, TERRAIN_LABELS,
  type BoardData, type LogEntry, type ResourceType, type Resources,
} from '../Board/boardTypes';
import { ChevronIcon } from '../HUD/icons';

interface GameLogProps {
  log: LogEntry[];
  board: BoardData;
  myId: string;
  nameOf: (id: string) => string;
  colorOf: (id: string) => string;
}

const time = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function cards(hand: Resources) {
  return RESOURCE_ORDER.filter(r => hand[r] > 0).map(r => `${hand[r]}${RESOURCE_INFO[r].emoji}`).join(' ');
}

const emoji = (r: ResourceType) => RESOURCE_INFO[r].emoji;

// Every action on the table, as it happens: the game's running commentary
export default function GameLog({ log, board, myId, nameOf, colorOf }: GameLogProps) {
  const [open, setOpen] = useState(true);
  const list = useRef<HTMLOListElement>(null);
  const pinned = useRef(true); // following the newest line until the player scrolls up to read

  useEffect(() => {
    const el = list.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [log, open]);

  const hexAt = new Map(board.hexes.map(h => [`${h.q},${h.r}`, h]));
  const hexLabel = (key: string) => {
    const hex = hexAt.get(key);
    if (!hex) return '';
    return `${TERRAIN_LABELS[hex.terrain]}${hex.number ? ` ${hex.number}` : ''}`;
  };
  // the up to three hexes around a corner, e.g. "🌲8 · 🧱5"
  const cornerLabel = (vertexKey: string) => {
    const [q, r, dir] = vertexKey.split(',');
    const Q = Number(q);
    const R = Number(r);
    const keys = dir === 'T'
      ? [`${Q},${R}`, `${Q},${R - 1}`, `${Q + 1},${R - 1}`]
      : [`${Q},${R}`, `${Q},${R + 1}`, `${Q - 1},${R + 1}`];
    return keys.filter(k => hexAt.has(k)).map(hexLabel).join(' · ');
  };

  const who = (id: string | null, start = true) =>
    id === null ? '' : id === myId ? (start ? 'Você' : 'você') : nameOf(id);
  const name = (id: string | null, start = true) =>
    id === null ? null : <strong style={{ '--c': colorOf(id) } as CSSProperties} className="log-name">{who(id, start)}</strong>;

  const describe = (entry: LogEntry): ReactNode => {
    const e = entry.event;
    const actor = name(entry.userId);
    switch (e.type) {
      case 'start': return <>Partida começou. {name(e.firstId)} abre a fundação.</>;
      case 'place_settlement': return <>{actor} colocou uma aldeia <span className="log-place">{cornerLabel(e.vertexKey)}</span></>;
      case 'build_settlement': return <>{actor} construiu uma aldeia <span className="log-place">{cornerLabel(e.vertexKey)}</span></>;
      case 'build_city': return <>{actor} fez uma cidade <span className="log-place">{cornerLabel(e.vertexKey)}</span></>;
      case 'place_road': return <>{actor} colocou uma estrada</>;
      case 'build_road': return <>{actor} construiu uma estrada</>;
      case 'free_road': return <>{actor} construiu uma estrada grátis</>;
      case 'roll': {
        const sum = e.dice[0] + e.dice[1];
        return <>{actor} rolou {e.dice[0]} + {e.dice[1]} = <b className={sum === 7 ? 'log-seven' : 'log-sum'}>{sum}</b></>;
      }
      case 'produce': {
        const byPlayer = new Map<string, string[]>();
        for (const g of e.gains) byPlayer.set(g.userId, [...(byPlayer.get(g.userId) ?? []), `+${g.amount}${emoji(g.resource)}`]);
        return (
          <>Produção: {[...byPlayer].map(([id, gains], i) => (
            <span key={id}>{i > 0 && ' · '}{name(id)} {gains.join(' ')}</span>
          ))}</>
        );
      }
      case 'discard': return <>{actor} descartou {e.count} {e.count === 1 ? 'carta' : 'cartas'}</>;
      case 'robber': return <>{actor} moveu o ladrão para <span className="log-place">{hexLabel(e.hexKey)}</span></>;
      case 'steal':
        return <>{actor} roubou {e.resource ? `${emoji(e.resource)} ${RESOURCE_INFO[e.resource].label}` : 'uma carta'} de {name(e.victimId, false)}</>;
      case 'bank_trade':
        return <>{actor} trocou {e.amount}{emoji(e.give)} por 1{emoji(e.get)} {e.amount < 4 ? 'no porto' : 'com o banco'}</>;
      case 'offer': return <>{actor} ofereceu {cards(e.give)} por {cards(e.get)}</>;
      case 'offer_answer': return <>{actor} {e.accepted ? 'aceitou' : 'recusou'} a oferta</>;
      case 'trade': return <>{actor} trocou {cards(e.give)} por {cards(e.get)} com {name(e.partnerId, false)}</>;
      case 'offer_cancel': return <>{actor} cancelou a oferta</>;
      case 'buy_dev_card': return <>{actor} comprou uma carta de desenvolvimento</>;
      case 'play_card': {
        const info = DEV_CARD_INFO[e.card];
        const extra = e.card === 'year_of_plenty' && e.resources ? `: ${e.resources.map(emoji).join(' ')}`
          : e.card === 'monopoly' && e.resource ? ` de ${emoji(e.resource)} e levou ${e.taken ?? 0}` : '';
        return <>{actor} jogou {info.emoji} {info.label}{extra}</>;
      }
      case 'award': {
        const prize = e.award === 'largest_army' ? '⚔️ Maior Exército' : '🛤️ Maior Estrada';
        if (entry.userId === null) return <>{name(e.lost)} perdeu {prize}; ninguém fica com ela</>;
        return <>{actor} conquistou {prize}{e.lost && <> de {name(e.lost, false)}</>}</>;
      }
      case 'end_turn': return <>{actor} passou a vez</>;
      case 'win': return <>🏆 {actor} venceu com {e.points} pontos!</>;
      case 'left': return <>{actor} saiu; um bot assume o lugar</>;
    }
  };

  const last = log[log.length - 1];
  return (
    <section className={`game-log glass ${open ? '' : 'collapsed'}`} aria-label="Registro da partida">
      <button className="log-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="live-dot" aria-hidden />
        <span className="log-title">Registro</span>
        {!open && last && <span className="log-peek">{describe(last)}</span>}
        <span className="log-count">{log.length}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <ol ref={list} className="log-list" aria-live="polite"
          onScroll={e => {
            const el = e.currentTarget;
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}>
          {log.map(entry => (
            <li key={entry.id} className={`log-${entry.event.type}`}>
              <time dateTime={new Date(entry.at).toISOString()}>{time.format(entry.at)}</time>
              <span className="log-text">{describe(entry)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
