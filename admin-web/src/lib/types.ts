export type Role = "admin" | "sales_employee" | "super_admin";

export interface PlantRef {
  id: string;
  name: string;
  code: string;
}

export interface Plant extends PlantRef {
  address: string | null;
  adminCount: number;
  employeeCount: number;
  storeCount: number;
}

export interface PlantAdmin {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  plantId: string | null;
  plant: PlantRef | null;
  createdAt: string;
}

export interface Store {
  id: string;
  plantId: string;
  name: string;
  ownerName: string | null;
  phone: string | null;
  address: string | null;
  lat: number;
  lng: number;
  notes: string | null;
  // A shop a salesperson added from the field waits for approval.
  status: "pending" | "approved";
  // When the owner read back the SMS code sent to the number.
  phoneVerifiedAt: string | null;
  // Checked for layout and check digit by the server.
  gstin: string | null;
  // YYYY-MM-DD (as an ISO date at midnight UTC), set at visit checkout.
  nextVisitOn: string | null;
  createdAt: string;
  plant: PlantRef;
  createdBy: { id: string; name: string } | null;
}

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
  employeeCode?: string | null;
  role: Role;
  districtId: string | null;
  plantId: string | null;
  plant: PlantRef | null;
}

export interface Employee {
  id: string;
  name: string;
  phone: string;
  employeeCode: string | null;
  minutesToday: number;
  active: boolean;
  districtId: string | null;
  district: District | null;
  plantId: string | null;
  plant: PlantRef | null;
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
  // Since when the employee has stayed in one spot (null when off duty).
  stationarySince: string | null;
  updatedAt: string;
  user?: {
    id: string;
    name: string;
    employeeCode?: string | null;
    districtId: string | null;
    district: District | null;
    plantId?: string | null;
    plant?: PlantRef | null;
  };
}

export interface ProductVariant {
  id: string;
  productId: string;
  sizeLabel: string;
  unit: string;
  // What the plant being viewed sells at: its own price, else the company price.
  price: number;
  basePrice: number;
  plantPrice: number | null;
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
  shades: ProductShade[];
}

// A colour of a product, picked on the order line after the product code.
export interface ProductShade {
  id: string;
  productId: string;
  name: string;
  code: string | null;
  hex: string | null;
  sortOrder: number;
  active: boolean;
}

// A catalogue size, or (variantId null) a custom size the salesperson
// described and priced at the shop: of `product`, or of one named in customName.
export interface OrderItem {
  id: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  variant: (ProductVariant & { product: Product }) | null;
  product: Product | null;
  customName: string | null;
  customSize: string | null;
  // "Ivory (2041)": the colour picked for the line.
  shadeName: string | null;
}

export type OrderStatus = "pending" | "confirmed" | "dispatched" | "delivered" | "cancelled";

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
  plantId: string;
  plant: PlantRef;
  items: OrderItem[];
  voiceNote: { durationMs: number | null } | null;
  channel: "in_person" | "phone";
  storeId: string | null;
  distanceFromStoreM: number | null;
  gstin: string | null;
  visitId: string | null;
  confirmedAt: string | null;
  dispatchedAt: string | null;
  vehicleNo: string | null;
  driverName: string | null;
  driverPhone: string | null;
  deliveredAt: string | null;
  deliveryNote: string | null;
  deliveryProof: { createdAt: string } | null;
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
  paymentAmount: number | null;
  paymentMode: PaymentMode | null;
  paymentRef: string | null;
  nextVisitOn: string | null;
  notifyOwner: boolean;
  storeId: string | null;
  employee: { id: string; name: string };
  district: District;
  plantId: string;
  plant: PlantRef;
}

export interface ReportSummary {
  // Only for the super admin looking at every plant.
  plantComparison?: {
    plantId: string;
    name: string;
    code: string;
    totalSales: number;
    ordersCount: number;
    visitsCount: number;
    employeeCount: number;
    onDutyCount: number;
  }[];
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

export interface WorkedDay {
  date: string;
  minutes: number;
  firstOn: string;
  lastOff: string | null;
}

export interface DutySession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  endReason: "manual" | "timeout" | "deactivated" | "day_end" | null;
  minutes: number;
}

export interface AttendanceReport {
  employee: Omit<Employee, "employeeLocation" | "minutesToday"> & {
    employeeLocation: { onDuty: boolean; updatedAt: string } | null;
  };
  from: string;
  to: string;
  totalMinutes: number;
  daysWorked: number;
  averageMinutesPerDay: number;
  days: WorkedDay[];
  sessions: DutySession[];
  activity: { orders: number; sales: number; visits: number };
}

export type PaymentMode = "cash" | "upi" | "cheque" | "bank_transfer" | "credit";

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  cash: "Cash",
  upi: "UPI",
  cheque: "Cheque",
  bank_transfer: "Bank transfer",
  credit: "Credit",
};

export type AttendanceStatus = "present" | "half" | "absent";

export interface MonthlyAttendance {
  month: string;
  dates: string[];
  fullDayMinutes: number;
  today: string;
  rows: {
    employee: { id: string; name: string; employeeCode: string | null; active: boolean; plantCode: string | null };
    days: {
      date: string;
      minutes: number;
      firstOn: string | null;
      lastOff: string | null;
      status: AttendanceStatus;
      autoEnded: boolean;
    }[];
    present: number;
    half: number;
    totalMinutes: number;
  }[];
}
