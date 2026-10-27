import { io, Socket } from 'socket.io-client';

// In development the Vite page talks to the backend on port 3001. The built frontend is served
// by the backend itself, so it connects to wherever the page came from (localhost, ngrok...).
const BACKEND_URL: string | undefined =
  import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? 'http://localhost:3001' : undefined);

export const socket: Socket = BACKEND_URL
  ? io(BACKEND_URL, { autoConnect: false })
  : io({ autoConnect: false });

