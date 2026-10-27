import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import cors from 'cors';
import { Server } from 'socket.io';
import { GameServer } from './events/socket';
import { getDb } from './config/database';
import { registerLobbyEvents } from './events/lobbyEvents';
import { registerGameEvents } from './events/gameEvents';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io: GameServer = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Initialize database on startup
getDb();

io.on('connection', (socket) => {
  console.log(`[WS] Conectado: ${socket.id}`);
  registerLobbyEvents(io, socket);
  registerGameEvents(io, socket);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Once the frontend is built (pnpm build), the server hands it out too, so the whole game
// lives on one address — handy for sharing it through a tunnel like ngrok
const FRONTEND_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  console.log(`🌐 Servindo o frontend de ${FRONTEND_DIST}`);
}

server.listen(PORT, () => {
  console.log(`🏝️  Catan Backend rodando na porta ${PORT}`);
});

