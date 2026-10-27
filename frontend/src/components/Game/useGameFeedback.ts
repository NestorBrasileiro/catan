import { useEffect, useRef } from 'react';
import { RESOURCE_INFO, RESOURCE_ORDER, type GameView, type ResourceGain, type ResourceType } from '../Board/boardTypes';
import { playSound } from '../../services/sound';

const FLIGHT_MS = 900;
const STAGGER_MS = 140; // between cards leaving the board, so they read one by one

// Animations are started by hand on the live page; they're cancelled when the game view closes
type Track = (animation: Animation, element: HTMLElement) => void;

function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function centerOf(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// A floating element over the page, removed when its animation ends
function floating(className: string, text: string, at: { x: number; y: number }) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  el.style.left = `${at.x}px`;
  el.style.top = `${at.y}px`;
  document.body.appendChild(el);
  return el;
}

// "+2" rising from one of our hand cards, which bounces
function popHandCard(resource: ResourceType, amount: number, track: Track) {
  const card = document.querySelector<HTMLElement>(`[data-hand="${resource}"]`);
  if (!card) return;
  card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }],
    { duration: 300, easing: 'ease-out' });
  const pop = floating('hand-pop', `+${amount}`, centerOf(card));
  const animation = pop.animate(
    [{ transform: 'translate(-50%, -100%)', opacity: 1 }, { transform: 'translate(-50%, calc(-100% - 28px))', opacity: 0 }],
    { duration: 900, easing: 'ease-out' },
  );
  track(animation, pop);
}

// One card flies from the hex to whoever received it: our own hand card, or the player's card count
function flyCard(gain: ResourceGain, order: number, myId: string, track: Track) {
  const mine = gain.userId === myId;
  const from = document.querySelector(`[data-hex="${gain.hexKey}"]`);
  const to = document.querySelector<HTMLElement>(mine ? `[data-hand="${gain.resource}"]` : `[data-cards-of="${gain.userId}"]`);
  if (!from || !to) return;

  const start = centerOf(from);
  const end = centerOf(to);
  const label = RESOURCE_INFO[gain.resource].emoji + (gain.amount > 1 ? `×${gain.amount}` : '');
  const card = floating('flying-card', label, start);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const animation = card.animate([
    { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
    { transform: 'translate(-50%, calc(-50% - 18px)) scale(1.15)', opacity: 1, offset: 0.2 },
    { transform: 'translate(-50%, calc(-50% - 18px)) scale(1)', opacity: 1, offset: 0.35 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.7)`, opacity: 1 },
  ], { duration: FLIGHT_MS, delay: order * STAGGER_MS, easing: 'ease-in-out', fill: 'backwards' });
  animation.onfinish = () => {
    card.remove();
    if (mine) {
      playSound('card', order);
      popHandCard(gain.resource, gain.amount, track);
    } else {
      to.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 300 });
    }
  };
  track(animation, card);
}

function pieceCount(view: GameView) {
  return Object.keys(view.roads).length
    + Object.values(view.buildings).reduce((n, b) => n + (b.type === 'city' ? 2 : 1), 0);
}

function knightCount(view: GameView) {
  return Object.values(view.players).reduce((n, p) => n + p.knightsPlayed, 0);
}

// Turns what changed on the table between two updates into sounds and card animations
function announceChanges(prev: GameView, next: GameView, myId: string, track: Track) {
  const rolledSeven = next.rollCount > prev.rollCount && next.dice !== null && next.dice[0] + next.dice[1] === 7;
  if (rolledSeven || knightCount(next) > knightCount(prev)) playSound('robber');
  if (pieceCount(next) > pieceCount(prev)) playSound('build');
  if (next.currentPlayerId === myId && prev.currentPlayerId !== myId && next.phase !== 'finished') playSound('turn');
  if (next.tradeOffer && !prev.tradeOffer && next.currentPlayerId !== myId) playSound('offer');
  if (next.winnerId && !prev.winnerId) playSound(next.winnerId === myId ? 'victory' : 'defeat');

  const production = next.lastProduction && next.lastProduction.id !== prev.lastProduction?.id
    ? next.lastProduction.gains
    : [];
  const animate = !reducedMotion();
  if (animate) production.forEach((gain, i) => flyCard(gain, i, myId, track));

  // Our hand: cards that didn't fly in (trades, robbery, development cards) just pop
  const before = prev.players[myId]?.resources;
  const after = next.players[myId]?.resources;
  if (!before || !after) return;
  RESOURCE_ORDER.forEach((r, i) => {
    const flown = animate ? production.filter(g => g.userId === myId && g.resource === r).reduce((n, g) => n + g.amount, 0) : 0;
    const extra = after[r] - before[r] - flown;
    if (extra <= 0) return;
    if (animate) popHandCard(r, extra, track);
    playSound('card', i);
  });
}

export function useGameFeedback(view: GameView | null, rolling: boolean, myId: string | undefined) {
  const prevRef = useRef<GameView | null>(null);
  const liveRef = useRef(new Map<Animation, HTMLElement>());

  useEffect(() => {
    if (rolling) playSound('dice');
  }, [rolling]);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = view;
    // The first view (game start, page reload) has nothing to compare against
    if (!prev || !view || !myId) return;

    const live = liveRef.current;
    const track: Track = (animation, element) => {
      live.set(animation, element);
      animation.addEventListener('finish', () => {
        element.remove();
        live.delete(animation);
      });
    };
    announceChanges(prev, view, myId, track);
  }, [view, myId]);

  useEffect(() => {
    const live = liveRef.current;
    return () => {
      for (const [animation, element] of live) {
        animation.cancel();
        element.remove();
      }
      live.clear();
    };
  }, []);
}
