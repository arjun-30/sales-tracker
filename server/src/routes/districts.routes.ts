import { Router } from "express";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";

export const districtsRouter = Router();

districtsRouter.get("/", requireAuth, async (_req, res) => {
  const districts = await prisma.district.findMany({ orderBy: { name: "asc" } });
  res.json({ districts });
});
