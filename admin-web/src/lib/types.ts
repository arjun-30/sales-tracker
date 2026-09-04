export type Role = "admin" | "sales_employee";

export interface District {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
}

export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  districtId: string | null;
}

export interface Employee {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  districtId: string | null;
  district: District | null;
  createdAt: string;
  employeeLocation: EmployeeLocation | null;
}

export interface EmployeeLocation {
  id: string;
  userId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  onDuty: boolean;
  updatedAt: string;
  user?: { id: string; name: string; districtId: string | null; district: District | null };
}

export interface ProductVariant {
  id: string;
  productId: string;
  sizeLabel: string;
  unit: string;
  price: number;
  sortOrder: number;
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  shortCode: string;
  category: string;
  active: boolean;
  variants: ProductVariant[];
}

export interface OrderItem {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  variant: ProductVariant & { product: Product };
}

export type OrderStatus = "pending" | "confirmed" | "delivered" | "cancelled";

export interface Order {
  id: string;
  employeeId: string;
  districtId: string;
  customerName: string;
  customerPhone: string | null;
  shopName: string | null;
  totalAmount: number;
  status: OrderStatus;
  notes: string | null;
  createdAt: string;
  employee: { id: string; name: string };
  district: District;
  items: OrderItem[];
}

export interface Visit {
  id: string;
  employeeId: string;
  districtId: string;
  shopName: string;
  checkInAt: string;
  checkInLat: number;
  checkInLng: number;
  checkOutAt: string | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  notes: string | null;
  employee: { id: string; name: string };
  district: District;
}

export interface ReportSummary {
  totalOrders: number;
  totalSales: number;
  totalVisits: number;
  activeEmployees: number;
  salesByDistrict: { districtId: string; districtName: string; totalSales: number; orderCount: number }[];
  ordersOverTime: { day: string; total: number; count: number }[];
  topProducts: { productId: string; name: string; category: string; quantity: number; revenue: number }[];
  revenueByCategory: { category: string; revenue: number }[];
  employeeLeaderboard: {
    employeeId: string;
    name: string;
    ordersCount: number;
    totalSales: number;
    visitsCount: number;
    conversionRate: number | null;
  }[];
  orderStatusBreakdown: { status: OrderStatus; count: number }[];
  stuckPendingOrders: {
    id: string;
    customerName: string;
    shopName: string | null;
    employeeName: string;
    districtName: string;
    totalAmount: number;
    createdAt: string;
    isStuck: boolean;
  }[];
  districtActivity: {
    districtId: string;
    districtName: string;
    employeeCount: number;
    onDutyCount: number;
    ordersCount: number;
    visitsCount: number;
  }[];
}
