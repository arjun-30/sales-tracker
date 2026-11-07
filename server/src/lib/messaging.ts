import { prisma } from "../db";

// SMS and WhatsApp to shop owners and plant admins. Every message is written
// to OutboundMessage, sent or not, so the office can see what went out.
//
// SMS goes through MSG91 (India: each text is a DLT-registered template, sent
// by its template id with the values as var1, var2, ...). WhatsApp goes
// through Meta's WhatsApp Cloud API with an approved template whose header is
// a document. With no provider set up, messages are only logged: the app and
// the test suite work without an account.

export type SmsKind = "store_otp" | "order_owner" | "order_admin" | "visit_owner" | "visit_admin";

// The env var holding each kind's MSG91 template id.
const SMS_TEMPLATE_ENV: Record<SmsKind, string> = {
  store_otp: "MSG91_TEMPLATE_STORE_OTP",
  order_owner: "MSG91_TEMPLATE_ORDER_OWNER",
  order_admin: "MSG91_TEMPLATE_ORDER_ADMIN",
  visit_owner: "MSG91_TEMPLATE_VISIT_OWNER",
  visit_admin: "MSG91_TEMPLATE_VISIT_ADMIN",
};

export const smsProvider = () => (process.env.SMS_PROVIDER === "msg91" ? "msg91" : "log");
export const whatsAppProvider = () => (process.env.WHATSAPP_PROVIDER === "meta" ? "meta" : "log");

interface Context {
  plantId?: string | null;
  orderId?: string | null;
  visitId?: string | null;
}

export interface Sms extends Context {
  kind: SmsKind;
  // 10-digit Indian mobile number.
  to: string;
  // The message as the recipient reads it; what the DLT template must say.
  text: string;
  // The template's variables, in order.
  vars: string[];
}

const to91 = (phone: string) => `91${phone.replace(/\D/g, "").slice(-10)}`;

async function record(
  data: Context & { channel: "sms" | "whatsapp"; kind: string; to: string; body: string; provider: string },
  outcome: { status: "sent" | "failed" | "logged"; providerRef?: string | null; error?: string | null }
) {
  await prisma.outboundMessage.create({ data: { ...data, ...outcome } });
  if (outcome.status === "logged") console.log(`[${data.channel} not sent, no provider] to ${data.to}: ${data.body}`);
  if (outcome.status === "failed") console.error(`[${data.channel} failed] to ${data.to}: ${outcome.error}`);
}

// Sends one SMS. Resolves to false when it could not be sent; never throws for
// a provider failure, which is recorded instead.
export async function sendSms(sms: Sms): Promise<boolean> {
  const provider = smsProvider();
  const base = {
    channel: "sms" as const,
    kind: sms.kind,
    to: sms.to,
    body: sms.text,
    provider,
    plantId: sms.plantId,
    orderId: sms.orderId,
    visitId: sms.visitId,
  };
  if (provider === "log") {
    await record(base, { status: "logged" });
    return true;
  }
  try {
    const templateId = process.env[SMS_TEMPLATE_ENV[sms.kind]];
    if (!templateId) throw new Error(`${SMS_TEMPLATE_ENV[sms.kind]} is not set`);
    const recipient: Record<string, string> = { mobiles: to91(sms.to) };
    sms.vars.forEach((v, i) => (recipient[`var${i + 1}`] = v));
    const res = await fetch("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey: process.env.MSG91_AUTH_KEY ?? "", "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        template_id: templateId,
        short_url: "0",
        ...(process.env.MSG91_SENDER ? { sender: process.env.MSG91_SENDER } : {}),
        recipients: [recipient],
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
    if (!res.ok || body.type === "error") throw new Error(body.message ?? `MSG91 answered ${res.status}`);
    await record(base, { status: "sent", providerRef: body.message ?? null });
    return true;
  } catch (err) {
    await record(base, { status: "failed", error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

export interface WhatsAppDocument extends Context {
  kind: string;
  to: string;
  pdf: Buffer;
  filename: string;
  // What the recipient reads under the document; what the template must say.
  text: string;
  // The template's body variables, in order ({{1}}, {{2}}, ...).
  vars: string[];
}

const graph = (path: string) => `https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION ?? "v21.0"}/${path}`;

// Sends a PDF on WhatsApp: uploaded to Meta first, then sent with the
// approved template (a business may only open a chat with a template).
export async function sendWhatsAppDocument(doc: WhatsAppDocument): Promise<boolean> {
  const provider = whatsAppProvider();
  const base = {
    channel: "whatsapp" as const,
    kind: doc.kind,
    to: doc.to,
    body: `${doc.text} [${doc.filename}]`,
    provider,
    plantId: doc.plantId,
    orderId: doc.orderId,
    visitId: doc.visitId,
  };
  if (provider === "log") {
    await record(base, { status: "logged" });
    return true;
  }
  try {
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const template = process.env.WHATSAPP_ORDER_TEMPLATE;
    if (!phoneNumberId || !template) throw new Error("WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ORDER_TEMPLATE must be set");
    const auth = { authorization: `Bearer ${process.env.WHATSAPP_TOKEN ?? ""}` };

    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", "application/pdf");
    form.append("file", new Blob([doc.pdf], { type: "application/pdf" }), doc.filename);
    const upload = await fetch(graph(`${phoneNumberId}/media`), {
      method: "POST",
      headers: auth,
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    const media = (await upload.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!upload.ok || !media.id) throw new Error(media.error?.message ?? `Media upload answered ${upload.status}`);

    const send = await fetch(graph(`${phoneNumberId}/messages`), {
      method: "POST",
      headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to91(doc.to),
        type: "template",
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "en" },
          components: [
            { type: "header", parameters: [{ type: "document", document: { id: media.id, filename: doc.filename } }] },
            { type: "body", parameters: doc.vars.map((text) => ({ type: "text", text })) },
          ],
        },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const sent = (await send.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
    if (!send.ok) throw new Error(sent.error?.message ?? `WhatsApp answered ${send.status}`);
    await record(base, { status: "sent", providerRef: sent.messages?.[0]?.id ?? null });
    return true;
  } catch (err) {
    await record(base, { status: "failed", error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}

// Messages about an order or visit go out after the response, so a slow
// provider never holds up the salesperson. The test suite waits for them.
const inFlight = new Set<Promise<unknown>>();

export function inBackground(task: () => Promise<unknown>) {
  const p = task()
    .catch((err) => console.error("Background message failed:", err))
    .finally(() => inFlight.delete(p));
  inFlight.add(p);
}

export async function flushMessages() {
  while (inFlight.size > 0) await Promise.all([...inFlight]);
}

// The active admins of a plant, who are told about its orders and visits.
export async function plantAdminPhones(plantId: string): Promise<string[]> {
  const admins = await prisma.user.findMany({ where: { plantId, role: "admin", active: true }, select: { phone: true } });
  return admins.map((a) => a.phone);
}
