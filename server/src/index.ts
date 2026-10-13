import "dotenv/config";
import { createServer } from "http";
import { app } from "./app";
import { initSocket } from "./socket";
import { startDutySweep } from "./lib/dutySweep";

const httpServer = createServer(app);
initSocket(httpServer);
startDutySweep();

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`paint-tracker server listening on http://localhost:${port}`);
});
