export type UserRole =
  | 'role-owner'
  | 'role-manager'
  | 'role-delivery';

export interface User {
  id: string;
  name: string;
  email: string;
  role_id: string;
  role_name: string;
  phone?: string;
  status: 'active' | 'inactive';
}

export interface Permission {
  module: string;
  can_view: number;
  can_create: number;
  can_edit: number;
  can_approve: number;
  can_delete: number;
}

export interface CustomerType {
  id: string;
  name: string;
  description: string;
  default_discount: number;
}

export const FIXED_DELIVERY_AREAS = [
  'Chiltan Scheme Airport Road',
  'Nawa Killi Bypass',
  'Main Jinnah Road',
  'Quetta Avenue City',
  'Hazara Town',
  'Mariabad',
] as const;

export const APPROVED_DELIVERY_AREAS = FIXED_DELIVERY_AREAS;

export type DeliveryArea = typeof FIXED_DELIVERY_AREAS[number] | string;

export const APPROVED_CUSTOMER_TYPES = [
  'Residential Home',
  'Restaurant',
  'Office',
  'Shop',
  'Other',
] as const;

export type CustomerTypeName = typeof APPROVED_CUSTOMER_TYPES[number];

export const CUSTOMER_TYPE_IDS: Record<CustomerTypeName, string> = {
  'Residential Home': 'ct-home',
  Restaurant: 'ct-restaurant',
  Office: 'ct-office',
  Shop: 'ct-shop',
  Other: 'ct-other',
};

export const LEGACY_CUSTOMER_TYPE_NAMES: Record<string, CustomerTypeName> = {
  home: 'Residential Home',
  residential: 'Residential Home',
  'residential home': 'Residential Home',
  restaurant: 'Restaurant',
  office: 'Office',
  commercial: 'Office',
  shop: 'Shop',
  retail: 'Shop',
  other: 'Other',
  industry: 'Other',
  industrial: 'Other',
};


export const CASH_STATUSES = [
  'Cash on Delivery',
  'Paid',
  'Pending',
  'Credit Account',
] as const;

export type CashStatus = typeof CASH_STATUSES[number] | string;

export interface Customer {
  id: string;
  name: string;
  contact_person?: string;
  phone: string;
  whatsapp?: string;
  address: string;
  area: string;
  area_access?: 'All Delivery Areas' | 'Specific Area';
  customer_type_id: string;
  customer_type_name?: string;
  selling_rate: number; // Agreed Selling Rate (PKR)
  payment_type: 'Cash' | 'Credit';
  cash_status: 'Cash on Delivery' | 'Paid' | 'Pending' | 'Credit Account' | string;
  credit_limit?: number;
  outstanding_balance: number;
  cans_held: number; // Company Cans With Customer
  net_deposit_amount: number; // Net Deposit Amount (PKR)
  notes?: string;
  delivery_instructions?: string;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at?: string;
}

export interface Product {
  id: string;
  name: string;
  size: string;
  unit: string;
  selling_price: number;
  cost_price: number;
  is_reusable: number;
  is_active: number;
  filled_stock?: number;
  empty_cans?: number;
  damaged_cans?: number;
  lost_cans?: number;
}

export interface InventoryItem {
  id: string;
  product_id: string;
  product_name: string;
  size: string;
  unit: string;
  selling_price: number;
  cost_price: number;
  is_reusable: number;
  filled_stock: number;
  empty_cans: number;
  damaged_cans: number;
  lost_cans: number;
  updated_at: string;
}

export interface InventoryMovement {
  id: string;
  product_id: string;
  product_name: string;
  size: string;
  movement_type: string;
  stock_type: string;
  quantity: number;
  reason?: string;
  reference_type?: string;
  reference_id?: string;
  user_name?: string;
  created_at: string;
}

export interface ProductionRecord {
  id: string;
  product_id: string;
  product_name: string;
  size: string;
  quantity_filled: number;
  source_tank: string;
  notes?: string;
  user_name?: string;
  created_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  product_name?: string;
  size?: string;
  unit?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  customer_area?: string;
  total_amount: number;
  payment_type: 'Cash' | 'Credit';
  payment_status: 'pending' | 'paid' | 'partially_paid' | 'credit' | 'overdue';
  order_status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  delivery_date: string;
  delivery_address: string;
  notes?: string;
  created_by_name?: string;
  created_at: string;
  items?: OrderItem[];
}

export interface DeliveryItem {
  id: string;
  delivery_id: string;
  product_id: string;
  product_name?: string;
  quantity: number;
}

export interface Delivery {
  id: string;
  delivery_number: string;
  order_id: string;
  order_number?: string;
  total_amount?: number;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_area?: string;
  driver_id?: string;
  driver_name?: string;
  vehicle?: string;
  delivery_date: string;
  delivery_time?: string;
  status: 'assigned' | 'out_for_delivery' | 'delivered' | 'failed' | 'rescheduled';
  empty_cans_returned: number;
  payment_collected: number;
  payment_method?: string;
  failure_reason?: string;
  notes?: string;
  completed_at?: string;
  created_at: string;
  items?: DeliveryItem[];
}

export interface CustomerCanMovement {
  id: string;
  customer_id: string;
  customer_name?: string;
  product_id?: string;
  product_name?: string;
  movement_type: string;
  quantity: number;
  balance_after: number;
  delivery_id?: string;
  reason?: string;
  notes?: string;
  user_id?: string;
  user_name?: string;
  target_type?: 'company' | 'customer';
  created_at: string;
}

export interface Payment {
  id: string;
  payment_number: string;
  customer_id: string;
  customer_name?: string;
  customer_phone?: string;
  order_id?: string;
  delivery_id?: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference?: string;
  notes?: string;
  received_by_name?: string;
  created_at: string;
}

export interface CustomerLedgerEntry {
  id: string;
  customer_id: string;
  transaction_type: string;
  reference_type?: string;
  reference_id?: string;
  debit: number;
  credit: number;
  balance: number;
  description: string;
  transaction_date: string;
  created_at: string;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  description?: string;
}

export interface Expense {
  id: string;
  category_id: string;
  category_name?: string;
  amount: number;
  description: string;
  paid_by: string;
  payment_method: string;
  expense_date: string;
  user_name?: string;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone: string;
  address?: string;
  materials_supplied?: string;
  outstanding_payable: number;
  notes?: string;
  created_at: string;
}

export interface SupplierTransaction {
  id: string;
  supplier_id: string;
  transaction_type: string;
  amount: number;
  description: string;
  transaction_date: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  user_name?: string;
  user_role?: string;
  action: string;
  module: string;
  record_ref?: string;
  details: string;
  old_value?: any;
  new_value?: any;
  ip_address?: string;
  created_at: string;
}

export interface DashboardSummary {
  kpis: {
    todaySales: number;
    todayCollections: number;
    todayExpenses: number;
    totalReceivables: number;
    filledStock: number;
    emptyCansStock: number;
    cansWithCustomers: number;
    deliveriesToday: number;
    deliveriesDelivered: number;
    deliveriesInTransit: number;
    deliveriesPending: number;
    monthlyRevenue: number;
    monthlyExpenses: number;
    monthlyProfit: number;
    periodLabel?: string;
    periodSales?: number;
    periodCollections?: number;
    periodExpenses?: number;
    periodProfit?: number;
    periodDeliveriesToday?: number;
    periodDeliveriesDelivered?: number;
    periodDeliveriesInTransit?: number;
    periodDeliveriesPending?: number;
  };
  recentDeliveries: Delivery[];
  recentOrders: Order[];
  lowStock: { name: string; size: string; filled_stock: number; empty_cans: number }[];
  topDebtors: Customer[];
  salesTrend: { day: string; date?: string; amount: number; displayLabel?: string }[];
}
