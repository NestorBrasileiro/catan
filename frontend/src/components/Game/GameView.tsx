import { useState } from 'react';
import { useGame } from '../../contexts/useGame';
import Board from '../Board/Board';
import { BUILD_COSTS, RESOURCE_INFO, RESOURCE_ORDER, type BuildKind, type GameAction } from '../Board/boardTypes';
import DiscardPanel from './DiscardPanel';
import IncomingOffer from './IncomingOffer';
import TradePanel from './TradePanel';
import './GameView.css';

const BUILD_KINDS: BuildKind[] = ['road', 'settlement', 'city'];
const BUILD_LABELS: Record<BuildKind, string> = { road: 'Estrada', settlement: 'Aldeia', city: 'Cidade' };
const DICE_FACES = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

function costText(kind: BuildKind): string {
  return RESOURCE_ORDER
    .filter(r => BUILD_COSTS[kind][r])
    .map(r => RESOURCE_INFO[r].emoji.repeat(BUILD_COSTS[kind][r]!))
    .join('');
}

export default function GameView() {
  const { room, user, board, gameState: game, sendAction } = useGame();
  const [buildMode, setBuildMode] = useState<BuildKind | null>(null);

  if (!room || !user || !board || !game) {
    return <div className="card"><h2>🎲 Carregando tabuleiro...</h2></div>;
  }

  const nameOf = (id: string) => room.players.find(p => p.user_id === id)?.username ?? '?';
  // "Você" for the viewer, the player's name otherwise
  const who = (id: string, capitalized = true) => id === user.id ? (capitalized ? 'Você' : 'você') : nameOf(id);
  const me = game.players[user.id];
  const isMyTurn = game.currentPlayerId === user.id && game.phase !== 'finished';
  const myDiscard = game.discards[user.id] ?? 0;
  const legal = game.legal ?? { settlements: [], roads: [], cities: [], robberHexes: [], victims: [], bankRatios: null };
  const spots: Record<BuildKind, string[]> = { road: legal.roads, settlement: legal.settlements, city: legal.cities };

  // During setup the step decides what to place; afterwards the player picks what to build
  let mode: BuildKind | null = null;
  if (isMyTurn && game.step === 'place_settlement') mode = 'settlement';
  else if (isMyTurn && game.step === 'place_road') mode = 'road';
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
      case 'roll':
        return isMyTurn ? 'Sua vez: role os dados' : `Vez de ${current}: aguardando os dados`;
      default:
        if (!isMyTurn) return `Vez de ${current}`;
        return mode ? `Escolha no tabuleiro onde construir: ${BUILD_LABELS[mode].toLowerCase()}` : 'Sua vez: construa ou passe a vez';
    }
  })();

  const robberyText = (() => {
    const robbery = game.lastRobbery;
    if (!robbery) return null;
    const card = robbery.resource ? `${RESOURCE_INFO[robbery.resource].emoji} ${RESOURCE_INFO[robbery.resource].label}` : 'uma carta';
    return `${who(robbery.thiefId)} roubou ${card} de ${who(robbery.victimId, false)}`;
  })();

  const diceSum = game.dice ? game.dice[0] + game.dice[1] : null;
  const needsMe = isMyTurn || myDiscard > 0 || game.phase === 'finished';

  return (
    <div className="game-layout">
      <div className="game-main">
        <div className={`status-bar ${needsMe ? 'highlight' : ''}`} role="status">
          {status}
        </div>
        <Board
          board={board}
          game={game}
          highlightVertices={mode === 'settlement' ? spots.settlement : mode === 'city' ? spots.city : []}
          highlightEdges={mode === 'road' ? spots.road : []}
          highlightHexes={legal.robberHexes}
          onVertexClick={vertexKey => act(mode === 'city' ? { type: 'build_city', vertexKey } : { type: 'build_settlement', vertexKey })}
          onEdgeClick={edgeKey => act({ type: 'build_road', edgeKey })}
          onHexClick={hexKey => act({ type: 'move_robber', hexKey })}
        />
      </div>

      <aside className="game-side">
        {myDiscard > 0 && me.resources && (
          <DiscardPanel key={myDiscard} hand={me.resources} owed={myDiscard}
            onConfirm={resources => act({ type: 'discard', resources })} />
        )}

        {game.tradeOffer && !isMyTurn && me.resources && (
          <IncomingOffer offer={game.tradeOffer} fromName={nameOf(game.currentPlayerId)}
            myId={user.id} hand={me.resources} act={act} />
        )}

        {legal.victims.length > 0 && (
          <section className="panel panel-alert">
            <h3>Roubar de quem?</h3>
            <div className="victims">
              {legal.victims.map(id => (
                <button key={id} className="wide victim-btn" onClick={() => act({ type: 'steal', victimId: id })}>
                  <span className="color-dot" style={{ backgroundColor: game.players[id].color }} />
                  {nameOf(id)} · 🃏 {game.players[id].resourceCount}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="panel">
          <h3>Jogadores</h3>
          <ul className="score-list">
            {game.playerOrder.map(id => {
              const p = game.players[id];
              return (
                <li key={id} className={id === game.currentPlayerId && game.phase !== 'finished' ? 'current' : ''}>
                  <span className="color-dot" style={{ backgroundColor: p.color }} />
                  <span className="player-name">{nameOf(id)}{id === user.id && ' (você)'}</span>
                  <span title="Pontos de vitória">⭐ {p.victoryPoints}</span>
                  <span title="Cartas na mão">🃏 {p.resourceCount}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {game.phase !== 'setup' && (
          <section className="panel">
            <h3>Dados</h3>
            {game.dice ? (
              <div className="dice" aria-label={`Dados: ${game.dice[0]} e ${game.dice[1]}`}>
                <span aria-hidden>{DICE_FACES[game.dice[0] - 1]}{DICE_FACES[game.dice[1] - 1]}</span>
                <strong>{diceSum}</strong>
              </div>
            ) : <p className="muted">Ainda não rolados.</p>}
            {robberyText && <p className="robbery">🥷 {robberyText}</p>}

            {isMyTurn && game.step === 'roll' && (
              <button className="wide" onClick={() => act({ type: 'roll_dice' })}>🎲 Rolar dados</button>
            )}
            {isMyTurn && game.step === 'main' && (
              <div className="actions">
                {BUILD_KINDS.map(kind => (
                  <button key={kind}
                    className={`build-btn ${buildMode === kind ? 'active' : ''}`}
                    aria-pressed={buildMode === kind}
                    disabled={spots[kind].length === 0}
                    title={spots[kind].length === 0 ? 'Sem recursos, peças ou lugar disponível' : undefined}
                    onClick={() => setBuildMode(buildMode === kind ? null : kind)}>
                    <span>{BUILD_LABELS[kind]}</span>
                    <span className="cost">{costText(kind)}</span>
                  </button>
                ))}
                <button className="wide btn-secondary" onClick={() => act({ type: 'end_turn' })}>Passar a vez ➜</button>
              </div>
            )}
          </section>
        )}

        {isMyTurn && game.step === 'main' && legal.bankRatios && me.resources && (
          <TradePanel hand={me.resources} bank={game.bank} bankRatios={legal.bankRatios} offer={game.tradeOffer}
            opponents={game.playerOrder.filter(id => id !== user.id)} nameOf={nameOf} act={act} />
        )}

        {me?.resources && (
          <section className="panel">
            <h3>Sua mão</h3>
            <div className="hand">
              {RESOURCE_ORDER.map(r => (
                <div key={r} className="hand-card" title={RESOURCE_INFO[r].label}>
                  <span className="hand-emoji">{RESOURCE_INFO[r].emoji}</span>
                  <strong>{me.resources![r]}</strong>
                </div>
              ))}
            </div>
            <p className="muted pieces">
              Peças: {me.piecesLeft.road} estradas · {me.piecesLeft.settlement} aldeias · {me.piecesLeft.city} cidades
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}
