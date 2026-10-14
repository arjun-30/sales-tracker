import type { Server as HttpServer } from "http";
import { Server, type Socket } from "socket.io";
import { loadRequestUser, type RequestUser } from "./middleware/auth";
import { config } from "./config";

let io: Server | undefined;

export function initSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: config.corsOrigin },
  });

  io.use(async (socket: Socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("Missing auth token"));
    try {
      const user = await loadRequestUser(token);
      if (!user) return next(new Error("Invalid or expired token"));
      socket.data.user = user;
      next();
    } catch {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const user = socket.data.user as RequestUser;
    if (user.role === "super_admin") socket.join("role:super_admin");
    if (user.role === "admin" && user.plantId) socket.join(`plant:${user.plantId}`);
    socket.join(`user:${user.sub}`);
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.io not initialized yet");
  return io;
}

// Live updates go to the super admin and to the admins of the plant they
// concern, never to other plants.
export function emitToAdmins(plantId: string | null, event: string, payload: Record<string, unknown>) {
  const rooms = ["role:super_admin", ...(plantId ? [`plant:${plantId}`] : [])];
  getIO().to(rooms).emit(event, { ...payload, plantId });
}
