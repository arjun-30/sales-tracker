import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { gstinLookupLimiter } from "../middleware/rateLimit";
import { verifyGstin } from "../lib/gstVerify";

export const gstinRouter = Router();

gstinRouter.use(requireAuth);

// The app and admin panel check a GSTIN as it is typed: the registered name
// and status from the GST portal, or what is wrong with the number.
gstinRouter.get("/:gstin", gstinLookupLimiter, async (req, res) => {
  res.json(await verifyGstin(String(req.params.gstin).slice(0, 20)));
});
