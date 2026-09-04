import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import { authRouter } from "./routes/auth.routes";
import { districtsRouter } from "./routes/districts.routes";
import { employeesRouter } from "./routes/employees.routes";
import { trackingRouter } from "./routes/tracking.routes";
import { productsRouter } from "./routes/products.routes";
import { ordersRouter } from "./routes/orders.routes";
import { visitsRouter } from "./routes/visits.routes";
import { reportsRouter } from "./routes/reports.routes";
import { initSocket } from "./socket";

const app = express();
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

const httpServer = createServer(app);
initSocket(httpServer);

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`paint-tracker server listening on http://localhost:${port}`);
});
