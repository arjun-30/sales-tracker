import { io, type Socket } from "socket.io-client";
import { API_URL, getAccessToken } from "./api";

let socket: Socket | null = null;

export function connectSocket(): Socket {
  if (socket?.connected) return socket;
  socket = io(API_URL, {
    transports: ["websocket"],
    auth: { token: getAccessToken() },
  });
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
