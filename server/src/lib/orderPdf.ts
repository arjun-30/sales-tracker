import path from "path";
import PDFDocument from "pdfkit";
import { prisma } from "../db";

// The order copy sent to the shop owner on WhatsApp and downloadable from the
// dashboard: who took it, for which shop, and every line with its price.

const LOGO = path.join(__dirname, "../../assets/roalux-logo.png");
const RED = "#c8102e";
const MUTED = "#555555";
const LINE = "#d9d9d9";

// A short reference people can read out on the phone: RLX-7K2Q9M.
export const orderRef = (id: string) => `RLX-${id.slice(-6).toUpperCase()}`;

// The built-in PDF fonts have no rupee sign.
const rupees = (n: number) => `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const titleCase = (name: string) =>
  name
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|[\s(])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase());

export async function loadOrderForPdf(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      employee: { select: { name: true, phone: true, employeeCode: true } },
      plant: { select: { name: true, address: true } },
      store: { select: { name: true, ownerName: true, phone: true, address: true } },
      items: { include: { variant: { include: { product: true } }, product: true } },
    },
  });
}

type PdfOrder = NonNullable<Awaited<ReturnType<typeof loadOrderForPdf>>>;

export function orderPdf(order: PdfOrder): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: `Roalux order ${orderRef(order.id)}` } });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // Header: logo, plant, and the order reference.
    doc.image(LOGO, left, 44, { width: 120 });
    doc
      .font("Helvetica-Bold")
      .fontSize(18)
      .fillColor("#000")
      .text("Order copy", left, 50, { width, align: "right" })
      .font("Helvetica")
      .fontSize(10)
      .fillColor(MUTED)
      .text(orderRef(order.id), { width, align: "right" })
      .text(
        order.createdAt.toLocaleString("en-IN", {
          timeZone: "Asia/Kolkata",
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }),
        { width, align: "right" }
      );
    doc.moveTo(left, 104).lineTo(right, 104).lineWidth(2).strokeColor(RED).stroke();

    // Shop and salesperson side by side.
    const shopName = order.store?.name ?? order.shopName ?? order.customerName;
    const shopLines = [
      order.store?.ownerName ?? order.customerName,
      order.store?.phone ?? order.customerPhone,
      order.store?.address,
    ].filter((l): l is string => !!l && l !== shopName);
    const half = width / 2 - 10;
    const top = 120;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text("SHOP", left, top);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#000").text(shopName, left, top + 14, { width: half });
    doc.font("Helvetica").fontSize(10).fillColor(MUTED);
    for (const l of shopLines) doc.text(l, { width: half });
    const shopBottom = doc.y;

    const mid = left + width / 2 + 10;
    doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text("TAKEN BY", mid, top);
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#000").text(order.employee.name, mid, top + 14, { width: half });
    doc.font("Helvetica").fontSize(10).fillColor(MUTED);
    for (const l of [order.employee.employeeCode, order.employee.phone, order.plant.name]) if (l) doc.text(l, { width: half });
    const repBottom = doc.y;

    // Lines.
    const cols = { item: left, size: left + width * 0.5, qty: left + width * 0.64, rate: left + width * 0.72, amount: left + width * 0.86 };
    let y = Math.max(shopBottom, repBottom) + 24;
    doc.rect(left, y, width, 22).fill("#f2f2f2");
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#000");
    doc.text("PRODUCT", cols.item + 8, y + 7);
    doc.text("SIZE", cols.size, y + 7);
    doc.text("QTY", cols.qty, y + 7, { width: cols.rate - cols.qty - 8, align: "right" });
    doc.text("RATE", cols.rate, y + 7, { width: cols.amount - cols.rate - 8, align: "right" });
    doc.text("AMOUNT", cols.amount, y + 7, { width: right - cols.amount - 8, align: "right" });
    y += 22;

    doc.font("Helvetica").fontSize(10);
    for (const i of order.items) {
      const name = titleCase(i.variant?.product.name ?? i.product?.name ?? i.customName ?? "Custom item");
      const size = i.variant?.sizeLabel === "STD" ? "Standard" : (i.variant?.sizeLabel ?? i.customSize ?? "");
      const rate = Number(i.unitPrice);
      const nameHeight = doc.heightOfString(name, { width: cols.size - cols.item - 16 });
      const rowHeight = Math.max(nameHeight, 12) + 14;
      if (y + rowHeight > doc.page.height - 120) {
        doc.addPage();
        y = doc.page.margins.top;
      }
      doc.fillColor("#000").text(name, cols.item + 8, y + 7, { width: cols.size - cols.item - 16 });
      doc.fillColor(MUTED).text(size, cols.size, y + 7, { width: cols.qty - cols.size - 8 });
      doc.fillColor("#000").text(String(i.quantity), cols.qty, y + 7, { width: cols.rate - cols.qty - 8, align: "right" });
      doc.text(rupees(rate), cols.rate, y + 7, { width: cols.amount - cols.rate - 8, align: "right" });
      doc.text(rupees(rate * i.quantity), cols.amount, y + 7, { width: right - cols.amount - 8, align: "right" });
      y += rowHeight;
      doc.moveTo(left, y).lineTo(right, y).lineWidth(0.5).strokeColor(LINE).stroke();
    }

    y += 12;
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#000");
    // The total gets the rate and amount columns together, so it never wraps.
    doc.text("Total", cols.qty - 40, y, { width: cols.rate - cols.qty + 32, align: "right" });
    doc.text(rupees(Number(order.totalAmount)), cols.rate, y, { width: right - cols.rate - 8, align: "right" });
    y += 30;

    if (order.notes) {
      doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text("NOTES", left, y);
      doc.font("Helvetica").fontSize(10).fillColor("#000").text(order.notes, left, y + 14, { width });
      y = doc.y + 16;
    }

    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        "Rates are those in force when the order was taken. The office confirms the order and the delivery date. " +
          "For any change, call the salesperson above.",
        left,
        Math.max(y, doc.page.height - 110),
        { width }
      );
    doc.end();
  });
}
