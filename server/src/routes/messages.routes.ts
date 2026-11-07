import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { plantFilter } from "../lib/scope";
import { smsProvider, whatsAppProvider } from "../lib/messaging";

// The SMS and WhatsApp messages sent for the plant, newest first, so the
// office can check what a shop owner or admin was told and whether it went.
export const messagesRouter = Router();

messagesRouter.use(requireAuth, requireAdmin);

const listQuerySchema = z.object({
  kind: z.string().optional(),
  status: z.enum(["sent", "failed", "logged"]).optional(),
});

messagesRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "Invalid filter" });
  const { kind, status } = parsed.data;
  const messages = await prisma.outboundMessage.findMany({
    where: { ...plantFilter(req), ...(kind ? { kind } : {}), ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
  // A one-time code is the owner's alone, even in the office's log.
  const shown = messages.map((m) => (m.kind === "store_otp" ? { ...m, body: m.body.replace(/^\d{6}/, "******") } : m));
  res.json({ messages: shown, providers: { sms: smsProvider(), whatsapp: whatsAppProvider() } });
});
