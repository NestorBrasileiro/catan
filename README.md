# 🏝️ Catan dos Crias

Um jogo de tabuleiro para jogar remuneradamente durante reuniões chatas.
Versão web multiplayer do Catan.

## Stack
- **Backend**: Node.js + TypeScript + Express + Socket.IO + SQLite (better-sqlite3)
- **Frontend**: React 19 + Vite + TypeScript + socket.io-client

## Estrutura
```
catan-dos-crias/
├── backend/          # Servidor Node.js (autoritativo)
│   ├── src/
│   │   ├── config/   # DB
│   │   ├── events/   # Handlers WebSocket
│   │   ├── models/   # Tipos
│   │   └── index.ts
│   └── data/         # SQLite (gerado automaticamente)
└── frontend/         # App React
    └── src/
        ├── components/Lobby/
        ├── contexts/
        └── services/
```

## Como rodar

### Backend
```bash
cd backend
npm install
npm run dev          # http://localhost:3001
```

### Frontend
```bash
cd frontend
pnpm install
pnpm dev             # http://localhost:5173
```

Para simular vários jogadores no mesmo navegador, abra outra aba ou janela e use **Trocar de jogador** no lobby (uma aba nova entra automaticamente como o último jogador daquele navegador).

### Jogar com alguém pela internet (ngrok)
O servidor também entrega o frontend já compilado, então o jogo inteiro fica numa porta só (3001) e basta um túnel:

```bash
cd frontend && pnpm build        # gera frontend/dist (refaça depois de mudar o frontend)
cd ../backend && npm run dev     # jogo completo em http://localhost:3001
ngrok http 3001                  # em outro terminal; compartilhe o endereço https que aparecer
```

- Primeira vez com ngrok: `brew install ngrok`, crie uma conta grátis em ngrok.com e rode `ngrok config add-authtoken <seu token>`.
- No plano grátis, quem abre o link vê um aviso do ngrok antes; é só clicar em "Visit Site".
- Sem conta: `brew install cloudflared` e `cloudflared tunnel --url http://localhost:3001` também funciona.
- Na mesma rede (Wi-Fi), nem precisa de túnel: `http://<seu IP local>:3001`.
- As partidas ficam na memória do servidor: se ele reiniciar (o `npm run dev` reinicia sozinho quando um arquivo do backend muda), a partida em andamento acaba. Durante o jogo, não edite o backend.
- Qualquer pessoa com o link entra no site enquanto o túnel estiver aberto; feche o túnel quando terminar.

### Testes (regras do jogo)
```bash
cd backend
npm test
```

## Status atual
Referência de regras e interface: Catan base oficial, como no Board Game Arena. Por enquanto, 2–4 jogadores.

- ✅ Lobby: registo, criar sala (2–4 jogadores), entrar por código, iniciar
- ✅ Tabuleiro aleatório oficial: 19 hexágonos, 9 portos, 6 e 8 nunca vizinhos, ladrão no deserto
- ✅ Fundação: ordem sorteada, serpente (1-2-3-4, 4-3-2-1), regra de distância, recursos da 2ª aldeia
- ✅ Turno: rolar dados, produção (aldeia 1, cidade 2, ladrão bloqueia, limite de 19 cartas por recurso no banco), construir estrada/aldeia/cidade com custos e limite de peças (15/5/4), passar a vez
- ✅ Ladrão no 7: quem tem mais de 7 cartas descarta metade (todos ao mesmo tempo), o jogador da vez move o ladrão e rouba 1 carta aleatória de um vizinho (automático se só houver um)
- ✅ Comércio depois de rolar: banco 4:1, portos 3:1 e 2:1 (estoque do banco visível), e ofertas aos outros jogadores (aceitar/recusar, quem propôs escolhe com quem fechar; sem doações nem troca do mesmo recurso)
- ✅ Cartas de desenvolvimento (14 Cavaleiros, 5 Pontos de Vitória, 2 Construção de Estradas, 2 Invenção, 2 Monopólio): 1 por turno, a qualquer momento da vez (até antes de rolar), nunca a comprada no mesmo turno; pontos ficam escondidos dos outros
- ✅ Maior Exército (3+ Cavaleiros) e Maior Estrada (5+, cortada por construção adversária; empate mantém o dono; se o dono perde a liderança e outros empatam, ninguém fica), 2 pontos cada
- ✅ Vitória com 10 pontos durante a própria vez, contando pontos escondidos e também no início do turno (sala fica `finished` e vai para `game_history`)
- ✅ Reconexão: recarregar a página ou perder a conexão devolve o jogador ao mesmo lugar (sessão por token; só o hash fica no banco). Na sala de espera, quem cai tem 20 s para voltar; se o host sai, o próximo vira host
- ✅ Presença e saída: o placar mostra quem está offline; "Sair da partida" pula a vez do jogador, devolve as cartas dele ao banco e ele para de produzir; o último que sobra vence
- ✅ Animações e som: os dados rolam no canto do tabuleiro e o resultado só aparece quando param; as cartas produzidas voam do hexágono até a mão de quem ganhou. Sons gerados no navegador (sem arquivos de áudio) para dados, cartas, construção, sua vez, ladrão, oferta de troca e fim de jogo, com botão 🔊/🔇 que fica salvo. Quem tem "reduzir movimento" ligado no sistema não vê as animações
- ⏳ Histórico de jogadas, timer de turno, tela de vitória; partidas ainda vivem só na memória (reiniciar o servidor encerra as partidas em andamento)

## Eventos WebSocket (Cliente → Servidor)

Todos respondem por ack com `{ ok: true, ... }` ou `{ error }`.

| Evento | Payload | Resposta (ack) |
|---|---|---|
| `register` | `{ username }` | `{ ok, user: { id, username }, token }` |
| `resume` | `{ token }` | `{ ok, user, inRoom }` (e reenvia sala, tabuleiro e estado do jogo) |
| `create_room` | `{ maxPlayers (2–4), turnTimer (30–600) }` | `{ ok, room }` |
| `join_room` | `{ code }` | `{ ok, room }` |
| `leave_room` | `{}` (sala de espera: libera o lugar; partida: desiste) | `{ ok }` |
| `start_game` | `{}` (só o host) | `{ ok }` |
| `game_action` | `{ type: 'build_settlement', vertexKey }` · `{ type: 'build_road', edgeKey }` · `{ type: 'build_city', vertexKey }` · `{ type: 'roll_dice' }` · `{ type: 'discard', resources }` (qualquer jogador que deva cartas) · `{ type: 'move_robber', hexKey }` · `{ type: 'steal', victimId }` · `{ type: 'bank_trade', give, get }` · `{ type: 'propose_trade', give, get }` · `{ type: 'respond_trade', accept }` (os outros jogadores) · `{ type: 'confirm_trade', partnerId }` · `{ type: 'cancel_trade' }` · `{ type: 'buy_dev_card' }` · `{ type: 'play_knight' }` · `{ type: 'play_road_building' }` · `{ type: 'play_year_of_plenty', resources: [r1, r2] }` · `{ type: 'play_monopoly', resource }` · `{ type: 'end_turn' }` | `{ ok }` |

## Eventos WebSocket (Servidor → Cliente)

| Evento | Payload |
|---|---|
| `room_state_updated` | `{ id, code, hostId, maxPlayers, turnTimer, status, players[] }` (cada jogador com `online`) |
| `board_generated` | `{ hexes, ports, vertices, edges }` (uma vez, ao iniciar) |
| `game_state_update` | visão do jogo para aquele jogador: mão própria, só a contagem de cartas dos outros, e as jogadas válidas (`legal`) se for a vez dele. `rollCount` e `lastProduction` (`{ id, gains: [{ hexKey, userId, resource, amount }] }`) dizem ao cliente quando animar os dados e as cartas |
