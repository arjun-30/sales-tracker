import express, { type ErrorRequestHandler } from "express";
// Patches Express 4 so a rejected promise in any route handler reaches the
// error middleware below instead of hanging the request or crashing Node.
import "express-async-errors";
import { Prisma } from "@prisma/client";
import cors from "cors";
import { authRouter } from "./routes/auth.routes";
import { districtsRouter } from "./routes/districts.routes";
import { employeesRouter } from "./routes/employees.routes";
import { trackingRouter } from "./routes/tracking.routes";
import { productsRouter } from "./routes/products.routes";
import { ordersRouter } from "./routes/orders.routes";
import { visitsRouter } from "./routes/visits.routes";
import { reportsRouter } from "./routes/reports.routes";

export const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/auth", authRouter);
app.use("/api/districts", districtsRouter);
app.use("/api/employees", employeesRouter);
app.use("/api/tracking", trackingRouter);
app.use("/api/products", productsRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/visits", visitsRouter);
app.use("/api/reports", reportsRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
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
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Malformed JSON body" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(errorHandler);
