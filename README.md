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

Abra duas janelas anónimas para simular 2 jogadores.

## Status atual — Fase 1: Lobby ✅
- Registo de utilizador (persistido em SQLite)
- Criar sala com código único (5 chars), `maxPlayers` (2–6) e `turnTimer`
- Entrar em sala pelo código
- Atribuição automática de cor
- Broadcast `room_state_updated` em tempo real
- Validações: sala cheia, sala já iniciada, duplicados
- Limpeza automática em disconnect (só em salas `waiting`)

## Eventos WebSocket (Cliente → Servidor)

| Evento | Payload | Resposta (ack) |
|---|---|---|
| `register` | `{ username }` | `{ ok, user: { id, username } }` |
| `create_room` | `{ maxPlayers, turnTimer }` | `{ ok, room }` |
| `join_room` | `{ code }` | `{ ok, room }` |
| `leave_room` | `{}` | `{ ok }` |

## Eventos WebSocket (Servidor → Cliente)

| Evento | Payload |
|---|---|
| `room_state_updated` | `{ id, code, hostId, maxPlayers, turnTimer, status, players[] }` |

## Próximo passo (Fase 2)
Geração do tabuleiro: 19 hexágonos (padrão) / 30 (expandido 5–6 jogadores), fichas numeradas, portos, ladrão no deserto.
