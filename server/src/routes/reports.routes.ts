import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

export const reportsRouter = Router();

reportsRouter.use(requireAuth, requireRole("admin"));

const querySchema = z.object({
  districtId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

reportsRouter.get("/summary", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { districtId, from, to } = parsed.data;

  const dateFilter =
    from || to
      ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined }
      : undefined;

  const orderWhere: Record<string, unknown> = {};
  if (districtId) orderWhere.districtId = districtId;
  if (dateFilter) orderWhere.createdAt = dateFilter;

  const visitWhere: Record<string, unknown> = {};
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
    prisma.order.aggregate({ where: orderWhere, _sum: { totalAmount: true }, _count: true }),
    prisma.visit.count({ where: visitWhere }),
    prisma.employeeLocation.count({ where: { onDuty: true } }),
    prisma.order.groupBy({
      by: ["districtId"],
      where: orderWhere,
      _sum: { totalAmount: true },
      _count: true,
    }),
    (() => {
      const conditions: Prisma.Sql[] = [];
      if (districtId) conditions.push(Prisma.sql`"districtId" = ${districtId}`);
      if (dateFilter?.gte) conditions.push(Prisma.sql`"createdAt" >= ${dateFilter.gte}`);
      if (dateFilter?.lte) conditions.push(Prisma.sql`"createdAt" <= ${dateFilter.lte}`);
      const where = conditions.length
        ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
        : Prisma.empty;
      return prisma.$queryRaw<{ day: string; total: number; count: bigint }[]>`
        SELECT to_char("createdAt", 'YYYY-MM-DD') as day, SUM("totalAmount")::float as total, COUNT(*) as count
        FROM "Order"
        ${where}
        GROUP BY day ORDER BY day ASC
      `;
    })(),
    prisma.orderItem.findMany({
      where: { order: orderWhere },
      select: {
        quantity: true,
        unitPrice: true,
        variant: { select: { product: { select: { id: true, name: true, category: true } } } },
      },
    }),
    prisma.order.groupBy({ by: ["employeeId"], where: orderWhere, _sum: { totalAmount: true }, _count: true }),
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
      where: { role: "sales_employee", active: true, districtId: { not: null } },
      _count: true,
    }),
    prisma.employeeLocation.findMany({
      where: { onDuty: true },
      select: { user: { select: { districtId: true } } },
    }),
    prisma.order.groupBy({
      by: ["districtId"],
      where: dateFilter ? { createdAt: dateFilter } : {},
      _count: true,
    }),
    prisma.visit.groupBy({
      by: ["districtId"],
      where: dateFilter ? { checkInAt: dateFilter } : {},
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
    const product = item.variant.product;
    const revenue = item.quantity * item.unitPrice;
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
  const salesById = new Map(ordersByEmployee.map((o) => [o.employeeId, o._sum.totalAmount ?? 0]));
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

  res.json({
    totalOrders: orderAgg._count,
    totalSales: orderAgg._sum.totalAmount ?? 0,
    totalVisits: visitCount,
    activeEmployees,
    salesByDistrict: ordersByDistrict.map((d) => ({
      districtId: d.districtId,
      districtName: districtNameById.get(d.districtId) ?? "Unknown",
      totalSales: d._sum.totalAmount ?? 0,
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
      totalAmount: o.totalAmount,
      createdAt: o.createdAt,
      isStuck: o.createdAt < stuckCutoff,
    })),
    districtActivity,
  });
});
