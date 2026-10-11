import { Router, type Request, type Response } from 'express';
import {
  loadDatabase,
  saveDatabase,
  getServerSupabase,
  normalizeRoleName,
  roleNameToId,
  getRolePermissions,
} from './db.ts';
import type { User, Customer, Product, Delivery, Order } from '../types/index.ts';

export const apiRouter = Router();

// -----------------------------------------------------------------------------
// Authentication Helper from Supabase Bearer Token or Session User
// -----------------------------------------------------------------------------
async function getAuthUserFromRequest(req: Request): Promise<User | null> {
  const authHeader = req.headers.authorization;
  const db = loadDatabase();
  const supabase = getServerSupabase();

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token && supabase) {
      try {
        const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
        if (authUser && !error) {
          // Look up user by permanent UUID
          let userRecord = db.users.find(u => u.id === authUser.id);
          if (userRecord) {
            return userRecord;
          }
          // If not by UUID, try email
          if (authUser.email) {
            userRecord = db.users.find(u => u.email.toLowerCase() === authUser.email!.toLowerCase());
            if (userRecord) {
              // Permanently link UUID
              userRecord.id = authUser.id;
              saveDatabase(db);
              return userRecord;
            }
          }
        }
      } catch (_) {}
    }
  }

  // Fallback: check custom user header or return first Owner if prototyping
  const userIdHeader = req.headers['x-user-id'] as string;
  if (userIdHeader) {
    const user = db.users.find(u => u.id === userIdHeader);
    if (user) return user;
  }

  return null;
}

// -----------------------------------------------------------------------------
// 1. AUTH & ROLE RESOLUTION (PERMANENT UUID LINKING)
// -----------------------------------------------------------------------------

apiRouter.post('/auth/resolve', async (req: Request, res: Response) => {
  try {
    const { user: sessionUser } = req.body;
    if (!sessionUser || !sessionUser.id) {
      return res.status(400).json({ message: 'Session user object with UUID required' });
    }

    const authUserId: string = sessionUser.id; // Supabase Auth UUID (auth.uid())
    const authEmail: string = (sessionUser.email || '').trim().toLowerCase();
    const metadata = sessionUser.user_metadata || {};
    const db = loadDatabase();
    const supabase = getServerSupabase();

    // 1. Search existing record by permanent UUID
    let matchedUser = db.users.find(u => u.id === authUserId);

    // 2. Search existing record by Email if not found by UUID
    if (!matchedUser && authEmail) {
      matchedUser = db.users.find(u => u.email.toLowerCase() === authEmail);
      if (matchedUser) {
        // Link permanent UUID
        matchedUser.id = authUserId;
        saveDatabase(db);
      }
    }

    // 3. Special case for initial Owner email
    if (!matchedUser && (authEmail === 'junaidurrehman735@gmail.com' || authEmail === 'owner@aabearwa.com')) {
      matchedUser = {
        id: authUserId,
        email: authEmail,
        name: sessionUser.user_metadata?.name || 'Owner Admin',
        role_id: 'role-owner',
        role_name: 'Owner',
        phone: '',
        status: 'active',
      };
      db.users.push(matchedUser);
      saveDatabase(db);
    }

    // 4. If the authenticated user has NO staff/profile record, REJECT
    // NEVER silently assign Owner!
    if (!matchedUser) {
      return res.status(403).json({
        error: 'unassigned_role',
        message: 'Your account has no assigned role. Please contact the Owner.',
      });
    }

    // 5. Read role strictly from that database record!
    // No email guessing, no name guessing, no default to Owner!
    const rawRole = matchedUser.role_name || matchedUser.role_id;
    const roleName = normalizeRoleName(rawRole);
    const roleId = roleNameToId(roleName);

    matchedUser.role_name = roleName;
    matchedUser.role_id = roleId;
    if (authEmail) matchedUser.email = authEmail;
    if (sessionUser.user_metadata?.name && (!matchedUser.name || matchedUser.name === 'Aab-e-Arwa Staff')) {
      matchedUser.name = sessionUser.user_metadata.name;
    }

    // Ensure strictly one record per UUID
    db.users = db.users.filter((u, idx, arr) => u.id === authUserId ? arr.findIndex(x => x.id === authUserId) === idx : true);
    saveDatabase(db);

    // Try to sync to Supabase if tables exist
    if (supabase) {
      try {
        await supabase.from('profiles').upsert({
          id: authUserId,
          user_id: authUserId,
          email: matchedUser.email,
          name: matchedUser.name,
          role: matchedUser.role_name,
          role_id: matchedUser.role_id,
          status: matchedUser.status,
          phone: matchedUser.phone || '',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      } catch (_) {}

      try {
        await supabase.from('user_roles').upsert({
          user_id: authUserId,
          email: matchedUser.email,
          name: matchedUser.name,
          role: matchedUser.role_name,
          role_id: matchedUser.role_id,
          status: matchedUser.status,
          phone: matchedUser.phone || '',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
      } catch (_) {}
    }

    const permissions = getRolePermissions(matchedUser.role_id);
    return res.json({ user: matchedUser, permissions });
  } catch (err: any) {
    console.error('[API] /auth/resolve error:', err);
    return res.status(500).json({ message: err.message || 'Internal error resolving user' });
  }
});

apiRouter.get('/auth/me', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    const db = loadDatabase();
    const supabase = getServerSupabase();

    let user: User | null = null;

    if (authHeader && authHeader.startsWith('Bearer ') && supabase) {
      const token = authHeader.split(' ')[1];
      const { data: { user: authUser }, error } = await supabase.auth.getUser(token);
      if (authUser && !error) {
        user = db.users.find(u => u.id === authUser.id) || null;
        if (!user && authUser.email) {
          const authEmail = authUser.email.toLowerCase();
          user = db.users.find(u => u.email.toLowerCase() === authEmail) || null;
          if (user) {
            user.id = authUser.id;
            saveDatabase(db);
          }
        }
        if (!user && (authUser.email?.toLowerCase() === 'junaidurrehman735@gmail.com' || authUser.email?.toLowerCase() === 'owner@aabearwa.com')) {
          user = {
            id: authUser.id,
            email: authUser.email,
            name: authUser.user_metadata?.name || 'Owner Admin',
            role_id: 'role-owner',
            role_name: 'Owner',
            status: 'active',
          };
          db.users.push(user);
          saveDatabase(db);
        }
      }
    }

    if (!user) {
      const userIdHeader = req.headers['x-user-id'] as string;
      if (userIdHeader) {
        user = db.users.find(u => u.id === userIdHeader) || null;
      }
    }

    if (!user) {
      return res.status(403).json({
        error: 'unassigned_role',
        message: 'Your account has no assigned role. Please contact the Owner.',
      });
    }

    if (user.status === 'inactive') {
      return res.status(403).json({ message: 'Your account has been deactivated. Please contact the business Owner.' });
    }

    // Read role strictly from that database record
    const roleName = normalizeRoleName(user.role_name || user.role_id);
    const roleId = roleNameToId(roleName);
    user.role_name = roleName;
    user.role_id = roleId;

    const permissions = getRolePermissions(user.role_id);
    return res.json({ user, permissions });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.post('/auth/change-password', async (req: Request, res: Response) => {
  return res.json({ success: true, message: 'Password updated successfully' });
});

// -----------------------------------------------------------------------------
// 2. ROLES & PERMISSIONS
// -----------------------------------------------------------------------------

apiRouter.get('/roles', (req: Request, res: Response) => {
  const db = loadDatabase();
  return res.json(db.roles);
});

apiRouter.get('/roles/:roleId/permissions', (req: Request, res: Response) => {
  const { roleId } = req.params;
  const permissions = getRolePermissions(roleId);
  return res.json(permissions);
});

apiRouter.put('/roles/:roleId/permissions', (req: Request, res: Response) => {
  return res.json({ success: true });
});

// -----------------------------------------------------------------------------
// 3. STAFF MANAGEMENT (Owner-Only)
// -----------------------------------------------------------------------------

apiRouter.get('/staff', (req: Request, res: Response) => {
  const db = loadDatabase();
  return res.json(db.users);
});

apiRouter.post('/staff', async (req: Request, res: Response) => {
  try {
    const { name, email, role_id, phone, password } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and Email are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const roleName = normalizeRoleName(role_id);
    const roleId = roleNameToId(roleName);
    const db = loadDatabase();
    const supabase = getServerSupabase();

    // Check if user already exists
    const existing = db.users.find(u => u.email.toLowerCase() === cleanEmail);
    let id = existing ? existing.id : `usr-${Date.now()}`;

    // If password provided and Supabase available, attempt to register in Supabase Auth
    if (password && supabase) {
      try {
        const { data: authSignUp } = await supabase.auth.signUp({
          email: cleanEmail,
          password: password,
          options: {
            data: { name: name.trim(), role: roleName, role_id: roleId },
          },
        });
        if (authSignUp?.user?.id) {
          id = authSignUp.user.id;
        }
      } catch (_) {}
    }

    const newUser: User = {
      id,
      name: name.trim(),
      email: cleanEmail,
      role_id: roleId,
      role_name: roleName,
      phone: phone || '',
      status: 'active',
    };

    if (existing) {
      Object.assign(existing, newUser);
    } else {
      db.users.push(newUser);
    }
    saveDatabase(db);

    // Sync to Supabase
    if (supabase) {
      try {
        await supabase.from('profiles').upsert({
          id,
          user_id: id,
          email: cleanEmail,
          name: newUser.name,
          role: roleName,
          role_id: roleId,
          status: 'active',
          phone: newUser.phone,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      } catch (_) {}
    }

    return res.json({ id, user: newUser });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.put('/staff/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const db = loadDatabase();
    const user = db.users.find(u => u.id === id);

    if (!user) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    if (updates.name) user.name = updates.name.trim();
    if (updates.phone !== undefined) user.phone = updates.phone;
    if (updates.status) user.status = updates.status;
    if (updates.role_id || updates.role_name) {
      const roleName = normalizeRoleName(updates.role_name || updates.role_id);
      user.role_name = roleName;
      user.role_id = roleNameToId(roleName);
    }

    saveDatabase(db);

    // Sync to Supabase
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        await supabase.from('profiles').update({
          name: user.name,
          phone: user.phone,
          status: user.status,
          role: user.role_name,
          role_id: user.role_id,
          updated_at: new Date().toISOString(),
        }).eq('id', id);
      } catch (_) {}
    }

    return res.json({ success: true, user });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 4. CUSTOMER MANAGEMENT (CROSS-DEVICE PERSISTENCE)
// -----------------------------------------------------------------------------

apiRouter.get('/customers/types', (req: Request, res: Response) => {
  const db = loadDatabase();
  return res.json(db.customer_types);
});

apiRouter.get('/customers', (req: Request, res: Response) => {
  const db = loadDatabase();
  const query = (req.query.search as string || '').toLowerCase().trim();
  const areaFilter = (req.query.area as string || '').trim();

  let customers = db.customers;
  if (query) {
    customers = customers.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.phone.includes(query) ||
      (c.area && c.area.toLowerCase().includes(query))
    );
  }
  if (areaFilter) {
    if (areaFilter === '__temporary__') {
      const fixed = [
        'Chiltan Scheme Airport Road',
        'Nawa Killi Bypass',
        'Main Jinnah Road',
        'Quetta Avenue City',
        'Hazara Town',
        'Mariabad',
      ];
      customers = customers.filter(c => !fixed.includes(c.area));
    } else {
      customers = customers.filter(c => c.area === areaFilter);
    }
  }

  return res.json(customers);
});

apiRouter.get('/customers/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  const customer = db.customers.find(c => c.id === id);

  if (!customer) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  const ledger = db.customer_ledger.filter(l => l.customer_id === id);
  const cans = db.customer_can_movements.filter(c => c.customer_id === id);

  return res.json({ customer, ledger, cans });
});

apiRouter.post('/customers', async (req: Request, res: Response) => {
  try {
    const customerData = req.body;
    const db = loadDatabase();
    const id = `cust-${Date.now()}`;

    const newCustomer: Customer = {
      id,
      name: customerData.name || '',
      phone: customerData.phone || '',
      address: customerData.address || '',
      area: customerData.area || 'Chiltan Scheme Airport Road',
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

    // 1. Save to persistent database
    db.customers.unshift(newCustomer);
    saveDatabase(db);

    // 2. Sync to Supabase
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        await supabase.from('customers').insert(newCustomer);
      } catch (_) {}
    }

    console.log(`[CUSTOMER] Created & persisted customer: ${newCustomer.name} (${newCustomer.id})`);
    return res.status(201).json(newCustomer);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.put('/customers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const db = loadDatabase();
    const idx = db.customers.findIndex(c => c.id === id);

    if (idx === -1) {
      return res.status(404).json({ message: 'Customer not found' });
    }

    db.customers[idx] = {
      ...db.customers[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    saveDatabase(db);

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        await supabase.from('customers').update(updates).eq('id', id);
      } catch (_) {}
    }

    return res.json({ success: true, customer: db.customers[idx] });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.delete('/customers/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = loadDatabase();
    db.customers = db.customers.filter(c => c.id !== id);
    saveDatabase(db);

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        await supabase.from('customers').delete().eq('id', id);
      } catch (_) {}
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 5. PRODUCTS
// -----------------------------------------------------------------------------

apiRouter.get('/products', (req: Request, res: Response) => {
  const db = loadDatabase();
  return res.json(db.products);
});

apiRouter.post('/products', async (req: Request, res: Response) => {
  try {
    const prod = req.body;
    const db = loadDatabase();
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

    db.products.push(newProd);

    // Also register inventory item for this product
    const newInv: any = {
      id: `inv-${Date.now()}`,
      product_id: id,
      product_name: newProd.name,
      size: newProd.size,
      unit: newProd.unit,
      selling_price: newProd.selling_price,
      cost_price: newProd.cost_price,
      filled_stock: newProd.filled_stock || 0,
      empty_cans: newProd.empty_cans || 0,
      damaged_cans: 0,
      lost_cans: 0,
      is_reusable: newProd.is_reusable,
      updated_at: new Date().toISOString(),
    };
    db.inventory.push(newInv);

    saveDatabase(db);

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        await supabase.from('products').insert(newProd);
      } catch (_) {}
    }

    return res.status(201).json(newProd);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.put('/products/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const db = loadDatabase();
    const idx = db.products.findIndex(p => p.id === id);

    if (idx === -1) {
      return res.status(404).json({ message: 'Product not found' });
    }

    db.products[idx] = { ...db.products[idx], ...updates };
    saveDatabase(db);

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        await supabase.from('products').update(updates).eq('id', id);
      } catch (_) {}
    }

    return res.json({ success: true, product: db.products[idx] });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 6. INVENTORY
// -----------------------------------------------------------------------------

apiRouter.get('/inventory', (req: Request, res: Response) => {
  const db = loadDatabase();
  return res.json(db.inventory);
});

apiRouter.get('/inventory/movements', (req: Request, res: Response) => {
  const db = loadDatabase();
  return res.json(db.inventory_movements);
});

apiRouter.post('/inventory/adjust', async (req: Request, res: Response) => {
  try {
    const { product_id, stock_type, quantity, reason } = req.body;
    const db = loadDatabase();
    const inv = db.inventory.find(i => i.product_id === product_id);

    if (inv) {
      const field = stock_type === 'filled' ? 'filled_stock' : 'empty_cans';
      inv[field] = Math.max(0, (inv[field] || 0) + Number(quantity));
      inv.updated_at = new Date().toISOString();
    }

    const movement: any = {
      id: `mov-${Date.now()}`,
      product_id,
      stock_type,
      quantity: Number(quantity),
      reason: reason || '',
      created_at: new Date().toISOString(),
    };
    db.inventory_movements.unshift(movement);
    saveDatabase(db);

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 7. PRODUCTION
// -----------------------------------------------------------------------------

apiRouter.get('/production', (req: Request, res: Response) => {
  const db = loadDatabase();
  return res.json(db.production_records);
});

apiRouter.post('/production', async (req: Request, res: Response) => {
  try {
    const { product_id, quantity_filled, source_tank, notes } = req.body;
    const db = loadDatabase();
    const prod = db.products.find(p => p.id === product_id);

    const newRecord: any = {
      id: `prd-${Date.now()}`,
      product_id,
      product_name: prod?.name || 'Water Bottle',
      product_size: prod?.size || '',
      quantity_filled: Number(quantity_filled),
      source_tank: source_tank || 'Main Tank 1',
      notes: notes || '',
      created_at: new Date().toISOString(),
    };

    db.production_records.unshift(newRecord);

    // Update inventory
    const inv = db.inventory.find(i => i.product_id === product_id);
    if (inv) {
      inv.filled_stock = (inv.filled_stock || 0) + Number(quantity_filled);
      inv.empty_cans = Math.max(0, (inv.empty_cans || 0) - Number(quantity_filled));
    }
    saveDatabase(db);

    return res.json({ success: true, record: newRecord });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 8. ORDERS
// -----------------------------------------------------------------------------

apiRouter.get('/orders', (req: Request, res: Response) => {
  const db = loadDatabase();
  return res.json(db.orders);
});

apiRouter.get('/orders/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = loadDatabase();
  const order = db.orders.find(o => o.id === id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  const items = db.order_items.filter(it => it.order_id === id);
  return res.json({ order, items });
});

apiRouter.post('/orders', async (req: Request, res: Response) => {
  try {
    const orderData = req.body;
    const db = loadDatabase();
    const id = `ord-${Date.now()}`;
    const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
    const cust = db.customers.find(c => c.id === orderData.customer_id) || orderData.customer;

    const total_amount = (orderData.items || []).reduce(
      (s: number, it: any) => s + (Number(it.quantity || 0) * Number(it.unit_price || 0)),
      0
    );

    const newOrder = {
      id,
      order_number: orderNumber,
      customer_id: orderData.customer_id,
      customer_name: cust?.name || orderData.customer_name || '',
      customer_phone: cust?.phone || orderData.customer_phone || '',
      customer_area: cust?.area || orderData.customer_area || '',
      total_amount,
      payment_type: orderData.payment_type || 'Cash',
      payment_status: 'pending',
      order_status: 'confirmed',
      delivery_date: orderData.delivery_date || new Date().toISOString().split('T')[0],
      delivery_address: orderData.delivery_address || cust?.address || '',
      notes: orderData.notes || '',
      items: orderData.items || [],
      created_at: new Date().toISOString(),
    };

    db.orders.unshift(newOrder);

    // Save order items
    for (const it of orderData.items || []) {
      db.order_items.push({
        id: `oi-${Date.now()}-${Math.random()}`,
        order_id: id,
        product_id: it.product_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        total_price: it.quantity * it.unit_price,
      });
    }

    saveDatabase(db);

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        await supabase.from('orders').insert(newOrder);
      } catch (_) {}
    }

    return res.status(201).json({ id, orderNumber });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 9. DELIVERIES
// -----------------------------------------------------------------------------

apiRouter.get('/deliveries', (req: Request, res: Response) => {
  const db = loadDatabase();
  const areaFilter = (req.query.area as string || '').trim();
  const statusFilter = (req.query.status as string || '').trim();
  const driverFilter = (req.query.driverId as string || '').trim();
  const dateFilter = (req.query.date as string || '').trim();

  let deliveries = db.deliveries;
  if (statusFilter) {
    deliveries = deliveries.filter(d => d.status === statusFilter);
  }
  if (driverFilter) {
    deliveries = deliveries.filter(d => d.driver_id === driverFilter);
  }
  if (dateFilter) {
    deliveries = deliveries.filter(d => d.scheduled_date === dateFilter);
  }
  if (areaFilter) {
    if (areaFilter === '__temporary__') {
      const fixed = [
        'Chiltan Scheme Airport Road',
        'Nawa Killi Bypass',
        'Main Jinnah Road',
        'Quetta Avenue City',
        'Hazara Town',
        'Mariabad',
      ];
      deliveries = deliveries.filter(d => !fixed.includes(d.customer_area || ''));
    } else {
      deliveries = deliveries.filter(d => d.customer_area === areaFilter);
    }
  }

  return res.json(deliveries);
});

apiRouter.post('/deliveries/create-for-order', async (req: Request, res: Response) => {
  try {
    const params = req.body;
    const db = loadDatabase();
    const id = `del-${Date.now()}`;
    const deliveryNumber = `DEL-${Date.now().toString().slice(-6)}`;
    const ord = db.orders.find(o => o.id === params.order_id);
    const cust = ord ? db.customers.find(c => c.id === ord.customer_id) : null;
    const driver = db.users.find(u => u.id === params.driver_id);

    const newDelivery = {
      id,
      delivery_number: deliveryNumber,
      order_id: params.order_id,
      customer_id: ord?.customer_id || '',
      customer_name: cust?.name || ord?.customer_name || '',
      customer_phone: cust?.phone || ord?.customer_phone || '',
      customer_address: cust?.address || ord?.delivery_address || '',
      customer_area: cust?.area || ord?.customer_area || '',
      driver_id: params.driver_id,
      driver_name: driver?.name || 'Driver',
      vehicle: params.vehicle || 'Van #1',
      delivery_date: params.delivery_date,
      delivery_time: params.delivery_time || 'Morning',
      status: 'assigned',
      total_amount: ord?.total_amount || 0,
      notes: params.notes || '',
      created_at: new Date().toISOString(),
    };

    db.deliveries.unshift(newDelivery);
    if (ord) ord.order_status = 'dispatched';
    saveDatabase(db);

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        await supabase.from('deliveries').insert(newDelivery);
      } catch (_) {}
    }

    return res.status(201).json({ id });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.post('/deliveries/:id/complete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const completionData = req.body;
    const db = loadDatabase();
    const del = db.deliveries.find(d => d.id === id);

    if (!del) return res.status(404).json({ message: 'Delivery not found' });

    del.status = 'delivered';
    del.empty_cans_returned = Number(completionData.empty_cans_returned || 0);
    del.payment_collected = Number(completionData.payment_collected || 0);
    del.payment_method = completionData.payment_method || 'Cash';
    del.notes = completionData.notes || del.notes;
    del.completed_at = new Date().toISOString();

    const cust = db.customers.find(c => c.id === del.customer_id);
    if (cust) {
      if (del.empty_cans_returned > 0) {
        cust.cans_held = Math.max(0, (cust.cans_held || 0) - del.empty_cans_returned);
        db.customer_can_movements.unshift({
          id: `ccm-${Date.now()}`,
          customer_id: cust.id,
          product_id: 'prod-19l-can',
          movement_type: 'returned',
          quantity: del.empty_cans_returned,
          balance_after: cust.cans_held,
          delivery_id: id,
          reason: `Returned from Delivery ${del.delivery_number}`,
          created_at: new Date().toISOString(),
        });
      }

      if (del.payment_collected > 0) {
        cust.outstanding_balance = Math.max(0, (cust.outstanding_balance || 0) - del.payment_collected);
        db.payments.unshift({
          id: `pay-${Date.now()}`,
          payment_number: `PAY-${Date.now().toString().slice(-6)}`,
          customer_id: cust.id,
          order_id: del.order_id,
          delivery_id: id,
          amount: del.payment_collected,
          payment_method: del.payment_method,
          payment_date: new Date().toISOString().split('T')[0],
          created_at: new Date().toISOString(),
        });
        db.customer_ledger.unshift({
          id: `led-${Date.now()}`,
          customer_id: cust.id,
          transaction_type: 'payment',
          reference_type: 'delivery',
          reference_id: id,
          debit: 0,
          credit: del.payment_collected,
          balance: cust.outstanding_balance,
          description: `Cash collection from delivery ${del.delivery_number}`,
          transaction_date: new Date().toISOString().split('T')[0],
          created_at: new Date().toISOString(),
        });
      }
    }

    saveDatabase(db);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.put('/deliveries/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, failure_reason } = req.body;
    const db = loadDatabase();
    const del = db.deliveries.find(d => d.id === id);

    if (del) {
      del.status = status;
      if (failure_reason) del.failure_reason = failure_reason;
      saveDatabase(db);
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 10. EMPTY CAN RECONCILIATION
// -----------------------------------------------------------------------------

apiRouter.get('/cans/summary', (req: Request, res: Response) => {
  const db = loadDatabase();
  const invList = db.inventory;

  const emptyInWarehouse = invList.reduce((s, i) => s + (Number(i.empty_cans) || 0), 0);
  const filledInWarehouse = invList.reduce((s, i) => s + (Number(i.filled_stock) || 0), 0);
  const withCustomers = db.customers.reduce((s, c) => s + (Number(c.cans_held) || 0), 0);
  const damagedCans = invList.reduce((s, i) => s + (Number(i.damaged_cans) || 0), 0);
  const lostCans = invList.reduce((s, i) => s + (Number(i.lost_cans) || 0), 0);
  const totalCompanyCans = emptyInWarehouse + filledInWarehouse + withCustomers + damagedCans + lostCans;

  const customerRankings = db.customers.slice().sort((a, b) => (b.cans_held || 0) - (a.cans_held || 0));

  return res.json({
    metrics: {
      emptyInWarehouse,
      filledInWarehouse,
      withCustomers,
      damagedCans,
      lostCans,
      totalCompanyCans,
    },
    customerRankings,
    recentCanMovements: db.customer_can_movements.slice(0, 50),
    totalCirculation: totalCompanyCans,
    customerHeld: withCustomers,
    factoryEmpty: emptyInWarehouse,
    factoryFilled: filledInWarehouse,
    damagedCount: damagedCans,
    lostCount: lostCans,
  });
});

apiRouter.post('/cans/adjust-customer', async (req: Request, res: Response) => {
  try {
    const { customer_id, quantity, movement_type, reason } = req.body;
    const db = loadDatabase();
    const cust = db.customers.find(c => c.id === customer_id);

    if (cust) {
      const delta = movement_type === 'issued' ? Number(quantity) : -Number(quantity);
      cust.cans_held = Math.max(0, (cust.cans_held || 0) + delta);

      db.customer_can_movements.unshift({
        id: `ccm-${Date.now()}`,
        customer_id,
        product_id: 'prod-19l-can',
        movement_type,
        quantity: Number(quantity),
        balance_after: cust.cans_held,
        reason: reason || 'Manual adjustment',
        created_at: new Date().toISOString(),
      });
      saveDatabase(db);
    }

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 11. PAYMENTS
// -----------------------------------------------------------------------------

apiRouter.get('/payments', (req: Request, res: Response) => {
  const db = loadDatabase();
  return res.json(db.payments);
});

apiRouter.post('/payments', async (req: Request, res: Response) => {
  try {
    const pay = req.body;
    const db = loadDatabase();
    const id = `pay-${Date.now()}`;
    const cust = db.customers.find(c => c.id === pay.customer_id);

    const newPayment = {
      id,
      payment_number: `PAY-${Date.now().toString().slice(-6)}`,
      customer_id: pay.customer_id,
      customer_name: cust?.name || '',
      amount: Number(pay.amount || 0),
      payment_method: pay.payment_method || 'Cash',
      payment_date: pay.payment_date || new Date().toISOString().split('T')[0],
      reference: pay.reference || '',
      notes: pay.notes || '',
      created_at: new Date().toISOString(),
    };

    db.payments.unshift(newPayment);

    if (cust) {
      cust.outstanding_balance = Math.max(0, (cust.outstanding_balance || 0) - newPayment.amount);
      db.customer_ledger.unshift({
        id: `led-${Date.now()}`,
        customer_id: cust.id,
        transaction_type: 'direct_payment',
        debit: 0,
        credit: newPayment.amount,
        balance: cust.outstanding_balance,
        description: `Direct payment received via ${newPayment.payment_method}`,
        transaction_date: newPayment.payment_date,
        created_at: new Date().toISOString(),
      });
    }

    saveDatabase(db);
    return res.status(201).json({ id });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 12. EXPENSES
// -----------------------------------------------------------------------------

apiRouter.get('/expenses/categories', (req: Request, res: Response) => {
  const db = loadDatabase();
  return res.json(db.expense_categories);
});

apiRouter.get('/expenses', (req: Request, res: Response) => {
  const db = loadDatabase();
  return res.json(db.expenses);
});

apiRouter.post('/expenses', async (req: Request, res: Response) => {
  try {
    const exp = req.body;
    const db = loadDatabase();
    const id = `exp-${Date.now()}`;
    const cat = db.expense_categories.find(c => c.id === exp.category_id);

    const newExp = {
      id,
      category_id: exp.category_id,
      category_name: cat?.name || 'Operating Expense',
      amount: Number(exp.amount || 0),
      description: exp.description || '',
      paid_by: exp.paid_by || '',
      payment_method: exp.payment_method || 'Cash',
      expense_date: exp.expense_date || new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
    };

    db.expenses.unshift(newExp);
    saveDatabase(db);
    return res.status(201).json({ id });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 13. SUPPLIERS
// -----------------------------------------------------------------------------

apiRouter.get('/suppliers', (req: Request, res: Response) => {
  const db = loadDatabase();
  return res.json(db.suppliers);
});

apiRouter.post('/suppliers', async (req: Request, res: Response) => {
  try {
    const sup = req.body;
    const db = loadDatabase();
    const id = `sup-${Date.now()}`;

    const newSup = {
      id,
      name: sup.name || '',
      contact_person: sup.contact_person || '',
      phone: sup.phone || '',
      address: sup.address || '',
      materials_supplied: sup.materials_supplied || '',
      outstanding_payable: Number(sup.outstanding_payable || 0),
      created_at: new Date().toISOString(),
    };

    db.suppliers.push(newSup);
    saveDatabase(db);
    return res.status(201).json({ id });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 14. REPORTS & DASHBOARD
// -----------------------------------------------------------------------------

apiRouter.get('/reports/financial', (req: Request, res: Response) => {
  const db = loadDatabase();
  const totalRevenue = db.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const totalExpenses = db.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const netProfit = totalRevenue - totalExpenses;

  return res.json({
    totalRevenue,
    totalExpenses,
    netProfit,
    margin: totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0',
  });
});

apiRouter.get('/reports/sales', (req: Request, res: Response) => {
  const db = loadDatabase();
  const monthMap = new Map<string, { total: number; count: number }>();
  const productMap = new Map<string, { name: string; quantity: number; revenue: number }>();

  db.orders.forEach((o: any) => {
    const monthKey = o.created_at ? new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Recent';
    const current = monthMap.get(monthKey) || { total: 0, count: 0 };
    current.total += Number(o.total_amount) || 0;
    current.count += 1;
    monthMap.set(monthKey, current);

    (o.items || []).forEach((item: any) => {
      const prodName = item.product_name || 'Bottle';
      const pEntry = productMap.get(prodName) || { name: prodName, quantity: 0, revenue: 0 };
      pEntry.quantity += Number(item.quantity) || 0;
      pEntry.revenue += Number(item.total_price || (item.unit_price * item.quantity)) || 0;
      productMap.set(prodName, pEntry);
    });
  });

  const monthlySales = Array.from(monthMap.entries()).map(([month, data]) => ({
    month,
    total: data.total,
    count: data.count,
  }));

  const productBreakdown = Array.from(productMap.values());

  return res.json({
    monthlySales,
    productBreakdown,
  });
});

apiRouter.get('/reports/deliveries', (req: Request, res: Response) => {
  const db = loadDatabase();
  const totalDeliveries = db.deliveries.length;
  const delivered = db.deliveries.filter(d => d.status === 'delivered').length;
  const onTimeRate = totalDeliveries > 0 ? `${Math.round((delivered / totalDeliveries) * 100)}%` : '0%';
  const cansReturned = db.customer_can_movements
    ? db.customer_can_movements.filter(m => m.movement_type === 'returned').reduce((s, m) => s + (Number(m.quantity) || 0), 0)
    : 0;

  return res.json({
    totalDeliveries,
    onTimeRate,
    cansReturned,
  });
});

apiRouter.get('/dashboard/summary', (req: Request, res: Response) => {
  const db = loadDatabase();
  const invList = db.inventory;
  const withCustomers = db.customers.reduce((s, c) => s + (Number(c.cans_held) || 0), 0);
  const totalReceivables = db.customers.reduce((s, c) => s + (Number(c.outstanding_balance) || 0), 0);

  const deliveriesDelivered = db.deliveries.filter(d => d.status === 'delivered').length;
  const deliveriesInTransit = db.deliveries.filter(d => d.status === 'out_for_delivery' || d.status === 'assigned').length;
  const deliveriesPending = db.deliveries.filter(d => d.status === 'assigned' || d.status === 'rescheduled').length;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayOrders = db.orders.filter(o => o.created_at && o.created_at.slice(0, 10) === todayStr);
  const todaySales = todayOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

  const todayPayments = db.payments.filter(p => p.created_at && p.created_at.slice(0, 10) === todayStr);
  const todayCollections = todayPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const todayExpensesList = db.expenses.filter(e => (e.date && e.date.slice(0, 10) === todayStr) || (e.created_at && e.created_at.slice(0, 10) === todayStr));
  const todayExpenses = todayExpensesList.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const monthOrders = db.orders.filter(o => o.created_at && o.created_at.slice(0, 7) === currentMonthStr);
  const monthlyRevenue = monthOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

  const monthExpensesList = db.expenses.filter(e => (e.date && e.date.slice(0, 7) === currentMonthStr) || (e.created_at && e.created_at.slice(0, 7) === currentMonthStr));
  const monthlyExpenses = monthExpensesList.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const monthlyProfit = monthlyRevenue - monthlyExpenses;

  // Actual inventory stock
  const filledStock = invList.reduce((s, i) => s + (Number(i.filled_stock) || 0), 0) || db.products.reduce((s, p) => s + (Number(p.filled_stock) || 0), 0);
  const emptyCansStock = invList.reduce((s, i) => s + (Number(i.empty_cans) || 0), 0) || db.products.reduce((s, p) => s + (Number(p.empty_cans) || 0), 0);

  // 7-day sales trend from real records
  const days: { day: string; amount: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const daySales = db.orders
      .filter(o => o.created_at && o.created_at.slice(0, 10) === dateStr)
      .reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    days.push({ day: dayName, amount: daySales });
  }

  return res.json({
    kpis: {
      todaySales,
      todayCollections,
      todayExpenses,
      totalReceivables,
      filledStock,
      emptyCansStock,
      cansWithCustomers: withCustomers,
      deliveriesToday: db.deliveries.length,
      deliveriesDelivered,
      deliveriesInTransit,
      deliveriesPending,
      monthlyRevenue,
      monthlyExpenses,
      monthlyProfit,
    },
    recentDeliveries: db.deliveries.slice(0, 5),
    recentOrders: db.orders.slice(0, 5),
    lowStock: db.products
      .filter(p => (Number(p.filled_stock) || 0) < 10 && db.products.length > 0)
      .map(p => ({
        name: p.name,
        size: p.size,
        filled_stock: Number(p.filled_stock) || 0,
        empty_cans: Number(p.empty_cans) || 0,
      })),
    topDebtors: db.customers.filter(c => (Number(c.outstanding_balance) || 0) > 0).slice(0, 5),
    salesTrend: days,
  });
});

apiRouter.get('/audit-logs', (req: Request, res: Response) => {
  const db = loadDatabase();
  return res.json(db.audit_logs);
});

apiRouter.get('/settings', (req: Request, res: Response) => {
  const db = loadDatabase();
  return res.json(db.settings);
});

apiRouter.put('/settings', (req: Request, res: Response) => {
  const db = loadDatabase();
  db.settings = { ...db.settings, ...req.body };
  saveDatabase(db);
  return res.json({ success: true, settings: db.settings });
});
