import { nanoid } from 'nanoid';
import { GameServer, GameSocket, onEvent } from './socket';

const MAX_LENGTH = 300;
const HISTORY_SIZE = 100;

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  at: number; // epoch ms
}

// Recent messages per room, so a player who reloads the page still sees the conversation
const history = new Map<string, ChatMessage[]>();

export function chatHistory(roomId: string): ChatMessage[] {
  return history.get(roomId) ?? [];
}

export function clearChat(roomId: string) {
  history.delete(roomId);
}

export function registerChatEvents(io: GameServer, socket: GameSocket) {
  onEvent<{ text: string }>(socket, 'chat_message', (data, reply) => {
    const { userId, username, roomId } = socket.data;
    if (!userId || !username || !roomId) return reply({ error: 'Não está numa sala.' });
    const text = typeof data.text === 'string' ? data.text.trim() : '';
    if (text.length === 0) return reply({ error: 'Mensagem vazia.' });
    if (text.length > MAX_LENGTH) return reply({ error: `Mensagem com mais de ${MAX_LENGTH} caracteres.` });

    const message: ChatMessage = { id: nanoid(8), userId, username, text, at: Date.now() };
    const messages = history.get(roomId) ?? [];
    messages.push(message);
    history.set(roomId, messages.slice(-HISTORY_SIZE));
    io.to(roomId).emit('chat_message', message);
    reply({ ok: true });
  });
}
