import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Customer,
  CustomerType,
  Product,
  InventoryItem,
  InventoryMovement,
  ProductionRecord,
  Order,
  Delivery,
  Payment,
  Expense,
  ExpenseCategory,
  Supplier,
  SupplierTransaction,
  User,
  Permission,
  AuditLog,
  CustomerLedgerEntry,
  CustomerCanMovement,
  DashboardSummary,
} from '../types/index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const DB_FILE = path.resolve(DATA_DIR, 'aab_database.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// -----------------------------------------------------------------------------
// Supabase Client on Server
// -----------------------------------------------------------------------------
let serverSupabase: SupabaseClient | null = null;
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

if (supabaseUrl && supabaseKey) {
  try {
    serverSupabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    });
  } catch (err) {
    console.warn('[SERVER] Supabase client init warning:', err);
  }
}

export function getServerSupabase(): SupabaseClient | null {
  return serverSupabase;
}

// -----------------------------------------------------------------------------
// Approved 3 Roles & Standard Initial Data
// -----------------------------------------------------------------------------
const INITIAL_ROLES = [
  { id: 'role-owner', name: 'Owner', description: 'Full business ownership, financial control, and user management', is_system: true },
  { id: 'role-manager', name: 'Manager', description: 'Operations oversight, bottle filling, and logistics supervision', is_system: true },
  { id: 'role-delivery', name: 'Delivery Boy', description: 'Route deliveries, bottle collection, and cash receipts', is_system: true },
];

const INITIAL_CUSTOMER_TYPES: CustomerType[] = [
  { id: 'ct-home', name: 'Residential Home', description: 'Residential households & domestic consumers', default_discount: 0 },
  { id: 'ct-restaurant', name: 'Restaurant', description: 'Restaurants, cafes, food service & caterers', default_discount: 0 },
  { id: 'ct-office', name: 'Office', description: 'Corporate workplaces & commercial offices', default_discount: 0 },
  { id: 'ct-shop', name: 'Shop', description: 'Retail marts, grocery stores & commercial outlets', default_discount: 0 },
  { id: 'ct-other', name: 'Other', description: 'Other customer classifications', default_discount: 0 },
];

const INITIAL_PRODUCTS: Product[] = [];

const INITIAL_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: 'exp-fuel', name: 'Fuel & Delivery Logistics', description: 'Diesel and petrol for delivery vans' },
  { id: 'exp-salaries', name: 'Staff Salaries & Wages', description: 'Monthly payroll' },
  { id: 'exp-utilities', name: 'Utilities & Electricity', description: 'RO plant electricity dues' },
  { id: 'exp-vehicle', name: 'Vehicle Maintenance & Repairs', description: 'Tyre changes & repairs' },
  { id: 'exp-packaging', name: 'Packaging & Caps & Seals', description: 'Caps and sanitary seal films' },
  { id: 'exp-chemicals', name: 'Filtration & Consumables', description: 'Membrane cleaner, mineral dosing' },
  { id: 'exp-other', name: 'General & Miscellaneous', description: 'General plant supplies' },
];

interface DatabaseSchema {
  users: User[];
  roles: { id: string; name: string; description: string; is_system: boolean }[];
  permissions: Permission[];
  customer_types: CustomerType[];
  customers: Customer[];
  products: Product[];
  inventory: InventoryItem[];
  inventory_movements: InventoryMovement[];
  production_records: ProductionRecord[];
  orders: any[];
  order_items: any[];
  deliveries: any[];
  customer_can_movements: CustomerCanMovement[];
  customer_ledger: CustomerLedgerEntry[];
  payments: any[];
  expenses: any[];
  expense_categories: ExpenseCategory[];
  suppliers: Supplier[];
  supplier_transactions: SupplierTransaction[];
  audit_logs: AuditLog[];
  settings: Record<string, string>;
  idempotency_records?: Record<string, { key: string; action: string; response: any; created_at: string }>;
}

function getDefaultDatabase(): DatabaseSchema {
  return {
    users: [],
    roles: INITIAL_ROLES,
    permissions: [],
    customer_types: INITIAL_CUSTOMER_TYPES,
    customers: [],
    products: [],
    inventory: [],
    inventory_movements: [],
    production_records: [],
    orders: [],
    order_items: [],
    deliveries: [],
    customer_can_movements: [],
    customer_ledger: [],
    payments: [],
    expenses: [],
    expense_categories: INITIAL_EXPENSE_CATEGORIES,
    suppliers: [],
    supplier_transactions: [],
    audit_logs: [],
    settings: {
      business_name: 'AAB E ARWA Premium Drinking Water',
      business_phone: '+92 300 1234567',
      business_address: 'Plot 42, Industrial Zone, Water Filtration Estate',
      currency: 'PKR',
      can_security_deposit: '1200',
    },
    idempotency_records: {},
  };
}

let dbInstance: DatabaseSchema | null = null;

export function loadDatabase(): DatabaseSchema {
  if (dbInstance) return dbInstance;

  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      dbInstance = { ...getDefaultDatabase(), ...parsed };
      return dbInstance!;
    }
  } catch (err) {
    console.error('[DB] Error loading database file:', err);
  }

  dbInstance = getDefaultDatabase();
  saveDatabase(dbInstance);
  return dbInstance;
}

export function saveDatabase(data: DatabaseSchema) {
  dbInstance = data;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB] Error writing database file:', err);
  }
}

// Helper: Normalize role name strictly to one of the 3 approved roles
export function normalizeRoleName(role?: string): 'Owner' | 'Manager' | 'Delivery Boy' {
  if (!role) return 'Delivery Boy';
  const clean = role.toLowerCase().trim();
  if (clean.includes('owner')) return 'Owner';
  if (clean.includes('manager')) return 'Manager';
  return 'Delivery Boy';
}

export function roleNameToId(roleName: 'Owner' | 'Manager' | 'Delivery Boy'): 'role-owner' | 'role-manager' | 'role-delivery' {
  if (roleName === 'Owner') return 'role-owner';
  if (roleName === 'Manager') return 'role-manager';
  return 'role-delivery';
}

export function getRolePermissions(roleId: string): Permission[] {
  const modules = [
    'dashboard', 'customers', 'products', 'inventory', 'production',
    'orders', 'deliveries', 'cans', 'payments', 'expenses',
    'staff', 'reports', 'audit', 'settings'
  ];

  const db = loadDatabase();
  const storedForRole = (db.permissions || []).filter((p: any) => p.role_id === roleId);

  // Default module-by-module baseline
  const defaults: Record<string, Permission> = {};
  if (roleId === 'role-owner') {
    modules.forEach(m => {
      defaults[m] = { module: m, can_view: 1, can_create: 1, can_edit: 1, can_approve: 1, can_delete: 1 };
    });
  } else if (roleId === 'role-manager') {
    modules.forEach(m => {
      const isFinancialOrAdmin = ['payments', 'expenses', 'staff', 'settings'].includes(m);
      defaults[m] = {
        module: m,
        can_view: isFinancialOrAdmin ? 0 : 1,
        can_create: isFinancialOrAdmin ? 0 : 1,
        can_edit: isFinancialOrAdmin ? 0 : 1,
        can_approve: isFinancialOrAdmin ? 0 : 1,
        can_delete: isFinancialOrAdmin ? 0 : 1,
      };
    });
  } else {
    // Delivery Boy
    modules.forEach(m => {
      defaults[m] = {
        module: m,
        can_view: ['dashboard', 'deliveries', 'cans', 'customers'].includes(m) ? 1 : 0,
        can_create: m === 'deliveries' || m === 'cans' ? 1 : 0,
        can_edit: m === 'deliveries' || m === 'cans' ? 1 : 0,
        can_approve: 0,
        can_delete: 0,
      };
    });
  }

  // Merge stored customized permissions on top of default baseline
  return modules.map(m => {
    const found = storedForRole.find((p: any) => p.module === m);
    if (found) {
      return {
        module: m,
        can_view: Number(found.can_view ?? 0),
        can_create: Number(found.can_create ?? 0),
        can_edit: Number(found.can_edit ?? 0),
        can_approve: Number(found.can_approve ?? 0),
        can_delete: Number(found.can_delete ?? 0),
      };
    }
    return defaults[m] || { module: m, can_view: 0, can_create: 0, can_edit: 0, can_approve: 0, can_delete: 0 };
  });
}

export function saveRolePermissions(roleId: string, perms: Permission[]) {
  const db = loadDatabase();
  if (!db.permissions) {
    db.permissions = [];
  }

  // Remove existing permissions for this role
  db.permissions = db.permissions.filter((p: any) => p.role_id !== roleId);

  // Insert updated permissions
  perms.forEach((p) => {
    db.permissions.push({
      role_id: roleId,
      module: p.module,
      can_view: Number(p.can_view ?? 0),
      can_create: Number(p.can_create ?? 0),
      can_edit: Number(p.can_edit ?? 0),
      can_approve: Number(p.can_approve ?? 0),
      can_delete: Number(p.can_delete ?? 0),
    } as any);
  });

  saveDatabase(db);
}

export function getIdempotencyRecord(key: string): any | null {
  if (!key) return null;
  const db = loadDatabase();
  const rec = db.idempotency_records?.[key];
  return rec ? rec.response : null;
}

export function saveIdempotencyRecord(key: string, action: string, response: any) {
  if (!key) return;
  const db = loadDatabase();
  if (!db.idempotency_records) {
    db.idempotency_records = {};
  }
  db.idempotency_records[key] = {
    key,
    action,
    response,
    created_at: new Date().toISOString(),
  };
  saveDatabase(db);
}

const inFlightLocks = new Map<string, Promise<any>>();

export async function runWithLock<T>(lockKey: string, fn: () => Promise<T>): Promise<T> {
  while (inFlightLocks.has(lockKey)) {
    try {
      await inFlightLocks.get(lockKey);
    } catch (_) {}
  }
  const promise = (async () => {
    try {
      return await fn();
    } finally {
      inFlightLocks.delete(lockKey);
    }
  })();
  inFlightLocks.set(lockKey, promise);
  return promise;
}




