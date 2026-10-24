import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { plantFilter } from "../lib/scope";

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireAdmin);

const querySchema = z.object({
  districtId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  plantId: z.string().optional(),
});

reportsRouter.get("/summary", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { districtId, from, to } = parsed.data;
  // A plant admin only ever sees their plant; the super admin every plant or the one picked.
  const plant = plantFilter(req);
  const plantId = plant.plantId;

  const dateFilter =
    from || to
      ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined }
      : undefined;

  const orderWhere: Record<string, unknown> = { ...plant };
  if (districtId) orderWhere.districtId = districtId;
  if (dateFilter) orderWhere.createdAt = dateFilter;
  // Sales figures leave out cancelled orders: that money never came in. The
  // status breakdown and pending list still see every order.
  const salesWhere = { ...orderWhere, status: { not: "cancelled" as const } };

  const visitWhere: Record<string, unknown> = { ...plant };
  if (districtId) visitWhere.districtId = districtId;
  if (dateFilter) visitWhere.checkInAt = dateFilter;

  const STUCK_THRESHOLD_DAYS = 2;
  const stuckCutoff = new Date(Date.now() - STUCK_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);

  const [
    orderAgg,
    visitCount,
    activeEmployees,
    ordersByDistrict,
    ordersByDay,
    orderItemsForAgg,
    ordersByEmployee,
    visitsByEmployee,
    statusBreakdown,
    stuckPendingOrders,
    allDistricts,
    employeesByDistrict,
    onDutyLocations,
    ordersByDistrictAll,
    visitsByDistrictAll,
  ] = await Promise.all([
    prisma.order.aggregate({ where: salesWhere, _sum: { totalAmount: true }, _count: true }),
    prisma.visit.count({ where: visitWhere }),
    prisma.employeeLocation.count({ where: { onDuty: true, user: plant } }),
    prisma.order.groupBy({
      by: ["districtId"],
      where: salesWhere,
      _sum: { totalAmount: true },
      _count: true,
    }),
    (() => {
      const conditions: Prisma.Sql[] = [Prisma.sql`"status" <> 'cancelled'`];
      if (districtId) conditions.push(Prisma.sql`"districtId" = ${districtId}`);
      if (plantId) conditions.push(Prisma.sql`"plantId" = ${plantId}`);
      if (dateFilter?.gte) conditions.push(Prisma.sql`"createdAt" >= ${dateFilter.gte}`);
      if (dateFilter?.lte) conditions.push(Prisma.sql`"createdAt" <= ${dateFilter.lte}`);
      const where = Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`;
      return prisma.$queryRaw<{ day: string; total: number; count: bigint }[]>`
        -- createdAt is a UTC timestamp without zone: tag it as UTC, then convert to IST before bucketing by day.
        SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') as day, SUM("totalAmount")::float as total, COUNT(*) as count
        FROM "Order"
        ${where}
        GROUP BY day ORDER BY day ASC
      `;
    })(),
    prisma.orderItem.findMany({
      where: { order: salesWhere },
      select: {
        quantity: true,
        unitPrice: true,
        variant: { select: { product: { select: { id: true, name: true, category: true } } } },
        product: { select: { id: true, name: true, category: true } },
        customName: true,
      },
    }),
    prisma.order.groupBy({ by: ["employeeId"], where: salesWhere, _sum: { totalAmount: true }, _count: true }),
    prisma.visit.groupBy({ by: ["employeeId"], where: visitWhere, _count: true }),
    prisma.order.groupBy({ by: ["status"], where: orderWhere, _count: true }),
    prisma.order.findMany({
      where: { ...orderWhere, status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: {
        id: true,
        customerName: true,
        shopName: true,
        totalAmount: true,
        createdAt: true,
        employee: { select: { name: true } },
        district: { select: { name: true } },
      },
    }),
    prisma.district.findMany({ orderBy: { name: "asc" } }),
    prisma.user.groupBy({
      by: ["districtId"],
      where: { role: "sales_employee", active: true, districtId: { not: null }, ...plant },
      _count: true,
    }),
    prisma.employeeLocation.findMany({
      where: { onDuty: true, user: plant },
      select: { user: { select: { districtId: true } } },
    }),
    prisma.order.groupBy({
      by: ["districtId"],
      where: { ...plant, ...(dateFilter ? { createdAt: dateFilter } : {}) },
      _count: true,
    }),
    prisma.visit.groupBy({
      by: ["districtId"],
      where: { ...plant, ...(dateFilter ? { checkInAt: dateFilter } : {}) },
      _count: true,
    }),
  ]);

  const districts = await prisma.district.findMany({
    where: { id: { in: ordersByDistrict.map((d) => d.districtId) } },
  });
  const districtNameById = new Map(districts.map((d) => [d.id, d.name]));

  // Top products & revenue by category — aggregated in JS since category lives on
  // the related Product, not on OrderItem, so a single groupBy can't produce it.
  const productAgg = new Map<string, { name: string; category: string; quantity: number; revenue: number }>();
  const categoryAgg = new Map<string, number>();
  for (const item of orderItemsForAgg) {
    // A custom line counts towards its catalogue product; one for a product
    // the catalogue doesn't have is grouped under its own name.
    const product = item.variant?.product ??
      item.product ?? { id: `custom:${item.customName ?? ""}`, name: item.customName ?? "Custom item", category: "Custom" };
    const revenue = item.unitPrice.mul(item.quantity).toNumber();
    const existing = productAgg.get(product.id) ?? {
      name: product.name,
      category: product.category,
      quantity: 0,
      revenue: 0,
    };
    existing.quantity += item.quantity;
    existing.revenue += revenue;
    productAgg.set(product.id, existing);
    categoryAgg.set(product.category, (categoryAgg.get(product.category) ?? 0) + revenue);
  }
  const topProducts = [...productAgg.entries()]
    .map(([productId, v]) => ({ productId, ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
  const revenueByCategory = [...categoryAgg.entries()]
    .map(([category, revenue]) => ({ category, revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  // Employee leaderboard — union of everyone with an order or a visit in range,
  // so a visit-only employee (no sales yet) still shows up with 0 orders.
  const employeeIds = new Set<string>([
    ...ordersByEmployee.map((o) => o.employeeId),
    ...visitsByEmployee.map((v) => v.employeeId),
  ]);
  const employeeUsers = await prisma.user.findMany({
    where: { id: { in: [...employeeIds] } },
    select: { id: true, name: true },
  });
  const employeeNameById = new Map(employeeUsers.map((e) => [e.id, e.name]));
  const ordersCountById = new Map(ordersByEmployee.map((o) => [o.employeeId, o._count]));
  const salesById = new Map(ordersByEmployee.map((o) => [o.employeeId, o._sum.totalAmount?.toNumber() ?? 0]));
  const visitsCountById = new Map(visitsByEmployee.map((v) => [v.employeeId, v._count]));
  const employeeLeaderboard = [...employeeIds]
    .map((id) => {
      const visitsCountForEmp = visitsCountById.get(id) ?? 0;
      const ordersCountForEmp = ordersCountById.get(id) ?? 0;
      return {
        employeeId: id,
        name: employeeNameById.get(id) ?? "Unknown",
        ordersCount: ordersCountForEmp,
        totalSales: salesById.get(id) ?? 0,
        visitsCount: visitsCountForEmp,
        conversionRate: visitsCountForEmp > 0 ? ordersCountForEmp / visitsCountForEmp : null,
      };
    })
    .sort((a, b) => b.totalSales - a.totalSales);

  const orderStatusBreakdown = statusBreakdown.map((s) => ({ status: s.status, count: s._count }));

  // District coverage deliberately ignores the districtId filter (if any) — the
  // point is to see gaps across the whole territory, not drill into one district.
  const onDutyCountByDistrict = new Map<string, number>();
  for (const loc of onDutyLocations) {
    const d = loc.user?.districtId;
    if (d) onDutyCountByDistrict.set(d, (onDutyCountByDistrict.get(d) ?? 0) + 1);
  }
  const employeeCountByDistrict = new Map(employeesByDistrict.map((e) => [e.districtId as string, e._count]));
  const ordersByDistrictAllMap = new Map(ordersByDistrictAll.map((o) => [o.districtId, o._count]));
  const visitsByDistrictAllMap = new Map(visitsByDistrictAll.map((v) => [v.districtId, v._count]));
  const districtActivity = allDistricts
    .map((d) => ({
      districtId: d.id,
      districtName: d.name,
      employeeCount: employeeCountByDistrict.get(d.id) ?? 0,
      onDutyCount: onDutyCountByDistrict.get(d.id) ?? 0,
      ordersCount: ordersByDistrictAllMap.get(d.id) ?? 0,
      visitsCount: visitsByDistrictAllMap.get(d.id) ?? 0,
    }))
    .sort((a, b) => b.ordersCount + b.visitsCount - (a.ordersCount + a.visitsCount));

  // The super admin looking at every plant gets them side by side.
  const plantComparison =
    req.user!.role === "super_admin" && !plantId ? await comparePlants(salesWhere, visitWhere) : undefined;

  res.json({
    plantComparison,
    totalOrders: orderAgg._count,
    totalSales: orderAgg._sum.totalAmount?.toNumber() ?? 0,
    totalVisits: visitCount,
    activeEmployees,
    salesByDistrict: ordersByDistrict.map((d) => ({
      districtId: d.districtId,
      districtName: districtNameById.get(d.districtId) ?? "Unknown",
      totalSales: d._sum.totalAmount?.toNumber() ?? 0,
      orderCount: d._count,
    })),
    ordersOverTime: ordersByDay.map((r) => ({ day: r.day, total: r.total, count: Number(r.count) })),
    topProducts,
    revenueByCategory,
    employeeLeaderboard,
    orderStatusBreakdown,
    stuckPendingOrders: stuckPendingOrders.map((o) => ({
      id: o.id,
      customerName: o.customerName,
      shopName: o.shopName,
      employeeName: o.employee.name,
      districtName: o.district.name,
      totalAmount: o.totalAmount.toNumber(),
      createdAt: o.createdAt,
      isStuck: o.createdAt < stuckCutoff,
    })),
    districtActivity,
  });
});

async function comparePlants(salesWhere: Record<string, unknown>, visitWhere: Record<string, unknown>) {
  const [plants, sales, visits, staff, onDuty] = await Promise.all([
    prisma.plant.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
    prisma.order.groupBy({ by: ["plantId"], where: salesWhere, _sum: { totalAmount: true }, _count: true }),
    prisma.visit.groupBy({ by: ["plantId"], where: visitWhere, _count: true }),
    prisma.user.groupBy({ by: ["plantId"], where: { role: "sales_employee", active: true }, _count: true }),
    prisma.employeeLocation.findMany({ where: { onDuty: true }, select: { user: { select: { plantId: true } } } }),
  ]);
  const salesBy = new Map(sales.map((s) => [s.plantId, s]));
  const visitsBy = new Map(visits.map((v) => [v.plantId, v._count]));
  const staffBy = new Map(staff.map((u) => [u.plantId, u._count]));
  const onDutyBy = new Map<string, number>();
  for (const l of onDuty) {
    if (l.user.plantId) onDutyBy.set(l.user.plantId, (onDutyBy.get(l.user.plantId) ?? 0) + 1);
  }
  return plants
    .map((p) => ({
      plantId: p.id,
      name: p.name,
      code: p.code,
      totalSales: salesBy.get(p.id)?._sum.totalAmount?.toNumber() ?? 0,
      ordersCount: salesBy.get(p.id)?._count ?? 0,
      visitsCount: visitsBy.get(p.id) ?? 0,
      employeeCount: staffBy.get(p.id) ?? 0,
      onDutyCount: onDutyBy.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.totalSales - a.totalSales);
}
