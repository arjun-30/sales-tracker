import "dotenv/config";
import { createServer } from "http";
import { app } from "./app";
import { initSocket } from "./socket";

const httpServer = createServer(app);
initSocket(httpServer);

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`paint-tracker server listening on http://localhost:${port}`);
});
