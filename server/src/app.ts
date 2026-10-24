import express, { type ErrorRequestHandler } from "express";
// Patches Express 4 so a rejected promise in any route handler reaches the
// error middleware below instead of hanging the request or crashing Node.
import "express-async-errors";
import { Prisma } from "@prisma/client";
import cors from "cors";
import { config } from "./config";
import { authRouter } from "./routes/auth.routes";
import { districtsRouter } from "./routes/districts.routes";
import { employeesRouter } from "./routes/employees.routes";
import { trackingRouter } from "./routes/tracking.routes";
import { productsRouter } from "./routes/products.routes";
import { ordersRouter } from "./routes/orders.routes";
import { visitsRouter } from "./routes/visits.routes";
import { reportsRouter } from "./routes/reports.routes";
import { plantsRouter } from "./routes/plants.routes";
import { adminsRouter } from "./routes/admins.routes";
import { storesRouter } from "./routes/stores.routes";
import { MulterError } from "multer";
import { HttpError } from "./lib/scope";

export const app = express();
app.set("trust proxy", config.trustProxy);
app.disable("x-powered-by");
app.use(cors({ origin: config.corsOrigin }));
// Room for an imported dealer list (a couple of thousand rows).
app.use(express.json({ limit: "2mb" }));
// Money columns are Prisma Decimals, which JSON.stringify would turn into
// strings. Send them as numbers so the clients keep working unchanged.
app.set("json replacer", function (this: Record<string, unknown>, key: string, value: unknown) {
  const raw = this[key];
  return Prisma.Decimal.isDecimal(raw) ? (raw as Prisma.Decimal).toNumber() : value;
});

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/districts", districtsRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/tracking", trackingRouter);
app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/visits", visitsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/plants", plantsRouter);
app.use("/api/admins", adminsRouter);
app.use("/api/stores", storesRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  // A plantId, districtId or similar that points at nothing.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
    return res.status(400).json({ error: "Refers to a plant, district or product that does not exist" });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    return res.status(404).json({ error: "Not found" });
  }
  // e.g. an unparseable ?from= date reaching a Prisma filter
  // Unique constraint, e.g. a duplicate product short code or size label.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const fields = (err.meta?.target as string[] | undefined)?.join(", ");
    return res.status(409).json({ error: fields ? `Already exists: ${fields}` : "Already exists" });
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return res.status(400).json({ error: "Invalid request parameters" });
  }
  // An order's voice note that is too long, or more than one file.
  if (err instanceof MulterError) {
    return res
      .status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400)
      .json({ error: err.code === "LIMIT_FILE_SIZE" ? "The voice note is too long. Keep it under a few minutes." : err.message });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Malformed JSON body" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);
