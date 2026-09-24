import { io, type Socket } from "socket.io-client";
import { API_URL, getAccessToken, tryRefresh } from "./api";

let socket: Socket | null = null;

export function connectSocket(): Socket {
  // Reuse while connecting too, or a second call opens a duplicate socket.
  if (socket) return socket;
  socket = io(API_URL, {
    transports: ["websocket"],
    // Callback form is re-evaluated on every (re)connect, so a rotated token is picked up.
    auth: (cb) => cb({ token: getAccessToken() }),
  });
  // Socket.io does not auto-retry after the server's auth middleware rejects
  // the handshake, so refresh the access token and reconnect ourselves.
  socket.on("connect_error", async () => {
    const s = socket;
    if (!s || s.active) return; // still retrying on its own (plain network error)
    const token = await tryRefresh().catch(() => null);
    if (token && socket === s) s.connect();
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
