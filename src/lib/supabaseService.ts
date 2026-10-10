import { getSupabaseClient } from './supabase.ts';
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

// -----------------------------------------------------------------------------
// Current Authenticated User & Role Context Helper
// -----------------------------------------------------------------------------

function getCurrentAuthUser(): { id: string; role_name: string; role_id: string } {
  try {
    const saved = localStorage.getItem('aab_user');
    if (saved) {
      const u = JSON.parse(saved);
      return {
        id: u.id || '',
        role_name: u.role_name || (u.role_id === 'role-owner' ? 'Owner' : u.role_id === 'role-manager' ? 'Manager' : 'Delivery Boy'),
        role_id: u.role_id || 'role-delivery',
      };
    }
  } catch (_) {}
  return { id: '', role_name: 'Delivery Boy', role_id: 'role-delivery' };
}

function assertRole(allowed: ('Owner' | 'Manager' | 'Delivery Boy')[], actionDescription: string) {
  const current = getCurrentAuthUser();
  const normalizedRole = current.role_name === 'Owner' || current.role_id === 'role-owner'
    ? 'Owner'
    : current.role_name === 'Manager' || current.role_id === 'role-manager'
    ? 'Manager'
    : 'Delivery Boy';

  if (!allowed.includes(normalizedRole as any)) {
    throw new Error(
      `Access Denied: ${normalizedRole} role is unauthorized to ${actionDescription}.`
    );
  }
}

// -----------------------------------------------------------------------------
// Initial Catalog & Metadata Defaults for Supabase Sync
// -----------------------------------------------------------------------------

const DEFAULT_ROLES = [
  { id: 'role-owner', name: 'Owner', description: 'Full business ownership, financial control, and user management', is_system: true },
  { id: 'role-manager', name: 'Manager', description: 'Operations oversight, bottle filling, and logistics supervision', is_system: true },
  { id: 'role-delivery', name: 'Delivery Boy', description: 'Route deliveries, bottle collection, and cash receipts', is_system: true },
];

const DEFAULT_CUSTOMER_TYPES = [
  { id: 'ct-home', name: 'Residential Home', description: 'Residential households & domestic consumers', default_discount: 0 },
  { id: 'ct-restaurant', name: 'Restaurant', description: 'Restaurants, cafes, food service & caterers', default_discount: 0 },
  { id: 'ct-office', name: 'Office', description: 'Corporate workplaces & commercial offices', default_discount: 0 },
  { id: 'ct-shop', name: 'Shop', description: 'Retail marts, grocery stores & commercial outlets', default_discount: 0 },
  { id: 'ct-other', name: 'Other', description: 'Other customer classifications', default_discount: 0 },
];

const DEFAULT_PRODUCTS = [
  { id: 'prod-19l-can', name: 'AAB E ARWA 19L Premium Water Can', size: '19 Liter', unit: 'Can', selling_price: 220, cost_price: 65, is_reusable: 1, is_active: 1 },
  { id: 'prod-1.5l-bottle', name: 'AAB E ARWA 1.5L Drinking Water (Pack of 6)', size: '1.5 Liter (6-Pack)', unit: 'Pack', selling_price: 360, cost_price: 190, is_reusable: 0, is_active: 1 },
  { id: 'prod-500ml-bottle', name: 'AAB E ARWA 500ml Mineral Water (Pack of 12)', size: '500ml (12-Pack)', unit: 'Pack', selling_price: 520, cost_price: 310, is_reusable: 0, is_active: 1 },
];

const DEFAULT_EXPENSE_CATEGORIES = [
  { id: 'exp-fuel', name: 'Fuel & Delivery Logistics', description: 'Diesel and petrol for delivery vans', is_active: 1 },
  { id: 'exp-salaries', name: 'Staff Salaries & Wages', description: 'Monthly payroll', is_active: 1 },
  { id: 'exp-utilities', name: 'Utilities & Electricity', description: 'RO plant electricity dues', is_active: 1 },
  { id: 'exp-vehicle', name: 'Vehicle Maintenance & Repairs', description: 'Tyre changes & repairs', is_active: 1 },
  { id: 'exp-packaging', name: 'Packaging & Caps & Seals', description: 'Caps and sanitary seal films', is_active: 1 },
  { id: 'exp-chemicals', name: 'Filtration & Consumables', description: 'Membrane cleaner, mineral dosing', is_active: 1 },
  { id: 'exp-other', name: 'General & Miscellaneous', description: 'General plant supplies', is_active: 1 },
];

// In-memory synchronization cache to ensure seamless UI reactivity across Vercel deployments
let memoryStorage: Record<string, any[]> = {};

function getMem(table: string): any[] {
  if (!memoryStorage[table]) {
    try {
      const saved = localStorage.getItem(`aab_db_${table}`);
      memoryStorage[table] = saved ? JSON.parse(saved) : [];
    } catch (_) {
      memoryStorage[table] = [];
    }
  }
  return memoryStorage[table];
}

function saveMem(table: string, data: any[]) {
  memoryStorage[table] = data;
  try {
    localStorage.setItem(`aab_db_${table}`, JSON.stringify(data));
  } catch (_) {}
}

// -----------------------------------------------------------------------------
// CORE REPOSITORY API (DIRECT SUPABASE POSTGRESQL IMPLEMENTATION)
// -----------------------------------------------------------------------------

export const SupabaseDataService = {
  // 1. AUTH & ROLES
  async getRoles(): Promise<{ id: string; name: string; description: string }[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('roles').select('*').order('name');
      if (!error && data && data.length > 0) {
        return data;
      }
    }
    return DEFAULT_ROLES;
  },

  async getRolePermissions(roleId: string): Promise<Permission[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('permissions').select('*').eq('role_id', roleId);
      if (!error && data && data.length > 0) {
        return data as Permission[];
      }
    }

    // Default permissions matrix based on the 3 roles
    const modules = [
      'dashboard', 'customers', 'products', 'inventory', 'production',
      'orders', 'deliveries', 'cans', 'payments', 'expenses',
      'suppliers', 'staff', 'reports', 'audit', 'settings'
    ];

    if (roleId === 'role-owner') {
      return modules.map(m => ({ module: m, can_view: 1, can_create: 1, can_edit: 1, can_approve: 1, can_delete: 1 }));
    } else if (roleId === 'role-manager') {
      return modules.map(m => {
        const isFinancialOrAdmin = ['payments', 'expenses', 'staff', 'settings'].includes(m);
        return {
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
      return modules.map(m => ({
        module: m,
        can_view: ['dashboard', 'deliveries', 'cans', 'customers'].includes(m) ? 1 : 0,
        can_create: m === 'deliveries' || m === 'cans' ? 1 : 0,
        can_edit: m === 'deliveries' || m === 'cans' ? 1 : 0,
        can_approve: 0,
        can_delete: 0,
      }));
    }
  },

  async updateRolePermissions(roleId: string, permissions: Permission[]): Promise<void> {
    assertRole(['Owner'], 'modify role permissions');
    const supabase = getSupabaseClient();
    if (supabase) {
      for (const p of permissions) {
        await supabase
          .from('permissions')
          .upsert({
            role_id: roleId,
            module: p.module,
            can_view: p.can_view ? 1 : 0,
            can_create: p.can_create ? 1 : 0,
            can_edit: p.can_edit ? 1 : 0,
            can_approve: p.can_approve ? 1 : 0,
            can_delete: p.can_delete ? 1 : 0,
          }, { onConflict: 'role_id,module' });
      }
    }
  },

  // 2. USERS & STAFF MANAGEMENT (Strictly Owner Accessible)
  async getStaff(): Promise<User[]> {
    assertRole(['Owner'], 'view staff accounts');
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('users').select('*').order('name');
      if (!error && data) {
        return data as User[];
      }
    }
    return getMem('users');
  },

  async createStaff(userData: { name: string; email: string; role_id: string; phone?: string }): Promise<{ id: string }> {
    assertRole(['Owner'], 'create staff accounts');
    const supabase = getSupabaseClient();
    const id = `usr-${Date.now()}`;
    const roleMap: Record<string, string> = {
      'role-owner': 'Owner',
      'role-manager': 'Manager',
      'role-delivery': 'Delivery Boy',
    };
    const role_name = roleMap[userData.role_id] || 'Delivery Boy';

    const newStaff: User = {
      id,
      name: userData.name.trim(),
      email: userData.email.trim().toLowerCase(),
      role_id: userData.role_id,
      role_name,
      phone: userData.phone || '',
      status: 'active',
    };

    if (supabase) {
      await supabase.from('users').insert(newStaff);
    }

    const current = getMem('users');
    current.push(newStaff);
    saveMem('users', current);

    return { id };
  },

  async updateStaff(id: string, updates: Partial<User>): Promise<void> {
    assertRole(['Owner'], 'update staff accounts');
    const supabase = getSupabaseClient();
    if (updates.role_id) {
      const roleMap: Record<string, string> = {
        'role-owner': 'Owner',
        'role-manager': 'Manager',
        'role-delivery': 'Delivery Boy',
      };
      updates.role_name = roleMap[updates.role_id] || updates.role_name;
    }

    if (supabase) {
      await supabase.from('users').update(updates).eq('id', id);
    }

    const current = getMem('users').map(u => u.id === id ? { ...u, ...updates } : u);
    saveMem('users', current);
  },

  // 3. CUSTOMER MANAGEMENT
  async getCustomerTypes(): Promise<CustomerType[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('customer_types').select('*').order('name');
      if (!error && data && data.length > 0) {
        return data as CustomerType[];
      }
    }
    return DEFAULT_CUSTOMER_TYPES;
  },

  async getCustomers(query?: string): Promise<Customer[]> {
    const currentUser = getCurrentAuthUser();
    const supabase = getSupabaseClient();

    let customers: Customer[] = [];

    if (supabase) {
      let req = supabase.from('customers').select('*').order('name');
      const { data, error } = await req;
      if (!error && data) {
        customers = data as Customer[];
      }
    }

    if (customers.length === 0) {
      customers = getMem('customers');
    }

    // Role-based filtering: Delivery Boy only sees customers related to their deliveries
    if (currentUser.role_id === 'role-delivery' || currentUser.role_name === 'Delivery Boy') {
      const deliveries = await this.getDeliveries();
      const customerIds = new Set(deliveries.map(d => d.customer_id));
      customers = customers.filter(c => customerIds.has(c.id));
    }

    return customers;
  },

  async getCustomerDetails(id: string): Promise<{ customer: Customer; ledger: CustomerLedgerEntry[]; cans: CustomerCanMovement[] }> {
    const supabase = getSupabaseClient();
    let customer: Customer | null = null;
    let ledger: CustomerLedgerEntry[] = [];
    let cans: CustomerCanMovement[] = [];

    if (supabase) {
      const { data } = await supabase.from('customers').select('*').eq('id', id).single();
      if (data) customer = data as Customer;

      // Only Owner can see financial ledger
      const current = getCurrentAuthUser();
      if (current.role_id === 'role-owner' || current.role_name === 'Owner') {
        const { data: ledg } = await supabase.from('customer_ledger').select('*').eq('customer_id', id).order('transaction_date', { ascending: false });
        if (ledg) ledger = ledg as CustomerLedgerEntry[];
      }

      const { data: canMovs } = await supabase.from('customer_can_movements').select('*').eq('customer_id', id).order('created_at', { ascending: false });
      if (canMovs) cans = canMovs as CustomerCanMovement[];
    }

    if (!customer) {
      customer = getMem('customers').find(c => c.id === id) || null;
      ledger = getMem('customer_ledger').filter(l => l.customer_id === id);
      cans = getMem('customer_can_movements').filter(c => c.customer_id === id);
    }

    if (!customer) throw new Error('Customer not found');
    return { customer, ledger, cans };
  },

  async createCustomer(customerData: Partial<Customer>): Promise<Customer> {
    assertRole(['Owner', 'Manager'], 'register customers');
    const supabase = getSupabaseClient();
    const id = `cust-${Date.now()}`;

    const newCust: Customer = {
      id,
      name: customerData.name || '',
      phone: customerData.phone || '',
      address: customerData.address || '',
      area: customerData.area || 'Other',
      area_access: customerData.area_access || 'Specific Area',
      customer_type_id: customerData.customer_type_id || 'ct-home',
      customer_type_name: customerData.customer_type_name || 'Residential Home',
      selling_rate: Number(customerData.selling_rate || 220),
      payment_type: customerData.payment_type || 'Cash',
      cash_status: customerData.cash_status || 'Cash on Delivery',
      credit_limit: Number(customerData.credit_limit || 0),
      outstanding_balance: Number(customerData.outstanding_balance || 0),
      cans_held: Number(customerData.cans_held || 0),
      net_deposit_amount: Number(customerData.net_deposit_amount || 0),
      notes: customerData.notes || '',
      delivery_instructions: customerData.delivery_instructions || '',
      status: 'active',
      created_at: new Date().toISOString(),
    };

    if (supabase) {
      await supabase.from('customers').insert(newCust);
    }

    const current = getMem('customers');
    current.unshift(newCust);
    saveMem('customers', current);

    return newCust;
  },

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<void> {
    assertRole(['Owner', 'Manager'], 'update customers');
    const supabase = getSupabaseClient();
    (updates as any).updated_at = new Date().toISOString();

    if (supabase) {
      await supabase.from('customers').update(updates).eq('id', id);
    }

    const current = getMem('customers').map(c => c.id === id ? { ...c, ...updates } : c);
    saveMem('customers', current);
  },

  async deleteCustomer(id: string): Promise<void> {
    assertRole(['Owner'], 'delete customers');
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('customers').delete().eq('id', id);
    }
    const current = getMem('customers').filter(c => c.id !== id);
    saveMem('customers', current);
  },

  // 4. PRODUCTS & FINISHED STOCK
  async getProducts(): Promise<Product[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('products').select('*').order('name');
      if (!error && data && data.length > 0) {
        return data as Product[];
      }
    }
    return DEFAULT_PRODUCTS as Product[];
  },

  async createProduct(prod: Partial<Product>): Promise<Product> {
    assertRole(['Owner', 'Manager'], 'create products');
    const supabase = getSupabaseClient();
    const id = `prod-${Date.now()}`;
    const newProd: Product = {
      id,
      name: prod.name || '',
      size: prod.size || '',
      unit: prod.unit || 'Can',
      selling_price: Number(prod.selling_price || 0),
      cost_price: Number(prod.cost_price || 0),
      is_reusable: prod.is_reusable ?? 1,
      is_active: 1,
      filled_stock: Number(prod.filled_stock || 0),
      empty_cans: Number(prod.empty_cans || 0),
    };

    if (supabase) {
      await supabase.from('products').insert(newProd);
      await supabase.from('inventory').insert({
        product_id: id,
        filled_stock: newProd.filled_stock,
        empty_cans: newProd.empty_cans,
      });
    }

    const mem = getMem('products');
    mem.push(newProd);
    saveMem('products', mem);

    return newProd;
  },

  async updateProduct(id: string, updates: Partial<Product>): Promise<void> {
    assertRole(['Owner', 'Manager'], 'modify product specifications or rate');
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('products').update(updates).eq('id', id);
    }
    const mem = getMem('products').map(p => p.id === id ? { ...p, ...updates } : p);
    saveMem('products', mem);
  },

  // 5. INVENTORY & STOCK AUDIT
  async getInventory(): Promise<InventoryItem[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('inventory').select('*, product:products(*)');
      if (!error && data && data.length > 0) {
        return data.map(item => ({
          ...item,
          product_name: item.product?.name || '',
          size: item.product?.size || '',
          unit: item.product?.unit || '',
          selling_price: item.product?.selling_price || 0,
          cost_price: item.product?.cost_price || 0,
          is_reusable: item.product?.is_reusable ?? 1,
        }));
      }
    }

    return [
      { id: 'inv-19l', product_id: 'prod-19l-can', product_name: 'AAB E ARWA 19L Premium Water Can', size: '19 Liter', unit: 'Can', selling_price: 220, cost_price: 65, filled_stock: 350, empty_cans: 280, damaged_cans: 5, lost_cans: 2, is_reusable: 1, updated_at: new Date().toISOString() },
      { id: 'inv-1.5l', product_id: 'prod-1.5l-bottle', product_name: 'AAB E ARWA 1.5L Drinking Water (Pack of 6)', size: '1.5 Liter (6-Pack)', unit: 'Pack', selling_price: 360, cost_price: 190, filled_stock: 90, empty_cans: 0, damaged_cans: 0, lost_cans: 0, is_reusable: 0, updated_at: new Date().toISOString() },
      { id: 'inv-500ml', product_id: 'prod-500ml-bottle', product_name: 'AAB E ARWA 500ml Mineral Water (Pack of 12)', size: '500ml (12-Pack)', unit: 'Pack', selling_price: 520, cost_price: 310, filled_stock: 110, empty_cans: 0, damaged_cans: 0, lost_cans: 0, is_reusable: 0, updated_at: new Date().toISOString() },
    ];
  },

  async adjustInventory(adj: { product_id: string; stock_type: string; quantity: number; reason: string }): Promise<void> {
    assertRole(['Owner', 'Manager'], 'adjust inventory stock');
    const supabase = getSupabaseClient();
    const movementId = `mov-${Date.now()}`;

    if (supabase) {
      // Record movement audit
      await supabase.from('inventory_movements').insert({
        id: movementId,
        product_id: adj.product_id,
        movement_type: 'manual_adjustment',
        stock_type: adj.stock_type,
        quantity: adj.quantity,
        reason: adj.reason,
        user_id: getCurrentAuthUser().id,
      });

      // Update inventory balance
      const { data: inv } = await supabase.from('inventory').select('*').eq('product_id', adj.product_id).single();
      if (inv) {
        const field = adj.stock_type === 'filled' ? 'filled_stock' : 'empty_cans';
        const updated = Math.max(0, (inv[field] || 0) + adj.quantity);
        await supabase.from('inventory').update({ [field]: updated }).eq('product_id', adj.product_id);
      }
    }
  },

  async getInventoryMovements(): Promise<InventoryMovement[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('inventory_movements').select('*, product:products(name, size)').order('created_at', { ascending: false }).limit(100);
      if (!error && data) {
        return data.map(m => ({
          ...m,
          product_name: m.product?.name || '',
          product_size: m.product?.size || '',
        }));
      }
    }
    return [];
  },

  // 6. WATER FILLING PLANT / PRODUCTION
  async getProductionRecords(): Promise<ProductionRecord[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('production_records').select('*, product:products(name, size)').order('created_at', { ascending: false }).limit(100);
      if (!error && data) {
        return data.map(p => ({
          ...p,
          product_name: p.product?.name || '',
          product_size: p.product?.size || '',
        }));
      }
    }
    return [];
  },

  async createProductionRecord(rec: { product_id: string; quantity_filled: number; source_tank?: string; notes?: string }): Promise<void> {
    assertRole(['Owner', 'Manager'], 'record water plant filling batch');
    const supabase = getSupabaseClient();
    const id = `prd-${Date.now()}`;

    if (supabase) {
      await supabase.from('production_records').insert({
        id,
        product_id: rec.product_id,
        quantity_filled: rec.quantity_filled,
        source_tank: rec.source_tank || 'Main Tank 1',
        notes: rec.notes || '',
        user_id: getCurrentAuthUser().id,
      });

      // Auto update inventory: deduct empty cans, add filled stock
      const { data: inv } = await supabase.from('inventory').select('*').eq('product_id', rec.product_id).single();
      if (inv) {
        await supabase.from('inventory').update({
          filled_stock: (inv.filled_stock || 0) + rec.quantity_filled,
          empty_cans: Math.max(0, (inv.empty_cans || 0) - rec.quantity_filled),
        }).eq('product_id', rec.product_id);
      }
    }
  },

  // 7. ORDERS & DISPATCH
  async getOrders(): Promise<Order[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('orders').select('*, customer:customers(name, phone, area), items:order_items(*)').order('created_at', { ascending: false });
      if (!error && data) {
        return data.map(o => ({
          ...o,
          customer_name: o.customer?.name || '',
          customer_phone: o.customer?.phone || '',
          customer_area: o.customer?.area || '',
        }));
      }
    }
    return getMem('orders');
  },

  async createOrder(orderData: { customer_id: string; delivery_date: string; delivery_address: string; items: { product_id: string; quantity: number; unit_price: number }[]; payment_type?: string; notes?: string }): Promise<{ id: string; orderNumber: string }> {
    assertRole(['Owner', 'Manager'], 'create customer orders');
    const supabase = getSupabaseClient();
    const id = `ord-${Date.now()}`;
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    const total_amount = orderData.items.reduce((s, it) => s + (it.quantity * it.unit_price), 0);

    const newOrder = {
      id,
      order_number: orderNumber,
      customer_id: orderData.customer_id,
      total_amount,
      payment_type: orderData.payment_type || 'Cash',
      payment_status: 'pending',
      order_status: 'confirmed',
      delivery_date: orderData.delivery_date,
      delivery_address: orderData.delivery_address,
      notes: orderData.notes || '',
      created_by: getCurrentAuthUser().id,
    };

    if (supabase) {
      await supabase.from('orders').insert(newOrder);
      for (const it of orderData.items) {
        await supabase.from('order_items').insert({
          order_id: id,
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total_price: it.quantity * it.unit_price,
        });
      }
    }

    const current = getMem('orders');
    current.unshift(newOrder);
    saveMem('orders', current);

    return { id, orderNumber };
  },

  // 8. DELIVERIES & FLEET LOGISTICS
  async getDeliveries(): Promise<Delivery[]> {
    const currentUser = getCurrentAuthUser();
    const supabase = getSupabaseClient();

    let deliveries: Delivery[] = [];

    if (supabase) {
      let query = supabase.from('deliveries').select('*, customer:customers(name, phone, area, address), order:orders(total_amount, order_number)').order('created_at', { ascending: false });

      // Delivery Boy can ONLY access assigned deliveries
      if (currentUser.role_id === 'role-delivery' || currentUser.role_name === 'Delivery Boy') {
        query = query.eq('driver_id', currentUser.id);
      }

      const { data, error } = await query;
      if (!error && data) {
        deliveries = data.map(d => ({
          ...d,
          customer_name: d.customer?.name || '',
          customer_phone: d.customer?.phone || '',
          customer_address: d.customer?.address || '',
          customer_area: d.customer?.area || '',
          total_amount: d.order?.total_amount || 0,
        }));
      }
    }

    if (deliveries.length === 0) {
      deliveries = getMem('deliveries');
      if (currentUser.role_id === 'role-delivery' || currentUser.role_name === 'Delivery Boy') {
        deliveries = deliveries.filter(d => d.driver_id === currentUser.id);
      }
    }

    return deliveries;
  },

  async createDeliveryForOrder(params: { order_id: string; driver_id: string; delivery_date: string; vehicle?: string; delivery_time?: string; notes?: string }): Promise<{ id: string }> {
    assertRole(['Owner', 'Manager'], 'dispatch delivery route');
    const supabase = getSupabaseClient();
    const id = `del-${Date.now()}`;
    const deliveryNumber = `DEL-${Date.now().toString().slice(-6)}`;

    // Lookup order
    let customer_id = '';
    if (supabase) {
      const { data: ord } = await supabase.from('orders').select('customer_id').eq('id', params.order_id).single();
      if (ord) customer_id = ord.customer_id;
    }

    const newDel = {
      id,
      delivery_number: deliveryNumber,
      order_id: params.order_id,
      customer_id,
      driver_id: params.driver_id,
      vehicle: params.vehicle || 'Van #1',
      delivery_date: params.delivery_date,
      delivery_time: params.delivery_time || 'Morning',
      status: 'assigned',
      notes: params.notes || '',
    };

    if (supabase) {
      await supabase.from('deliveries').insert(newDel);
      await supabase.from('orders').update({ order_status: 'dispatched' }).eq('id', params.order_id);
    }

    const current = getMem('deliveries');
    current.unshift(newDel);
    saveMem('deliveries', current);

    return { id };
  },

  async completeDelivery(id: string, completionData: { empty_cans_returned: number; payment_collected: number; payment_method?: string; notes?: string }): Promise<void> {
    assertRole(['Owner', 'Manager', 'Delivery Boy'], 'complete route delivery');
    const supabase = getSupabaseClient();
    const user = getCurrentAuthUser();

    if (supabase) {
      // 1. Update delivery status
      await supabase.from('deliveries').update({
        status: 'delivered',
        empty_cans_returned: completionData.empty_cans_returned,
        payment_collected: completionData.payment_collected,
        payment_method: completionData.payment_method || 'Cash',
        notes: completionData.notes || '',
        completed_at: new Date().toISOString(),
      }).eq('id', id);

      // 2. Fetch delivery details
      const { data: del } = await supabase.from('deliveries').select('*, order:orders(id, total_amount), customer:customers(*)').eq('id', id).single();
      if (del) {
        // Record returned cans
        if (completionData.empty_cans_returned > 0) {
          await supabase.from('customer_can_movements').insert({
            customer_id: del.customer_id,
            product_id: 'prod-19l-can',
            movement_type: 'returned',
            quantity: completionData.empty_cans_returned,
            balance_after: Math.max(0, (del.customer?.cans_held || 0) - completionData.empty_cans_returned),
            delivery_id: id,
            reason: `Return from Delivery ${del.delivery_number}`,
            user_id: user.id,
          });

          // Decrement customer held cans
          await supabase.from('customers').update({
            cans_held: Math.max(0, (del.customer?.cans_held || 0) - completionData.empty_cans_returned),
          }).eq('id', del.customer_id);
        }

        // Record payment if collected
        if (completionData.payment_collected > 0) {
          const payId = `pay-${Date.now()}`;
          await supabase.from('payments').insert({
            id: payId,
            payment_number: `PAY-${Date.now().toString().slice(-6)}`,
            customer_id: del.customer_id,
            order_id: del.order_id,
            delivery_id: id,
            amount: completionData.payment_collected,
            payment_method: completionData.payment_method || 'Cash',
            payment_date: new Date().toISOString().split('T')[0],
            received_by: user.id,
          });

          // Update customer ledger
          await supabase.from('customer_ledger').insert({
            customer_id: del.customer_id,
            transaction_type: 'payment',
            reference_type: 'delivery',
            reference_id: id,
            credit: completionData.payment_collected,
            balance: Math.max(0, (del.customer?.outstanding_balance || 0) - completionData.payment_collected),
            description: `Cash collection from delivery ${del.delivery_number}`,
            transaction_date: new Date().toISOString().split('T')[0],
          });

          // Update customer outstanding balance
          await supabase.from('customers').update({
            outstanding_balance: Math.max(0, (del.customer?.outstanding_balance || 0) - completionData.payment_collected),
          }).eq('id', del.customer_id);
        }
      }
    }
  },

  async updateDeliveryStatus(id: string, status: string, reason?: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from('deliveries').update({
        status,
        failure_reason: reason || null,
      }).eq('id', id);
    }
  },

  // 9. EMPTY CAN ASSET TRACKING
  async getCanSummary(): Promise<any> {
    const supabase = getSupabaseClient();
    let emptyInWarehouse = 0;
    let filledInWarehouse = 0;
    let withCustomers = 0;
    let damagedCans = 0;
    let lostCans = 0;
    let customerRankings: Customer[] = [];
    let recentCanMovements: CustomerCanMovement[] = [];

    if (supabase) {
      // 1. Inventory counts for 19L reusable cans
      const { data: inv } = await supabase
        .from('inventory')
        .select('*')
        .eq('product_id', 'prod-19l-can')
        .maybeSingle();

      if (inv) {
        emptyInWarehouse = Number(inv.empty_cans) || 0;
        filledInWarehouse = Number(inv.filled_stock) || 0;
        damagedCans = Number(inv.damaged_cans) || 0;
        lostCans = Number(inv.lost_cans) || 0;
      }

      // 2. Customers ranked by cans held
      const { data: custs } = await supabase
        .from('customers')
        .select('*')
        .order('cans_held', { ascending: false });

      if (custs && custs.length > 0) {
        customerRankings = custs as Customer[];
        withCustomers = custs.reduce((sum, c) => sum + (Number(c.cans_held) || 0), 0);
      }

      // 3. Recent can movements audit trail
      const { data: movs } = await supabase
        .from('customer_can_movements')
        .select('*, customer:customers(name)')
        .order('created_at', { ascending: false })
        .limit(50);

      if (movs && movs.length > 0) {
        recentCanMovements = movs.map((m: any) => ({
          ...m,
          customer_name: m.customer?.name || m.customer_name || 'Customer',
        }));
      }
    } else {
      // Memory cache fallback if client not initialized
      const custs = getMem('customers');
      customerRankings = custs.slice().sort((a, b) => (b.cans_held || 0) - (a.cans_held || 0));
      withCustomers = custs.reduce((sum, c) => sum + (c.cans_held || 0), 0);
      emptyInWarehouse = 280;
      filledInWarehouse = 350;
      recentCanMovements = getMem('customer_can_movements') || [];
    }

    const totalCompanyCans = emptyInWarehouse + filledInWarehouse + withCustomers + damagedCans + lostCans;

    return {
      metrics: {
        emptyInWarehouse,
        filledInWarehouse,
        withCustomers,
        damagedCans,
        lostCans,
        totalCompanyCans,
      },
      customerRankings: customerRankings || [],
      recentCanMovements: recentCanMovements || [],
      // Compatibility aliases for dashboard
      totalCirculation: totalCompanyCans,
      customerHeld: withCustomers,
      factoryEmpty: emptyInWarehouse,
      factoryFilled: filledInWarehouse,
      damagedCount: damagedCans,
      lostCount: lostCans,
    };
  },

  async adjustCustomerCans(adj: { customer_id: string; quantity: number; movement_type: 'issued' | 'returned' | 'adjusted'; reason?: string }): Promise<void> {
    assertRole(['Owner', 'Manager'], 'manually adjust customer can balance');
    const supabase = getSupabaseClient();
    const user = getCurrentAuthUser();

    if (supabase) {
      const { data: cust } = await supabase.from('customers').select('cans_held').eq('id', adj.customer_id).single();
      const currentHeld = cust?.cans_held || 0;
      const delta = adj.movement_type === 'issued' ? adj.quantity : -adj.quantity;
      const newBalance = Math.max(0, currentHeld + delta);

      await supabase.from('customer_can_movements').insert({
        customer_id: adj.customer_id,
        product_id: 'prod-19l-can',
        movement_type: adj.movement_type,
        quantity: adj.quantity,
        balance_after: newBalance,
        reason: adj.reason || 'Manual ledger audit adjustment',
        user_id: user.id,
      });

      await supabase.from('customers').update({ cans_held: newBalance }).eq('id', adj.customer_id);
    }
  },

  // 10. PAYMENTS & FINANCIALS (Strictly Owner Accessible)
  async getPayments(): Promise<Payment[]> {
    assertRole(['Owner'], 'access financial payments ledger');
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('payments').select('*, customer:customers(name, phone)').order('created_at', { ascending: false });
      if (!error && data) {
        return data.map(p => ({
          ...p,
          customer_name: p.customer?.name || '',
          customer_phone: p.customer?.phone || '',
        }));
      }
    }
    return getMem('payments');
  },

  async createPayment(pay: { customer_id: string; amount: number; payment_method: string; payment_date: string; reference?: string; notes?: string }): Promise<{ id: string }> {
    assertRole(['Owner'], 'record financial payments');
    const supabase = getSupabaseClient();
    const id = `pay-${Date.now()}`;
    const user = getCurrentAuthUser();

    const newPayment = {
      id,
      payment_number: `PAY-${Date.now().toString().slice(-6)}`,
      customer_id: pay.customer_id,
      amount: pay.amount,
      payment_method: pay.payment_method,
      payment_date: pay.payment_date,
      reference: pay.reference || '',
      notes: pay.notes || '',
      received_by: user.id,
    };

    if (supabase) {
      await supabase.from('payments').insert(newPayment);

      // Ledger entry
      const { data: cust } = await supabase.from('customers').select('outstanding_balance').eq('id', pay.customer_id).single();
      const newBal = Math.max(0, (cust?.outstanding_balance || 0) - pay.amount);

      await supabase.from('customer_ledger').insert({
        customer_id: pay.customer_id,
        transaction_type: 'direct_payment',
        credit: pay.amount,
        balance: newBal,
        description: `Direct payment received via ${pay.payment_method}`,
        transaction_date: pay.payment_date,
      });

      await supabase.from('customers').update({ outstanding_balance: newBal }).eq('id', pay.customer_id);
    }

    return { id };
  },

  // 11. OPERATING EXPENSES (Strictly Owner Accessible)
  async getExpenseCategories(): Promise<ExpenseCategory[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('expense_categories').select('*').order('name');
      if (!error && data && data.length > 0) {
        return data as ExpenseCategory[];
      }
    }
    return DEFAULT_EXPENSE_CATEGORIES;
  },

  async getExpenses(): Promise<Expense[]> {
    assertRole(['Owner'], 'access operating expense records');
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('expenses').select('*, category:expense_categories(name)').order('expense_date', { ascending: false });
      if (!error && data) {
        return data.map(e => ({
          ...e,
          category_name: e.category?.name || '',
        }));
      }
    }
    return getMem('expenses');
  },

  async createExpense(exp: { category_id: string; amount: number; description: string; paid_by: string; payment_method: string; expense_date: string }): Promise<{ id: string }> {
    assertRole(['Owner'], 'record operating expenses');
    const supabase = getSupabaseClient();
    const id = `exp-${Date.now()}`;
    const user = getCurrentAuthUser();

    const newExp = {
      id,
      category_id: exp.category_id,
      amount: exp.amount,
      description: exp.description,
      paid_by: exp.paid_by,
      payment_method: exp.payment_method,
      expense_date: exp.expense_date,
      user_id: user.id,
    };

    if (supabase) {
      await supabase.from('expenses').insert(newExp);
    }

    const current = getMem('expenses');
    current.unshift(newExp);
    saveMem('expenses', current);

    return { id };
  },

  // 12. SUPPLIERS & PROCUREMENT
  async getSuppliers(): Promise<Supplier[]> {
    assertRole(['Owner', 'Manager'], 'view suppliers');
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.from('suppliers').select('*').order('name');
      if (!error && data && data.length > 0) {
        return data as Supplier[];
      }
    }
    return [
      { id: 'sup-1', name: 'Apex Containers Ltd.', contact_person: 'Salman Qureshi', phone: '+92 301 8847120', materials_supplied: '19L Polycarbonate Cans', outstanding_payable: 45000, created_at: new Date().toISOString() },
      { id: 'sup-2', name: 'Ozone & Membrane Supplies', contact_person: 'Farooq Ahmad', phone: '+92 322 9918230', materials_supplied: 'RO Membrane Washes, Ozone Spares', outstanding_payable: 18000, created_at: new Date().toISOString() },
    ];
  },

  async createSupplier(sup: Partial<Supplier>): Promise<{ id: string }> {
    assertRole(['Owner', 'Manager'], 'add suppliers');
    const supabase = getSupabaseClient();
    const id = `sup-${Date.now()}`;
    const newSup = {
      id,
      name: sup.name || '',
      contact_person: sup.contact_person || '',
      phone: sup.phone || '',
      address: sup.address || '',
      materials_supplied: sup.materials_supplied || '',
      outstanding_payable: Number(sup.outstanding_payable || 0),
    };
    if (supabase) {
      await supabase.from('suppliers').insert(newSup);
    }
    return { id };
  },

  // 13. REPORTS & P&L
  async getFinancialReport(): Promise<any> {
    assertRole(['Owner'], 'view financial P&L statements');
    const supabase = getSupabaseClient();
    let totalRevenue = 185400;
    let totalExpenses = 72100;
    let netProfit = totalRevenue - totalExpenses;

    if (supabase) {
      const { data: pays } = await supabase.from('payments').select('amount');
      if (pays) totalRevenue = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);

      const { data: exps } = await supabase.from('expenses').select('amount');
      if (exps) totalExpenses = exps.reduce((s, e) => s + (Number(e.amount) || 0), 0);

      netProfit = totalRevenue - totalExpenses;
    }

    return {
      totalRevenue,
      totalExpenses,
      netProfit,
      margin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0',
    };
  },

  async getSalesReport(): Promise<any> {
    assertRole(['Owner', 'Manager'], 'view sales breakdowns');
    return {
      monthlySales: [
        { month: 'Oct 2026', total: 185400, count: 620 },
      ],
      productBreakdown: [
        { name: '19L Premium Can', quantity: 580, revenue: 127600 },
        { name: '1.5L Pack of 6', quantity: 95, revenue: 34200 },
        { name: '500ml Pack of 12', quantity: 45, revenue: 23600 },
      ],
    };
  },

  async getDeliveryReport(): Promise<any> {
    assertRole(['Owner', 'Manager'], 'view logistics delivery report');
    return {
      totalDeliveries: 48,
      onTimeRate: '96%',
      cansReturned: 42,
    };
  },

  // 14. DASHBOARD AGGREGATED STATS
  async getDashboardSummary(): Promise<DashboardSummary> {
    const user = getCurrentAuthUser();
    const isOwner = user.role_name === 'Owner' || user.role_id === 'role-owner';

    const cans = await this.getCanSummary();
    const deliveries = await this.getDeliveries();
    const orders = await this.getOrders();
    const customers = await this.getCustomers();
    const products = await this.getProducts();

    const deliveriesDelivered = deliveries.filter(d => d.status === 'delivered').length;
    const deliveriesInTransit = deliveries.filter(d => d.status === 'out_for_delivery' || d.status === 'assigned').length;
    const deliveriesPending = deliveries.filter(d => d.status === 'assigned' || d.status === 'rescheduled').length;

    const totalReceivables = isOwner ? customers.reduce((sum, c) => sum + (c.outstanding_balance || 0), 0) : 0;

    const kpis = {
      todaySales: isOwner ? 18400 : 0,
      todayCollections: isOwner ? 16200 : 0,
      todayExpenses: isOwner ? 4800 : 0,
      totalReceivables,
      filledStock: cans.factoryFilled || 350,
      emptyCansStock: cans.factoryEmpty || 280,
      cansWithCustomers: cans.customerHeld || 210,
      deliveriesToday: deliveries.length,
      deliveriesDelivered,
      deliveriesInTransit,
      deliveriesPending,
      monthlyRevenue: isOwner ? 185400 : 0,
      monthlyExpenses: isOwner ? 72100 : 0,
      monthlyProfit: isOwner ? 113300 : 0,
    };

    const recentDeliveries = deliveries.slice(0, 5);
    const recentOrders = orders.slice(0, 5);
    const lowStock = products.map(p => ({
      name: p.name,
      size: p.size,
      filled_stock: p.filled_stock || 150,
      empty_cans: p.empty_cans || 80,
    }));
    const topDebtors = isOwner ? customers.filter(c => c.outstanding_balance > 0).slice(0, 5) : [];

    const salesTrend = isOwner ? [
      { day: 'Mon', amount: 15400 },
      { day: 'Tue', amount: 18200 },
      { day: 'Wed', amount: 22100 },
      { day: 'Thu', amount: 19800 },
      { day: 'Fri', amount: 24500 },
      { day: 'Sat', amount: 21300 },
      { day: 'Sun', amount: 16900 },
    ] : [
      { day: 'Mon', amount: 0 },
      { day: 'Tue', amount: 0 },
      { day: 'Wed', amount: 0 },
      { day: 'Thu', amount: 0 },
      { day: 'Fri', amount: 0 },
      { day: 'Sat', amount: 0 },
      { day: 'Sun', amount: 0 },
    ];

    return {
      kpis,
      recentDeliveries,
      recentOrders,
      lowStock,
      topDebtors,
      salesTrend,
    };
  },

  // 15. AUDIT LOGS
  async getAuditLogs(): Promise<AuditLog[]> {
    assertRole(['Owner'], 'view security audit trail');
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
      if (data) return data as AuditLog[];
    }
    return [];
  },

  // 16. SETTINGS
  async getSettings(): Promise<Record<string, string>> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data } = await supabase.from('settings').select('*');
      if (data) {
        const map: Record<string, string> = {};
        data.forEach(s => { map[s.key] = s.value; });
        return map;
      }
    }
    return {
      business_name: 'AAB E ARWA Premium Drinking Water',
      business_phone: '+92 300 1234567',
      business_address: 'Plot 42, Industrial Zone, Water Filtration Estate',
      currency: 'PKR',
      can_security_deposit: '1200',
    };
  },

  async updateSettings(settings: Record<string, string>): Promise<void> {
    assertRole(['Owner'], 'update business configurations');
    const supabase = getSupabaseClient();
    if (supabase) {
      for (const [key, value] of Object.entries(settings)) {
        await supabase.from('settings').upsert({ key, value });
      }
    }
  },
};
