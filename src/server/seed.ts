import bcrypt from 'bcryptjs';
import { queryOne, queryAll, runQuery, transaction } from './db.ts';

export async function seedInitialData() {
  // Check if roles exist
  const existingRole = queryOne('SELECT id FROM roles LIMIT 1;');
  if (existingRole) {
    return; // Already initialized
  }

  console.log('Seeding initial system roles, permissions, settings, and starter data...');

  transaction(() => {
    // 1. Roles
    const roles = [
      { id: 'role-owner', name: 'Owner / Super Admin', description: 'Full business ownership with unrestricted system access', is_system: 1 },
      { id: 'role-manager', name: 'Manager', description: 'Operations oversight, approval authority and staff supervision', is_system: 1 },
      { id: 'role-accountant', name: 'Accountant', description: 'Financial ledgers, payments, expenses, cash collection, and P&L reports', is_system: 1 },
      { id: 'role-sales', name: 'Sales Staff', description: 'Customer onboarding, order creation, rate management, and sales quotes', is_system: 1 },
      { id: 'role-warehouse', name: 'Filling / Warehouse Staff', description: 'Water purification, bottle filling, batch records, and warehouse inventory', is_system: 1 },
      { id: 'role-delivery', name: 'Delivery Staff', description: 'Route deliveries, bottle exchange, can returns, and instant cash collection', is_system: 1 },
    ];

    for (const r of roles) {
      runQuery(
        'INSERT INTO roles (id, name, description, is_system) VALUES (?, ?, ?, ?);',
        [r.id, r.name, r.description, r.is_system]
      );
    }

    // 2. Modules & Permissions
    const modules = [
      'dashboard', 'customers', 'products', 'inventory', 'production', 
      'orders', 'deliveries', 'cans', 'payments', 'expenses', 
      'suppliers', 'staff', 'reports', 'audit', 'settings'
    ];

    // Grant owner all permissions
    for (const m of modules) {
      runQuery(
        'INSERT INTO permissions (id, role_id, module, can_view, can_create, can_edit, can_approve, can_delete) VALUES (?, ?, ?, 1, 1, 1, 1, 1);',
        [`perm-owner-${m}`, 'role-owner', m]
      );
    }

    // Manager permissions
    for (const m of modules) {
      const isSuperOnly = m === 'settings';
      runQuery(
        'INSERT INTO permissions (id, role_id, module, can_view, can_create, can_edit, can_approve, can_delete) VALUES (?, ?, ?, 1, 1, 1, 1, ?);',
        [`perm-mgr-${m}`, 'role-manager', m, isSuperOnly ? 0 : 1]
      );
    }

    // Accountant permissions
    for (const m of modules) {
      const isFinancial = ['dashboard', 'payments', 'expenses', 'customers', 'suppliers', 'reports', 'orders'].includes(m);
      runQuery(
        'INSERT INTO permissions (id, role_id, module, can_view, can_create, can_edit, can_approve, can_delete) VALUES (?, ?, ?, ?, ?, ?, ?, ?);',
        [`perm-acc-${m}`, 'role-accountant', m, 
          isFinancial ? 1 : (['inventory', 'cans'].includes(m) ? 1 : 0),
          isFinancial ? 1 : 0,
          isFinancial ? 1 : 0,
          isFinancial ? 1 : 0,
          0
        ]
      );
    }

    // Sales staff permissions
    for (const m of modules) {
      const canAccess = ['dashboard', 'customers', 'orders', 'products', 'cans'].includes(m);
      runQuery(
        'INSERT INTO permissions (id, role_id, module, can_view, can_create, can_edit, can_approve, can_delete) VALUES (?, ?, ?, ?, ?, ?, ?, 0);',
        [`perm-sales-${m}`, 'role-sales', m, canAccess ? 1 : 0, canAccess ? 1 : 0, canAccess ? 1 : 0, 0]
      );
    }

    // Warehouse/Filling staff permissions
    for (const m of modules) {
      const canAccess = ['dashboard', 'inventory', 'production', 'products'].includes(m);
      runQuery(
        'INSERT INTO permissions (id, role_id, module, can_view, can_create, can_edit, can_approve, can_delete) VALUES (?, ?, ?, ?, ?, ?, 0, 0);',
        [`perm-wh-${m}`, 'role-warehouse', m, canAccess ? 1 : 0, canAccess ? 1 : 0, canAccess ? 1 : 0]
      );
    }

    // Delivery staff permissions
    for (const m of modules) {
      const canAccess = ['dashboard', 'deliveries', 'cans', 'customers'].includes(m);
      runQuery(
        'INSERT INTO permissions (id, role_id, module, can_view, can_create, can_edit, can_approve, can_delete) VALUES (?, ?, ?, ?, ?, ?, 0, 0);',
        [`perm-del-${m}`, 'role-delivery', m, canAccess ? 1 : 0, m === 'deliveries' ? 1 : 0, m === 'deliveries' ? 1 : 0]
      );
    }

    // 3. System Settings
    const defaultSettings = [
      { key: 'business_name', value: 'AAB E ARWA Premium Drinking Water', description: 'Official Business Name' },
      { key: 'business_phone', value: '+92 300 1234567', description: 'Primary Hotline / WhatsApp' },
      { key: 'business_address', value: 'Plot 42, Industrial Zone, Water Filtration Estate', description: 'Plant & Office Address' },
      { key: 'currency', value: 'PKR', description: 'System Currency Symbol' },
      { key: 'can_security_deposit', value: '1200', description: 'Standard Deposit per Reusable Can' },
      { key: 'tax_rate', value: '0', description: 'Sales Tax Percentage' },
    ];
    for (const s of defaultSettings) {
      runQuery(
        'INSERT INTO settings (key, value, description) VALUES (?, ?, ?);',
        [s.key, s.value, s.description]
      );
    }

    // 4. Customer Types (Home, Office, Restaurant, Shop, Other)
    const customerTypes = [
      { id: 'ct-home', name: 'Home', description: 'Residential households & domestic consumers', default_discount: 0 },
      { id: 'ct-office', name: 'Office', description: 'Corporate offices, commercial premises, clinics', default_discount: 0 },
      { id: 'ct-restaurant', name: 'Restaurant', description: 'Restaurants, cafes, caterers, food joints', default_discount: 0 },
      { id: 'ct-shop', name: 'Shop', description: 'Retail stores, grocery marts, local outlets', default_discount: 0 },
      { id: 'ct-other', name: 'Other', description: 'Other customer classifications', default_discount: 0 },
    ];
    for (const ct of customerTypes) {
      runQuery(
        'INSERT INTO customer_types (id, name, description, default_discount) VALUES (?, ?, ?, ?);',
        [ct.id, ct.name, ct.description, ct.default_discount]
      );
    }

    // 5. Expense Categories
    const expenseCategories = [
      { id: 'exp-fuel', name: 'Fuel & Delivery Logistics', description: 'Diesel, petrol for delivery vans & motorbikes' },
      { id: 'exp-salaries', name: 'Staff Salaries & Wages', description: 'Monthly payroll for production, drivers, and sales' },
      { id: 'exp-utilities', name: 'Utilities & Electricity', description: 'High-power RO pump electricity, water extraction dues' },
      { id: 'exp-vehicle', name: 'Vehicle Maintenance & Repairs', description: 'Tyre changes, engine tuning, route wear' },
      { id: 'exp-can-replace', name: 'Can & Bottle Replacement', description: 'Damaged can write-offs and replacement purchases' },
      { id: 'exp-packaging', name: 'Packaging & Caps & Seals', description: 'Sanitary caps, tamper-evident shrink wraps, labels' },
      { id: 'exp-chemicals', name: 'Filtration & Mineral Consumables', description: 'RO membrane wash, mineral dosing, ozone supplies' },
      { id: 'exp-rent', name: 'Plant & Warehouse Rent', description: 'Monthly premises lease' },
      { id: 'exp-marketing', name: 'Marketing & Signboards', description: 'Door-to-door flyers, banner boards, local ads' },
      { id: 'exp-other', name: 'General & Miscellaneous', description: 'Tea, office stationery, minor repairs' },
    ];
    for (const ec of expenseCategories) {
      runQuery(
        'INSERT INTO expense_categories (id, name, description) VALUES (?, ?, ?);',
        [ec.id, ec.name, ec.description]
      );
    }

    // 6. Products
    const products = [
      {
        id: 'prod-19l-can',
        name: 'AAB E ARWA 19L Premium Water Can',
        size: '19 Liter',
        unit: 'Can',
        selling_price: 220,
        cost_price: 65,
        is_reusable: 1,
        filled_stock: 350,
        empty_cans: 280,
      },
      {
        id: 'prod-20l-can',
        name: 'AAB E ARWA 20L Heavy-Duty Can',
        size: '20 Liter',
        unit: 'Can',
        selling_price: 240,
        cost_price: 70,
        is_reusable: 1,
        filled_stock: 140,
        empty_cans: 95,
      },
      {
        id: 'prod-1500ml-bottle',
        name: 'AAB E ARWA 1.5L Mineral Water (Pack of 6)',
        size: '1.5 Liter (6-Pack)',
        unit: 'Pack',
        selling_price: 450,
        cost_price: 280,
        is_reusable: 0,
        filled_stock: 90,
        empty_cans: 0,
      },
      {
        id: 'prod-500ml-bottle',
        name: 'AAB E ARWA 500ml Mineral Water (Pack of 12)',
        size: '500ml (12-Pack)',
        unit: 'Pack',
        selling_price: 520,
        cost_price: 310,
        is_reusable: 0,
        filled_stock: 110,
        empty_cans: 0,
      },
    ];

    for (const p of products) {
      runQuery(
        'INSERT INTO products (id, name, size, unit, selling_price, cost_price, is_reusable, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1);',
        [p.id, p.name, p.size, p.unit, p.selling_price, p.cost_price, p.is_reusable]
      );

      runQuery(
        'INSERT INTO inventory (id, product_id, filled_stock, empty_cans, damaged_cans, lost_cans) VALUES (?, ?, ?, ?, 0, 0);',
        [`inv-${p.id}`, p.id, p.filled_stock, p.empty_cans]
      );

      // Initial movement record
      runQuery(
        'INSERT INTO inventory_movements (id, product_id, movement_type, stock_type, quantity, reason, reference_type) VALUES (?, ?, ?, ?, ?, ?, ?);',
        [`mov-init-${p.id}`, p.id, 'initial_stock', 'filled', p.filled_stock, 'Initial Opening Balance', 'initial']
      );
    }

    // 7. Initial Users (with bcrypt hashed passwords: admin123, manager123, etc.)
    const salt = bcrypt.genSaltSync(10);
    const users = [
      { id: 'user-owner', name: 'Tariq Mehmood', email: 'owner@aabearwa.com', pass: 'admin123', role: 'role-owner', phone: '+92 300 8472911' },
      { id: 'user-manager', name: 'Kamran Ali', email: 'manager@aabearwa.com', pass: 'manager123', role: 'role-manager', phone: '+92 321 9845120' },
      { id: 'user-accountant', name: 'Zahid Hussain', email: 'accountant@aabearwa.com', pass: 'account123', role: 'role-accountant', phone: '+92 333 4120987' },
      { id: 'user-sales', name: 'Bilal Farooq', email: 'sales@aabearwa.com', pass: 'sales123', role: 'role-sales', phone: '+92 302 5541290' },
      { id: 'user-warehouse', name: 'Muhammad Aslam', email: 'filling@aabearwa.com', pass: 'filling123', role: 'role-warehouse', phone: '+92 311 7782390' },
      { id: 'user-delivery-1', name: 'Rashid Khan', email: 'delivery@aabearwa.com', pass: 'delivery123', role: 'role-delivery', phone: '+92 345 6671029' },
    ];

    for (const u of users) {
      const hash = bcrypt.hashSync(u.pass, salt);
      runQuery(
        'INSERT INTO users (id, name, email, password_hash, role_id, phone, status) VALUES (?, ?, ?, ?, ?, ?, ?);',
        [u.id, u.name, u.email, hash, u.role, u.phone, 'active']
      );
    }

    // 8. Starter Suppliers
    const suppliers = [
      {
        id: 'sup-polytech',
        name: 'Apex PolyTech Containers Ltd.',
        contact_person: 'Mr. Salman Qureshi',
        phone: '+92 301 8847120',
        address: 'Plot 18, Plastics Industrial Estate, Sheikhupura Road',
        materials_supplied: '19L & 20L Polycarbonate Cans, Spill-proof Handles',
        outstanding_payable: 45000,
      },
      {
        id: 'sup-caps-seals',
        name: 'PureShield Caps & Closures',
        contact_person: 'Adeel Akhtar',
        phone: '+92 322 4490183',
        address: 'B-12 Small Industrial Estate, Gujranwala',
        materials_supplied: '55mm Non-spill Caps, Shrink Sleeves, Hologram Labels',
        outstanding_payable: 18500,
      },
      {
        id: 'sup-minerals',
        name: 'AquaPure Chemical & Mineral Technologies',
        contact_person: 'Dr. Nadeem Sheikh',
        phone: '+92 334 7729104',
        address: 'Commerce Avenue, Lahore',
        materials_supplied: 'RO Membrane Antiscalant, Food-grade Mineral Salts (Magnesium, Potassium, Calcium)',
        outstanding_payable: 28000,
      },
    ];

    for (const s of suppliers) {
      runQuery(
        'INSERT INTO suppliers (id, name, contact_person, phone, address, materials_supplied, outstanding_payable) VALUES (?, ?, ?, ?, ?, ?, ?);',
        [s.id, s.name, s.contact_person, s.phone, s.address, s.materials_supplied, s.outstanding_payable]
      );
    }

    // 9. Starter Customers (Realistic, with can tracking and ledger balances)
    const customers = [
      {
        id: 'cust-beacon',
        name: 'Beaconhouse School System (Main Branch)',
        contact_person: 'Admin Officer Naveed',
        phone: '+92 321 8493021',
        whatsapp: '+92 321 8493021',
        address: 'Campus 4, Main Boulevard',
        area: 'Main Jinnah Road',
        customer_type_id: 'ct-office',
        selling_rate: 210,
        payment_type: 'Credit',
        cash_status: 'Pending',
        outstanding_balance: 6300,
        cans_held: 25,
        net_deposit_amount: 37500,
        notes: 'Monthly billing cycle on 1st of each month',
        delivery_instructions: 'Deliver before 8:00 AM before student arrival. Gate 2.',
      },
      {
        id: 'cust-metro-clinic',
        name: 'Metro Care Hospital & Diagnostics',
        contact_person: 'Store Incharge Imran',
        phone: '+92 300 9182345',
        whatsapp: '+92 300 9182345',
        address: 'Plot 104, Medical Boulevard',
        area: 'Chiltan Scheme Airport Road',
        customer_type_id: 'ct-office',
        selling_rate: 200,
        payment_type: 'Credit',
        cash_status: 'Pending',
        outstanding_balance: 8000,
        cans_held: 30,
        net_deposit_amount: 45000,
        notes: 'Strict sanitization of external bottle necks required',
        delivery_instructions: 'Receive at basement loading ramp. Signature from store keeper.',
      },
      {
        id: 'cust-ali-residence',
        name: 'Brigadier (R) Ali Khan Residence',
        contact_person: 'Ali Khan',
        phone: '+92 333 5521908',
        whatsapp: '+92 333 5521908',
        address: 'House 74, Street 19',
        area: 'Chiltan Scheme Airport Road',
        customer_type_id: 'ct-home',
        selling_rate: 220,
        payment_type: 'Cash',
        cash_status: 'Paid',
        outstanding_balance: 440,
        cans_held: 4,
        net_deposit_amount: 6000,
        notes: '2 cans twice a week (Tuesdays and Saturdays)',
        delivery_instructions: 'Ring front bell, leave cans inside porch stand.',
      },
      {
        id: 'cust-apex-tech',
        name: 'Apex Digital Solutions Software House',
        contact_person: 'HR Manager Maryam',
        phone: '+92 312 9901452',
        whatsapp: '+92 312 9901452',
        address: 'Floor 3, IT Tower, Bypass Express',
        area: 'Nawa Killi Bypass',
        customer_type_id: 'ct-office',
        selling_rate: 210,
        payment_type: 'Cash',
        cash_status: 'Paid',
        outstanding_balance: 0,
        cans_held: 12,
        net_deposit_amount: 18000,
        notes: 'Prefers digital receipt via WhatsApp',
        delivery_instructions: 'Call reception upon arrival. Use service elevator.',
      },
      {
        id: 'cust-al-madina-mart',
        name: 'Al-Madina Super Mart',
        contact_person: 'Haji Shabir',
        phone: '+92 345 5567812',
        whatsapp: '+92 345 5567812',
        address: 'Main Market, City Center',
        area: 'Quetta Avenue City',
        customer_type_id: 'ct-shop',
        selling_rate: 195,
        payment_type: 'Credit',
        cash_status: 'Cash on Delivery',
        outstanding_balance: 5850,
        cans_held: 20,
        net_deposit_amount: 30000,
        notes: 'Resells cans to walk-in neighborhood customers',
        delivery_instructions: 'Delivery during morning 9:00 AM - 11:00 AM.',
      },
    ];

    for (const c of customers) {
      runQuery(
        `INSERT INTO customers (id, name, contact_person, phone, whatsapp, address, area, customer_type_id, selling_rate, payment_type, cash_status, outstanding_balance, cans_held, net_deposit_amount, notes, delivery_instructions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [c.id, c.name, c.contact_person, c.phone, c.whatsapp, c.address, c.area, c.customer_type_id, c.selling_rate, c.payment_type, c.cash_status, c.outstanding_balance, c.cans_held, c.net_deposit_amount, c.notes, c.delivery_instructions]
      );

      // Ledger entry for existing balance if > 0
      if (c.outstanding_balance > 0) {
        runQuery(
          `INSERT INTO customer_ledger (id, customer_id, transaction_type, reference_type, debit, credit, balance, description, transaction_date)
           VALUES (?, ?, 'opening_balance', 'initial', ?, 0, ?, 'Previous Verified Opening Ledger Balance', date('now', '-7 days'));`,
          [`led-init-${c.id}`, c.id, c.outstanding_balance, c.outstanding_balance]
        );
      }

      // Can tracking record
      if (c.cans_held > 0) {
        runQuery(
          `INSERT INTO customer_can_movements (id, customer_id, product_id, movement_type, quantity, balance_after, reason)
           VALUES (?, ?, 'prod-19l-can', 'initial_cans', ?, ?, 'Opening Can Balance with Customer');`,
          [`can-init-${c.id}`, c.id, c.cans_held, c.cans_held]
        );
      }
    }

    // 10. Sample Recent Production / Filling Batch
    const batchId = `prod-batch-${Date.now()}`;
    runQuery(
      `INSERT INTO production_records (id, product_id, quantity_filled, source_tank, notes, user_id, created_at)
       VALUES (?, 'prod-19l-can', 180, 'RO Mineral Tank Line 1', 'Morning filling shift batch #091 - TDS 110 ppm, pH 7.4 tested OK', 'user-warehouse', datetime('now', '-2 hours'));`,
      [batchId]
    );

    // 11. Sample Deliveries & Orders for Today
    const today = new Date().toISOString().split('T')[0];

    // Order 1: Completed Delivery
    const ord1Id = 'ord-1001';
    runQuery(
      `INSERT INTO orders (id, order_number, customer_id, total_amount, payment_type, payment_status, order_status, delivery_date, delivery_address, created_by, created_at)
       VALUES (?, 'ORD-2026-001', 'cust-ali-residence', 440, 'Cash', 'paid', 'completed', ?, 'House 74, Street 19, Sector F-7/2', 'user-sales', datetime('now', '-4 hours'));`,
      [ord1Id, today]
    );
    runQuery(
      `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price)
       VALUES ('oi-1001', ?, 'prod-19l-can', 2, 220, 440);`,
      [ord1Id]
    );

    const del1Id = 'del-2001';
    runQuery(
      `INSERT INTO deliveries (id, delivery_number, order_id, customer_id, driver_id, vehicle, delivery_date, delivery_time, status, empty_cans_returned, payment_collected, payment_method, completed_at, created_at)
       VALUES (?, 'DEL-2026-001', ?, 'cust-ali-residence', 'user-delivery-1', 'Suzuki APV (LEA-819)', ?, '10:30 AM', 'delivered', 2, 440, 'Cash', datetime('now', '-3 hours'), datetime('now', '-4 hours'));`,
      [del1Id, ord1Id, today]
    );
    runQuery(
      `INSERT INTO delivery_items (id, delivery_id, product_id, quantity) VALUES ('di-2001', ?, 'prod-19l-can', 2);`,
      [del1Id]
    );

    // Payment for Order 1
    runQuery(
      `INSERT INTO payments (id, payment_number, customer_id, order_id, delivery_id, amount, payment_method, payment_date, reference, notes, received_by)
       VALUES ('pay-3001', 'PAY-2026-001', 'cust-ali-residence', ?, ?, 440, 'Cash', ?, 'REC-001', 'Cash collected at doorstep upon delivery', 'user-delivery-1');`,
      [ord1Id, del1Id, today]
    );

    // Order 2: Pending Out for Delivery
    const ord2Id = 'ord-1002';
    runQuery(
      `INSERT INTO orders (id, order_number, customer_id, total_amount, payment_type, payment_status, order_status, delivery_date, delivery_address, created_by, created_at)
       VALUES (?, 'ORD-2026-002', 'cust-beacon', 2100, 'Credit', 'credit', 'confirmed', ?, 'Campus 4, Sector G-11/2', 'user-sales', datetime('now', '-1 hour'));`,
      [ord2Id, today]
    );
    runQuery(
      `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price)
       VALUES ('oi-1002', ?, 'prod-19l-can', 10, 210, 2100);`,
      [ord2Id]
    );

    const del2Id = 'del-2002';
    runQuery(
      `INSERT INTO deliveries (id, delivery_number, order_id, customer_id, driver_id, vehicle, delivery_date, delivery_time, status, notes, created_at)
       VALUES (?, 'DEL-2026-002', ?, 'cust-beacon', 'user-delivery-1', 'Suzuki APV (LEA-819)', ?, '02:00 PM', 'out_for_delivery', '10 cans to school main entrance', datetime('now', '-1 hour'));`,
      [del2Id, ord2Id, today]
    );
    runQuery(
      `INSERT INTO delivery_items (id, delivery_id, product_id, quantity) VALUES ('di-2002', ?, 'prod-19l-can', 10);`,
      [del2Id]
    );

    // 12. Starter Expenses
    const expenses = [
      { id: 'exp-1', category_id: 'exp-fuel', amount: 3200, desc: 'Diesel top-up for delivery van LEA-819', paid_by: 'Rashid Khan (Driver)', method: 'Cash', date: today },
      { id: 'exp-2', category_id: 'exp-packaging', amount: 4500, desc: 'Batch of 500 blue heat-shrink bottle neck seals', paid_by: 'Muhammad Aslam', method: 'Cash', date: today },
      { id: 'exp-3', category_id: 'exp-utilities', amount: 18500, desc: 'Commercial tube-well power bill portion', paid_by: 'Tariq Mehmood', method: 'Bank Transfer', date: today },
    ];
    for (const e of expenses) {
      runQuery(
        `INSERT INTO expenses (id, category_id, amount, description, paid_by, payment_method, expense_date, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'user-owner');`,
        [e.id, e.category_id, e.amount, e.desc, e.paid_by, e.method, e.date]
      );
    }

    // 13. Audit Log Entry
    runQuery(
      `INSERT INTO audit_logs (id, user_id, user_name, action, module, record_ref, details)
       VALUES ('audit-init', 'user-owner', 'Tariq Mehmood', 'SYSTEM_INITIALIZE', 'system', 'sys-001', 'Initial business database schema, products, customer accounts and role configurations seeded successfully');`
    );
  });

  console.log('Database initialization & seeding completed successfully.');
}
