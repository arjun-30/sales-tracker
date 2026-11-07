import "dotenv/config";
import { createServer } from "http";
import { app } from "./app";
import { initSocket } from "./socket";
import { startDutySweep } from "./lib/dutySweep";
import { smsProvider, whatsAppProvider } from "./lib/messaging";

const httpServer = createServer(app);
initSocket(httpServer);
startDutySweep();

const port = Number(process.env.PORT ?? 4000);
httpServer.listen(port, () => {
  console.log(`paint-tracker server listening on http://localhost:${port}`);
  // Without a provider, shop codes and order messages are only logged.
  if (smsProvider() === "log") console.warn("SMS_PROVIDER not set: SMS (including shop codes) are logged, not sent");
  if (whatsAppProvider() === "log") console.warn("WHATSAPP_PROVIDER not set: order PDFs are logged, not sent on WhatsApp");
});
