import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { verifyAccessToken } from "./lib/jwt";

let io: Server | undefined;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN ?? "*" },
  });

  io.use((socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Missing auth token"));
    try {
      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as { sub: string; role: string; name: string };
    if (user.role === "admin") {
      socket.join("role:admin");
    }
    socket.join(`user:${user.sub}`);
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.io not initialized yet");
  return io;
}
