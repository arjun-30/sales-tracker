import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db";
import { verifyAccessToken, type Role } from "../lib/jwt";

export interface RequestUser {
  sub: string;
  role: Role;
  name: string;
  plantId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

// Role and plant are read from the database on every request, not trusted from
// the token: moving an admin to another plant, or deactivating anyone, takes
// effect at once instead of when their 15-minute token runs out.
export async function loadRequestUser(token: string): Promise<RequestUser | null> {
  const { sub } = verifyAccessToken(token);
  const user = await prisma.user.findUnique({
    where: { id: sub },
    select: { id: true, role: true, name: true, plantId: true, active: true },
  });
  if (!user || !user.active) return null;
  return { sub: user.id, role: user.role, name: user.name, plantId: user.plantId };
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  let user: RequestUser | null;
  try {
    user = await loadRequestUser(header.slice("Bearer ".length));
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
  if (!user) return res.status(401).json({ error: "Invalid or expired token" });
  req.user = user;
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

// Plant admins and the super admin.
export const requireAdmin = requireRole("admin", "super_admin");
export const requireSuperAdmin = requireRole("super_admin");
