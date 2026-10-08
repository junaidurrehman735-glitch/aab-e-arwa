import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

let dbInstance: any = null;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'water_business.sqlite');

export async function getDatabase() {
  if (dbInstance) {
    return dbInstance;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const filebuffer = fs.readFileSync(DB_PATH);
    dbInstance = new SQL.Database(filebuffer);
  } else {
    dbInstance = new SQL.Database();
  }

  // Enable foreign keys
  dbInstance.run('PRAGMA foreign_keys = ON;');
  
  initializeSchema(dbInstance);
  persistDatabase();

  return dbInstance;
}

export function persistDatabase() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('Failed to persist database to disk:', err);
  }
}

export function queryAll<T = any>(sql: string, params: any[] = []): T[] {
  if (!dbInstance) throw new Error('Database not initialized');
  const stmt = dbInstance.prepare(sql);
  if (params && params.length > 0) {
    stmt.bind(params);
  }
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

export function queryOne<T = any>(sql: string, params: any[] = []): T | null {
  const all = queryAll<T>(sql, params);
  return all.length > 0 ? all[0] : null;
}

let inTransaction = false;

export function runQuery(sql: string, params: any[] = []): { changes: number } {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run(sql, params);
  const changes = dbInstance.getRowsModified();
  if (!inTransaction) {
    persistDatabase();
  }
  return { changes };
}

export function transaction<T>(callback: () => T): T {
  if (!dbInstance) throw new Error('Database not initialized');
  inTransaction = true;
  dbInstance.run('BEGIN TRANSACTION;');
  try {
    const result = callback();
    dbInstance.run('COMMIT;');
    inTransaction = false;
    persistDatabase();
    return result;
  } catch (error) {
    inTransaction = false;
    try {
      dbInstance.run('ROLLBACK;');
    } catch (_) {}
    console.error('CRITICAL TRANSACTION ERROR:', error);
    throw error;
  }
}

function initializeSchema(db: any) {
  db.run(`
    -- Roles table
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_system INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Permissions table
    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      module TEXT NOT NULL,
      can_view INTEGER DEFAULT 1,
      can_create INTEGER DEFAULT 0,
      can_edit INTEGER DEFAULT 0,
      can_approve INTEGER DEFAULT 0,
      can_delete INTEGER DEFAULT 0,
      UNIQUE(role_id, module)
    );

    -- Users / Staff table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_id TEXT NOT NULL REFERENCES roles(id),
      phone TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Customer Types
    CREATE TABLE IF NOT EXISTS customer_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      default_discount REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Customers
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT NOT NULL,
      whatsapp TEXT,
      address TEXT NOT NULL,
      area TEXT NOT NULL,
      area_access TEXT DEFAULT 'Specific Area',
      customer_type_id TEXT REFERENCES customer_types(id),
      selling_rate REAL DEFAULT 0,
      payment_type TEXT DEFAULT 'Cash',
      cash_status TEXT DEFAULT 'Cash on Delivery',
      credit_limit REAL DEFAULT 0,
      outstanding_balance REAL DEFAULT 0,
      cans_held INTEGER DEFAULT 0,
      net_deposit_amount REAL DEFAULT 0,
      notes TEXT,
      delivery_instructions TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Products / Cans
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      size TEXT NOT NULL,
      unit TEXT NOT NULL,
      selling_price REAL NOT NULL,
      cost_price REAL DEFAULT 0,
      is_reusable INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Inventory table
    CREATE TABLE IF NOT EXISTS inventory (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
      filled_stock INTEGER DEFAULT 0,
      empty_cans INTEGER DEFAULT 0,
      damaged_cans INTEGER DEFAULT 0,
      lost_cans INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Inventory Movements / Audit of stock
    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id),
      movement_type TEXT NOT NULL,
      stock_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      reason TEXT,
      reference_type TEXT,
      reference_id TEXT,
      user_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Production / Filling records
    CREATE TABLE IF NOT EXISTS production_records (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity_filled INTEGER NOT NULL,
      source_tank TEXT,
      notes TEXT,
      user_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Orders
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      total_amount REAL NOT NULL,
      payment_type TEXT NOT NULL DEFAULT 'Cash',
      payment_status TEXT NOT NULL DEFAULT 'pending',
      order_status TEXT NOT NULL DEFAULT 'pending',
      delivery_date TEXT NOT NULL,
      delivery_address TEXT NOT NULL,
      notes TEXT,
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Order Items
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL
    );

    -- Deliveries
    CREATE TABLE IF NOT EXISTS deliveries (
      id TEXT PRIMARY KEY,
      delivery_number TEXT NOT NULL UNIQUE,
      order_id TEXT NOT NULL REFERENCES orders(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      driver_id TEXT REFERENCES users(id),
      vehicle TEXT,
      delivery_date TEXT NOT NULL,
      delivery_time TEXT,
      status TEXT NOT NULL DEFAULT 'assigned',
      empty_cans_returned INTEGER DEFAULT 0,
      payment_collected REAL DEFAULT 0,
      payment_method TEXT,
      failure_reason TEXT,
      notes TEXT,
      completed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Delivery Items
    CREATE TABLE IF NOT EXISTS delivery_items (
      id TEXT PRIMARY KEY,
      delivery_id TEXT NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL
    );

    -- Customer Can Movements
    CREATE TABLE IF NOT EXISTS customer_can_movements (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      product_id TEXT REFERENCES products(id),
      movement_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      delivery_id TEXT REFERENCES deliveries(id),
      reason TEXT,
      user_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Payments
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      payment_number TEXT NOT NULL UNIQUE,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      order_id TEXT REFERENCES orders(id),
      delivery_id TEXT REFERENCES deliveries(id),
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      reference TEXT,
      notes TEXT,
      received_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Customer Ledger
    CREATE TABLE IF NOT EXISTS customer_ledger (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      transaction_type TEXT NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      debit REAL DEFAULT 0,
      credit REAL DEFAULT 0,
      balance REAL NOT NULL,
      description TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Expense Categories
    CREATE TABLE IF NOT EXISTS expense_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Expenses
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES expense_categories(id),
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      paid_by TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      expense_date TEXT NOT NULL,
      user_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Suppliers
    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact_person TEXT,
      phone TEXT NOT NULL,
      address TEXT,
      materials_supplied TEXT,
      outstanding_payable REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Supplier Transactions
    CREATE TABLE IF NOT EXISTS supplier_transactions (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      transaction_type TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      transaction_date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Audit Logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      record_ref TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Settings
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Indices for quick query performance
    CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
    CREATE INDEX IF NOT EXISTS idx_customers_area ON customers(area);
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(order_status);
    CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(driver_id);
    CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
    CREATE INDEX IF NOT EXISTS idx_ledger_customer ON customer_ledger(customer_id);
    CREATE INDEX IF NOT EXISTS idx_can_movements_customer ON customer_can_movements(customer_id);
    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
  `);

  // Safe migrations for newly added columns if database already existed
  try {
    db.run("ALTER TABLE customers ADD COLUMN cash_status TEXT DEFAULT 'Cash on Delivery';");
  } catch (_) {}
  try {
    db.run("ALTER TABLE customers ADD COLUMN net_deposit_amount REAL DEFAULT 0;");
  } catch (_) {}
  try {
    db.run("ALTER TABLE customers ADD COLUMN area_access TEXT DEFAULT 'Specific Area';");
  } catch (_) {}

  // Ensure the 5 approved customer types exist
  const approvedTypes = [
    { id: 'ct-home', name: 'Home', description: 'Residential and domestic households' },
    { id: 'ct-office', name: 'Office', description: 'Commercial offices and workplace accounts' },
    { id: 'ct-restaurant', name: 'Restaurant', description: 'Restaurants, cafes, food service' },
    { id: 'ct-shop', name: 'Shop', description: 'Retail marts, local convenience shops' },
    { id: 'ct-other', name: 'Other', description: 'Other customer classifications' },
  ];
  for (const t of approvedTypes) {
    try {
      db.run(
        "INSERT OR IGNORE INTO customer_types (id, name, description, default_discount) VALUES (?, ?, ?, 0);",
        [t.id, t.name, t.description]
      );
    } catch (_) {}
  }

  // Update old customer types mapping if existing
  try {
    db.run("UPDATE customers SET customer_type_id = 'ct-home' WHERE customer_type_id = 'ct-residential';");
    db.run("UPDATE customers SET customer_type_id = 'ct-office' WHERE customer_type_id = 'ct-commercial';");
    db.run("UPDATE customers SET customer_type_id = 'ct-shop' WHERE customer_type_id = 'ct-retail';");
    db.run("UPDATE customers SET customer_type_id = 'ct-other' WHERE customer_type_id = 'ct-industrial';");
  } catch (_) {}

  // Normalize existing areas to ONLY the 5 approved delivery areas:
  // 1. Chiltan Scheme Airport Road
  // 2. Nawa Killi Bypass
  // 3. Main Jinnah Road
  // 4. Quetta Avenue City
  // 5. Other
  try {
    db.run(`
      UPDATE customers 
      SET area = 'Chiltan Scheme Airport Road' 
      WHERE area LIKE '%F-7%' OR area LIKE '%Airport%' OR area LIKE '%Chiltan%';
    `);
    db.run(`
      UPDATE customers 
      SET area = 'Main Jinnah Road' 
      WHERE area LIKE '%Blue Area%' OR area LIKE '%G-11%' OR area LIKE '%Jinnah%';
    `);
    db.run(`
      UPDATE customers 
      SET area = 'Nawa Killi Bypass' 
      WHERE area LIKE '%H-8%' OR area LIKE '%Bypass%' OR area LIKE '%Nawa%';
    `);
    db.run(`
      UPDATE customers 
      SET area = 'Quetta Avenue City' 
      WHERE area LIKE '%I-9%' OR area LIKE '%City%' OR area LIKE '%Quetta%';
    `);
    db.run(`
      UPDATE customers 
      SET area = 'Other' 
      WHERE area NOT IN (
        'Chiltan Scheme Airport Road',
        'Nawa Killi Bypass',
        'Main Jinnah Road',
        'Quetta Avenue City',
        'Other'
      );
    `);
    // Ensure existing customers have reasonable net_deposit_amount if they have cans and deposit was 0
    db.run(`
      UPDATE customers
      SET net_deposit_amount = cans_held * 1500
      WHERE (net_deposit_amount IS NULL OR net_deposit_amount = 0) AND cans_held > 0;
    `);
    // Ensure cash_status is valid
    db.run(`
      UPDATE customers
      SET cash_status = CASE 
        WHEN outstanding_balance > 0 THEN 'Pending'
        WHEN payment_type = 'Cash' THEN 'Cash on Delivery'
        ELSE 'Paid'
      END
      WHERE cash_status IS NULL OR cash_status = '';
    `);
  } catch (_) {}
}
