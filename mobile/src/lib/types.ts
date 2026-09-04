export type Role = "admin" | "sales_employee";

export interface District {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
}

export interface User {
  id: string;
  name: string;
  phone: string;
  role: Role;
  districtId: string | null;
  district?: District | null;
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
  lat: number | null;
  lng: number | null;
  createdAt: string;
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
}
