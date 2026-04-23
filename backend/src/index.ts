import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { getDb } from './config/database';
import { registerLobbyEvents } from './events/lobbyEvents';
import { registerGameEvents } from './events/gameEvents';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
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

server.listen(PORT, () => {
  console.log(`🏝️  Catan Backend rodando na porta ${PORT}`);
});

