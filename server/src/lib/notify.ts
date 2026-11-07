import { prisma } from "../db";
import { plantAdminPhones, sendSms, sendWhatsAppDocument } from "./messaging";
import { loadOrderForPdf, orderPdf, orderRef } from "./orderPdf";

// What the shop owner and the plant's admins are told after each order and
// each visit that ended without one.

const rupees = (n: number) => `Rs ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const time = (d: Date) => d.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit" });

// The owner's number: the shop's own (checked by SMS code when it was added
// from the field), else the one typed on the order.
function ownerPhone(order: { store: { phone: string | null } | null; customerPhone: string | null }) {
  const phone = (order.store?.phone ?? order.customerPhone ?? "").replace(/\D/g, "").slice(-10);
  return phone.length === 10 ? phone : null;
}

// An order was taken: SMS to the owner and the plant admins, and the order
// copy as a PDF on the owner's WhatsApp.
export async function notifyOrderTaken(orderId: string) {
  const order = await loadOrderForPdf(orderId);
  if (!order) return;
  const ref = orderRef(order.id);
  const shop = order.store?.name ?? order.shopName ?? order.customerName;
  const total = rupees(Number(order.totalAmount));
  const items = `${order.items.length} ${order.items.length === 1 ? "item" : "items"}`;
  const context = { plantId: order.plantId, orderId: order.id };
  const owner = ownerPhone(order);

  const sends: Promise<unknown>[] = [];
  if (owner) {
    sends.push(
      sendSms({
        ...context,
        kind: "order_owner",
        to: owner,
        text: `Roalux: Order ${ref} for ${shop} taken by ${order.employee.name}, ${items}, total ${total}. The order copy is on your WhatsApp. Thank you.`,
        vars: [ref, shop, order.employee.name, items, total],
      })
    );
    sends.push(
      orderPdf(order).then((pdf) =>
        sendWhatsAppDocument({
          ...context,
          kind: "order_pdf",
          to: owner,
          pdf,
          filename: `Roalux-order-${ref}.pdf`,
          text: `Order ${ref} for ${shop}, total ${total}. Thank you for your order.`,
          vars: [ref, shop, total],
        })
      )
    );
  }
  for (const admin of await plantAdminPhones(order.plantId)) {
    sends.push(
      sendSms({
        ...context,
        kind: "order_admin",
        to: admin,
        text: `Roalux: ${order.employee.name} took order ${ref} at ${shop}, ${items}, ${total}.`,
        vars: [order.employee.name, ref, shop, items, total],
      })
    );
  }
  await Promise.all(sends);
}

// A visit to a shop on the map ended. If no order was taken there during it,
// the owner and the plant admins are told; an order already sent its own SMS.
export async function notifyVisitEnded(visitId: string) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: { store: { select: { name: true, phone: true } }, employee: { select: { name: true } } },
  });
  if (!visit?.storeId || !visit.store || !visit.checkOutAt) return;
  const ordered = await prisma.order.count({
    where: {
      employeeId: visit.employeeId,
      storeId: visit.storeId,
      status: { not: "cancelled" },
      createdAt: { gte: visit.checkInAt, lte: visit.checkOutAt },
    },
  });
  if (ordered > 0) return;

  const shop = visit.store.name;
  const at = time(visit.checkInAt);
  const context = { plantId: visit.plantId, visitId: visit.id };
  const sends: Promise<unknown>[] = [];
  const owner = (visit.store.phone ?? "").replace(/\D/g, "").slice(-10);
  // The salesperson can choose at checkout not to message the owner.
  if (owner.length === 10 && visit.notifyOwner) {
    sends.push(
      sendSms({
        ...context,
        kind: "visit_owner",
        to: owner,
        text: `Roalux: ${visit.employee.name} visited ${shop} today at ${at}. No order was placed this time. Thank you for your time.`,
        vars: [visit.employee.name, shop, at],
      })
    );
  }
  for (const admin of await plantAdminPhones(visit.plantId)) {
    sends.push(
      sendSms({
        ...context,
        kind: "visit_admin",
        to: admin,
        text: `Roalux: ${visit.employee.name} visited ${shop} at ${at}. No order was taken.`,
        vars: [visit.employee.name, shop, at],
      })
    );
  }
  await Promise.all(sends);
}

async function orderForMessage(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: { store: { select: { name: true, phone: true } } },
  });
}

// The office confirmed the order: the owner gets a thank-you with the
// reference, so they know it is being supplied.
export async function notifyOrderConfirmed(orderId: string) {
  const order = await orderForMessage(orderId);
  const owner = order && ownerPhone(order);
  if (!order || !owner) return;
  const ref = orderRef(order.id);
  const shop = order.store?.name ?? order.shopName ?? order.customerName;
  const total = rupees(Number(order.totalAmount));
  await sendSms({
    plantId: order.plantId,
    orderId: order.id,
    kind: "order_confirmed_owner",
    to: owner,
    text: `Roalux: Thank you, ${shop}. Your order ${ref} of ${total} is confirmed and will be dispatched soon.`,
    vars: [shop, ref, total],
  });
}

// The goods left the plant: the owner hears which vehicle and whom to call.
export async function notifyOrderDispatched(orderId: string) {
  const order = await orderForMessage(orderId);
  const owner = order && ownerPhone(order);
  if (!order || !owner) return;
  const ref = orderRef(order.id);
  const vehicle = order.vehicleNo ?? "our vehicle";
  const driver = [order.driverName, order.driverPhone].filter(Boolean).join(" ") || "the office";
  await sendSms({
    plantId: order.plantId,
    orderId: order.id,
    kind: "order_dispatched_owner",
    to: owner,
    text: `Roalux: Your order ${ref} has been dispatched in ${vehicle}. Driver: ${driver}. Thank you.`,
    vars: [ref, vehicle, driver],
  });
}

const PAYMENT_MODE_LABEL: Record<string, string> = {
  cash: "cash",
  upi: "UPI",
  cheque: "cheque",
  bank_transfer: "bank transfer",
  credit: "credit",
};

// Payment recorded at checkout: the owner gets a receipt by SMS. Credit is
// not money received, so it sends nothing.
export async function notifyPaymentReceived(visitId: string) {
  const visit = await prisma.visit.findUnique({
    where: { id: visitId },
    include: { store: { select: { name: true, phone: true } }, employee: { select: { name: true } } },
  });
  if (!visit?.store || !visit.notifyOwner) return;
  if (!visit.paymentAmount || !visit.paymentMode || visit.paymentMode === "credit") return;
  const owner = (visit.store.phone ?? "").replace(/\D/g, "").slice(-10);
  if (owner.length !== 10) return;
  const amount = rupees(Number(visit.paymentAmount));
  const mode = PAYMENT_MODE_LABEL[visit.paymentMode] + (visit.paymentRef ? ` (${visit.paymentRef})` : "");
  await sendSms({
    plantId: visit.plantId,
    visitId: visit.id,
    kind: "payment_owner",
    to: owner,
    text: `Roalux: Received ${amount} by ${mode} from ${visit.store.name}, collected by ${visit.employee.name}. Thank you.`,
    vars: [amount, mode, visit.store.name, visit.employee.name],
  });
}
