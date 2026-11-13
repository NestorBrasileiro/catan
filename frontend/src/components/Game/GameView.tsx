import { lazy, Suspense, useEffect, useState, type CSSProperties } from 'react';
import { useGame } from '../../contexts/useGame';
import { updateGraphics, useGraphics } from '../../services/graphics';
import Board from '../Board/Board';
import { BUILD_COSTS, RESOURCE_INFO, RESOURCE_ORDER, type BuildKind, type GameAction } from '../Board/boardTypes';
import MapNav from '../HUD/MapNav';
import MapToolbar from '../HUD/MapToolbar';
import { CloseIcon, ExitIcon, PanelIcon } from '../HUD/icons';
import { useHudPadding } from '../HUD/useHudPadding';
import ChatPanel from './ChatPanel';
import Dice from './Dice';
import DevCardsPanel from './DevCardsPanel';
import DiscardPanel from './DiscardPanel';
import HelpDialog from './HelpDialog';
import RollStats from './RollStats';
import IncomingOffer from './IncomingOffer';
import TradePanel from './TradePanel';
import { useGameFeedback } from './useGameFeedback';
import { useRollReveal } from './useRollReveal';
import '../HUD/hud.css';
import './GameView.css';

// three.js is heavy, so it only loads when the 3D map is shown
const Board3D = lazy(() => import('../Board3D/Board3D'));

const BUILD_KINDS: BuildKind[] = ['road', 'settlement', 'city'];
const BUILD_LABELS: Record<BuildKind, string> = { road: 'Estrada', settlement: 'Aldeia', city: 'Cidade' };
const BUILD_ICONS: Record<BuildKind | 'devCard', string> = { road: '🛤️', settlement: '🏠', city: '🏰', devCard: '📜' };

type Tab = 'cards' | 'chat' | 'stats';
const TABS: { id: Tab; label: string }[] = [
  { id: 'cards', label: 'Cartas' },
  { id: 'chat', label: 'Chat' },
  { id: 'stats', label: 'Dados' },
];

function Cost({ kind }: { kind: BuildKind | 'devCard' }) {
  return (
    <span className="cost" aria-hidden>
      {RESOURCE_ORDER.filter(r => BUILD_COSTS[kind][r]).map(r => (
        <span key={r} className={`cost-chip res-${r}`}>{RESOURCE_INFO[r].emoji}{BUILD_COSTS[kind][r]! > 1 && <b>{BUILD_COSTS[kind][r]}</b>}</span>
      ))}
    </span>
  );
}

function isPhone() {
  return window.matchMedia('(max-width: 760px)').matches;
}

export default function GameView() {
  const { room, user, board, gameState, chat, sendAction, leaveRoom } = useGame();
  const settings = useGraphics();
  const [buildMode, setBuildMode] = useState<BuildKind | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');
  const [drawerOpen, setDrawerOpen] = useState(() => !isPhone());
  const [seenChat, setSeenChat] = useState(chat.length);
  const [tradeOpen, setTradeOpen] = useState(false);
  const padding = useHudPadding('game', drawerOpen);

  const { view: game, rolling } = useRollReveal(gameState);
  useGameFeedback(game, rolling, user?.id);

  // With no development card to play first, rolling is the only thing to do: do it for the player,
  // after a beat so they see the turn is theirs
  const mustRoll = game?.phase === 'playing' && game.step === 'roll' && !rolling
    && game.currentPlayerId === user?.id && game.legal?.devCardsToPlay.length === 0;
  useEffect(() => {
    if (!mustRoll) return;
    const timer = setTimeout(() => sendAction({ type: 'roll_dice' }).catch(() => {}), 900);
    return () => clearTimeout(timer);
  }, [mustRoll, sendAction]);

  // Messages count as read while the chat tab is open
  const readingChat = drawerOpen && tab === 'chat';
  if (readingChat && seenChat !== chat.length) setSeenChat(chat.length);

  if (!room || !user || !board || !game) {
    return (
      <div className="game-shell">
        <div className="world-loading"><span className="spinner" />Carregando o mapa…</div>
      </div>
    );
  }

  const flat = settings.view === '2d';
  const nameOf = (id: string) => room.players.find(p => p.user_id === id)?.username ?? '?';
  // "Você" for the viewer, the player's name otherwise
  const who = (id: string, capitalized = true) => id === user.id ? (capitalized ? 'Você' : 'você') : nameOf(id);
  const me = game.players[user.id];
  const isMyTurn = game.currentPlayerId === user.id && game.phase !== 'finished';
  const myDiscard = game.discards[user.id] ?? 0;
  const legal = game.legal ?? {
    settlements: [], roads: [], cities: [], robberHexes: [], victims: [], bankRatios: null,
    canBuyDevCard: false, devCardsToPlay: [],
  };
  const spots: Record<BuildKind, string[]> = { road: legal.roads, settlement: legal.settlements, city: legal.cities };
  const canTrade = isMyTurn && game.step === 'main' && !!legal.bankRatios && !!me.resources;
  // an offer of ours on the table keeps the trade panel open until it's closed or cancelled
  const showTrade = canTrade && (tradeOpen || !!game.tradeOffer);
  const unread = Math.max(0, chat.length - seenChat);

  // During setup the step decides what to place; afterwards the player picks what to build
  let mode: BuildKind | null = null;
  if (isMyTurn && game.step === 'place_settlement') mode = 'settlement';
  else if (isMyTurn && (game.step === 'place_road' || game.step === 'road_building')) mode = 'road';
  else if (isMyTurn && game.step === 'main') mode = buildMode;

  // Resolves to whether the server accepted the action; refusals already show in the error banner
  const act = async (action: GameAction): Promise<boolean> => {
    try {
      await sendAction(action);
      setBuildMode(null);
      return true;
    } catch {
      return false;
    }
  };

  const status = (() => {
    const current = nameOf(game.currentPlayerId);
    if (game.phase === 'finished') return `🏆 ${nameOf(game.winnerId!)} venceu a partida!`;
    if (game.phase === 'setup') {
      const what = game.step === 'place_settlement' ? 'uma aldeia' : 'uma estrada';
      return isMyTurn
        ? `Fundação (rodada ${game.setupRound}): coloque ${what}`
        : `Fundação (rodada ${game.setupRound}): ${current} coloca ${what}`;
    }
    switch (game.step) {
      case 'discard':
        return myDiscard
          ? `Saiu 7! Descarte ${myDiscard} cartas`
          : `Saiu 7! Aguardando descarte de ${Object.keys(game.discards).map(id => nameOf(id)).join(', ')}`;
      case 'move_robber':
        return isMyTurn ? 'Clique no hexágono para onde o ladrão vai' : `${current} está movendo o ladrão`;
      case 'steal':
        return isMyTurn ? 'Escolha de quem roubar uma carta' : `${current} está escolhendo de quem roubar`;
      case 'road_building':
        return isMyTurn
          ? `Construção de Estradas: coloque ${game.freeRoadsLeft} estrada(s) grátis`
          : `${current} está construindo estradas grátis`;
      case 'roll':
        if (mustRoll) return 'Sua vez: rolando os dados…';
        return isMyTurn ? 'Sua vez: role os dados ou jogue uma carta' : `Vez de ${current}: aguardando os dados`;
      default:
        if (!isMyTurn) return `Vez de ${current}`;
        return mode ? `Escolha no mapa onde construir: ${BUILD_LABELS[mode].toLowerCase()}` : 'Sua vez: construa, troque ou passe a vez';
    }
  })();

  const robberyText = (() => {
    const robbery = game.lastRobbery;
    if (!robbery) return null;
    const card = robbery.resource ? `${RESOURCE_INFO[robbery.resource].emoji} ${RESOURCE_INFO[robbery.resource].label}` : 'uma carta';
    return `${who(robbery.thiefId)} roubou ${card} de ${who(robbery.victimId, false)}`;
  })();

  const boardProps = {
    board,
    game,
    highlightVertices: mode === 'settlement' ? spots.settlement : mode === 'city' ? spots.city : [],
    highlightEdges: mode === 'road' ? spots.road : [],
    highlightHexes: legal.robberHexes,
    onVertexClick: (vertexKey: string) => act(mode === 'city' ? { type: 'build_city', vertexKey } : { type: 'build_settlement', vertexKey }),
    onEdgeClick: (edgeKey: string) => act({ type: 'build_road', edgeKey }),
    onHexClick: (hexKey: string) => act({ type: 'move_robber', hexKey }),
  };

  const needsMe = isMyTurn || myDiscard > 0 || game.phase === 'finished';
  const openTab = (next: Tab) => {
    setTab(next);
    setDrawerOpen(true);
  };

  return (
    <div className="game-shell">
      {flat ? (
        <div className="board2d-stage"><Board {...boardProps} /></div>
      ) : (
        <Suspense fallback={<div className="world-loading"><span className="spinner" />Carregando o mapa 3D…</div>}>
          <Board3D {...boardProps} rolling={rolling} padding={padding} />
        </Suspense>
      )}

      <div className={`hud ${drawerOpen ? 'drawer-open' : 'drawer-closed'}`}>
        {/* ---- Players (top left) ---- */}
        <section className="hud-players glass" aria-label="Jogadores">
          <header className="hud-brand">
            <span className="brand-mark" aria-hidden>⬢</span>
            <strong>Catan dos Crias</strong>
            <span className="room-code" title="Código da sala">{room.code}</span>
          </header>
          <ul className="score-list">
            {game.playerOrder.map(id => {
              const p = game.players[id];
              const left = game.bots.includes(id);
              const offline = !left && room.players.find(rp => rp.user_id === id)?.online === false;
              const current = id === game.currentPlayerId && game.phase !== 'finished';
              return (
                <li key={id} className={current ? 'current' : ''} style={{ '--player': p.color } as CSSProperties}>
                  <span className="color-dot" style={{ backgroundColor: p.color }} />
                  <div className="player-main">
                    <span className={`player-name ${left || offline ? 'away' : ''}`}>
                      {nameOf(id)}{id === user.id && <span className="you"> (você)</span>}
                      {left && <span className="presence"> · bot</span>}
                      {offline && <span className="presence"> · offline</span>}
                    </span>
                    <span className="player-stats">
                      <span title="Cartas de recurso na mão" data-cards-of={id}>🃏 {p.resourceCount}</span>
                      <span title="Cartas de desenvolvimento">📜 {p.devCardCount}</span>
                      <span title="Cavaleiros jogados">⚔️ {p.knightsPlayed}</span>
                      <span title="Maior estrada contínua">🛤️ {p.roadLength}</span>
                    </span>
                    {(game.largestArmyHolder === id || game.longestRoadHolder === id) && (
                      <span className="awards">
                        {game.largestArmyHolder === id && <span className="award">Maior Exército</span>}
                        {game.longestRoadHolder === id && <span className="award">Maior Estrada</span>}
                      </span>
                    )}
                  </div>
                  <span className="vp" title="Pontos de vitória"><strong>{p.victoryPoints}</strong><small>pts</small></span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* ---- Status (top center) ---- */}
        <div className="hud-status">
          <div className={`status-pill glass ${needsMe ? 'highlight' : ''}`} role="status">
            <span className="color-dot" style={{ backgroundColor: game.players[game.currentPlayerId]?.color }} />
            <span>{rolling ? 'Rolando os dados…' : status}</span>
          </div>
          {game.phase !== 'setup' && <Dice dice={game.dice} rolling={rolling} />}
        </div>

        {/* ---- Map controls (top right / right edge) ---- */}
        <div className="hud-toolbar">
          <MapToolbar onHelp={() => setShowHelp(true)} sound>
            <button className={`icon-btn ${drawerOpen ? 'on' : ''}`} onClick={() => setDrawerOpen(!drawerOpen)}
              aria-label={drawerOpen ? 'Fechar painel' : 'Abrir painel'} title={drawerOpen ? 'Fechar painel' : 'Abrir painel'}
              aria-expanded={drawerOpen}>
              <PanelIcon />
              {!drawerOpen && unread > 0 && <span className="badge-dot" />}
            </button>
          </MapToolbar>
        </div>
        {!flat && <div className="hud-nav"><MapNav /></div>}

        {/* ---- Things that need an answer (center) ---- */}
        <div className="hud-alerts">
          {game.phase === 'finished' && (
            <section className="panel panel-alert finish">
              <h3>Fim de jogo</h3>
              <p className="finish-title">🏆 {who(game.winnerId!)} venceu a partida!</p>
              <button className="wide" onClick={() => leaveRoom().catch(() => {})}>Voltar ao lobby</button>
            </section>
          )}
          {myDiscard > 0 && me.resources && (
            <DiscardPanel key={myDiscard} hand={me.resources} owed={myDiscard}
              onConfirm={resources => act({ type: 'discard', resources })} />
          )}
          {legal.victims.length > 0 && (
            <section className="panel panel-alert">
              <h3>Roubar de quem?</h3>
              <div className="victims">
                {legal.victims.map(id => (
                  <button key={id} className="victim-btn btn-secondary" onClick={() => act({ type: 'steal', victimId: id })}>
                    <span className="color-dot" style={{ backgroundColor: game.players[id].color }} />
                    {nameOf(id)} <span className="muted">· 🃏 {game.players[id].resourceCount}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {robberyText && <p key={robberyText + game.rollCount} className="robbery-note glass">🥷 {robberyText}</p>}
        </div>

        {/* ---- Side drawer: trade, cards, chat, dice stats ---- */}
        <aside className="hud-drawer glass" aria-label="Painel" hidden={!drawerOpen}>
          <div className="drawer-tabs" role="tablist">
            {TABS.map(t => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''}
                onClick={() => setTab(t.id)}>
                {t.label}
                {t.id === 'chat' && unread > 0 && <span className="badge">{unread}</span>}
                {t.id === 'cards' && me.devCardCount > 0 && <span className="badge soft">{me.devCardCount}</span>}
              </button>
            ))}
            <button className="icon-btn drawer-close" onClick={() => setDrawerOpen(false)} aria-label="Fechar painel"><CloseIcon /></button>
          </div>
          <div className="drawer-body">
            <div role="tabpanel" hidden={tab !== 'cards'}>
              {me.devCards && me.newDevCards && me.devCardCount > 0 ? (
                <DevCardsPanel cards={me.devCards} newCards={me.newDevCards} playable={legal.devCardsToPlay}
                  alreadyPlayed={isMyTurn && game.devCardPlayed} bank={game.bank} act={act} />
              ) : (
                <p className="empty-state">Você ainda não tem cartas de desenvolvimento. Compre uma por 🐑 🌾 ⛰️ na sua vez.</p>
              )}
              <p className="muted deck-count">{game.devDeckCount} cartas no baralho</p>
            </div>
            <div role="tabpanel" hidden={tab !== 'chat'}>
              <ChatPanel colorOf={id => game.players[id]?.color ?? '#eee'} />
            </div>
            <div role="tabpanel" hidden={tab !== 'stats'}>
              <RollStats stats={game.rollStats} lastSum={game.dice ? game.dice[0] + game.dice[1] : null} />
            </div>
          </div>
          {game.phase !== 'finished' && (
            <footer className="drawer-footer">
              {confirmingLeave ? (
                <div className="leave-confirm">
                  <p>Sair da partida? Um bot assume o seu lugar, com suas cartas e construções, e não dá para voltar.</p>
                  <div className="offer-actions">
                    <button className="btn-danger" onClick={() => leaveRoom().catch(() => {})}>Sair</button>
                    <button className="btn-secondary" onClick={() => setConfirmingLeave(false)}>Ficar</button>
                  </div>
                </div>
              ) : (
                <button className="link-btn leave-btn" onClick={() => setConfirmingLeave(true)}><ExitIcon /> Sair da partida</button>
              )}
            </footer>
          )}
        </aside>

        {/* ---- Bottom center: trade floating over the dock, then the dock with the hand and actions ---- */}
        <div className="hud-bottom">
          {showTrade && (
            <div className="trade-float">
              <TradePanel hand={me.resources!} bank={game.bank} bankRatios={legal.bankRatios!} offer={game.tradeOffer}
                opponents={game.playerOrder.filter(id => id !== user.id)} nameOf={nameOf} act={act}
                onClose={() => setTradeOpen(false)} />
            </div>
          )}
          {game.tradeOffer && !isMyTurn && me.resources && (
            <div className="trade-float">
              <IncomingOffer offer={game.tradeOffer} fromName={nameOf(game.currentPlayerId)}
                fromColor={game.players[game.currentPlayerId].color} myId={user.id} hand={me.resources} act={act} />
            </div>
          )}
          <div className="hud-dock glass">
            {me.resources && (
              <div className="hand" aria-label="Sua mão">
                {RESOURCE_ORDER.map(r => (
                  <div key={r} className={`res-card res-${r} ${me.resources![r] === 0 ? 'empty' : ''}`}
                    title={RESOURCE_INFO[r].label} data-hand={r}>
                    <span className="res-emoji" aria-hidden>{RESOURCE_INFO[r].emoji}</span>
                    <strong aria-label={`${me.resources![r]} ${RESOURCE_INFO[r].label}`}>{me.resources![r]}</strong>
                  </div>
                ))}
              </div>
            )}

            {isMyTurn && game.step === 'roll' && (
              <div className="dock-actions">
                {legal.devCardsToPlay.length > 0 && (
                  <button className="btn-secondary" onClick={() => openTab('cards')}>📜 Jogar carta</button>
                )}
                <button className="primary-action" disabled={rolling} onClick={() => act({ type: 'roll_dice' })}>
                  🎲 {rolling ? 'Rolando…' : 'Rolar dados'}
                </button>
              </div>
            )}

            {isMyTurn && game.step === 'main' && (
              <div className="dock-actions">
                {BUILD_KINDS.map(kind => (
                  <button key={kind}
                    className={`build-btn ${buildMode === kind ? 'active' : ''}`}
                    aria-pressed={buildMode === kind}
                    disabled={spots[kind].length === 0}
                    title={spots[kind].length === 0
                      ? 'Sem recursos, peças ou lugar disponível'
                      : `${BUILD_LABELS[kind]} · ${me.piecesLeft[kind]} peças restantes`}
                    onClick={() => setBuildMode(buildMode === kind ? null : kind)}>
                    <span className="build-icon" aria-hidden>{BUILD_ICONS[kind]}</span>
                    <span className="build-label">{BUILD_LABELS[kind]}</span>
                    <Cost kind={kind} />
                    <span className="pieces-left" aria-hidden>{me.piecesLeft[kind]}</span>
                  </button>
                ))}
                <button className="build-btn" disabled={!legal.canBuyDevCard}
                  title={legal.canBuyDevCard ? 'Comprar carta de desenvolvimento' : 'Sem recursos ou baralho vazio'}
                  onClick={() => act({ type: 'buy_dev_card' })}>
                  <span className="build-icon" aria-hidden>{BUILD_ICONS.devCard}</span>
                  <span className="build-label">Carta</span>
                  <Cost kind="devCard" />
                </button>
                <button className={`trade-btn ${showTrade ? 'active' : ''}`} aria-pressed={showTrade}
                  onClick={() => setTradeOpen(!showTrade)} disabled={!!game.tradeOffer && showTrade}>
                  <span className="build-icon" aria-hidden>⇄</span>
                  <span className="build-label">Comércio</span>
                </button>
                <button className="primary-action" onClick={() => { setTradeOpen(false); act({ type: 'end_turn' }); }}>Passar a vez ➜</button>
              </div>
            )}
          </div>
        </div>

        {flat && (
          <button className="view-switch glass" onClick={() => updateGraphics({ view: '3d' })}>Voltar ao mapa 3D</button>
        )}
      </div>
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
    </div>
  );
}
