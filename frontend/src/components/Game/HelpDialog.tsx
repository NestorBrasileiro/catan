import { useEffect, useRef } from 'react';
import { BUILD_COSTS, DEV_CARD_INFO, DEV_CARD_ORDER, RESOURCE_INFO, RESOURCE_ORDER, type BuildKind } from '../Board/boardTypes';

const BUILDS: { kind: BuildKind | 'devCard'; name: string; what: string }[] = [
  { kind: 'road', name: 'Estrada', what: 'Liga suas construções e abre caminho para novas aldeias.' },
  { kind: 'settlement', name: 'Aldeia', what: 'Vale 1 ponto. Rende 1 carta de cada hexágono vizinho quando o número dele sai.' },
  { kind: 'city', name: 'Cidade', what: 'Substitui uma aldeia. Vale 2 pontos e rende 2 cartas em vez de 1.' },
  { kind: 'devCard', name: 'Carta de desenvolvimento', what: 'Uma carta surpresa do baralho (veja abaixo).' },
];

function Cost({ kind }: { kind: BuildKind | 'devCard' }) {
  return (
    <span className="help-cost">
      {RESOURCE_ORDER.filter(r => BUILD_COSTS[kind][r]).map(r => (
        <span key={r} title={RESOURCE_INFO[r].label}>{RESOURCE_INFO[r].emoji.repeat(BUILD_COSTS[kind][r]!)}</span>
      ))}
    </span>
  );
}

// The rules in short, opened from the "?" button
export default function HelpDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);

  // A modal <dialog> handles Esc, focus and staying on top (also in fullscreen) by itself
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog ref={dialog} className="help-dialog" onClose={onClose}
      onClick={e => { if (e.target === dialog.current) onClose(); }}>
      <div className="help-content">
        <header>
          <h2>Como jogar</h2>
          <button className="btn-secondary" onClick={onClose} aria-label="Fechar">✕</button>
        </header>

        <h3>Objetivo</h3>
        <p>Vence quem chegar primeiro a <strong>10 pontos de vitória</strong> na própria vez.</p>

        <h3>Fundação</h3>
        <p>Cada jogador coloca 2 aldeias e 2 estradas, uma de cada vez. A ordem vai e volta (1-2-3-4, 4-3-2-1).
          A 2ª aldeia já rende 1 carta de cada hexágono vizinho. Aldeias nunca ficam em cantos vizinhos.</p>

        <h3>Sua vez</h3>
        <ol>
          <li><strong>Role os dados.</strong> Todo hexágono com o número que saiu rende cartas para quem tem
            aldeia (1) ou cidade (2) em um canto dele. Os números com mais bolinhas saem mais.</li>
          <li><strong>Troque e construa</strong>, em qualquer ordem, quantas vezes puder pagar.</li>
          <li><strong>Passe a vez.</strong></li>
        </ol>
        <p>Você pode jogar 1 carta de desenvolvimento por turno, inclusive antes de rolar.
          Se não tiver nenhuma para jogar, os dados rolam sozinhos.</p>

        <h3>Recursos</h3>
        <p className="help-resources">
          {RESOURCE_ORDER.map(r => <span key={r}>{RESOURCE_INFO[r].emoji} {RESOURCE_INFO[r].label}</span>)}
        </p>
        <p>Floresta dá madeira, colina dá tijolo, pasto dá ovelha, campo dá trigo e montanha dá minério. O deserto não rende nada.</p>

        <h3>Construções e custos</h3>
        <ul className="help-list">
          {BUILDS.map(b => (
            <li key={b.kind}><strong>{b.name}</strong> <Cost kind={b.kind} /><br />{b.what}</li>
          ))}
        </ul>
        <p>Cada jogador tem 15 estradas, 5 aldeias e 4 cidades.</p>

        <h3>Cartas de desenvolvimento</h3>
        <ul className="help-list">
          {DEV_CARD_ORDER.map(card => (
            <li key={card}><strong>{DEV_CARD_INFO[card].emoji} {DEV_CARD_INFO[card].label}</strong><br />{DEV_CARD_INFO[card].hint}</li>
          ))}
        </ul>
        <p>Uma carta comprada só pode ser jogada a partir do seu próximo turno. Pontos de Vitória ficam
          guardados e contam sem precisar jogar.</p>

        <h3>Ladrão (quando sai 7)</h3>
        <ol>
          <li>Quem tem <strong>mais de 7 cartas</strong> descarta metade (arredondando para baixo).</li>
          <li>Quem rolou move o ladrão para outro hexágono, que para de render enquanto ele estiver lá.</li>
          <li>E rouba 1 carta, ao acaso, de um jogador com construção nesse hexágono.</li>
        </ol>
        <p>O Cavaleiro faz os passos 2 e 3, sem o descarte.</p>

        <h3>Comércio</h3>
        <ul className="help-list">
          <li><strong>Banco:</strong> 4 cartas iguais por 1 de sua escolha.</li>
          <li><strong>Portos:</strong> com uma construção no porto, a troca fica 3 por 1 (qualquer recurso)
            ou 2 por 1 (o recurso da placa).</li>
          <li><strong>Jogadores:</strong> na sua vez, proponha uma troca. Os outros aceitam ou recusam e você
            escolhe com quem fechar.</li>
        </ul>

        <h3>Prêmios (2 pontos cada)</h3>
        <ul className="help-list">
          <li><strong>⚔️ Maior Exército:</strong> primeiro a jogar 3 Cavaleiros. Passa para quem jogar mais.</li>
          <li><strong>🛣️ Maior Estrada:</strong> primeiro com 5 estradas seguidas. Passa para quem fizer uma
            mais longa. Uma construção adversária no meio corta a estrada.</li>
        </ul>

        <h3>No placar</h3>
        <p>pts pontos · 🃏 cartas de recurso · 📜 cartas de desenvolvimento · ⚔️ cavaleiros jogados · 🛤️ maior estrada contínua</p>

        <h3>Mapa</h3>
        <ul className="help-list">
          <li><strong>Mover:</strong> arraste com o botão esquerdo (ou um dedo).</li>
          <li><strong>Girar e inclinar:</strong> arraste com o botão direito, ou Ctrl/⌘ + arrastar (dois dedos no celular).</li>
          <li><strong>Zoom:</strong> roda do mouse ou pinça, em direção ao cursor. Os botões no canto também fazem isso,
            e a bússola volta para o norte.</li>
          <li><strong>Camadas</strong> (ícone de pilha): números, mapa de produção, rótulos, portos, vegetação e nuvens,
            ou o plano 2D.</li>
          <li><strong>Gráficos</strong> (ícone de controles): qualidade de Baixo a Ultra, ou Auto, que reduz sozinho se o
            jogo ficar lento; hora do dia e modo cinema.</li>
        </ul>
      </div>
    </dialog>
  );
}
