import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { queryOne, queryAll, runQuery, transaction } from './db.ts';
import { authenticate, checkPermission, generateToken, logAudit, AuthRequest } from './auth.ts';

export const apiRouter = Router();

// ==========================================
// 1. AUTHENTICATION & PROFILE
// ==========================================

apiRouter.post('/auth/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = queryOne(
    `SELECT u.*, r.name as role_name 
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE LOWER(u.email) = LOWER(?);`,
    [email.trim()]
  );

  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (user.status !== 'active') {
    return res.status(403).json({ error: 'Your account is deactivated. Contact business administrator.' });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = generateToken(user);
  logAudit(user, 'LOGIN', 'auth', user.id, `User ${user.name} logged in`, req);

  // Fetch user's permissions
  const permissions = queryAll(
    'SELECT module, can_view, can_create, can_edit, can_approve, can_delete FROM permissions WHERE role_id = ?;',
    [user.role_id]
  );

  res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role_id: user.role_id,
      role_name: user.role_name,
      phone: user.phone,
    },
    permissions,
  });
});

apiRouter.get('/auth/me', authenticate, (req: AuthRequest, res: Response) => {
  const user = req.user!;
  const permissions = queryAll(
    'SELECT module, can_view, can_create, can_edit, can_approve, can_delete FROM permissions WHERE role_id = ?;',
    [user.role_id]
  );
  res.json({ user, permissions });
});

apiRouter.post('/auth/change-password', authenticate, (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  const user = queryOne('SELECT password_hash FROM users WHERE id = ?;', [req.user!.id]);
  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(newPassword, salt);
  runQuery('UPDATE users SET password_hash = ?, updated_at = datetime("now") WHERE id = ?;', [hash, req.user!.id]);

  logAudit(req.user, 'PASSWORD_CHANGE', 'users', req.user!.id, 'User changed their password', req);
  res.json({ success: true, message: 'Password updated successfully' });
});

// ==========================================
// 2. DASHBOARD
// ==========================================

apiRouter.get('/dashboard/summary', authenticate, (req: AuthRequest, res: Response) => {
  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = today.substring(0, 7) + '-01';

  // 1. Today's Sales
  const todaySales = queryOne(
    `SELECT COALESCE(SUM(total_amount), 0) as total FROM orders 
     WHERE date(created_at) = ? AND order_status != 'cancelled';`,
    [today]
  )?.total || 0;

  // 2. Today's Collections
  const todayCollections = queryOne(
    `SELECT COALESCE(SUM(amount), 0) as total FROM payments 
     WHERE payment_date = ?;`,
    [today]
  )?.total || 0;

  // 3. Today's Expenses
  const todayExpenses = queryOne(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses 
     WHERE expense_date = ?;`,
    [today]
  )?.total || 0;

  // 4. Outstanding Receivables
  const totalReceivables = queryOne(
    `SELECT COALESCE(SUM(outstanding_balance), 0) as total FROM customers;`
  )?.total || 0;

  // 5. Inventory status
  const inventoryStats = queryOne(
    `SELECT 
       COALESCE(SUM(filled_stock), 0) as filled_stock,
       COALESCE(SUM(empty_cans), 0) as empty_cans,
       COALESCE(SUM(damaged_cans), 0) as damaged_cans,
       COALESCE(SUM(lost_cans), 0) as lost_cans
     FROM inventory;`
  ) || { filled_stock: 0, empty_cans: 0, damaged_cans: 0, lost_cans: 0 };

  // 6. Cans held with customers
  const cansWithCustomers = queryOne(
    `SELECT COALESCE(SUM(cans_held), 0) as total FROM customers;`
  )?.total || 0;

  // 7. Deliveries Today
  const deliveriesToday = queryOne(
    `SELECT 
       COUNT(*) as total,
       SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
       SUM(CASE WHEN status = 'out_for_delivery' THEN 1 ELSE 0 END) as in_transit,
       SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as pending
     FROM deliveries 
     WHERE delivery_date = ?;`,
    [today]
  ) || { total: 0, delivered: 0, in_transit: 0, pending: 0 };

  // 8. Month-to-date Revenue & Expenses
  const monthlyRevenue = queryOne(
    `SELECT COALESCE(SUM(total_amount), 0) as total FROM orders 
     WHERE date(created_at) >= ? AND order_status != 'cancelled';`,
    [firstDayOfMonth]
  )?.total || 0;

  const monthlyExpenses = queryOne(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses 
     WHERE expense_date >= ?;`,
    [firstDayOfMonth]
  )?.total || 0;

  // Monthly cost of delivered products
  const monthlyCost = queryOne(
    `SELECT COALESCE(SUM(di.quantity * p.cost_price), 0) as total
     FROM delivery_items di
     JOIN deliveries d ON di.delivery_id = d.id
     JOIN products p ON di.product_id = p.id
     WHERE d.status = 'delivered' AND date(d.created_at) >= ?;`,
    [firstDayOfMonth]
  )?.total || 0;

  const monthlyProfit = monthlyRevenue - (monthlyExpenses + monthlyCost);

  // 9. Recent Deliveries
  const recentDeliveries = queryAll(
    `SELECT d.*, c.name as customer_name, c.area as customer_area, u.name as driver_name
     FROM deliveries d
     JOIN customers c ON d.customer_id = c.id
     LEFT JOIN users u ON d.driver_id = u.id
     ORDER BY d.created_at DESC
     LIMIT 5;`
  );

  // 10. Recent Orders
  const recentOrders = queryAll(
    `SELECT o.*, c.name as customer_name, c.phone as customer_phone
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     ORDER BY o.created_at DESC
     LIMIT 5;`
  );

  // 11. Low stock warnings
  const lowStock = queryAll(
    `SELECT p.name, p.size, i.filled_stock, i.empty_cans
     FROM inventory i
     JOIN products p ON i.product_id = p.id
     WHERE i.filled_stock < 50;`
  );

  // 12. Top Debtor Customers
  const topDebtors = queryAll(
    `SELECT id, name, area, phone, outstanding_balance, cans_held, net_deposit_amount, cash_status
     FROM customers
     WHERE outstanding_balance > 0
     ORDER BY outstanding_balance DESC
     LIMIT 5;`
  );

  // 13. Weekly sales trend (last 7 days)
  const salesTrend = queryAll(
    `SELECT date(created_at) as day, COALESCE(SUM(total_amount), 0) as amount
     FROM orders
     WHERE date(created_at) >= date('now', '-6 days') AND order_status != 'cancelled'
     GROUP BY date(created_at)
     ORDER BY day ASC;`
  );

  res.json({
    kpis: {
      todaySales,
      todayCollections,
      todayExpenses,
      totalReceivables,
      filledStock: inventoryStats.filled_stock,
      emptyCansStock: inventoryStats.empty_cans,
      cansWithCustomers,
      deliveriesToday: deliveriesToday.total,
      deliveriesDelivered: deliveriesToday.delivered,
      deliveriesInTransit: deliveriesToday.in_transit,
      deliveriesPending: deliveriesToday.pending,
      monthlyRevenue,
      monthlyExpenses,
      monthlyProfit,
    },
    recentDeliveries,
    recentOrders,
    lowStock,
    topDebtors,
    salesTrend,
  });
});

// ==========================================
// 3. CUSTOMER MANAGEMENT
// ==========================================

apiRouter.get('/customers', authenticate, checkPermission('customers', 'can_view'), (req: Request, res: Response) => {
  const { search, area, type, paymentType, cashStatus } = req.query;
  let sql = `
    SELECT c.*, ct.name as customer_type_name
    FROM customers c
    LEFT JOIN customer_types ct ON c.customer_type_id = ct.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (search) {
    sql += ` AND (LOWER(c.name) LIKE ? OR c.phone LIKE ? OR LOWER(c.address) LIKE ? OR LOWER(c.area) LIKE ?)`;
    const s = `%${String(search).toLowerCase()}%`;
    params.push(s, s, s, s);
  }

  if (area) {
    sql += ` AND c.area = ?`;
    params.push(area);
  }

  if (type) {
    sql += ` AND (c.customer_type_id = ? OR ct.name = ?)`;
    params.push(type, type);
  }

  if (paymentType) {
    sql += ` AND c.payment_type = ?`;
    params.push(paymentType);
  }

  if (cashStatus) {
    sql += ` AND c.cash_status = ?`;
    params.push(cashStatus);
  }

  sql += ` ORDER BY c.name ASC;`;

  const customers = queryAll(sql, params);
  res.json(customers);
});

apiRouter.get('/customers/types', authenticate, (req: Request, res: Response) => {
  const types = queryAll('SELECT * FROM customer_types ORDER BY name ASC;');
  res.json(types);
});

apiRouter.get('/customers/:id', authenticate, checkPermission('customers', 'can_view'), (req: Request, res: Response) => {
  const customer = queryOne(
    `SELECT c.*, ct.name as customer_type_name
     FROM customers c
     LEFT JOIN customer_types ct ON c.customer_type_id = ct.id
     WHERE c.id = ?;`,
    [req.params.id]
  );

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  // Related orders
  const orders = queryAll(
    `SELECT o.*, u.name as created_by_name 
     FROM orders o
     LEFT JOIN users u ON o.created_by = u.id
     WHERE o.customer_id = ?
     ORDER BY o.created_at DESC LIMIT 20;`,
    [customer.id]
  );

  // Related deliveries
  const deliveries = queryAll(
    `SELECT d.*, u.name as driver_name
     FROM deliveries d
     LEFT JOIN users u ON d.driver_id = u.id
     WHERE d.customer_id = ?
     ORDER BY d.created_at DESC LIMIT 20;`,
    [customer.id]
  );

  // Related payments
  const payments = queryAll(
    `SELECT p.*, u.name as received_by_name
     FROM payments p
     LEFT JOIN users u ON p.received_by = u.id
     WHERE p.customer_id = ?
     ORDER BY p.payment_date DESC LIMIT 20;`,
    [customer.id]
  );

  // Can movement statement
  const canMovements = queryAll(
    `SELECT cm.*, p.name as product_name, u.name as user_name
     FROM customer_can_movements cm
     LEFT JOIN products p ON cm.product_id = p.id
     LEFT JOIN users u ON cm.user_id = u.id
     WHERE cm.customer_id = ?
     ORDER BY cm.created_at DESC LIMIT 30;`,
    [customer.id]
  );

  // Running customer ledger
  const ledger = queryAll(
    `SELECT * FROM customer_ledger 
     WHERE customer_id = ?
     ORDER BY created_at ASC;`,
    [customer.id]
  );

  res.json({
    customer,
    orders,
    deliveries,
    payments,
    canMovements,
    ledger,
  });
});

apiRouter.post('/customers', authenticate, checkPermission('customers', 'can_create'), (req: AuthRequest, res: Response) => {
  const {
    name, contact_person, phone, whatsapp, address, area, area_access,
    customer_type_id, selling_rate, payment_type, cash_status,
    company_cans, cans_held, initial_cans, net_deposit_amount,
    notes, delivery_instructions
  } = req.body;

  if (!name || !phone || !address || !area) {
    return res.status(400).json({ error: 'Name, phone, address, and delivery area are required' });
  }

  const id = `cust-${Date.now()}`;
  const cansHeld = Number(company_cans !== undefined ? company_cans : (cans_held !== undefined ? cans_held : initial_cans)) || 0;
  const deposit = Number(net_deposit_amount) || 0;
  const rate = Number(selling_rate) || 0;
  const cashStat = cash_status || 'Cash on Delivery';

  transaction(() => {
    runQuery(
      `INSERT INTO customers (
        id, name, contact_person, phone, whatsapp, address, area, area_access,
        customer_type_id, selling_rate, payment_type, cash_status, credit_limit,
        outstanding_balance, cans_held, net_deposit_amount, notes, delivery_instructions
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?);`,
      [
        id, name.trim(), contact_person || '', phone.trim(), whatsapp || phone.trim(),
        address.trim(), area.trim(), area_access || 'Specific Area',
        customer_type_id || 'ct-home', rate, payment_type || 'Cash', cashStat,
        cansHeld, deposit, notes || '', delivery_instructions || ''
      ]
    );

    if (cansHeld > 0) {
      runQuery(
        `INSERT INTO customer_can_movements (id, customer_id, product_id, movement_type, quantity, balance_after, reason, user_id)
         VALUES (?, ?, 'prod-19l-can', 'initial_cans', ?, ?, 'Initial company cans with customer registration', ?);`,
        [`can-${Date.now()}`, id, cansHeld, cansHeld, req.user!.id]
      );
    }

    logAudit(req.user, 'CREATE', 'customers', id, `Created customer: ${name} (Cans: ${cansHeld}, Deposit: PKR ${deposit}, Status: ${cashStat})`, req);
  });

  res.status(201).json({ id, message: 'Customer profile created successfully' });
});

apiRouter.put('/customers/:id', authenticate, checkPermission('customers', 'can_edit'), (req: AuthRequest, res: Response) => {
  const {
    name, contact_person, phone, whatsapp, address, area, area_access,
    customer_type_id, selling_rate, payment_type, cash_status,
    company_cans, cans_held, net_deposit_amount,
    status, notes, delivery_instructions
  } = req.body;

  const existing = queryOne('SELECT * FROM customers WHERE id = ?;', [req.params.id]);
  if (!existing) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const updatedCans = company_cans !== undefined 
    ? Number(company_cans) 
    : (cans_held !== undefined ? Number(cans_held) : existing.cans_held);
  const updatedDeposit = net_deposit_amount !== undefined 
    ? Number(net_deposit_amount) 
    : (existing.net_deposit_amount || 0);
  const updatedRate = selling_rate !== undefined 
    ? Number(selling_rate) 
    : existing.selling_rate;
  const updatedCashStatus = cash_status || existing.cash_status || 'Cash on Delivery';
  const updatedAreaAccess = area_access || existing.area_access || 'Specific Area';

  transaction(() => {
    runQuery(
      `UPDATE customers SET 
         name = ?, contact_person = ?, phone = ?, whatsapp = ?, address = ?, area = ?, area_access = ?,
         customer_type_id = ?, selling_rate = ?, payment_type = ?, cash_status = ?,
         cans_held = ?, net_deposit_amount = ?,
         status = ?, notes = ?, delivery_instructions = ?, updated_at = datetime('now')
       WHERE id = ?;`,
      [
        name, contact_person || '', phone, whatsapp || '', address, area, updatedAreaAccess,
        customer_type_id, updatedRate, payment_type || existing.payment_type || 'Cash', updatedCashStatus,
        updatedCans, updatedDeposit,
        status || 'active', notes || '', delivery_instructions || '', req.params.id
      ]
    );

    // If cans held changed, record audit & can movement!
    if (updatedCans !== existing.cans_held) {
      const diff = updatedCans - existing.cans_held;
      runQuery(
        `INSERT INTO customer_can_movements (id, customer_id, product_id, movement_type, quantity, balance_after, reason, user_id)
         VALUES (?, ?, 'prod-19l-can', 'adjustment', ?, ?, 'Customer profile cans updated from ${existing.cans_held} to ${updatedCans}', ?);`,
        [`can-adj-${Date.now()}`, req.params.id, Math.abs(diff), updatedCans, req.user!.id]
      );
    }

    logAudit(req.user, 'UPDATE', 'customers', req.params.id, `Updated customer profile: ${name} (Cans: ${updatedCans}, Deposit: PKR ${updatedDeposit}, Status: ${updatedCashStatus})`, req);
  });

  res.json({ success: true, message: 'Customer profile updated successfully' });
});

// Quick security deposit adjustment / refund
apiRouter.post('/customers/:id/deposit', authenticate, checkPermission('customers', 'can_edit'), (req: AuthRequest, res: Response) => {
  const { amount, action, notes } = req.body;
  const customer = queryOne('SELECT * FROM customers WHERE id = ?;', [req.params.id]);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  let newDeposit = customer.net_deposit_amount || 0;
  const numAmount = Number(amount) || 0;
  if (action === 'add') {
    newDeposit += numAmount;
  } else if (action === 'refund') {
    newDeposit = Math.max(0, newDeposit - numAmount);
  } else {
    newDeposit = numAmount;
  }

  runQuery('UPDATE customers SET net_deposit_amount = ?, updated_at = datetime("now") WHERE id = ?;', [newDeposit, req.params.id]);
  logAudit(req.user, 'UPDATE', 'customers', req.params.id, `Adjusted security deposit: PKR ${newDeposit} (${notes || action})`, req);
  res.json({ success: true, net_deposit_amount: newDeposit, message: 'Deposit updated successfully' });
});

apiRouter.delete('/customers/:id', authenticate, checkPermission('customers', 'can_delete'), (req: AuthRequest, res: Response) => {
  const customer = queryOne('SELECT * FROM customers WHERE id = ?;', [req.params.id]);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  if (customer.outstanding_balance > 0) {
    return res.status(400).json({
      error: `Cannot delete customer with active outstanding balance of PKR ${customer.outstanding_balance}. Settle ledger first.`
    });
  }

  if (customer.cans_held > 0) {
    return res.status(400).json({
      error: `Cannot delete customer who currently holds ${customer.cans_held} company cans. Collect or adjust cans first.`
    });
  }

  transaction(() => {
    runQuery('DELETE FROM customer_ledger WHERE customer_id = ?;', [customer.id]);
    runQuery('DELETE FROM customer_can_movements WHERE customer_id = ?;', [customer.id]);
    runQuery('DELETE FROM customers WHERE id = ?;', [customer.id]);
    logAudit(req.user, 'DELETE', 'customers', customer.id, `Deleted customer: ${customer.name}`, req);
  });

  res.json({ success: true, message: 'Customer deleted successfully' });
});

// ==========================================
// 4. PRODUCTS & CAN MANAGEMENT
// ==========================================

apiRouter.get('/products', authenticate, (req: Request, res: Response) => {
  const products = queryAll(
    `SELECT p.*, i.filled_stock, i.empty_cans, i.damaged_cans, i.lost_cans
     FROM products p
     LEFT JOIN inventory i ON p.id = i.product_id
     ORDER BY p.name ASC;`
  );
  res.json(products);
});

apiRouter.post('/products', authenticate, checkPermission('products', 'can_create'), (req: AuthRequest, res: Response) => {
  const { name, size, unit, selling_price, cost_price, is_reusable } = req.body;
  if (!name || !size || !unit || selling_price === undefined) {
    return res.status(400).json({ error: 'Name, size, unit, and selling price are required' });
  }

  const id = `prod-${Date.now()}`;
  transaction(() => {
    runQuery(
      `INSERT INTO products (id, name, size, unit, selling_price, cost_price, is_reusable, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1);`,
      [id, name.trim(), size.trim(), unit.trim(), Number(selling_price), Number(cost_price) || 0, is_reusable ? 1 : 0]
    );

    runQuery(
      `INSERT INTO inventory (id, product_id, filled_stock, empty_cans, damaged_cans, lost_cans)
       VALUES (?, ?, 0, 0, 0, 0);`,
      [`inv-${id}`, id]
    );

    logAudit(req.user, 'CREATE', 'products', id, `Created product: ${name} (${size})`, req);
  });

  res.status(201).json({ id, message: 'Product created successfully' });
});

apiRouter.put('/products/:id', authenticate, checkPermission('products', 'can_edit'), (req: AuthRequest, res: Response) => {
  const { name, size, unit, selling_price, cost_price, is_reusable, is_active } = req.body;
  
  runQuery(
    `UPDATE products SET
       name = ?, size = ?, unit = ?, selling_price = ?, cost_price = ?,
       is_reusable = ?, is_active = ?, updated_at = datetime('now')
     WHERE id = ?;`,
    [name, size, unit, Number(selling_price), Number(cost_price) || 0, is_reusable ? 1 : 0, is_active ? 1 : 0, req.params.id]
  );

  logAudit(req.user, 'UPDATE', 'products', req.params.id, `Updated product: ${name}`, req);
  res.json({ success: true, message: 'Product updated successfully' });
});

// ==========================================
// 5. INVENTORY & STOCK MOVEMENTS
// ==========================================

apiRouter.get('/inventory', authenticate, checkPermission('inventory', 'can_view'), (req: Request, res: Response) => {
  const inventory = queryAll(
    `SELECT i.*, p.name as product_name, p.size, p.unit, p.selling_price, p.cost_price, p.is_reusable
     FROM inventory i
     JOIN products p ON i.product_id = p.id
     ORDER BY p.name ASC;`
  );
  res.json(inventory);
});

apiRouter.get('/inventory/movements', authenticate, checkPermission('inventory', 'can_view'), (req: Request, res: Response) => {
  const { productId, stockType } = req.query;
  let sql = `
    SELECT im.*, p.name as product_name, p.size, u.name as user_name
    FROM inventory_movements im
    JOIN products p ON im.product_id = p.id
    LEFT JOIN users u ON im.user_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (productId) {
    sql += ` AND im.product_id = ?`;
    params.push(productId);
  }
  if (stockType) {
    sql += ` AND im.stock_type = ?`;
    params.push(stockType);
  }
  sql += ` ORDER BY im.created_at DESC LIMIT 100;`;

  const movements = queryAll(sql, params);
  res.json(movements);
});

apiRouter.post('/inventory/adjust', authenticate, checkPermission('inventory', 'can_edit'), (req: AuthRequest, res: Response) => {
  const { product_id, stock_type, quantity, reason } = req.body;
  if (!product_id || !stock_type || quantity === undefined || !reason) {
    return res.status(400).json({ error: 'Product, stock type, adjustment quantity, and reason are required' });
  }

  const allowedTypes = ['filled_stock', 'empty_cans', 'damaged_cans', 'lost_cans'];
  if (!allowedTypes.includes(stock_type)) {
    return res.status(400).json({ error: 'Invalid stock type' });
  }

  const inv = queryOne('SELECT * FROM inventory WHERE product_id = ?;', [product_id]);
  if (!inv) {
    return res.status(404).json({ error: 'Inventory record not found' });
  }

  const currentVal = Number(inv[stock_type]) || 0;
  const change = Number(quantity);
  const newVal = currentVal + change;

  if (newVal < 0) {
    return res.status(400).json({ error: `Cannot reduce ${stock_type.replace('_', ' ')} below zero (currently ${currentVal})` });
  }

  transaction(() => {
    runQuery(
      `UPDATE inventory SET ${stock_type} = ?, updated_at = datetime('now') WHERE product_id = ?;`,
      [newVal, product_id]
    );

    const movId = `mov-adj-${Date.now()}`;
    runQuery(
      `INSERT INTO inventory_movements (id, product_id, movement_type, stock_type, quantity, reason, reference_type, user_id)
       VALUES (?, ?, 'manual_adjustment', ?, ?, ?, 'adjustment', ?);`,
      [movId, product_id, stock_type, change, reason.trim(), req.user!.id]
    );

    logAudit(
      req.user,
      'INVENTORY_ADJUST',
      'inventory',
      product_id,
      `Adjusted ${stock_type} by ${change > 0 ? '+' : ''}${change} (new: ${newVal}). Reason: ${reason}`,
      req
    );
  });

  res.json({ success: true, message: 'Stock adjusted successfully', newQuantity: newVal });
});

// ==========================================
// 6. PRODUCTION / FILLING
// ==========================================

apiRouter.get('/production', authenticate, checkPermission('production', 'can_view'), (req: Request, res: Response) => {
  const records = queryAll(
    `SELECT pr.*, p.name as product_name, p.size, u.name as user_name
     FROM production_records pr
     JOIN products p ON pr.product_id = p.id
     LEFT JOIN users u ON pr.user_id = u.id
     ORDER BY pr.created_at DESC LIMIT 100;`
  );
  res.json(records);
});

apiRouter.post('/production', authenticate, checkPermission('production', 'can_create'), (req: AuthRequest, res: Response) => {
  const { product_id, quantity_filled, source_tank, notes } = req.body;
  const qty = Number(quantity_filled);
  if (!product_id || isNaN(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Valid product and positive filled quantity are required' });
  }

  const product = queryOne('SELECT * FROM products WHERE id = ?;', [product_id]);
  if (!product) {
    return res.status(404).json({ error: 'Product not found' });
  }

  const inv = queryOne('SELECT * FROM inventory WHERE product_id = ?;', [product_id]);
  if (!inv) {
    return res.status(404).json({ error: 'Inventory not initialized for this product' });
  }

  transaction(() => {
    // If reusable can, check and deduct from empty cans
    if (product.is_reusable) {
      if (inv.empty_cans < qty) {
        // Warning: if empty cans are less, we allow with note or reduce empty cans to 0
        // But in a real plant you sanitize empty cans to fill them!
      }
      const newEmpty = Math.max(0, inv.empty_cans - qty);
      const newFilled = inv.filled_stock + qty;
      runQuery(
        `UPDATE inventory SET filled_stock = ?, empty_cans = ?, updated_at = datetime('now') WHERE product_id = ?;`,
        [newFilled, newEmpty, product_id]
      );

      // Record movement for empty cans consumed
      runQuery(
        `INSERT INTO inventory_movements (id, product_id, movement_type, stock_type, quantity, reason, reference_type, user_id)
         VALUES (?, ?, 'production_consumption', 'empty_cans', ?, 'Empty cans sanitized and filled', 'production', ?);`,
        [`mov-emp-${Date.now()}`, product_id, -qty, req.user!.id]
      );
    } else {
      // Disposable pack
      runQuery(
        `UPDATE inventory SET filled_stock = filled_stock + ?, updated_at = datetime('now') WHERE product_id = ?;`,
        [qty, product_id]
      );
    }

    const prodId = `pr-${Date.now()}`;
    runQuery(
      `INSERT INTO production_records (id, product_id, quantity_filled, source_tank, notes, user_id)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [prodId, product_id, qty, source_tank || 'Main RO Storage Tank A', notes || '', req.user!.id]
    );

    // Record movement for finished filled stock
    runQuery(
      `INSERT INTO inventory_movements (id, product_id, movement_type, stock_type, quantity, reason, reference_type, reference_id, user_id)
       VALUES (?, ?, 'production_fill', 'filled_stock', ?, 'Production batch filled & sealed', 'production', ?, ?);`,
      [`mov-fil-${Date.now()}`, product_id, qty, prodId, req.user!.id]
    );

    logAudit(
      req.user,
      'PRODUCTION_FILL',
      'production',
      prodId,
      `Filled ${qty} units of ${product.name} from ${source_tank || 'tank'}`,
      req
    );
  });

  res.status(201).json({ success: true, message: 'Production batch recorded and filled stock updated' });
});

// ==========================================
// 7. SALES & ORDERS
// ==========================================

apiRouter.get('/orders', authenticate, checkPermission('orders', 'can_view'), (req: Request, res: Response) => {
  const { status, customerId } = req.query;
  let sql = `
    SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.area as customer_area, u.name as created_by_name
    FROM orders o
    JOIN customers c ON o.customer_id = c.id
    LEFT JOIN users u ON o.created_by = u.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (status) {
    sql += ` AND o.order_status = ?`;
    params.push(status);
  }
  if (customerId) {
    sql += ` AND o.customer_id = ?`;
    params.push(customerId);
  }
  sql += ` ORDER BY o.created_at DESC;`;

  const orders = queryAll(sql, params);
  res.json(orders);
});

apiRouter.get('/orders/:id', authenticate, checkPermission('orders', 'can_view'), (req: Request, res: Response) => {
  const order = queryOne(
    `SELECT o.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address, c.area as customer_area, c.outstanding_balance
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     WHERE o.id = ?;`,
    [req.params.id]
  );

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const items = queryAll(
    `SELECT oi.*, p.name as product_name, p.size, p.unit
     FROM order_items oi
     JOIN products p ON oi.product_id = p.id
     WHERE oi.order_id = ?;`,
    [order.id]
  );

  const delivery = queryOne(
    `SELECT d.*, u.name as driver_name
     FROM deliveries d
     LEFT JOIN users u ON d.driver_id = u.id
     WHERE d.order_id = ?;`,
    [order.id]
  );

  res.json({ order, items, delivery });
});

apiRouter.post('/orders', authenticate, checkPermission('orders', 'can_create'), (req: AuthRequest, res: Response) => {
  const { customer_id, items, delivery_date, delivery_address, payment_type, notes } = req.body;

  if (!customer_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Customer and at least one order product item are required' });
  }

  const customer = queryOne('SELECT * FROM customers WHERE id = ?;', [customer_id]);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  let totalAmount = 0;
  const processedItems: any[] = [];

  for (const item of items) {
    const qty = Number(item.quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ error: 'Quantities must be positive numbers' });
    }
    const product = queryOne('SELECT * FROM products WHERE id = ?;', [item.product_id]);
    if (!product) {
      return res.status(400).json({ error: `Product ${item.product_id} not found` });
    }

    // Rate: use customer selling rate if set, otherwise product selling price
    const unitPrice = customer.selling_rate > 0 ? customer.selling_rate : product.selling_price;
    const itemTotal = unitPrice * qty;
    totalAmount += itemTotal;

    processedItems.push({
      product_id: product.id,
      quantity: qty,
      unit_price: unitPrice,
      total_price: itemTotal,
    });
  }

  // Credit limit validation if credit order and customer has a configured credit limit
  if (payment_type === 'Credit' && customer.credit_limit > 0) {
    if (customer.outstanding_balance + totalAmount > customer.credit_limit) {
      return res.status(400).json({
        error: `Order total PKR ${totalAmount} exceeds customer credit limit (Balance: ${customer.outstanding_balance}, Limit: ${customer.credit_limit})`
      });
    }
  }

  const orderId = `ord-${Date.now()}`;
  const orderNumber = `ORD-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

  transaction(() => {
    runQuery(
      `INSERT INTO orders (id, order_number, customer_id, total_amount, payment_type, payment_status, order_status, delivery_date, delivery_address, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?);`,
      [
        orderId, orderNumber, customer_id, totalAmount, payment_type || customer.payment_type,
        payment_type === 'Credit' ? 'credit' : 'pending',
        delivery_date || new Date().toISOString().split('T')[0],
        delivery_address || customer.address, notes || '', req.user!.id
      ]
    );

    for (const pi of processedItems) {
      runQuery(
        `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [`oi-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, orderId, pi.product_id, pi.quantity, pi.unit_price, pi.total_price]
      );
    }

    logAudit(req.user, 'CREATE', 'orders', orderId, `Created order ${orderNumber} for ${customer.name} (PKR ${totalAmount})`, req);
  });

  res.status(201).json({ id: orderId, orderNumber, message: 'Order created successfully' });
});

// ==========================================
// 8. DELIVERY MANAGEMENT & MASTER TRANSACTION
// ==========================================

apiRouter.get('/deliveries', authenticate, checkPermission('deliveries', 'can_view'), (req: Request, res: Response) => {
  const { status, driverId, date, area } = req.query;
  let sql = `
    SELECT d.*, c.name as customer_name, c.phone as customer_phone, c.address as customer_address, c.area as customer_area,
           o.order_number, o.total_amount, u.name as driver_name
    FROM deliveries d
    JOIN customers c ON d.customer_id = c.id
    JOIN orders o ON d.order_id = o.id
    LEFT JOIN users u ON d.driver_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (status) {
    sql += ` AND d.status = ?`;
    params.push(status);
  }
  if (driverId) {
    sql += ` AND d.driver_id = ?`;
    params.push(driverId);
  }
  if (date) {
    sql += ` AND d.delivery_date = ?`;
    params.push(date);
  }
  if (area) {
    sql += ` AND c.area = ?`;
    params.push(area);
  }
  sql += ` ORDER BY d.created_at DESC;`;

  const deliveries = queryAll(sql, params);
  res.json(deliveries);
});

apiRouter.post('/deliveries/create-for-order', authenticate, checkPermission('deliveries', 'can_create'), (req: AuthRequest, res: Response) => {
  const { order_id, driver_id, vehicle, delivery_time } = req.body;
  const order = queryOne('SELECT * FROM orders WHERE id = ?;', [order_id]);
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  const existingDelivery = queryOne('SELECT id FROM deliveries WHERE order_id = ?;', [order_id]);
  if (existingDelivery) {
    return res.status(400).json({ error: 'Delivery already assigned for this order' });
  }

  const orderItems = queryAll('SELECT * FROM order_items WHERE order_id = ?;', [order_id]);
  const deliveryId = `del-${Date.now()}`;
  const deliveryNumber = `DEL-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

  transaction(() => {
    runQuery(
      `INSERT INTO deliveries (id, delivery_number, order_id, customer_id, driver_id, vehicle, delivery_date, delivery_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'assigned');`,
      [deliveryId, deliveryNumber, order.id, order.customer_id, driver_id || null, vehicle || 'Delivery Van', order.delivery_date, delivery_time || '10:00 AM']
    );

    for (const item of orderItems) {
      runQuery(
        `INSERT INTO delivery_items (id, delivery_id, product_id, quantity)
         VALUES (?, ?, ?, ?);`,
        [`di-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`, deliveryId, item.product_id, item.quantity]
      );
    }

    logAudit(req.user, 'CREATE', 'deliveries', deliveryId, `Created delivery ${deliveryNumber} for order ${order.order_number}`, req);
  });

  res.status(201).json({ id: deliveryId, deliveryNumber, message: 'Delivery dispatch scheduled' });
});

apiRouter.put('/deliveries/:id/status', authenticate, checkPermission('deliveries', 'can_edit'), (req: AuthRequest, res: Response) => {
  const { status, failure_reason } = req.body;
  const delivery = queryOne('SELECT * FROM deliveries WHERE id = ?;', [req.params.id]);
  if (!delivery) {
    return res.status(404).json({ error: 'Delivery not found' });
  }

  runQuery(
    `UPDATE deliveries SET status = ?, failure_reason = ?, updated_at = datetime('now') WHERE id = ?;`,
    [status, failure_reason || null, req.params.id]
  );

  logAudit(req.user, 'UPDATE', 'deliveries', req.params.id, `Updated delivery status to ${status}`, req);
  res.json({ success: true, message: `Delivery status updated to ${status}` });
});

// MASTER TRANSACTION: COMPLETE DELIVERY
apiRouter.post('/deliveries/:id/complete', authenticate, checkPermission('deliveries', 'can_edit'), (req: AuthRequest, res: Response) => {
  const { empty_cans_returned, payment_collected, payment_method, notes } = req.body;
  const emptyReturned = Number(empty_cans_returned) || 0;
  const paymentAmount = Number(payment_collected) || 0;

  const delivery = queryOne('SELECT * FROM deliveries WHERE id = ?;', [req.params.id]);
  if (!delivery) {
    return res.status(404).json({ error: 'Delivery record not found' });
  }

  if (delivery.status === 'delivered') {
    return res.status(400).json({ error: 'This delivery has already been marked DELIVERED' });
  }

  const order = queryOne('SELECT * FROM orders WHERE id = ?;', [delivery.order_id]);
  const customer = queryOne('SELECT * FROM customers WHERE id = ?;', [delivery.customer_id]);
  const deliveryItems = queryAll('SELECT * FROM delivery_items WHERE delivery_id = ?;', [delivery.id]);

  if (!order || !customer) {
    return res.status(404).json({ error: 'Related order or customer not found' });
  }

  // 1. Stock check before deduction
  for (const item of deliveryItems) {
    const inv = queryOne('SELECT filled_stock FROM inventory WHERE product_id = ?;', [item.product_id]);
    if (!inv || inv.filled_stock < item.quantity) {
      return res.status(400).json({
        error: `Insufficient filled stock for delivery. Required: ${item.quantity}, In Stock: ${inv ? inv.filled_stock : 0}`
      });
    }
  }

  transaction(() => {
    let totalCansDelivered = 0;

    // 2. Reduce filled water stock & create inventory movements
    for (const item of deliveryItems) {
      const product = queryOne('SELECT * FROM products WHERE id = ?;', [item.product_id]);
      
      runQuery(
        'UPDATE inventory SET filled_stock = filled_stock - ?, updated_at = datetime("now") WHERE product_id = ?;',
        [item.quantity, item.product_id]
      );

      runQuery(
        `INSERT INTO inventory_movements (id, product_id, movement_type, stock_type, quantity, reason, reference_type, reference_id, user_id)
         VALUES (?, ?, 'delivery_sale', 'filled_stock', ?, 'Delivered to customer', 'delivery', ?, ?);`,
        [`mov-del-${Date.now()}-${item.product_id}`, item.product_id, -item.quantity, delivery.id, req.user!.id]
      );

      if (product && product.is_reusable) {
        totalCansDelivered += item.quantity;
      }
    }

    // 3. Add returned empty cans to inventory
    if (emptyReturned > 0) {
      // Find primary reusable can product
      const reusableProduct = queryOne('SELECT id FROM products WHERE is_reusable = 1 LIMIT 1;');
      if (reusableProduct) {
        runQuery(
          'UPDATE inventory SET empty_cans = empty_cans + ?, updated_at = datetime("now") WHERE product_id = ?;',
          [emptyReturned, reusableProduct.id]
        );

        runQuery(
          `INSERT INTO inventory_movements (id, product_id, movement_type, stock_type, quantity, reason, reference_type, reference_id, user_id)
           VALUES (?, ?, 'empty_returned', 'empty_cans', ?, 'Empty cans retrieved from customer', 'delivery', ?, ?);`,
          [`mov-ret-${Date.now()}`, reusableProduct.id, emptyReturned, delivery.id, req.user!.id]
        );
      }
    }

    // 4. Update customer can balance: Cans held = previous + delivered - returned
    const netCanChange = totalCansDelivered - emptyReturned;
    const newCansHeld = Math.max(0, customer.cans_held + netCanChange);
    runQuery('UPDATE customers SET cans_held = ? WHERE id = ?;', [newCansHeld, customer.id]);

    // Record customer can movements
    if (totalCansDelivered > 0) {
      runQuery(
        `INSERT INTO customer_can_movements (id, customer_id, product_id, movement_type, quantity, balance_after, delivery_id, reason, user_id)
         VALUES (?, ?, 'prod-19l-can', 'cans_delivered', ?, ?, ?, 'Delivered full cans', ?);`,
        [`cm-del-${Date.now()}`, customer.id, totalCansDelivered, customer.cans_held + totalCansDelivered, delivery.id, req.user!.id]
      );
    }
    if (emptyReturned > 0) {
      runQuery(
        `INSERT INTO customer_can_movements (id, customer_id, product_id, movement_type, quantity, balance_after, delivery_id, reason, user_id)
         VALUES (?, ?, 'prod-19l-can', 'empty_returned', ?, ?, ?, 'Collected empty cans', ?);`,
        [`cm-ret-${Date.now()}`, customer.id, -emptyReturned, newCansHeld, delivery.id, req.user!.id]
      );
    }

    // 5. Update customer ledger & balance
    // Debit the sale:
    const saleAmount = order.total_amount;
    let runningBalance = customer.outstanding_balance + saleAmount;

    runQuery(
      `INSERT INTO customer_ledger (id, customer_id, transaction_type, reference_type, reference_id, debit, credit, balance, description, transaction_date)
       VALUES (?, ?, 'sale', 'delivery', ?, ?, 0, ?, 'Delivered Order #${order.order_number}', date('now'));`,
      [`led-sale-${Date.now()}`, customer.id, delivery.id, saleAmount, runningBalance]
    );

    // 6. Record payment if collected
    if (paymentAmount > 0) {
      const payId = `pay-${Date.now()}`;
      const payNum = `PAY-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

      runQuery(
        `INSERT INTO payments (id, payment_number, customer_id, order_id, delivery_id, amount, payment_method, payment_date, reference, notes, received_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, date('now'), ?, ?, ?);`,
        [payId, payNum, customer.id, order.id, delivery.id, paymentAmount, payment_method || 'Cash', `Deliv-${delivery.delivery_number}`, 'Collected upon delivery', req.user!.id]
      );

      runningBalance -= paymentAmount;

      runQuery(
        `INSERT INTO customer_ledger (id, customer_id, transaction_type, reference_type, reference_id, debit, credit, balance, description, transaction_date)
         VALUES (?, ?, 'payment', 'payment', ?, 0, ?, ?, 'Payment received on delivery #${delivery.delivery_number}', date('now'));`,
        [`led-pay-${Date.now()}`, customer.id, payId, paymentAmount, runningBalance]
      );
    }

    // Update customer's outstanding balance
    runQuery('UPDATE customers SET outstanding_balance = ? WHERE id = ?;', [runningBalance, customer.id]);

    // 7. Update order status & payment status
    let paymentStatus = 'credit';
    if (paymentAmount >= saleAmount) {
      paymentStatus = 'paid';
    } else if (paymentAmount > 0) {
      paymentStatus = 'partially_paid';
    }

    runQuery(
      'UPDATE orders SET order_status = "completed", payment_status = ?, updated_at = datetime("now") WHERE id = ?;',
      [paymentStatus, order.id]
    );

    // 8. Update delivery record
    runQuery(
      `UPDATE deliveries SET 
         status = 'delivered',
         empty_cans_returned = ?,
         payment_collected = ?,
         payment_method = ?,
         notes = ?,
         completed_at = datetime('now'),
         updated_at = datetime('now')
       WHERE id = ?;`,
      [emptyReturned, paymentAmount, payment_method || 'Cash', notes || '', delivery.id]
    );

    // 9. Audit record
    logAudit(
      req.user,
      'DELIVERY_COMPLETE',
      'deliveries',
      delivery.id,
      `Completed delivery ${delivery.delivery_number}. Delivered: ${totalCansDelivered} cans, Returned: ${emptyReturned} cans, Paid: PKR ${paymentAmount}, Customer balance: PKR ${runningBalance}`,
      req
    );
  });

  res.json({
    success: true,
    message: 'Delivery marked completed. Stock, empty cans, customer balance, and ledger synchronized perfectly!'
  });
});

// ==========================================
// 9. EMPTY CAN TRACKING MODULE
// ==========================================

apiRouter.get('/cans/summary', authenticate, checkPermission('cans', 'can_view'), (req: Request, res: Response) => {
  const inv = queryOne(
    `SELECT 
       COALESCE(SUM(empty_cans), 0) as empty_in_warehouse,
       COALESCE(SUM(filled_stock), 0) as filled_in_warehouse,
       COALESCE(SUM(damaged_cans), 0) as damaged_cans,
       COALESCE(SUM(lost_cans), 0) as lost_cans
     FROM inventory i
     JOIN products p ON i.product_id = p.id
     WHERE p.is_reusable = 1;`
  ) || { empty_in_warehouse: 0, filled_in_warehouse: 0, damaged_cans: 0, lost_cans: 0 };

  const withCustomers = queryOne(
    'SELECT COALESCE(SUM(cans_held), 0) as total FROM customers;'
  )?.total || 0;

  const totalCompanyCans =
    Number(inv.empty_in_warehouse) +
    Number(inv.filled_in_warehouse) +
    Number(inv.damaged_cans) +
    Number(inv.lost_cans) +
    Number(withCustomers);

  const customerRankings = queryAll(
    `SELECT id, name, area, phone, cans_held, outstanding_balance
     FROM customers
     WHERE cans_held > 0
     ORDER BY cans_held DESC;`
  );

  const recentCanMovements = queryAll(
    `SELECT cm.*, c.name as customer_name, p.name as product_name, u.name as user_name
     FROM customer_can_movements cm
     JOIN customers c ON cm.customer_id = c.id
     LEFT JOIN products p ON cm.product_id = p.id
     LEFT JOIN users u ON cm.user_id = u.id
     ORDER BY cm.created_at DESC
     LIMIT 50;`
  );

  res.json({
    metrics: {
      emptyInWarehouse: inv.empty_in_warehouse,
      filledInWarehouse: inv.filled_in_warehouse,
      withCustomers,
      damagedCans: inv.damaged_cans,
      lostCans: inv.lost_cans,
      totalCompanyCans,
    },
    customerRankings,
    recentCanMovements,
  });
});

apiRouter.post('/cans/adjust-customer', authenticate, checkPermission('cans', 'can_edit'), (req: AuthRequest, res: Response) => {
  const { customer_id, change_type, quantity, reason } = req.body;
  const qty = Number(quantity);

  if (!customer_id || !change_type || isNaN(qty) || qty <= 0 || !reason) {
    return res.status(400).json({ error: 'Customer, valid change type, positive quantity, and reason are required' });
  }

  const customer = queryOne('SELECT * FROM customers WHERE id = ?;', [customer_id]);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  transaction(() => {
    let newBalance = customer.cans_held;
    if (change_type === 'issue_more') {
      newBalance += qty;
    } else if (change_type === 'return_cans') {
      newBalance = Math.max(0, newBalance - qty);
    } else if (change_type === 'report_damaged' || change_type === 'report_lost') {
      newBalance = Math.max(0, newBalance - qty);
      // update damaged or lost in inventory
      const col = change_type === 'report_damaged' ? 'damaged_cans' : 'lost_cans';
      const prod = queryOne('SELECT id FROM products WHERE is_reusable = 1 LIMIT 1;');
      if (prod) {
        runQuery(`UPDATE inventory SET ${col} = ${col} + ? WHERE product_id = ?;`, [qty, prod.id]);
      }
    }

    runQuery('UPDATE customers SET cans_held = ? WHERE id = ?;', [newBalance, customer.id]);

    runQuery(
      `INSERT INTO customer_can_movements (id, customer_id, product_id, movement_type, quantity, balance_after, reason, user_id)
       VALUES (?, ?, 'prod-19l-can', ?, ?, ?, ?, ?);`,
      [`cm-adj-${Date.now()}`, customer.id, change_type, change_type === 'issue_more' ? qty : -qty, newBalance, reason.trim(), req.user!.id]
    );

    logAudit(
      req.user,
      'CAN_ADJUST',
      'cans',
      customer.id,
      `Adjusted cans for ${customer.name}: ${change_type} (${qty} cans). New customer balance: ${newBalance}. Reason: ${reason}`,
      req
    );
  });

  res.json({ success: true, message: 'Can balance adjusted successfully' });
});

// ==========================================
// 10. PAYMENTS & CUSTOMER LEDGER
// ==========================================

apiRouter.get('/payments', authenticate, checkPermission('payments', 'can_view'), (req: Request, res: Response) => {
  const { customerId, date } = req.query;
  let sql = `
    SELECT p.*, c.name as customer_name, c.phone as customer_phone, u.name as received_by_name
    FROM payments p
    JOIN customers c ON p.customer_id = c.id
    LEFT JOIN users u ON p.received_by = u.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (customerId) {
    sql += ` AND p.customer_id = ?`;
    params.push(customerId);
  }
  if (date) {
    sql += ` AND p.payment_date = ?`;
    params.push(date);
  }
  sql += ` ORDER BY p.created_at DESC;`;

  const payments = queryAll(sql, params);
  res.json(payments);
});

apiRouter.post('/payments', authenticate, checkPermission('payments', 'can_create'), (req: AuthRequest, res: Response) => {
  const { customer_id, amount, payment_method, payment_date, reference, notes } = req.body;
  const payAmount = Number(amount);

  if (!customer_id || isNaN(payAmount) || payAmount <= 0) {
    return res.status(400).json({ error: 'Customer and valid payment amount are required' });
  }

  const customer = queryOne('SELECT * FROM customers WHERE id = ?;', [customer_id]);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const payId = `pay-${Date.now()}`;
  const payNumber = `PAY-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
  const pDate = payment_date || new Date().toISOString().split('T')[0];

  transaction(() => {
    runQuery(
      `INSERT INTO payments (id, payment_number, customer_id, amount, payment_method, payment_date, reference, notes, received_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [payId, payNumber, customer.id, payAmount, payment_method || 'Cash', pDate, reference || '', notes || '', req.user!.id]
    );

    const newBalance = customer.outstanding_balance - payAmount;
    runQuery('UPDATE customers SET outstanding_balance = ? WHERE id = ?;', [newBalance, customer.id]);

    runQuery(
      `INSERT INTO customer_ledger (id, customer_id, transaction_type, reference_type, reference_id, debit, credit, balance, description, transaction_date)
       VALUES (?, ?, 'payment', 'payment', ?, 0, ?, ?, ?, ?);`,
      [
        `led-${Date.now()}`, customer.id, payId, payAmount, newBalance,
        `Payment Received via ${payment_method || 'Cash'}${reference ? ` (Ref: ${reference})` : ''}`,
        pDate
      ]
    );

    logAudit(
      req.user,
      'PAYMENT_RECORD',
      'payments',
      payId,
      `Received payment ${payNumber} of PKR ${payAmount} from ${customer.name}. New balance: PKR ${newBalance}`,
      req
    );
  });

  res.status(201).json({ id: payId, paymentNumber: payNumber, message: 'Payment recorded and customer ledger updated' });
});

apiRouter.get('/ledger/:customerId', authenticate, checkPermission('payments', 'can_view'), (req: Request, res: Response) => {
  const customer = queryOne('SELECT * FROM customers WHERE id = ?;', [req.params.customerId]);
  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const ledger = queryAll(
    'SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY created_at ASC;',
    [customer.id]
  );

  res.json({ customer, ledger });
});

// ==========================================
// 11. EXPENSE MANAGEMENT
// ==========================================

apiRouter.get('/expenses', authenticate, checkPermission('expenses', 'can_view'), (req: Request, res: Response) => {
  const { categoryId, month } = req.query;
  let sql = `
    SELECT e.*, ec.name as category_name, u.name as created_by_name
    FROM expenses e
    JOIN expense_categories ec ON e.category_id = ec.id
    LEFT JOIN users u ON e.user_id = u.id
    WHERE 1=1
  `;
  const params: any[] = [];
  if (categoryId) {
    sql += ` AND e.category_id = ?`;
    params.push(categoryId);
  }
  if (month) {
    sql += ` AND strftime('%Y-%m', e.expense_date) = ?`;
    params.push(month);
  }
  sql += ` ORDER BY e.expense_date DESC, e.created_at DESC;`;

  const expenses = queryAll(sql, params);
  res.json(expenses);
});

apiRouter.get('/expenses/categories', authenticate, (req: Request, res: Response) => {
  const categories = queryAll('SELECT * FROM expense_categories WHERE is_active = 1 ORDER BY name ASC;');
  res.json(categories);
});

apiRouter.post('/expenses', authenticate, checkPermission('expenses', 'can_create'), (req: AuthRequest, res: Response) => {
  const { category_id, amount, description, paid_by, payment_method, expense_date } = req.body;
  const expAmount = Number(amount);

  if (!category_id || isNaN(expAmount) || expAmount <= 0 || !description) {
    return res.status(400).json({ error: 'Category, valid positive amount, and description are required' });
  }

  const id = `exp-${Date.now()}`;
  transaction(() => {
    runQuery(
      `INSERT INTO expenses (id, category_id, amount, description, paid_by, payment_method, expense_date, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        id, category_id, expAmount, description.trim(),
        paid_by || req.user!.name, payment_method || 'Cash',
        expense_date || new Date().toISOString().split('T')[0], req.user!.id
      ]
    );

    logAudit(req.user, 'CREATE', 'expenses', id, `Recorded expense of PKR ${expAmount} (${description})`, req);
  });

  res.status(201).json({ id, message: 'Expense recorded successfully' });
});

apiRouter.post('/expenses/categories', authenticate, checkPermission('settings', 'can_create'), (req: AuthRequest, res: Response) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required' });

  const id = `exp-cat-${Date.now()}`;
  runQuery('INSERT INTO expense_categories (id, name, description) VALUES (?, ?, ?);', [id, name.trim(), description || '']);
  logAudit(req.user, 'CREATE', 'expenses', id, `Added expense category ${name}`, req);
  res.status(201).json({ id, message: 'Expense category added' });
});

// ==========================================
// 12. SUPPLIER MANAGEMENT
// ==========================================

apiRouter.get('/suppliers', authenticate, checkPermission('suppliers', 'can_view'), (req: Request, res: Response) => {
  const suppliers = queryAll('SELECT * FROM suppliers ORDER BY name ASC;');
  res.json(suppliers);
});

apiRouter.get('/suppliers/:id', authenticate, checkPermission('suppliers', 'can_view'), (req: Request, res: Response) => {
  const supplier = queryOne('SELECT * FROM suppliers WHERE id = ?;', [req.params.id]);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  const transactions = queryAll(
    'SELECT * FROM supplier_transactions WHERE supplier_id = ? ORDER BY transaction_date DESC, created_at DESC;',
    [supplier.id]
  );
  res.json({ supplier, transactions });
});

apiRouter.post('/suppliers', authenticate, checkPermission('suppliers', 'can_create'), (req: AuthRequest, res: Response) => {
  const { name, contact_person, phone, address, materials_supplied, opening_payable, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Supplier name and phone are required' });

  const id = `sup-${Date.now()}`;
  const payable = Number(opening_payable) || 0;

  transaction(() => {
    runQuery(
      `INSERT INTO suppliers (id, name, contact_person, phone, address, materials_supplied, outstanding_payable, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
      [id, name.trim(), contact_person || '', phone.trim(), address || '', materials_supplied || '', payable, notes || '']
    );

    if (payable > 0) {
      runQuery(
        `INSERT INTO supplier_transactions (id, supplier_id, transaction_type, amount, description, transaction_date)
         VALUES (?, ?, 'opening_balance', ?, 'Initial opening balance', date('now'));`,
        [`st-${Date.now()}`, id, payable]
      );
    }

    logAudit(req.user, 'CREATE', 'suppliers', id, `Added supplier ${name}`, req);
  });

  res.status(201).json({ id, message: 'Supplier added successfully' });
});

apiRouter.post('/suppliers/:id/transaction', authenticate, checkPermission('suppliers', 'can_create'), (req: AuthRequest, res: Response) => {
  const { transaction_type, amount, description, transaction_date } = req.body;
  const numAmount = Number(amount);
  if (!transaction_type || isNaN(numAmount) || numAmount <= 0) {
    return res.status(400).json({ error: 'Valid transaction type and positive amount are required' });
  }

  const supplier = queryOne('SELECT * FROM suppliers WHERE id = ?;', [req.params.id]);
  if (!supplier) return res.status(404).json({ error: 'Supplier not found' });

  transaction(() => {
    let newPayable = supplier.outstanding_payable;
    if (transaction_type === 'purchase') {
      newPayable += numAmount;
    } else if (transaction_type === 'payment') {
      newPayable = Math.max(0, newPayable - numAmount);
    }

    runQuery('UPDATE suppliers SET outstanding_payable = ?, updated_at = datetime("now") WHERE id = ?;', [newPayable, supplier.id]);

    const txId = `st-${Date.now()}`;
    runQuery(
      `INSERT INTO supplier_transactions (id, supplier_id, transaction_type, amount, description, transaction_date)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [txId, supplier.id, transaction_type, numAmount, description || '', transaction_date || new Date().toISOString().split('T')[0]]
    );

    logAudit(req.user, 'SUPPLIER_TX', 'suppliers', supplier.id, `${transaction_type}: PKR ${numAmount} (${description})`, req);
  });

  res.json({ success: true, message: 'Supplier transaction recorded' });
});

// ==========================================
// 13. STAFF & PERMISSIONS MANAGEMENT
// ==========================================

apiRouter.get('/staff', authenticate, checkPermission('staff', 'can_view'), (req: Request, res: Response) => {
  const staff = queryAll(
    `SELECT u.id, u.name, u.email, u.phone, u.status, u.role_id, r.name as role_name, u.created_at
     FROM users u
     JOIN roles r ON u.role_id = r.id
     ORDER BY u.name ASC;`
  );
  res.json(staff);
});

apiRouter.get('/roles', authenticate, (req: Request, res: Response) => {
  const roles = queryAll('SELECT * FROM roles ORDER BY name ASC;');
  res.json(roles);
});

apiRouter.get('/roles/:id/permissions', authenticate, checkPermission('staff', 'can_view'), (req: Request, res: Response) => {
  const perms = queryAll('SELECT * FROM permissions WHERE role_id = ?;', [req.params.id]);
  res.json(perms);
});

apiRouter.put('/roles/:id/permissions', authenticate, checkPermission('staff', 'can_edit'), (req: AuthRequest, res: Response) => {
  const { permissions } = req.body;
  if (!permissions || !Array.isArray(permissions)) {
    return res.status(400).json({ error: 'Permissions array required' });
  }

  transaction(() => {
    for (const p of permissions) {
      runQuery(
        `UPDATE permissions SET
           can_view = ?, can_create = ?, can_edit = ?, can_approve = ?, can_delete = ?
         WHERE role_id = ? AND module = ?;`,
        [p.can_view ? 1 : 0, p.can_create ? 1 : 0, p.can_edit ? 1 : 0, p.can_approve ? 1 : 0, p.can_delete ? 1 : 0, req.params.id, p.module]
      );
    }
    logAudit(req.user, 'PERMISSION_CHANGE', 'staff', req.params.id, 'Updated role permissions', req);
  });

  res.json({ success: true, message: 'Permissions updated successfully' });
});

apiRouter.post('/staff', authenticate, checkPermission('staff', 'can_create'), (req: AuthRequest, res: Response) => {
  const { name, email, password, role_id, phone } = req.body;
  if (!name || !email || !password || !role_id) {
    return res.status(400).json({ error: 'Name, email, password, and role are required' });
  }

  const existing = queryOne('SELECT id FROM users WHERE LOWER(email) = LOWER(?);', [email.trim()]);
  if (existing) {
    return res.status(400).json({ error: 'User with this email already exists' });
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);
  const id = `user-${Date.now()}`;

  runQuery(
    `INSERT INTO users (id, name, email, password_hash, role_id, phone, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active');`,
    [id, name.trim(), email.trim(), hash, role_id, phone || '']
  );

  logAudit(req.user, 'CREATE', 'staff', id, `Created staff account: ${name} (${email})`, req);
  res.status(201).json({ id, message: 'Staff user created successfully' });
});

apiRouter.put('/staff/:id', authenticate, checkPermission('staff', 'can_edit'), (req: AuthRequest, res: Response) => {
  const { name, phone, role_id, status, new_password } = req.body;
  const staff = queryOne('SELECT * FROM users WHERE id = ?;', [req.params.id]);
  if (!staff) return res.status(404).json({ error: 'User not found' });

  transaction(() => {
    runQuery(
      `UPDATE users SET name = ?, phone = ?, role_id = ?, status = ?, updated_at = datetime('now') WHERE id = ?;`,
      [name, phone || '', role_id, status || 'active', req.params.id]
    );

    if (new_password && new_password.length >= 6) {
      const salt = bcrypt.genSaltSync(10);
      const hash = bcrypt.hashSync(new_password, salt);
      runQuery('UPDATE users SET password_hash = ? WHERE id = ?;', [hash, req.params.id]);
    }

    logAudit(req.user, 'UPDATE', 'staff', req.params.id, `Updated user account: ${name}`, req);
  });

  res.json({ success: true, message: 'User updated successfully' });
});

// ==========================================
// 14. COMPREHENSIVE REPORTS & ANALYTICS
// ==========================================

apiRouter.get('/reports/financial', authenticate, checkPermission('reports', 'can_view'), (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  const sDate = startDate || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const eDate = endDate || new Date().toISOString().split('T')[0];

  // Total sales revenue
  const salesRev = queryOne(
    `SELECT COALESCE(SUM(total_amount), 0) as total FROM orders 
     WHERE date(created_at) BETWEEN ? AND ? AND order_status != 'cancelled';`,
    [sDate, eDate]
  )?.total || 0;

  // Collections
  const collections = queryOne(
    `SELECT COALESCE(SUM(amount), 0) as total FROM payments 
     WHERE payment_date BETWEEN ? AND ?;`,
    [sDate, eDate]
  )?.total || 0;

  // Operating Expenses
  const expenses = queryOne(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses 
     WHERE expense_date BETWEEN ? AND ?;`,
    [sDate, eDate]
  )?.total || 0;

  // Cost of goods delivered
  const cogs = queryOne(
    `SELECT COALESCE(SUM(di.quantity * p.cost_price), 0) as total
     FROM delivery_items di
     JOIN deliveries d ON di.delivery_id = d.id
     JOIN products p ON di.product_id = p.id
     WHERE d.status = 'delivered' AND date(d.created_at) BETWEEN ? AND ?;`,
    [sDate, eDate]
  )?.total || 0;

  const grossProfit = salesRev - cogs;
  const netProfit = grossProfit - expenses;

  // Category-wise expenses
  const categoryExpenses = queryAll(
    `SELECT ec.name, COALESCE(SUM(e.amount), 0) as amount
     FROM expense_categories ec
     LEFT JOIN expenses e ON ec.id = e.category_id AND e.expense_date BETWEEN ? AND ?
     GROUP BY ec.id
     HAVING amount > 0
     ORDER BY amount DESC;`,
    [sDate, eDate]
  );

  // Daily revenue vs expense breakdown
  const dailyFinancials = queryAll(
    `WITH RECURSIVE dates(d) AS (
       SELECT date(?)
       UNION ALL
       SELECT date(d, '+1 day') FROM dates WHERE d < date(?)
     )
     SELECT 
       dates.d as date,
       COALESCE((SELECT SUM(total_amount) FROM orders WHERE date(created_at) = dates.d AND order_status != 'cancelled'), 0) as sales,
       COALESCE((SELECT SUM(amount) FROM payments WHERE payment_date = dates.d), 0) as collections,
       COALESCE((SELECT SUM(amount) FROM expenses WHERE expense_date = dates.d), 0) as expenses
     FROM dates;`,
    [sDate, eDate]
  );

  res.json({
    summary: {
      salesRevenue: salesRev,
      collections,
      cogs,
      grossProfit,
      expenses,
      netProfit,
      profitMargin: salesRev > 0 ? ((netProfit / salesRev) * 100).toFixed(1) : '0',
    },
    categoryExpenses,
    dailyFinancials,
  });
});

apiRouter.get('/reports/sales', authenticate, checkPermission('reports', 'can_view'), (req: Request, res: Response) => {
  const { startDate, endDate } = req.query;
  const sDate = startDate || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const eDate = endDate || new Date().toISOString().split('T')[0];

  // Product-wise sales
  const productSales = queryAll(
    `SELECT p.name, p.size, SUM(oi.quantity) as total_qty, SUM(oi.total_price) as total_revenue
     FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     JOIN products p ON oi.product_id = p.id
     WHERE date(o.created_at) BETWEEN ? AND ? AND o.order_status != 'cancelled'
     GROUP BY p.id
     ORDER BY total_revenue DESC;`,
    [sDate, eDate]
  );

  // Area-wise sales
  const areaSales = queryAll(
    `SELECT c.area, COUNT(DISTINCT o.id) as total_orders, SUM(o.total_amount) as total_revenue
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     WHERE date(o.created_at) BETWEEN ? AND ? AND o.order_status != 'cancelled'
     GROUP BY c.area
     ORDER BY total_revenue DESC;`,
    [sDate, eDate]
  );

  // Customer-wise top sales
  const customerSales = queryAll(
    `SELECT c.name, c.area, COUNT(o.id) as orders_count, SUM(o.total_amount) as total_revenue
     FROM orders o
     JOIN customers c ON o.customer_id = c.id
     WHERE date(o.created_at) BETWEEN ? AND ? AND o.order_status != 'cancelled'
     GROUP BY c.id
     ORDER BY total_revenue DESC
     LIMIT 15;`,
    [sDate, eDate]
  );

  res.json({ productSales, areaSales, customerSales });
});

apiRouter.get('/reports/deliveries', authenticate, checkPermission('reports', 'can_view'), (req: Request, res: Response) => {
  const driverPerformance = queryAll(
    `SELECT 
       u.name as driver_name,
       COUNT(d.id) as total_assigned,
       SUM(CASE WHEN d.status = 'delivered' THEN 1 ELSE 0 END) as delivered,
       SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END) as failed,
       COALESCE(SUM(d.payment_collected), 0) as cash_collected,
       COALESCE(SUM(d.empty_cans_returned), 0) as empty_cans_collected
     FROM users u
     LEFT JOIN deliveries d ON u.id = d.driver_id
     WHERE u.role_id = 'role-delivery'
     GROUP BY u.id;`
  );

  res.json({ driverPerformance });
});

// ==========================================
// 15. AUDIT LOGS
// ==========================================

apiRouter.get('/audit-logs', authenticate, checkPermission('audit', 'can_view'), (req: Request, res: Response) => {
  const { module, action, search } = req.query;
  let sql = 'SELECT * FROM audit_logs WHERE 1=1';
  const params: any[] = [];

  if (module) {
    sql += ' AND module = ?';
    params.push(module);
  }
  if (action) {
    sql += ' AND action = ?';
    params.push(action);
  }
  if (search) {
    sql += ' AND (LOWER(details) LIKE ? OR LOWER(user_name) LIKE ?)';
    const s = `%${String(search).toLowerCase()}%`;
    params.push(s, s);
  }

  sql += ' ORDER BY created_at DESC LIMIT 150;';
  const logs = queryAll(sql, params);
  res.json(logs);
});

// ==========================================
// 16. SETTINGS
// ==========================================

apiRouter.get('/settings', authenticate, (req: Request, res: Response) => {
  const rows = queryAll('SELECT * FROM settings;');
  const settingsMap: Record<string, string> = {};
  for (const r of rows) {
    settingsMap[r.key] = r.value;
  }
  res.json(settingsMap);
});

apiRouter.put('/settings', authenticate, checkPermission('settings', 'can_edit'), (req: AuthRequest, res: Response) => {
  const settings = req.body;
  transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      runQuery(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
        [key, String(value)]
      );
    }
    logAudit(req.user, 'SETTINGS_UPDATE', 'settings', 'config', 'Updated business system settings', req);
  });
  res.json({ success: true, message: 'Settings saved successfully' });
});

// ==========================================
// 17. BACKUP / CSV EXPORT
// ==========================================

apiRouter.get('/export/:table', authenticate, checkPermission('reports', 'can_view'), (req: Request, res: Response) => {
  const allowedTables = ['customers', 'products', 'orders', 'deliveries', 'payments', 'expenses', 'inventory', 'suppliers', 'audit_logs'];
  const table = req.params.table;
  if (!allowedTables.includes(table)) {
    return res.status(400).json({ error: 'Invalid export entity' });
  }

  const rows = queryAll(`SELECT * FROM ${table};`);
  if (rows.length === 0) {
    return res.send('No data available');
  }

  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(',')];

  for (const row of rows) {
    const values = headers.map(h => {
      const val = row[h] === null || row[h] === undefined ? '' : String(row[h]);
      return `"${val.replace(/"/g, '""')}"`;
    });
    csvLines.push(values.join(','));
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${table}_export_${Date.now()}.csv"`);
  res.send(csvLines.join('\n'));
});
