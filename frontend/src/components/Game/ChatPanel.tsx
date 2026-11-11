import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useGame } from '../../contexts/useGame';
import { playSound } from '../../services/sound';

const MAX_LENGTH = 300; // same limit as the server

export default function ChatPanel({ colorOf }: { colorOf: (userId: string) => string }) {
  const { chat, user, sendChat } = useGame();
  const [text, setText] = useState('');
  const list = useRef<HTMLDivElement>(null);
  const seen = useRef(chat.length);

  // Keeps the newest message in view, and chimes for messages from other players
  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
    const last = chat[chat.length - 1];
    if (chat.length > seen.current && last.userId !== user?.id) playSound('offer');
    seen.current = chat.length;
  }, [chat, user?.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    try {
      await sendChat(message);
      setText('');
    } catch { /* the error banner already shows why */ }
  };

  return (
    <section className="panel">
      <h3>Chat</h3>
      <div className="chat-list" ref={list} role="log" aria-label="Mensagens do chat">
        {chat.length === 0 && <p className="muted">Nenhuma mensagem ainda.</p>}
        {chat.map(m => (
          <p key={m.id} className="chat-message">
            <span className="color-dot" style={{ backgroundColor: colorOf(m.userId) }} />
            <strong>{m.userId === user?.id ? 'Você' : m.username}:</strong> {m.text}
          </p>
        ))}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input value={text} onChange={e => setText(e.target.value)} maxLength={MAX_LENGTH}
          placeholder="Escreva uma mensagem" aria-label="Mensagem" />
        <button type="submit" disabled={!text.trim()}>Enviar</button>
      </form>
    </section>
  );
}
