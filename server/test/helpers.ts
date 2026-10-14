import { createServer } from "http";
import bcrypt from "bcryptjs";
import request from "supertest";
import { app } from "../src/app";
import { prisma } from "../src/db";
import { initSocket } from "../src/socket";

// Tracking routes push through getIO(), so the socket server must exist.
// It is attached to an http server that never listens.
let socketReady = false;
export function ensureSocket() {
  if (!socketReady) {
    initSocket(createServer(app));
    socketReady = true;
  }
}

export const api = () => request(app);

export const PASSWORD = "secret123";

export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE "OrderItem", "Order", "Visit", "LocationHistory", "EmployeeLocation", "DutySession",
             "Store", "PlantPrice", "ProductVariant", "Product", "User", "Plant", "District" CASCADE
  `);
}

export async function seedFixtures() {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const chennai = await prisma.district.create({
    data: { name: "Chennai", centerLat: 13.08, centerLng: 80.27 },
  });
  const madurai = await prisma.district.create({
    data: { name: "Madurai", centerLat: 9.93, centerLng: 78.12 },
  });
  const plantA = await prisma.plant.create({ data: { name: "Chennai Plant", code: "CHN" } });
  const plantB = await prisma.plant.create({ data: { name: "Madurai Plant", code: "MDU" } });
  // "admin" is the super admin: it sees every plant.
  const admin = await prisma.user.create({
    data: { name: "Admin", phone: "9999999999", passwordHash, role: "super_admin" },
  });
  const adminA = await prisma.user.create({
    data: { name: "Admin A", phone: "9888888881", passwordHash, role: "admin", plantId: plantA.id },
  });
  const adminB = await prisma.user.create({
    data: { name: "Admin B", phone: "9888888882", passwordHash, role: "admin", plantId: plantB.id },
  });
  const empA = await prisma.user.create({
    data: {
      name: "Emp A",
      phone: "9000000001",
      employeeCode: "RLX-CHN-001",
      passwordHash,
      role: "sales_employee",
      districtId: chennai.id,
      plantId: plantA.id,
    },
  });
  const empB = await prisma.user.create({
    data: {
      name: "Emp B",
      phone: "9000000002",
      employeeCode: "RLX-MDU-001",
      passwordHash,
      role: "sales_employee",
      districtId: madurai.id,
      plantId: plantB.id,
    },
  });
  const product = await prisma.product.create({
    data: {
      name: "Royale Premium Emulsion",
      shortCode: "RPE",
      category: "Interior",
      variants: {
        create: [
          { sizeLabel: "1L", unit: "L", price: 500, sortOrder: 1 },
          { sizeLabel: "4L", unit: "L", price: 1800, sortOrder: 2 },
          { sizeLabel: "20L", unit: "L", price: 8000, sortOrder: 3, active: false },
        ],
      },
    },
    include: { variants: { orderBy: { sortOrder: "asc" } } },
  });
  const inactiveProduct = await prisma.product.create({
    data: {
      name: "Old Enamel",
      shortCode: "OEN",
      category: "Enamel",
      active: false,
      variants: { create: [{ sizeLabel: "1L", unit: "L", price: 300 }] },
    },
    include: { variants: true },
  });
  const [v1L, v4L, v20L] = product.variants;
  return {
    chennai,
    madurai,
    plantA,
    plantB,
    admin,
    adminA,
    adminB,
    empA,
    empB,
    product,
    inactiveProduct,
    v1L,
    v4L,
    v20LInactive: v20L,
    inactiveProductVariant: inactiveProduct.variants[0],
  };
}

export type Fixtures = Awaited<ReturnType<typeof seedFixtures>>;

// Orders and visits need the employee on duty. Sets the flag directly, without
// a duty session, for tests that are not about duty itself.
export async function putOnDuty(...userIds: string[]) {
  await prisma.employeeLocation.createMany({
    data: userIds.map((userId) => ({ userId, lat: 13.05, lng: 80.25, onDuty: true })),
  });
}

export async function login(phone: string, password = PASSWORD) {
  const res = await api().post("/api/auth/login").send({ phone, password });
  if (res.status !== 200) throw new Error(`login ${phone} failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { accessToken: string; refreshToken: string; user: { id: string } };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
