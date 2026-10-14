import type { Request } from "express";

// Thrown from a route to answer with that status; see the error handler in app.ts.
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

// The plant an admin request is about. A plant admin always gets their own
// plant, whatever they ask for. The super admin gets the ?plantId they picked,
// or null for every plant.
export function scopedPlantId(req: Request): string | null {
  const user = req.user!;
  if (user.role === "super_admin") {
    const asked = req.query.plantId;
    return typeof asked === "string" && asked ? asked : null;
  }
  if (!user.plantId) throw new HttpError(403, "Your account is not linked to a plant");
  return user.plantId;
}

// Prisma filter limiting a query to the request's plant ({} = every plant).
export function plantFilter(req: Request): { plantId?: string } {
  const plantId = scopedPlantId(req);
  return plantId ? { plantId } : {};
}

// The plant a new record goes into. A plant admin can only add to their own;
// the super admin must say which plant.
export function targetPlantId(req: Request, requested: string | undefined | null): string {
  const user = req.user!;
  if (user.role === "super_admin") {
    if (!requested) throw new HttpError(400, "Choose a plant");
    return requested;
  }
  if (!user.plantId) throw new HttpError(403, "Your account is not linked to a plant");
  if (requested && requested !== user.plantId) throw new HttpError(403, "You can only manage your own plant");
  return user.plantId;
}
