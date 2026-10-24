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
  employeeCode?: string | null;
  role: Role;
  districtId: string | null;
  district?: District | null;
  plant?: { id: string; name: string; code: string } | null;
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

// A catalogue size, or (variantId null) a custom size priced at the shop:
// customSize of `product`, or of a product only named in customName.
export interface OrderItem {
  id: string;
  variantId: string | null;
  quantity: number;
  unitPrice: number;
  variant: (ProductVariant & { product: Product }) | null;
  product: Product | null;
  customName: string | null;
  customSize: string | null;
}

export interface Store {
  id: string;
  name: string;
  ownerName: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  lat: number;
  lng: number;
  // A shop a salesperson added waits for the office before others see it.
  status: "pending" | "approved";
  createdBy: { id: string; name: string } | null;
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
  voiceNote: { durationMs: number | null } | null;
  channel: "in_person" | "phone";
  storeId: string | null;
  distanceFromStoreM: number | null;
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
