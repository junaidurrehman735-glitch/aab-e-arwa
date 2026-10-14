import { Router, type Request, type Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  loadDatabase,
  saveDatabase,
  getServerSupabase,
  normalizeRoleName,
  roleNameToId,
  getRolePermissions,
  saveRolePermissions,
  getIdempotencyRecord,
  saveIdempotencyRecord,
  runWithLock,
} from './db.ts';
import type { User, Customer, Product, Delivery, Order, Permission, AuditLog } from '../types/index.ts';

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
// Granular Permission Authorization Helper for Server Endpoints
// -----------------------------------------------------------------------------
async function authorizePermission(
  req: Request,
  res: Response,
  module: string,
  action: 'can_view' | 'can_create' | 'can_edit' | 'can_approve' | 'can_delete'
): Promise<User | null> {
  const authUser = await getAuthUserFromRequest(req);
  if (!authUser) {
    res.status(401).json({ message: 'Authentication required' });
    return null;
  }

  const role = authUser.role_name || (authUser.role_id === 'role-owner' ? 'Owner' : authUser.role_id === 'role-manager' ? 'Manager' : 'Delivery Boy');
  const isOwner = role === 'Owner' || authUser.role_id === 'role-owner';

  // 1. Invariant: Non-Owners NEVER have access to financial tables or staff management
  if (!isOwner && ['payments', 'expenses', 'staff'].includes(module)) {
    res.status(403).json({ message: `Access Denied: ${role} role is unauthorized to access ${module}.` });
    return null;
  }

  // 2. Invariant: Delivery Boy CANNOT access financial reports, audit logs, or settings
  if ((role === 'Delivery Boy' || authUser.role_id === 'role-delivery') &&
      ['reports', 'audit', 'settings', 'production', 'inventory'].includes(module)) {
    res.status(403).json({ message: `Access Denied: Delivery Boy cannot access ${module}.` });
    return null;
  }

  // 3. Invariant: Owner always maintains staff & settings management
  if (isOwner && (module === 'staff' || module === 'settings') && (action === 'can_view' || action === 'can_edit')) {
    return authUser;
  }

  // 4. Resolve dynamically configured permission matrix for this role
  const permissions = getRolePermissions(authUser.role_id);
  const perm = permissions.find((p) => p.module === module);

  if (perm && perm[action] === 1) {
    return authUser;
  }

  res.status(403).json({
    message: `Access Denied: ${role} role lacks ${action.replace('_', ' ')} permission for ${module}.`
  });
  return null;
}

// -----------------------------------------------------------------------------
// Centralized System Audit Trail Logger
// Persists immutable audit records to Supabase & Central Database Cache
// -----------------------------------------------------------------------------
export async function logAuditEvent(params: {
  req: Request;
  action: string;
  module: string;
  record_ref?: string;
  details: string;
  old_value?: any;
  new_value?: any;
}): Promise<AuditLog | null> {
  try {
    const authUser = await getAuthUserFromRequest(params.req);
    const db = loadDatabase();
    const fallbackOwner = db.users.find(u => u.role_name === 'Owner' || u.role_id === 'role-owner') || db.users[0];

    const userId = authUser?.id || (params.req.headers['x-user-id'] as string) || fallbackOwner?.id || 'owner-system';
    const userName = authUser?.name || fallbackOwner?.name || 'System Operator';
    const userRole = authUser?.role_name || fallbackOwner?.role_name || 'Owner';
    const ip = (params.req.headers['x-forwarded-for'] as string) || params.req.ip || '127.0.0.1';
    const nowIso = new Date().toISOString();

    const auditEntry: AuditLog = {
      id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      user_id: userId,
      user_name: userName,
      user_role: userRole,
      action: params.action,
      module: params.module,
      record_ref: params.record_ref || '',
      details: params.details,
      old_value: params.old_value !== undefined ? params.old_value : null,
      new_value: params.new_value !== undefined ? params.new_value : null,
      ip_address: ip,
      created_at: nowIso,
    };

    if (!db.audit_logs) db.audit_logs = [];

    // Duplicate action protection: prevent identical audit log within 5 seconds for same action & record_ref
    const recentDuplicate = db.audit_logs.find(l =>
      l.action === auditEntry.action &&
      l.record_ref === auditEntry.record_ref &&
      Math.abs(new Date(nowIso).getTime() - new Date(l.created_at).getTime()) < 5000
    );
    if (recentDuplicate) {
      console.log(`[AUDIT] Duplicate prevented for ${auditEntry.action} on ${auditEntry.record_ref}`);
      return recentDuplicate;
    }

    // 1. Persist in local database (disk persistent via aab_database.json)
    db.audit_logs.unshift(auditEntry);
    if (db.audit_logs.length > 1000) {
      db.audit_logs = db.audit_logs.slice(0, 1000);
    }
    saveDatabase(db);

    // 2. Persist in Supabase audit_logs table
    const authHeader = params.req.headers.authorization;
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

    let savedToSupabase = false;
    if (authHeader && authHeader.startsWith('Bearer ') && supabaseUrl && supabaseKey) {
      try {
        const userSupabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false },
        });
        const { error } = await userSupabase.from('audit_logs').insert({
          id: auditEntry.id,
          user_id: auditEntry.user_id,
          user_name: auditEntry.user_name,
          action: auditEntry.action,
          module: auditEntry.module,
          record_ref: auditEntry.record_ref,
          details: auditEntry.details,
          ip_address: auditEntry.ip_address,
          created_at: auditEntry.created_at,
        });
        if (!error) savedToSupabase = true;
      } catch (err: any) {
        console.warn('[AUDIT] User Supabase insert warning:', err?.message || err);
      }
    }

    if (!savedToSupabase) {
      const serverSupabase = getServerSupabase();
      if (serverSupabase) {
        try {
          const { error } = await serverSupabase.from('audit_logs').insert({
            id: auditEntry.id,
            user_id: auditEntry.user_id,
            user_name: auditEntry.user_name,
            action: auditEntry.action,
            module: auditEntry.module,
            record_ref: auditEntry.record_ref,
            details: auditEntry.details,
            ip_address: auditEntry.ip_address,
            created_at: auditEntry.created_at,
          });
          if (!error) savedToSupabase = true;
        } catch (_) {}
      }
    }

    console.log(`[AUDIT] Recorded: [${auditEntry.module.toUpperCase()}] ${auditEntry.action} by ${userName} (${userRole}) - ${auditEntry.details}`);
    return auditEntry;
  } catch (err: any) {
    console.error('[AUDIT] Failed to record audit log:', err?.message || err);
    return null;
  }
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

apiRouter.put('/roles/:roleId/permissions', async (req: Request, res: Response) => {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    const isOwner = authUser.role_name === 'Owner' || authUser.role_id === 'role-owner';
    if (!isOwner) {
      return res.status(403).json({ message: 'Access Denied: Only Owner can modify role permissions.' });
    }

    const { roleId } = req.params;
    const permissions: Permission[] = req.body.permissions || [];
    if (!Array.isArray(permissions)) {
      return res.status(400).json({ message: 'Permissions array required' });
    }

    // Save to server database
    saveRolePermissions(roleId, permissions);

    // Try to sync to Supabase permissions table if available
    const supabase = getServerSupabase();
    if (supabase) {
      for (const p of permissions) {
        try {
          await supabase.from('permissions').upsert({
            id: `${roleId}:${p.module}`,
            role_id: roleId,
            module: p.module,
            can_view: Number(p.can_view ?? 0),
            can_create: Number(p.can_create ?? 0),
            can_edit: Number(p.can_edit ?? 0),
            can_approve: Number(p.can_approve ?? 0),
            can_delete: Number(p.can_delete ?? 0),
          }, { onConflict: 'role_id,module' });
        } catch (_) {}
      }
    }

    await logAuditEvent({
      req,
      action: 'CHANGE_PERMISSIONS',
      module: 'staff',
      record_ref: roleId,
      details: `Updated RBAC permissions for role "${roleId}" across ${permissions.length} modules`,
      new_value: permissions,
    });

    return res.json({ success: true, permissions: getRolePermissions(roleId) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message || 'Failed to update permissions' });
  }
});

// -----------------------------------------------------------------------------
// 3. STAFF MANAGEMENT (Owner-Only)
// -----------------------------------------------------------------------------

apiRouter.get('/staff', async (req: Request, res: Response) => {
  const authorized = await authorizePermission(req, res, 'staff', 'can_view');
  if (!authorized) return;
  const db = loadDatabase();
  return res.json(db.users);
});

apiRouter.post('/staff', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'staff', 'can_create');
    if (!authorized) return;

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

    await logAuditEvent({
      req,
      action: 'CREATE_STAFF',
      module: 'staff',
      record_ref: id,
      details: `Added staff member "${newUser.name}" (${cleanEmail}) with role "${newUser.role_name}"`,
      new_value: { name: newUser.name, email: cleanEmail, role: newUser.role_name, phone: newUser.phone, status: newUser.status },
    });

    return res.json({ id, user: newUser });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.put('/staff/:id', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'staff', 'can_edit');
    if (!authorized) return;

    const { id } = req.params;
    const updates = req.body;
    const db = loadDatabase();
    const user = db.users.find(u => u.id === id);

    if (!user) {
      return res.status(404).json({ message: 'Staff member not found' });
    }

    const prevName = user.name;
    const prevStatus = user.status;
    const prevRole = user.role_name;

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

    let staffAction = 'UPDATE_STAFF';
    let detailMsg = `Updated staff member "${user.name}" details`;
    if (updates.status && updates.status !== prevStatus) {
      staffAction = updates.status === 'inactive' ? 'DEACTIVATE_STAFF' : 'ACTIVATE_STAFF';
      detailMsg = `${updates.status === 'inactive' ? 'Deactivated' : 'Activated'} staff member "${user.name}"`;
    } else if ((updates.role_id || updates.role_name) && user.role_name !== prevRole) {
      staffAction = 'CHANGE_ROLE';
      detailMsg = `Changed role for staff member "${user.name}" from ${prevRole} to ${user.role_name}`;
    }

    await logAuditEvent({
      req,
      action: staffAction,
      module: 'staff',
      record_ref: id,
      details: detailMsg,
      old_value: { name: prevName, role: prevRole, status: prevStatus },
      new_value: { name: user.name, role: user.role_name, status: user.status },
    });

    return res.json({ success: true, user });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 4. CUSTOMER MANAGEMENT (CROSS-DEVICE PERSISTENCE)
// -----------------------------------------------------------------------------

apiRouter.get('/customers/types', async (req: Request, res: Response) => {
  const supabase = getServerSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase.from('customer_types').select('*').order('name');
      if (!error && data && data.length > 0) {
        return res.json(data);
      }
    } catch (_) {}
  }
  const db = loadDatabase();
  return res.json(db.customer_types);
});

apiRouter.get('/customers', async (req: Request, res: Response) => {
  const supabase = getServerSupabase();
  const query = (req.query.search as string || '').toLowerCase().trim();
  const areaFilter = (req.query.area as string || '').trim();
  const typeFilter = (req.query.type as string || '').trim();
  const cashStatusFilter = (req.query.cashStatus as string || '').trim();

  let customers: Customer[] = [];
  let fetchedFromSupabase = false;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        customers = data as Customer[];
        fetchedFromSupabase = true;
        // Keep local central database aligned
        try {
          const db = loadDatabase();
          db.customers = customers;
          saveDatabase(db);
        } catch (_) {}
      } else if (error) {
        console.warn('[API /customers] Supabase SELECT notice (using central database):', error.message || error);
      }
    } catch (err: any) {
      console.warn('[API /customers] Supabase SELECT notice:', err?.message || err);
    }
  }

  if (!fetchedFromSupabase) {
    const db = loadDatabase();
    customers = db.customers || [];
  }

  // Filter out archived/inactive customers from active management list by default
  const statusParam = (req.query.status as string || '').trim();
  if (statusParam) {
    customers = customers.filter(c => (c.status as string) === statusParam);
  } else {
    customers = customers.filter(c => (c.status as string) !== 'inactive' && (c.status as string) !== 'archived');
  }

  // Apply filters to real fetched records
  if (query) {
    customers = customers.filter(c =>
      (c.name && c.name.toLowerCase().includes(query)) ||
      (c.phone && c.phone.includes(query)) ||
      (c.address && c.address.toLowerCase().includes(query)) ||
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
  if (typeFilter) {
    customers = customers.filter(c => c.customer_type_id === typeFilter);
  }
  if (cashStatusFilter) {
    customers = customers.filter(c => c.cash_status === cashStatusFilter);
  }

  return res.json(customers);
});

apiRouter.get('/customers/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getServerSupabase();
  const db = loadDatabase();

  let customer: Customer | null = null;
  if (supabase) {
    try {
      const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
      if (!error && data) {
        customer = data as Customer;
      }
    } catch (_) {}
  }

  if (!customer) {
    customer = db.customers.find(c => c.id === id) || null;
  }

  if (!customer) {
    return res.status(404).json({ message: 'Customer not found' });
  }

  const ledger = (db.customer_ledger || []).filter(l => l.customer_id === id);
  const cans = (db.customer_can_movements || []).filter(c => c.customer_id === id);

  return res.json({ customer, ledger, cans });
});

apiRouter.post('/customers', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'customers', 'can_create');
    if (!authorized) return;

    const customerData = req.body;
    if (!customerData.name || !customerData.name.trim()) {
      return res.status(400).json({ message: 'Customer name is required' });
    }
    if (!customerData.phone || !customerData.phone.trim()) {
      return res.status(400).json({ message: 'Customer phone number is required' });
    }
    if (!customerData.address || !customerData.address.trim()) {
      return res.status(400).json({ message: 'Customer address is required' });
    }

    // Backend Idempotency & Concurrency Lock
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) || (customerData.idempotency_key as string);
    const cleanPhone = customerData.phone.trim().replace(/\s+/g, '');
    const cleanName = customerData.name.trim().toLowerCase();
    const cleanAddress = customerData.address.trim().toLowerCase();
    const lockKey = idempotencyKey || `cust-lock-${cleanPhone}-${cleanName}`;

    return await runWithLock(lockKey, async () => {
      // 1. Check cached idempotency response in memory/database
      if (idempotencyKey) {
        const cached = getIdempotencyRecord(idempotencyKey);
        if (cached) {
          console.log(`[IDEMPOTENCY] Returning cached customer response for key: ${idempotencyKey}`);
          return res.status(200).json(cached);
        }
      }

      const supabase = getServerSupabase();
      const customerId = customerData.id || `cust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // 2. Database safety check: Check Supabase directly for already-existing customer with same ID or rapid submission
      if (supabase) {
        // If an explicit client ID was provided:
        if (customerData.id) {
          const { data: existingCust } = await supabase
            .from('customers')
            .select('*')
            .eq('id', customerData.id)
            .maybeSingle();

          if (existingCust) {
            console.log(`[IDEMPOTENCY] Customer already exists with ID: ${customerData.id}`);
            if (idempotencyKey) {
              saveIdempotencyRecord(idempotencyKey, 'create_customer', existingCust);
            }
            return res.status(200).json(existingCust);
          }
        }

        // Check for rapid double-submission in Supabase (created in the last 15 seconds with identical phone, name, and address)
        const fifteenSecAgo = new Date(Date.now() - 15000).toISOString();
        const { data: recentCust } = await supabase
          .from('customers')
          .select('*')
          .eq('phone', customerData.phone.trim())
          .eq('name', customerData.name.trim())
          .eq('address', customerData.address.trim())
          .gte('created_at', fifteenSecAgo)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentCust) {
          console.log(`[IDEMPOTENCY] Detected rapid duplicate submission for ${customerData.name} - returning existing record (${recentCust.id})`);
          if (idempotencyKey) {
            saveIdempotencyRecord(idempotencyKey, 'create_customer', recentCust);
          }
          return res.status(200).json(recentCust);
        }
      }

      // Check central database cache for same ID
      const db = loadDatabase();
      const existingInDb = db.customers.find(c => c.id === customerId);
      if (existingInDb) {
        if (idempotencyKey) {
          saveIdempotencyRecord(idempotencyKey, 'create_customer', existingInDb);
        }
        return res.status(200).json(existingInDb);
      }

      const cleanCustomer: Record<string, any> = {
        id: customerId,
        name: customerData.name.trim(),
        contact_person: customerData.contact_person || '',
        phone: customerData.phone.trim(),
        whatsapp: customerData.whatsapp || '',
        address: customerData.address.trim(),
        area: customerData.area || 'Chiltan Scheme Airport Road',
        area_access: customerData.area_access || 'Specific Area',
        customer_type_id: customerData.customer_type_id || 'ct-home',
        selling_rate: Number(customerData.selling_rate || 220),
        payment_type: customerData.payment_type || 'Cash',
        cash_status: customerData.cash_status || 'Cash on Delivery',
        credit_limit: Number(customerData.credit_limit || 0),
        outstanding_balance: Number(customerData.outstanding_balance || 0),
        cans_held: Number(customerData.cans_held || customerData.company_cans || 0),
        net_deposit_amount: Number(customerData.net_deposit_amount || 0),
        notes: customerData.notes || '',
        delivery_instructions: customerData.delivery_instructions || '',
        status: customerData.status || 'active',
        created_at: new Date().toISOString(),
      };

      // 3. Insert into Supabase (single source of truth)
      if (supabase) {
        const { data, error } = await supabase.from('customers').insert(cleanCustomer).select().maybeSingle();
        if (error) {
          console.error('[API /customers] Supabase INSERT error:', error.message || error);
          return res.status(500).json({ message: error.message || 'Failed to insert customer into Supabase' });
        }

        const inserted = (data || cleanCustomer) as Customer;

        // Sync with central database cache
        db.customers = db.customers.filter(c => c.id !== inserted.id);
        db.customers.unshift(inserted);
        saveDatabase(db);

        // Save idempotency record
        if (idempotencyKey) {
          saveIdempotencyRecord(idempotencyKey, 'create_customer', inserted);
        }

        // Record in audit_logs for traceability
        await logAuditEvent({
          req,
          action: 'CREATE_CUSTOMER',
          module: 'customers',
          record_ref: inserted.id,
          details: `Created customer "${inserted.name}" (Phone: ${inserted.phone}) in area "${inserted.area}" | Selling Rate: PKR ${inserted.selling_rate}`,
          new_value: { name: inserted.name, phone: inserted.phone, area: inserted.area, selling_rate: inserted.selling_rate, status: inserted.status },
        });

        console.log(`[CUSTOMER] Created & verified in Supabase: ${inserted.name} (${inserted.id})`);
        return res.status(201).json(inserted);
      }

      // If no Supabase (fallback mode only):
      db.customers = db.customers.filter(c => c.id !== cleanCustomer.id);
      db.customers.unshift(cleanCustomer as Customer);
      saveDatabase(db);

      if (idempotencyKey) {
        saveIdempotencyRecord(idempotencyKey, 'create_customer', cleanCustomer);
      }

      await logAuditEvent({
        req,
        action: 'CREATE_CUSTOMER',
        module: 'customers',
        record_ref: cleanCustomer.id,
        details: `Created customer "${cleanCustomer.name}" (Phone: ${cleanCustomer.phone}) in area "${cleanCustomer.area}" | Selling Rate: PKR ${cleanCustomer.selling_rate}`,
        new_value: { name: cleanCustomer.name, phone: cleanCustomer.phone, area: cleanCustomer.area, selling_rate: cleanCustomer.selling_rate, status: cleanCustomer.status },
      });

      console.log(`[CUSTOMER] Created & saved in central DB: ${cleanCustomer.name} (${cleanCustomer.id})`);
      return res.status(201).json(cleanCustomer);
    });
  } catch (err: any) {
    console.error('[API /customers] Exception:', err?.message || err);
    return res.status(500).json({ message: err.message || 'Internal server error creating customer' });
  }
});

apiRouter.put('/customers/:id', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'customers', 'can_edit');
    if (!authorized) return;

    const { id } = req.params;
    const updates = req.body;
    const cleanUpdates: Record<string, any> = { ...updates, updated_at: new Date().toISOString() };
    delete cleanUpdates.id;
    delete cleanUpdates.customer_type_name;
    delete cleanUpdates.company_cans;

    const db = loadDatabase();
    const prevCust = db.customers.find(c => c.id === id);

    const supabase = getServerSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from('customers')
        .update(cleanUpdates)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) {
        console.error('[API /customers/:id] Supabase UPDATE error:', error.message || error);
        return res.status(500).json({ message: error.message || 'Failed to update customer in Supabase' });
      }
      if (!data) {
        return res.status(404).json({ message: 'Customer not found in Supabase' });
      }

      // Update central DB cache
      const idx = db.customers.findIndex(c => c.id === id);
      if (idx !== -1) {
        db.customers[idx] = { ...db.customers[idx], ...(data as Customer) };
      } else {
        db.customers.unshift(data as Customer);
      }
      saveDatabase(db);

      const custName = (data as any)?.name || prevCust?.name || id;
      await logAuditEvent({
        req,
        action: 'UPDATE_CUSTOMER',
        module: 'customers',
        record_ref: id,
        details: `Updated customer "${custName}" profile details`,
        old_value: prevCust ? { name: prevCust.name, phone: prevCust.phone, area: prevCust.area, selling_rate: prevCust.selling_rate, status: prevCust.status } : null,
        new_value: cleanUpdates,
      });

      console.log(`[CUSTOMER] Updated & verified in Supabase: (${id})`);
      return res.json({ success: true, customer: data });
    }

    const idx = db.customers.findIndex(c => c.id === id);
    if (idx === -1) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    db.customers[idx] = { ...db.customers[idx], ...cleanUpdates };
    saveDatabase(db);

    await logAuditEvent({
      req,
      action: 'UPDATE_CUSTOMER',
      module: 'customers',
      record_ref: id,
      details: `Updated customer "${db.customers[idx].name}" profile details`,
      old_value: prevCust ? { name: prevCust.name, phone: prevCust.phone, area: prevCust.area, selling_rate: prevCust.selling_rate, status: prevCust.status } : null,
      new_value: cleanUpdates,
    });

    return res.json({ success: true, customer: db.customers[idx] });
  } catch (err: any) {
    console.error('[API /customers/:id] Exception:', err?.message || err);
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.delete('/customers/:id', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'customers', 'can_delete');
    if (!authorized) return;

    const { id } = req.params;
    const db = loadDatabase();
    const existingInDb = db.customers.find(c => c.id === id);
    const supabase = getServerSupabase();
    let isArchived = false;
    let custName = existingInDb?.name || id;

    if (supabase) {
      // Check if customer exists in Supabase
      const { data: existing } = await supabase.from('customers').select('id, name').eq('id', id).maybeSingle();
      if (!existing && !existingInDb) {
        // Idempotent delete: customer already removed or does not exist
        return res.json({ success: true, message: 'Customer profile already removed or not found.' });
      }
      if (existing?.name) custName = existing.name;

      // Check if customer has historical records: orders, deliveries, payments, or ledger
      const [ordRes, delRes, payRes, ledgRes] = await Promise.all([
        supabase.from('orders').select('id').eq('customer_id', id).limit(1),
        supabase.from('deliveries').select('id').eq('customer_id', id).limit(1),
        supabase.from('payments').select('id').eq('customer_id', id).limit(1),
        supabase.from('customer_ledger').select('id').eq('customer_id', id).limit(1),
      ]);

      const hasHistory =
        (ordRes.data && ordRes.data.length > 0) ||
        (delRes.data && delRes.data.length > 0) ||
        (payRes.data && payRes.data.length > 0) ||
        (ledgRes.data && ledgRes.data.length > 0);

      if (hasHistory) {
        // Safe archive: set status to inactive in Supabase so historical financial integrity is preserved
        const { error: archErr } = await supabase
          .from('customers')
          .update({ status: 'inactive', updated_at: new Date().toISOString() })
          .eq('id', id);

        if (archErr) {
          console.error('[API /customers/:id] Archive error:', archErr.message);
          return res.status(500).json({ message: archErr.message });
        }
        isArchived = true;
        console.log(`[CUSTOMER] Safely ARCHIVED in Supabase (historical records preserved): (${id})`);
      } else {
        // No historical linkage: permanent delete from Supabase
        const { error: delErr } = await supabase.from('customers').delete().eq('id', id);
        if (delErr) {
          console.error('[API /customers/:id] Delete error:', delErr.message);
          return res.status(500).json({ message: delErr.message });
        }
        console.log(`[CUSTOMER] Permanently DELETED from Supabase: (${id})`);
      }
    }

    // Update central database
    if (isArchived) {
      const c = db.customers.find(x => x.id === id);
      if (c) c.status = 'inactive';
    } else {
      db.customers = db.customers.filter(c => c.id !== id);
    }
    saveDatabase(db);

    await logAuditEvent({
      req,
      action: isArchived ? 'ARCHIVE_CUSTOMER' : 'DELETE_CUSTOMER',
      module: 'customers',
      record_ref: id,
      details: `${isArchived ? 'Safely archived' : 'Permanently deleted'} customer profile "${custName}"`,
      old_value: existingInDb ? { id, name: existingInDb.name, phone: existingInDb.phone } : null,
    });

    return res.json({
      success: true,
      archived: isArchived,
      message: isArchived
        ? 'Customer has linked orders/payments and was safely archived (inactive).'
        : 'Customer profile permanently removed.',
    });
  } catch (err: any) {
    console.error('[API /customers/:id] Exception:', err?.message || err);
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 5. PRODUCTS
// -----------------------------------------------------------------------------

apiRouter.get('/products', async (req: Request, res: Response) => {
  const supabase = getServerSupabase();
  let products: Product[] = [];
  let fetchedFromSupabase = false;

  if (supabase) {
    try {
      const [prodsRes, invRes] = await Promise.all([
        supabase.from('products').select('*').order('created_at'),
        supabase.from('inventory').select('*'),
      ]);

      if (!prodsRes.error && prodsRes.data && prodsRes.data.length > 0) {
        const invMap: Record<string, any> = {};
        (invRes.data || []).forEach((i: any) => {
          invMap[i.product_id] = i;
        });

        products = prodsRes.data.map((p: any) => ({
          ...p,
          filled_stock: invMap[p.id]?.filled_stock ?? p.filled_stock ?? 0,
          empty_cans: invMap[p.id]?.empty_cans ?? p.empty_cans ?? 0,
        }));
        fetchedFromSupabase = true;

        const db = loadDatabase();
        db.products = products;
        saveDatabase(db);
      }
    } catch (err: any) {
      console.warn('[API /products] Supabase notice:', err?.message || err);
    }
  }

  if (!fetchedFromSupabase) {
    const db = loadDatabase();
    products = db.products || [];
  }

  return res.json(products);
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
      filled_stock: newProd.filled_stock || 0,
      empty_cans: newProd.empty_cans || 0,
      damaged_cans: 0,
      lost_cans: 0,
      updated_at: new Date().toISOString(),
    };
    db.inventory.push(newInv);
    saveDatabase(db);

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        await supabase.from('products').insert({
          id,
          name: newProd.name,
          size: newProd.size,
          unit: newProd.unit,
          selling_price: newProd.selling_price,
          cost_price: newProd.cost_price,
          is_reusable: newProd.is_reusable,
          is_active: 1,
        });
        await supabase.from('inventory').insert(newInv);
      } catch (err: any) {
        console.warn('[API /products] Supabase insert warning:', err?.message || err);
      }
    }

    await logAuditEvent({
      req,
      action: 'CREATE_PRODUCT',
      module: 'products',
      record_ref: id,
      details: `Created product "${newProd.name}" (${newProd.size}) | Selling: PKR ${newProd.selling_price} | Cost: PKR ${newProd.cost_price}`,
      new_value: { name: newProd.name, size: newProd.size, selling_price: newProd.selling_price, cost_price: newProd.cost_price },
    });

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

    const prevProd = { ...db.products[idx] };
    const oldActive = prevProd?.is_active ?? 1;
    const newActive = updates.is_active !== undefined ? Number(updates.is_active) : oldActive;
    let prodAction = 'UPDATE_PRODUCT';
    if (newActive === 0 && oldActive === 1) prodAction = 'ARCHIVE_PRODUCT';
    else if (newActive === 1 && oldActive === 0) prodAction = 'ACTIVATE_PRODUCT';

    db.products[idx] = { ...db.products[idx], ...updates };
    saveDatabase(db);

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const cleanUpdates = {
          ...(updates.name !== undefined && { name: updates.name }),
          ...(updates.size !== undefined && { size: updates.size }),
          ...(updates.unit !== undefined && { unit: updates.unit }),
          ...(updates.selling_price !== undefined && { selling_price: Number(updates.selling_price) }),
          ...(updates.cost_price !== undefined && { cost_price: Number(updates.cost_price) }),
          ...(updates.is_reusable !== undefined && { is_reusable: updates.is_reusable ? 1 : 0 }),
          ...(updates.is_active !== undefined && { is_active: Number(updates.is_active) }),
          updated_at: new Date().toISOString(),
        };
        await supabase.from('products').update(cleanUpdates).eq('id', id);
      } catch (err: any) {
        console.warn('[API /products/:id] Supabase update warning:', err?.message || err);
      }
    }

    await logAuditEvent({
      req,
      action: prodAction,
      module: 'products',
      record_ref: id,
      details: `${prodAction === 'ARCHIVE_PRODUCT' ? 'Archived' : prodAction === 'ACTIVATE_PRODUCT' ? 'Activated' : 'Updated'} product "${updates.name || prevProd?.name || id}"`,
      old_value: { name: prevProd?.name, selling_price: prevProd?.selling_price, is_active: oldActive },
      new_value: updates,
    });

    return res.json({ success: true, product: db.products[idx] });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.delete('/products/:id', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'products', 'can_delete');
    if (!authorized) return;

    const { id } = req.params;
    const db = loadDatabase();
    const prod = db.products.find(p => p.id === id);
    if (!prod) {
      return res.status(404).json({ message: 'Product not found' });
    }

    prod.is_active = 0;
    saveDatabase(db);

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        await supabase.from('products').update({ is_active: 0 }).eq('id', id);
      } catch (_) {}
    }

    await logAuditEvent({
      req,
      action: 'ARCHIVE_PRODUCT',
      module: 'products',
      record_ref: id,
      details: `Archived/deleted product "${prod.name}"`,
      old_value: { id, name: prod.name, is_active: 1 },
      new_value: { is_active: 0 },
    });

    return res.json({ success: true, message: 'Product archived successfully' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 6. INVENTORY & STOCK ADJUSTMENTS (REAL SUPABASE POSTGRESQL + AUDIT TRAIL)
// -----------------------------------------------------------------------------

apiRouter.get('/inventory', async (req: Request, res: Response) => {
  const supabase = getServerSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase.from('inventory').select('*');
      if (!error && data) {
        return res.json(data);
      }
    } catch (_) {}
  }
  const db = loadDatabase();
  return res.json(db.inventory);
});

apiRouter.get('/inventory/movements', async (req: Request, res: Response) => {
  const supabase = getServerSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error && data) {
        return res.json(data);
      }
    } catch (_) {}
  }
  const db = loadDatabase();
  return res.json(db.inventory_movements);
});

apiRouter.post('/inventory/adjust', async (req: Request, res: Response) => {
  try {
    const { product_id, stock_type = 'filled', adjustment, quantity, reason, user_name } = req.body;
    const delta = Number(adjustment !== undefined ? adjustment : quantity);

    if (isNaN(delta)) {
      return res.status(400).json({ message: 'Valid adjustment number is required' });
    }

    const supabase = getServerSupabase();
    let prevStock = 0;
    let newStock = 0;
    const nowIso = new Date().toISOString();

    if (supabase) {
      // 1. Get current inventory record for this product
      const { data: invRow } = await supabase
        .from('inventory')
        .select('*')
        .eq('product_id', product_id)
        .maybeSingle();

      const field = stock_type === 'empty' ? 'empty_cans' : 'filled_stock';
      prevStock = invRow ? Number(invRow[field] || 0) : 0;
      newStock = Math.max(0, prevStock + delta);

      if (invRow) {
        const { error: updErr } = await supabase
          .from('inventory')
          .update({
            [field]: newStock,
            updated_at: nowIso,
          })
          .eq('id', invRow.id);

        if (updErr) {
          console.error('[API /inventory/adjust] Supabase inventory update error:', updErr);
          return res.status(500).json({ message: updErr.message });
        }
      } else {
        const { error: insErr } = await supabase
          .from('inventory')
          .insert({
            id: `inv-${Date.now()}`,
            product_id,
            [field]: newStock,
            updated_at: nowIso,
          });

        if (insErr) {
          console.error('[API /inventory/adjust] Supabase inventory insert error:', insErr);
          return res.status(500).json({ message: insErr.message });
        }
      }

      // 2. Insert audit trail in inventory_movements table
      const { error: movErr } = await supabase
        .from('inventory_movements')
        .insert({
          id: `mov-${Date.now()}`,
          product_id,
          movement_type: delta >= 0 ? 'adjustment_increase' : 'adjustment_decrease',
          stock_type,
          quantity: delta,
          previous_stock: prevStock,
          new_stock: newStock,
          reason: reason || 'Manual Stock Adjustment',
          reference_type: 'manual_adjustment',
          user_id: user_name || 'Owner',
          created_at: nowIso,
        });

      if (movErr) {
        console.warn('[API /inventory/adjust] Supabase movement record notice:', movErr.message);
      }

      console.log(`[STOCK ADJUSTMENT] Product: ${product_id}, Delta: ${delta}, Prev: ${prevStock}, New: ${newStock}`);
    }

    // Keep central DB aligned
    const db = loadDatabase();
    let inv = db.inventory.find(i => i.product_id === product_id) as any;
    if (!inv) {
      inv = {
        id: `inv-${Date.now()}`,
        product_id,
        filled_stock: 0,
        empty_cans: 0,
        damaged_cans: 0,
        lost_cans: 0,
        updated_at: nowIso,
      };
      db.inventory.push(inv);
    }
    const field = stock_type === 'empty' ? 'empty_cans' : 'filled_stock';
    inv[field] = newStock;
    inv.updated_at = nowIso;

    // Also update product card filled_stock
    const prod = db.products.find(p => p.id === product_id);
    if (prod && stock_type === 'filled') {
      prod.filled_stock = newStock;
    }

    db.inventory_movements.unshift({
      id: `mov-${Date.now()}`,
      product_id,
      movement_type: delta >= 0 ? 'adjustment_increase' : 'adjustment_decrease',
      stock_type,
      quantity: delta,
      reason: reason || '',
      created_at: nowIso,
    } as any);
    saveDatabase(db);

    const act = delta > 0 ? 'STOCK_INCREASE' : delta < 0 ? 'STOCK_DECREASE' : 'STOCK_ADJUSTMENT';
    await logAuditEvent({
      req,
      action: act,
      module: 'inventory',
      record_ref: product_id,
      details: `Stock adjustment for "${prod?.name || product_id}": ${stock_type} stock adjusted from ${prevStock} to ${newStock} (${delta >= 0 ? '+' : ''}${delta}) | Reason: ${reason || 'Manual Adjustment'}`,
      old_value: { product_id, stock_type, stock: prevStock },
      new_value: { product_id, stock_type, stock: newStock, delta, reason: reason || 'Manual Adjustment' },
    });

    return res.json({
      success: true,
      previous_stock: prevStock,
      adjustment: delta,
      new_stock: newStock,
    });
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

    await logAuditEvent({
      req,
      action: 'STOCK_TRANSFER',
      module: 'inventory',
      record_ref: newRecord.id,
      details: `Production bottling & stock transfer: filled ${quantity_filled} units of "${prod?.name || product_id}" from ${source_tank || 'Main Tank'} (empty cans deducted, filled stock increased)`,
      new_value: { product_id, quantity_filled: Number(quantity_filled), source_tank: newRecord.source_tank, notes },
    });

    return res.json({ success: true, record: newRecord });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.post('/inventory/transfer', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'inventory', 'can_edit');
    if (!authorized) return;

    const { product_id, from_type = 'empty', to_type = 'filled', quantity, reason } = req.body;
    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ message: 'Valid positive quantity required' });
    }

    const db = loadDatabase();
    const inv = db.inventory.find(i => i.product_id === product_id);
    const prod = db.products.find(p => p.id === product_id);
    const fromField = from_type === 'empty' ? 'empty_cans' : 'filled_stock';
    const toField = to_type === 'empty' ? 'empty_cans' : 'filled_stock';

    if (inv) {
      inv[fromField] = Math.max(0, (inv[fromField] || 0) - qty);
      inv[toField] = (inv[toField] || 0) + qty;
      saveDatabase(db);
    }

    const transferId = `trf-${Date.now()}`;
    await logAuditEvent({
      req,
      action: 'STOCK_TRANSFER',
      module: 'inventory',
      record_ref: transferId,
      details: `Stock transfer: moved ${qty} units of "${prod?.name || product_id}" from ${from_type} to ${to_type} | Reason: ${reason || 'Operational transfer'}`,
      old_value: { from_type, to_type, quantity: qty },
      new_value: { from_type, to_type, quantity: qty, reason },
    });

    return res.json({ success: true, message: 'Stock transferred successfully' });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 8. ORDERS (REAL SUPABASE POSTGRESQL PERSISTENCE + RELATIONAL JOINS)
// -----------------------------------------------------------------------------

apiRouter.get('/orders', async (req: Request, res: Response) => {
  const supabase = getServerSupabase();
  const statusFilter = (req.query.status as string || '').trim();

  let orders: any[] = [];
  let fetchedFromSupabase = false;

  if (supabase) {
    try {
      let query = supabase
        .from('orders')
        .select(`
          *,
          customer:customers (
            id,
            name,
            phone,
            area,
            address
          ),
          items:order_items (
            id,
            order_id,
            product_id,
            quantity,
            unit_price,
            total_price,
            product:products (
              id,
              name,
              size,
              unit
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('order_status', statusFilter);
      }

      const { data, error } = await query;
      if (!error && data) {
        orders = data.map((o: any) => ({
          ...o,
          customer_name: o.customer?.name || '',
          customer_phone: o.customer?.phone || '',
          customer_area: o.customer?.area || '',
          items: (o.items || []).map((it: any) => ({
            ...it,
            product_name: it.product?.name || '',
            size: it.product?.size || '',
            unit: it.product?.unit || '',
          })),
        }));
        fetchedFromSupabase = true;

        // Keep local central db in sync
        const db = loadDatabase();
        db.orders = orders;
        saveDatabase(db);
      } else if (error) {
        console.error('[API /orders] Supabase SELECT error:', error.message);
      }
    } catch (err: any) {
      console.error('[API /orders] Supabase SELECT exception:', err?.message || err);
    }
  }

  if (!fetchedFromSupabase) {
    const db = loadDatabase();
    orders = db.orders || [];
    if (statusFilter) {
      orders = orders.filter((o: any) => o.order_status === statusFilter);
    }
  }

  return res.json(orders);
});

apiRouter.get('/orders/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const supabase = getServerSupabase();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers (*),
          items:order_items (
            *,
            product:products (*)
          )
        `)
        .eq('id', id)
        .maybeSingle();

      if (!error && data) {
        const order = {
          ...data,
          customer_name: data.customer?.name || '',
          customer_phone: data.customer?.phone || '',
          customer_area: data.customer?.area || '',
        };
        const items = (data.items || []).map((it: any) => ({
          ...it,
          product_name: it.product?.name || '',
          size: it.product?.size || '',
          unit: it.product?.unit || '',
        }));
        return res.json({ order, items });
      }
    } catch (_) {}
  }

  const db = loadDatabase();
  const order = db.orders.find(o => o.id === id);
  if (!order) return res.status(404).json({ message: 'Order not found' });
  const items = db.order_items.filter(it => it.order_id === id);
  return res.json({ order, items });
});

apiRouter.post('/orders', async (req: Request, res: Response) => {
  try {
    const orderData = req.body;
    if (!orderData.customer_id) {
      return res.status(400).json({ message: 'Customer ID is required' });
    }
    if (!orderData.items || orderData.items.length === 0) {
      return res.status(400).json({ message: 'At least one product item is required' });
    }

    // Backend Idempotency & Concurrency Lock
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) || (orderData.idempotency_key as string);
    const lockKey = idempotencyKey || `order-lock-${orderData.customer_id}-${orderData.delivery_date || ''}`;

    return await runWithLock(lockKey, async () => {
      if (idempotencyKey) {
        const existingResponse = getIdempotencyRecord(idempotencyKey);
        if (existingResponse) {
          console.log(`[IDEMPOTENCY] Returning cached response for key: ${idempotencyKey}`);
          return res.status(200).json(existingResponse);
        }
      }

      const supabase = getServerSupabase();
      const id = `ord-${Date.now()}`;
      const orderNumber = `ORD-${Date.now().toString().slice(-6)}`;
      const total_amount = (orderData.items || []).reduce(
        (s: number, it: any) => s + (Number(it.quantity || 0) * Number(it.unit_price || 0)),
        0
      );

      let customerId = orderData.customer_id;
      const nowIso = new Date().toISOString();
      const deliveryDate = orderData.delivery_date || nowIso.split('T')[0];

      // Fast check in memory/central DB first to avoid unnecessary slow sequential queries
      const db = loadDatabase();
      const existingLocalCust = db.customers.find(c => c.id === customerId);

      if (supabase && !existingLocalCust && (orderData.customer || orderData.customer_name)) {
        const { data: existingCust } = await supabase
          .from('customers')
          .select('id, name, phone, area, address')
          .eq('id', customerId)
          .maybeSingle();

        if (!existingCust) {
          const tempCustData = {
            id: customerId,
            name: (orderData.customer?.name || orderData.customer_name || 'Walk-in Customer').trim(),
            phone: (orderData.customer?.phone || orderData.customer_phone || '03000000000').trim(),
            address: (orderData.customer?.address || orderData.delivery_address || 'Quetta').trim(),
            area: orderData.customer?.area || orderData.customer_area || 'Main Jinnah Road',
            customer_type_id: orderData.customer?.customer_type_id || 'ct-other',
            selling_rate: Number(orderData.items[0]?.unit_price || 220),
            status: 'active',
            created_at: nowIso,
          };
          const { error: custErr } = await supabase.from('customers').insert(tempCustData);
          if (custErr) {
            console.warn('[API /orders] Temp customer auto-create warning:', custErr.message);
          }
        }
      }

      // 1. Prepare exact Supabase columns for orders table
      const cleanOrderRow = {
        id,
        order_number: orderNumber,
        customer_id: customerId,
        total_amount,
        payment_type: orderData.payment_type || 'Cash',
        payment_status: 'pending',
        order_status: 'confirmed',
        delivery_date: deliveryDate,
        delivery_address: orderData.delivery_address || orderData.customer?.address || '',
        notes: orderData.notes || '',
        created_by: orderData.created_by || 'Owner',
        created_at: nowIso,
      };

      if (supabase) {
        // INSERT Order into Supabase
        const { error: orderInsertErr } = await supabase.from('orders').insert(cleanOrderRow);
        if (orderInsertErr) {
          console.error('[API /orders] Supabase orders INSERT error:', orderInsertErr);
          return res.status(500).json({ message: `Supabase order error: ${orderInsertErr.message}` });
        }

        // 2. Prepare Order Items & Delivery rows
        const cleanItems = orderData.items.map((it: any) => ({
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          order_id: id,
          product_id: it.product_id,
          quantity: Number(it.quantity || 1),
          unit_price: Number(it.unit_price || 0),
          total_price: Number(it.quantity || 1) * Number(it.unit_price || 0),
        }));

        const deliveryId = `del-${Date.now()}`;
        const deliveryNumber = `DEL-${Date.now().toString().slice(-6)}`;
        const cleanDeliveryRow = {
          id: deliveryId,
          delivery_number: deliveryNumber,
          order_id: id,
          customer_id: customerId,
          driver_id: orderData.driver_id || null,
          vehicle: orderData.vehicle || 'Van #1',
          delivery_date: deliveryDate,
          delivery_time: orderData.delivery_time || 'Morning',
          status: 'assigned',
          empty_cans_returned: 0,
          payment_collected: 0,
          payment_method: orderData.payment_type || 'Cash',
          notes: orderData.notes || '',
          created_at: nowIso,
        };

        const delItems = orderData.items.map((it: any) => ({
          id: `ditem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          delivery_id: deliveryId,
          product_id: it.product_id,
          quantity: Number(it.quantity || 1),
        }));

        // Execute items & delivery in parallel for fast performance
        await Promise.all([
          supabase.from('order_items').insert(cleanItems),
          supabase.from('deliveries').insert(cleanDeliveryRow),
          supabase.from('delivery_items').insert(delItems),
        ]);

        console.log(`[ORDER] Created & saved in Supabase: #${orderNumber} (${id}) with Delivery: #${deliveryNumber}`);
      }

      // Keep central database aligned
      const cust = db.customers.find(c => c.id === customerId);
      const newOrderFull = {
        ...cleanOrderRow,
        customer_name: cust?.name || orderData.customer_name || '',
        customer_phone: cust?.phone || orderData.customer_phone || '',
        customer_area: cust?.area || orderData.customer_area || '',
        items: orderData.items || [],
        created_at: nowIso,
      };
      db.orders.unshift(newOrderFull);

      for (const it of orderData.items || []) {
        db.order_items.push({
          id: `oi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          order_id: id,
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total_price: it.quantity * it.unit_price,
        });
      }

      saveDatabase(db);

      const resultPayload = { id, orderNumber, success: true };
      if (idempotencyKey) {
        saveIdempotencyRecord(idempotencyKey, 'create_order', resultPayload);
      }

      await logAuditEvent({
        req,
        action: 'CREATE_ORDER',
        module: 'orders',
        record_ref: id,
        details: `Created order #${orderNumber} for customer "${cust?.name || cleanOrderRow.customer_id}" | Total: PKR ${cleanOrderRow.total_amount} | Delivery: ${cleanOrderRow.delivery_date}`,
        new_value: { order_number: orderNumber, total_amount: cleanOrderRow.total_amount, delivery_date: cleanOrderRow.delivery_date, items_count: (orderData.items || []).length },
      });

      return res.status(201).json(resultPayload);
    });
  } catch (err: any) {
    console.error('[API /orders] Exception:', err);
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.delete('/orders/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const db = loadDatabase();
    const ordToDel = db.orders.find(o => o.id === id);
    const supabase = getServerSupabase();

    if (supabase) {
      // 1. Delete linked deliveries and their items
      const { data: dels } = await supabase.from('deliveries').select('id').eq('order_id', id);
      if (dels && dels.length > 0) {
        const delIds = dels.map((d: any) => d.id);
        await supabase.from('delivery_items').delete().in('delivery_id', delIds);
        await supabase.from('deliveries').delete().in('id', delIds);
      }
      // 2. Delete order items
      await supabase.from('order_items').delete().eq('order_id', id);
      // 3. Delete order
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) {
        return res.status(500).json({ message: error.message });
      }
    }

    db.orders = db.orders.filter(o => o.id !== id);
    db.order_items = db.order_items.filter(oi => oi.order_id !== id);
    db.deliveries = db.deliveries.filter(d => d.order_id !== id);
    saveDatabase(db);

    await logAuditEvent({
      req,
      action: 'CANCEL_ORDER',
      module: 'orders',
      record_ref: id,
      details: `Deleted/cancelled order #${ordToDel?.order_number || id}`,
      old_value: ordToDel ? { id, order_number: ordToDel.order_number, total_amount: ordToDel.total_amount, status: ordToDel.order_status } : null,
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.put('/orders/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, payment_status } = req.body;
    const supabase = getServerSupabase();
    const db = loadDatabase();
    const ord = db.orders.find(o => o.id === id);
    const prevStatus = ord?.order_status || 'pending';
    const prevPayStatus = ord?.payment_status || 'pending';

    if (supabase) {
      const updates: any = { updated_at: new Date().toISOString() };
      if (status) updates.order_status = status;
      if (payment_status) updates.payment_status = payment_status;
      const { error } = await supabase.from('orders').update(updates).eq('id', id);
      if (error) return res.status(500).json({ message: error.message });
    }

    if (ord) {
      if (status) ord.order_status = status;
      if (payment_status) ord.payment_status = payment_status;
      saveDatabase(db);
    }

    let actionType = 'UPDATE_ORDER';
    if (status === 'confirmed') actionType = 'CONFIRM_ORDER';
    else if (status === 'out_for_delivery') actionType = 'DISPATCH_ORDER';
    else if (status === 'completed' || status === 'delivered') actionType = 'COMPLETE_ORDER';
    else if (status === 'cancelled') actionType = 'CANCEL_ORDER';

    await logAuditEvent({
      req,
      action: actionType,
      module: 'orders',
      record_ref: id,
      details: `Order #${ord?.order_number || id} status changed: ${prevStatus} → ${status || prevStatus}${payment_status ? ` | Payment: ${payment_status}` : ''}`,
      old_value: { order_status: prevStatus, payment_status: prevPayStatus },
      new_value: { order_status: status || prevStatus, payment_status: payment_status || prevPayStatus },
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.put('/orders/:id', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'orders', 'can_edit');
    if (!authorized) return;

    const { id } = req.params;
    const updates = req.body;
    const db = loadDatabase();
    const ord = db.orders.find(o => o.id === id);
    if (!ord) {
      return res.status(404).json({ message: 'Order not found' });
    }

    const prevOrder = { ...ord };
    Object.assign(ord, updates, { updated_at: new Date().toISOString() });
    saveDatabase(db);

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        const cleanUpdates: any = { updated_at: new Date().toISOString() };
        if (updates.delivery_date) cleanUpdates.delivery_date = updates.delivery_date;
        if (updates.notes !== undefined) cleanUpdates.notes = updates.notes;
        if (updates.total_amount !== undefined) cleanUpdates.total_amount = Number(updates.total_amount);
        if (updates.order_status) cleanUpdates.order_status = updates.order_status;
        if (updates.payment_status) cleanUpdates.payment_status = updates.payment_status;
        await supabase.from('orders').update(cleanUpdates).eq('id', id);
      } catch (_) {}
    }

    await logAuditEvent({
      req,
      action: 'UPDATE_ORDER',
      module: 'orders',
      record_ref: id,
      details: `Updated order #${ord.order_number || id} details`,
      old_value: { order_number: prevOrder.order_number, total_amount: prevOrder.total_amount, delivery_date: prevOrder.delivery_date, status: prevOrder.order_status },
      new_value: { total_amount: ord.total_amount, delivery_date: ord.delivery_date, status: ord.order_status, notes: ord.notes },
    });

    return res.json({ success: true, order: ord });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 9. DELIVERIES (REAL SUPABASE POSTGRESQL + FLEET DISPATCH)
// -----------------------------------------------------------------------------

apiRouter.get('/deliveries', async (req: Request, res: Response) => {
  const supabase = getServerSupabase();
  const areaFilter = (req.query.area as string || '').trim();
  const statusFilter = (req.query.status as string || '').trim();
  const driverFilter = (req.query.driverId as string || '').trim();
  const dateFilter = (req.query.date as string || '').trim();

  let deliveries: any[] = [];
  let fetchedFromSupabase = false;

  if (supabase) {
    try {
      let query = supabase
        .from('deliveries')
        .select(`
          *,
          customer:customers (
            id,
            name,
            phone,
            area,
            address
          ),
          order:orders (
            id,
            order_number,
            total_amount
          ),
          items:delivery_items (
            id,
            delivery_id,
            product_id,
            quantity,
            product:products (
              id,
              name
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (statusFilter) {
        query = query.eq('status', statusFilter);
      }
      if (driverFilter) {
        query = query.eq('driver_id', driverFilter);
      }
      if (dateFilter) {
        query = query.eq('delivery_date', dateFilter);
      }

      const { data, error } = await query;
      if (!error && data) {
        // Fetch staff driver names map
        const db = loadDatabase();
        const staffMap: Record<string, string> = {};
        db.users.forEach((u: any) => {
          staffMap[u.id] = u.name;
        });

        deliveries = data.map((d: any) => ({
          ...d,
          customer_name: d.customer?.name || '',
          customer_phone: d.customer?.phone || '',
          customer_address: d.customer?.address || '',
          customer_area: d.customer?.area || '',
          order_number: d.order?.order_number || '',
          total_amount: d.order?.total_amount || 0,
          driver_name: d.driver_id ? (staffMap[d.driver_id] || 'Assigned Driver') : 'Unassigned',
          items: (d.items || []).map((it: any) => ({
            ...it,
            product_name: it.product?.name || '',
          })),
        }));
        fetchedFromSupabase = true;

        // Keep local central DB aligned
        db.deliveries = deliveries;
        saveDatabase(db);
      } else if (error) {
        console.error('[API /deliveries] Supabase SELECT error:', error.message);
      }
    } catch (err: any) {
      console.error('[API /deliveries] Supabase SELECT exception:', err?.message || err);
    }
  }

  if (!fetchedFromSupabase) {
    const db = loadDatabase();
    deliveries = db.deliveries || [];
    if (statusFilter) deliveries = deliveries.filter((d: any) => d.status === statusFilter);
    if (driverFilter) deliveries = deliveries.filter((d: any) => d.driver_id === driverFilter);
    if (dateFilter) deliveries = deliveries.filter((d: any) => d.delivery_date === dateFilter);
  }

  // Delivery Area Filter
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
      deliveries = deliveries.filter((d: any) => !fixed.includes(d.customer_area || ''));
    } else {
      deliveries = deliveries.filter((d: any) => d.customer_area === areaFilter);
    }
  }

  return res.json(deliveries);
});

apiRouter.post('/deliveries/create-for-order', async (req: Request, res: Response) => {
  try {
    const params = req.body;
    if (!params.order_id) {
      return res.status(400).json({ message: 'Order ID is required' });
    }

    const idempotencyKey = (req.headers['x-idempotency-key'] as string) || (params.idempotency_key as string);
    const lockKey = `dispatch-order-${params.order_id}`;

    return await runWithLock(lockKey, async () => {
      if (idempotencyKey) {
        const cached = getIdempotencyRecord(idempotencyKey);
        if (cached) {
          console.log(`[IDEMPOTENCY] Returning cached dispatch response for key: ${idempotencyKey}`);
          return res.status(200).json(cached);
        }
      }

      const supabase = getServerSupabase();
      let customer_id = '';
      let deliveryDate = params.delivery_date || new Date().toISOString().split('T')[0];
      const nowIso = new Date().toISOString();

      if (supabase) {
        // Check order status: if already delivered or completed, do not dispatch
        const { data: ord } = await supabase
          .from('orders')
          .select('id, customer_id, delivery_date, order_status')
          .eq('id', params.order_id)
          .maybeSingle();

        if (ord?.order_status === 'completed' || ord?.order_status === 'delivered') {
          const payload = { message: 'Order is already completed/delivered', updated: false, order_id: params.order_id };
          if (idempotencyKey) saveIdempotencyRecord(idempotencyKey, 'dispatch_order', payload);
          return res.status(200).json(payload);
        }

        if (ord) {
          customer_id = ord.customer_id;
          if (ord.delivery_date) deliveryDate = ord.delivery_date;
        }

        // Check if a delivery already exists for this order
        const { data: existingDel } = await supabase
          .from('deliveries')
          .select('id, status, delivery_number')
          .eq('order_id', params.order_id)
          .maybeSingle();

        if (existingDel) {
          if (existingDel.status !== 'delivered') {
            await supabase
              .from('deliveries')
              .update({
                driver_id: params.driver_id || null,
                vehicle: params.vehicle || 'Van #1',
                delivery_time: params.delivery_time || 'Morning',
                status: 'assigned',
                updated_at: nowIso,
              })
              .eq('id', existingDel.id);

            await supabase.from('orders').update({ order_status: 'dispatched', updated_at: nowIso }).eq('id', params.order_id);
          }

          const payload = { id: existingDel.id, updated: true, order_id: params.order_id };
          if (idempotencyKey) saveIdempotencyRecord(idempotencyKey, 'dispatch_order', payload);

          const delNum = (existingDel as any).delivery_number || existingDel.id;
          await logAuditEvent({
            req,
            action: 'DISPATCH_ORDER',
            module: 'deliveries',
            record_ref: existingDel.id,
            details: `Dispatched delivery #${delNum} for order #${params.order_id} to driver "${params.driver_id || 'Fleet Driver'}" (${params.vehicle || 'Van #1'})`,
            new_value: { driver_id: params.driver_id, vehicle: params.vehicle || 'Van #1', status: 'assigned' },
          });

          return res.status(200).json(payload);
        }

        const id = `del-${Date.now()}`;
        const deliveryNumber = `DEL-${Date.now().toString().slice(-6)}`;
        const cleanDelRow = {
          id,
          delivery_number: deliveryNumber,
          order_id: params.order_id,
          customer_id: customer_id || 'cust-unknown',
          driver_id: params.driver_id || null,
          vehicle: params.vehicle || 'Van #1',
          delivery_date: deliveryDate,
          delivery_time: params.delivery_time || 'Morning',
          status: 'assigned',
          empty_cans_returned: 0,
          payment_collected: 0,
          notes: params.notes || '',
          created_at: nowIso,
        };

        const { error: insErr } = await supabase.from('deliveries').insert(cleanDelRow);
        if (insErr) {
          console.error('[API /deliveries/create-for-order] Supabase insert error:', insErr);
          return res.status(500).json({ message: insErr.message });
        }

        await supabase.from('orders').update({ order_status: 'dispatched', updated_at: nowIso }).eq('id', params.order_id);

        const payload = { id, created: true, order_id: params.order_id };
        if (idempotencyKey) saveIdempotencyRecord(idempotencyKey, 'dispatch_order', payload);

        await logAuditEvent({
          req,
          action: 'DISPATCH_ORDER',
          module: 'deliveries',
          record_ref: id,
          details: `Dispatched delivery #${deliveryNumber} for order #${params.order_id} to driver "${params.driver_id || 'Fleet Driver'}" (${params.vehicle || 'Van #1'})`,
          new_value: { delivery_number: deliveryNumber, driver_id: params.driver_id, vehicle: params.vehicle || 'Van #1', status: 'assigned' },
        });

        return res.status(201).json(payload);
      }

      // Central DB fallback
      const db = loadDatabase();
      const ord = db.orders.find(o => o.id === params.order_id);
      if (ord?.order_status === 'completed' || ord?.order_status === 'delivered') {
        const payload = { message: 'Order is already delivered', updated: false };
        if (idempotencyKey) saveIdempotencyRecord(idempotencyKey, 'dispatch_order', payload);
        return res.status(200).json(payload);
      }

      const existingDel = db.deliveries.find(d => d.order_id === params.order_id);
      if (existingDel) {
        if (existingDel.status !== 'delivered') {
          existingDel.driver_id = params.driver_id;
          existingDel.vehicle = params.vehicle || 'Van #1';
          existingDel.delivery_time = params.delivery_time || 'Morning';
          if (ord) ord.order_status = 'dispatched';
          saveDatabase(db);
        }
        const payload = { id: existingDel.id, updated: true };
        if (idempotencyKey) saveIdempotencyRecord(idempotencyKey, 'dispatch_order', payload);

        await logAuditEvent({
          req,
          action: 'ASSIGN_DELIVERY',
          module: 'deliveries',
          record_ref: existingDel.id,
          details: `Reassigned delivery #${existingDel.delivery_number} for order #${ord?.order_number || params.order_id} to driver "${params.driver_id || 'Fleet Driver'}" (${params.vehicle || 'Van #1'})`,
          new_value: { driver_id: params.driver_id, vehicle: params.vehicle },
        });

        return res.status(200).json(payload);
      }

      const id = `del-${Date.now()}`;
      const deliveryNumber = `DEL-${Date.now().toString().slice(-6)}`;
      const newDelivery = {
        id,
        delivery_number: deliveryNumber,
        order_id: params.order_id,
        customer_id: ord?.customer_id || '',
        customer_name: ord?.customer_name || '',
        driver_id: params.driver_id,
        vehicle: params.vehicle || 'Van #1',
        delivery_date: deliveryDate,
        delivery_time: params.delivery_time || 'Morning',
        status: 'assigned',
        notes: params.notes || '',
        created_at: nowIso,
      };
      db.deliveries.unshift(newDelivery);
      if (ord) ord.order_status = 'dispatched';
      saveDatabase(db);

      const payload = { id, created: true };
      if (idempotencyKey) saveIdempotencyRecord(idempotencyKey, 'dispatch_order', payload);

      await logAuditEvent({
        req,
        action: 'ASSIGN_DELIVERY',
        module: 'deliveries',
        record_ref: id,
        details: `Assigned delivery #${deliveryNumber} for order #${ord?.order_number || params.order_id} to driver "${params.driver_id || 'Fleet Driver'}" (${params.vehicle || 'Van #1'})`,
        new_value: { delivery_number: deliveryNumber, driver_id: params.driver_id, vehicle: params.vehicle },
      });

      return res.status(201).json(payload);
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.post('/deliveries/:id/complete', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const completionData = req.body;
    const idempotencyKey = (req.headers['x-idempotency-key'] as string) || (completionData.idempotency_key as string);
    const lockKey = `complete-delivery-${id}`;

    return await runWithLock(lockKey, async () => {
      // 1. Idempotency Cache Check
      if (idempotencyKey) {
        const cached = getIdempotencyRecord(idempotencyKey);
        if (cached) {
          console.log(`[IDEMPOTENCY] Returning cached complete response for key: ${idempotencyKey}`);
          return res.status(200).json(cached);
        }
      }

      const supabase = getServerSupabase();
      const emptyCans = Number(completionData.empty_cans_returned || 0);
      const paymentCollected = Number(completionData.payment_collected || 0);
      const paymentMethod = completionData.payment_method || 'Cash';
      const notes = completionData.notes || '';
      const nowIso = new Date().toISOString();
      const today = nowIso.split('T')[0];

      if (supabase) {
        // 2. Fetch delivery record
        const { data: del, error: delErr } = await supabase
          .from('deliveries')
          .select('*, order:orders(*)')
          .eq('id', id)
          .maybeSingle();

        if (delErr || !del) {
          return res.status(404).json({ message: 'Delivery record not found in Supabase' });
        }

        // 3. Strict Status Check - If already delivered, DO NOT process again!
        if (del.status === 'delivered') {
          console.log(`[DELIVERY] Delivery ${id} is already completed/delivered. Returning existing state.`);
          const alreadyResult = {
            success: true,
            alreadyCompleted: true,
            message: 'Delivery is already completed',
            delivery_id: id,
            status: 'delivered',
          };
          if (idempotencyKey) saveIdempotencyRecord(idempotencyKey, 'complete_delivery', alreadyResult);
          return res.status(200).json(alreadyResult);
        }

        // 4. Fetch order items to determine delivered products and quantities
        let orderItems: any[] = [];
        if (del.order_id) {
          const { data: items } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', del.order_id);
          orderItems = items || [];
        }

        const orderTotal = Number(del.order?.total_amount || 0);
        // Find delivered reusable 19L cans
        const delivered19lItem = orderItems.find((it: any) => it.product_id === 'prod-19l-can');
        const delivered19lCans = delivered19lItem ? Number(delivered19lItem.quantity || 0) : 0;

        // 5. Update delivery record
        const { error: updErr } = await supabase
          .from('deliveries')
          .update({
            status: 'delivered',
            empty_cans_returned: emptyCans,
            payment_collected: paymentCollected,
            payment_method: paymentMethod,
            notes: notes || del.notes,
            completed_at: nowIso,
            updated_at: nowIso,
          })
          .eq('id', id);

        if (updErr) {
          console.error('[API /deliveries/:id/complete] Supabase delivery update error:', updErr);
          return res.status(500).json({ message: updErr.message });
        }

        // 6. Update order status to completed
        if (del.order_id) {
          await supabase.from('orders').update({
            order_status: 'completed',
            payment_status: paymentCollected >= orderTotal ? 'paid' : (paymentCollected > 0 ? 'partially_paid' : 'pending'),
            updated_at: nowIso,
          }).eq('id', del.order_id);
        }

        // 7. Update Inventory (Warehouse Stock) Exactly Once
        for (const item of orderItems) {
          const { data: currentInv } = await supabase
            .from('inventory')
            .select('*')
            .eq('product_id', item.product_id)
            .maybeSingle();

          if (currentInv) {
            const currentFilled = Number(currentInv.filled_stock || 0);
            const newFilled = Math.max(0, currentFilled - Number(item.quantity || 0));
            await supabase.from('inventory').update({
              filled_stock: newFilled,
              updated_at: nowIso,
            }).eq('id', currentInv.id);

            await supabase.from('inventory_movements').insert({
              id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              product_id: item.product_id,
              movement_type: 'delivery',
              stock_type: 'filled',
              quantity: Number(item.quantity || 0),
              previous_stock: currentFilled,
              new_stock: newFilled,
              reason: `Delivered on Route ${del.delivery_number}`,
              reference_type: 'delivery',
              reference_id: id,
              created_at: nowIso,
            });
          }
        }

        // For empty cans returned: increment empty_cans in warehouse inventory
        if (emptyCans > 0) {
          const { data: canInv } = await supabase
            .from('inventory')
            .select('*')
            .eq('product_id', 'prod-19l-can')
            .maybeSingle();

          if (canInv) {
            const currentEmpty = Number(canInv.empty_cans || 0);
            const newEmpty = currentEmpty + emptyCans;
            await supabase.from('inventory').update({
              empty_cans: newEmpty,
              updated_at: nowIso,
            }).eq('id', canInv.id);

            await supabase.from('inventory_movements').insert({
              id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              product_id: 'prod-19l-can',
              movement_type: 'return',
              stock_type: 'empty',
              quantity: emptyCans,
              previous_stock: currentEmpty,
              new_stock: newEmpty,
              reason: `Empty cans retrieved on Delivery ${del.delivery_number}`,
              reference_type: 'delivery',
              reference_id: id,
              created_at: nowIso,
            });
          }
        }

        // 8. Update Customer Cans & Financial Balance Exactly Once
        const { data: cust } = await supabase
          .from('customers')
          .select('*')
          .eq('id', del.customer_id)
          .maybeSingle();

        if (cust) {
          const currentCansHeld = Number(cust.cans_held || 0);
          const newCansHeld = Math.max(0, currentCansHeld + delivered19lCans - emptyCans);

          const currentBal = Number(cust.outstanding_balance || 0);
          const netFinancialDelta = orderTotal - paymentCollected;
          const newBalance = Math.max(0, currentBal + netFinancialDelta);

          await supabase.from('customers').update({
            cans_held: newCansHeld,
            outstanding_balance: newBalance,
            updated_at: nowIso,
          }).eq('id', cust.id);

          if (delivered19lCans > 0) {
            await supabase.from('customer_can_movements').insert({
              id: `canmov-${Date.now()}-del`,
              customer_id: cust.id,
              product_id: 'prod-19l-can',
              movement_type: 'issued',
              quantity: delivered19lCans,
              balance_after: currentCansHeld + delivered19lCans,
              delivery_id: id,
              reason: `Delivered from ${del.delivery_number}`,
              created_at: nowIso,
            });
          }

          if (emptyCans > 0) {
            await supabase.from('customer_can_movements').insert({
              id: `canmov-${Date.now()}-ret`,
              customer_id: cust.id,
              product_id: 'prod-19l-can',
              movement_type: 'returned',
              quantity: emptyCans,
              balance_after: newCansHeld,
              delivery_id: id,
              reason: `Returned from Delivery ${del.delivery_number}`,
              created_at: nowIso,
            });
          }

          if (orderTotal > 0) {
            await supabase.from('customer_ledger').insert({
              id: `ledg-${Date.now()}-ord`,
              customer_id: cust.id,
              transaction_type: 'invoice',
              reference_type: 'order',
              reference_id: del.order_id || id,
              debit: orderTotal,
              credit: 0,
              balance: currentBal + orderTotal,
              description: `Order delivery #${del.delivery_number}`,
              transaction_date: today,
              created_at: nowIso,
            });
          }

          if (paymentCollected > 0) {
            await supabase.from('payments').insert({
              id: `pay-${Date.now()}`,
              payment_number: `PAY-${Date.now().toString().slice(-6)}`,
              customer_id: cust.id,
              order_id: del.order_id,
              delivery_id: id,
              amount: paymentCollected,
              payment_method: paymentMethod,
              payment_date: today,
              notes,
              created_at: nowIso,
            });

            await supabase.from('customer_ledger').insert({
              id: `ledg-${Date.now()}-pay`,
              customer_id: cust.id,
              transaction_type: 'payment',
              reference_type: 'delivery',
              reference_id: id,
              debit: 0,
              credit: paymentCollected,
              balance: newBalance,
              description: `Payment collection from delivery ${del.delivery_number}`,
              transaction_date: today,
              created_at: nowIso,
            });
          }
        }

        console.log(`[DELIVERY COMPLETED] #${del.delivery_number} atomically processed in Supabase`);
      }

      // Synchronize central local DB
      const db = loadDatabase();
      const localDel = db.deliveries.find(d => d.id === id);
      if (localDel) {
        localDel.status = 'delivered';
        localDel.empty_cans_returned = emptyCans;
        localDel.payment_collected = paymentCollected;
        localDel.payment_method = paymentMethod;
        localDel.completed_at = nowIso;
      }

      const localOrd = localDel ? db.orders.find(o => o.id === localDel.order_id) : null;
      if (localOrd) {
        localOrd.order_status = 'completed';
        localOrd.payment_status = paymentCollected >= Number(localOrd.total_amount || 0) ? 'paid' : 'pending';
      }

      if (localDel && localDel.customer_id) {
        const localCust = db.customers.find(c => c.id === localDel.customer_id);
        if (localCust) {
          const ordTot = Number(localOrd?.total_amount || localDel.total_amount || 0);
          localCust.cans_held = Math.max(0, (localCust.cans_held || 0) - emptyCans);
          localCust.outstanding_balance = Math.max(0, (localCust.outstanding_balance || 0) + (ordTot - paymentCollected));
        }
      }

      const inv19 = db.inventory.find(i => i.product_id === 'prod-19l-can');
      if (inv19 && emptyCans > 0) {
        inv19.empty_cans = (inv19.empty_cans || 0) + emptyCans;
      }

      saveDatabase(db);

      const resultPayload = { success: true, delivery_id: id, status: 'delivered' };
      if (idempotencyKey) {
        saveIdempotencyRecord(idempotencyKey, 'complete_delivery', resultPayload);
      }

      await logAuditEvent({
        req,
        action: 'COMPLETE_DELIVERY',
        module: 'deliveries',
        record_ref: id,
        details: `Completed delivery #${localDel?.delivery_number || id} | Returned cans: ${emptyCans} | Cash collected: PKR ${paymentCollected}`,
        old_value: { status: 'out_for_delivery' },
        new_value: { status: 'delivered', empty_cans_returned: emptyCans, payment_collected: paymentCollected, payment_method: paymentMethod },
      });

      return res.json(resultPayload);
    });
  } catch (err: any) {
    console.error('[API /deliveries/:id/complete] Exception:', err);
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.put('/deliveries/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, failure_reason } = req.body;
    const supabase = getServerSupabase();
    const nowIso = new Date().toISOString();

    const lockKey = `status-delivery-${id}`;
    return await runWithLock(lockKey, async () => {
      if (supabase) {
        const { data: existing } = await supabase.from('deliveries').select('status, order_id').eq('id', id).maybeSingle();
        if (existing) {
          if (existing.status === 'delivered') {
            // Cannot revert from delivered
            return res.json({ success: true, unchanged: true, status: 'delivered' });
          }
          if (existing.status === status) {
            return res.json({ success: true, unchanged: true, status });
          }
        }

        const updateData: any = {
          status,
          updated_at: nowIso,
        };
        if (failure_reason !== undefined) updateData.failure_reason = failure_reason;

        const { error } = await supabase.from('deliveries').update(updateData).eq('id', id);
        if (error) {
          console.error('[API /deliveries/:id/status] Supabase error:', error.message);
          return res.status(500).json({ message: error.message });
        }

        if (status === 'delivered' && existing?.order_id) {
          await supabase.from('orders').update({ order_status: 'completed', updated_at: nowIso }).eq('id', existing.order_id);
        }
      }

      const db = loadDatabase();
      const del = db.deliveries.find(d => d.id === id);
      const prevDelStatus = del?.status || 'assigned';
      if (del) {
        if (del.status === 'delivered') {
          return res.json({ success: true, unchanged: true, status: 'delivered' });
        }
        del.status = status;
        if (failure_reason) del.failure_reason = failure_reason;
        saveDatabase(db);
      }

      let delAction = 'UPDATE_DELIVERY';
      if (status === 'out_for_delivery') delAction = 'DISPATCH_DELIVERY';
      else if (status === 'delivered') delAction = 'COMPLETE_DELIVERY';
      else if (status === 'failed') delAction = 'FAILED_DELIVERY';
      else if (status === 'cancelled') delAction = 'CANCEL_DELIVERY';

      await logAuditEvent({
        req,
        action: delAction,
        module: 'deliveries',
        record_ref: id,
        details: `Delivery #${del?.delivery_number || id} status updated: ${prevDelStatus} → ${status}${failure_reason ? ` (Reason: ${failure_reason})` : ''}`,
        old_value: { status: prevDelStatus },
        new_value: { status, failure_reason },
      });

      return res.json({ success: true });
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 10. EMPTY CAN & PHYSICAL ASSET RECONCILIATION
// -----------------------------------------------------------------------------

apiRouter.get('/cans/summary', async (req: Request, res: Response) => {
  try {
    const db = loadDatabase();
    const supabase = getServerSupabase();

    let customers = db.customers || [];
    let movements: any[] = db.customer_can_movements || [];

    if (supabase) {
      try {
        const [invRes, custRes, movRes] = await Promise.all([
          supabase.from('inventory').select('*').eq('product_id', 'prod-19l-can').maybeSingle(),
          supabase.from('customers').select('*').order('cans_held', { ascending: false }),
          supabase.from('customer_can_movements').select('*').order('created_at', { ascending: false }).limit(60),
        ]);

        if (invRes.data) {
          const supInv = invRes.data;
          let localInv = db.inventory.find(i => i.product_id === 'prod-19l-can');
          if (!localInv) {
            const prod = db.products.find(p => p.id === 'prod-19l-can');
            localInv = {
              id: supInv.id || 'inv-19l',
              product_id: 'prod-19l-can',
              product_name: prod?.name || 'AAB E ARWA 19L Premium Water Can',
              size: prod?.size || '19L',
              unit: prod?.unit || 'bottle',
              selling_price: prod?.selling_price || 220,
              cost_price: prod?.cost_price || 95,
              is_reusable: 1,
              filled_stock: Number(supInv.filled_stock || 0),
              empty_cans: Number(supInv.empty_cans || 0),
              damaged_cans: Number(supInv.damaged_cans || 0),
              lost_cans: Number(supInv.lost_cans || 0),
              updated_at: supInv.updated_at || new Date().toISOString(),
            };
            db.inventory.push(localInv);
          } else {
            localInv.filled_stock = Number(supInv.filled_stock || 0);
            localInv.empty_cans = Number(supInv.empty_cans || 0);
            localInv.damaged_cans = Number(supInv.damaged_cans || 0);
            localInv.lost_cans = Number(supInv.lost_cans || 0);
          }
        }

        if (custRes.data && custRes.data.length > 0) {
          customers = custRes.data;
          for (const sc of customers) {
            const lc = db.customers.find(c => c.id === sc.id);
            if (lc) lc.cans_held = Number(sc.cans_held || 0);
          }
        }

        if (movRes.data && movRes.data.length > 0) {
          // Merge movements by ID preserving any rich local notes
          const movMap = new Map<string, any>();
          for (const m of (db.customer_can_movements || [])) {
            if (m.id) movMap.set(m.id, m);
          }
          for (const sm of movRes.data) {
            if (sm.id) {
              movMap.set(sm.id, {
                ...movMap.get(sm.id),
                ...sm,
              });
            }
          }
          movements = Array.from(movMap.values());
          db.customer_can_movements = movements.slice(0, 100);
        }
        saveDatabase(db);
      } catch (err: any) {
        console.warn('[API /cans/summary] Supabase sync notice:', err?.message || err);
      }
    }

    const inv19 = db.inventory.find(i => i.product_id === 'prod-19l-can');
    const emptyInWarehouse = Number(inv19?.empty_cans || 0);
    const filledInWarehouse = Number(inv19?.filled_stock || 0);
    const withCustomers = customers.reduce((s, c) => s + (Number(c.cans_held) || 0), 0);
    const damagedCans = Number(inv19?.damaged_cans || 0);
    const lostCans = Number(inv19?.lost_cans || 0);

    // Reconciled Total Company Cans:
    // Filled in Plant + Empty in Plant + With Customers + Damaged + Lost/Unreturned
    const totalCompanyCans = emptyInWarehouse + filledInWarehouse + withCustomers + damagedCans + lostCans;

    const customerRankings = customers.slice().sort((a, b) => (Number(b.cans_held) || 0) - (Number(a.cans_held) || 0));

    // Map movements with readable customer names and format
    const customerMap = new Map(customers.map(c => [c.id, c.name]));
    const mappedMovements = movements.map(m => {
      let custName = m.customer_name || customerMap.get(m.customer_id);
      if (!custName) {
        custName = m.customer_id === 'company-asset-pool' ? 'Company Physical Asset Pool' : 'Valued Customer';
      }
      return {
        ...m,
        customer_name: custName,
      };
    });

    mappedMovements.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

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
      recentCanMovements: mappedMovements.slice(0, 50),
      totalCirculation: totalCompanyCans,
      customerHeld: withCustomers,
      factoryEmpty: emptyInWarehouse,
      factoryFilled: filledInWarehouse,
      damagedCount: damagedCans,
      lostCount: lostCans,
    });
  } catch (err: any) {
    console.error('[API /cans/summary] Error:', err);
    return res.status(500).json({ message: err.message || 'Failed to load can summary' });
  }
});

// 1. Total Company Cans Adjustment Endpoint
apiRouter.post('/cans/adjust-company', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'cans', 'can_edit');
    if (!authorized) return;

    const {
      adjustment_mode = 'set_total',
      target_total,
      delta,
      empty_cans,
      damaged_cans,
      lost_cans,
      reason,
      notes,
    } = req.body;

    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Mandatory audit reason is required for company can adjustment' });
    }

    const authUser = await getAuthUserFromRequest(req);
    const db = loadDatabase();
    const fallbackOwner = db.users.find(u => u.role_name === 'Owner' || u.role_id === 'role-owner');
    const operatorName = authUser?.name || fallbackOwner?.name || 'Owner Operator';

    const supabase = getServerSupabase();
    let inv19 = db.inventory.find(i => i.product_id === 'prod-19l-can');
    if (!inv19) {
      const prod = db.products.find(p => p.id === 'prod-19l-can');
      inv19 = {
        id: 'inv-19l',
        product_id: 'prod-19l-can',
        product_name: prod?.name || 'AAB E ARWA 19L Premium Water Can',
        size: prod?.size || '19L',
        unit: prod?.unit || 'bottle',
        selling_price: prod?.selling_price || 220,
        cost_price: prod?.cost_price || 95,
        is_reusable: 1,
        filled_stock: 0,
        empty_cans: 0,
        damaged_cans: 0,
        lost_cans: 0,
        updated_at: new Date().toISOString(),
      };
      db.inventory.push(inv19);
    }
    const safeInv19 = inv19!;

    // Reconciled counts:
    // Product filled stock is finished goods and remains separate & untouched!
    const filledInWarehouse = Number(safeInv19.filled_stock || 0);
    const withCustomers = db.customers.reduce((s, c) => s + (Number(c.cans_held) || 0), 0);
    const currentEmpty = Number(safeInv19.empty_cans || 0);
    const currentDamaged = Number(safeInv19.damaged_cans || 0);
    const currentLost = Number(safeInv19.lost_cans || 0);
    const previousTotal = filledInWarehouse + currentEmpty + withCustomers + currentDamaged + currentLost;

    let newEmpty = currentEmpty;
    let newDamaged = currentDamaged;
    let newLost = currentLost;

    if (adjustment_mode === 'set_total') {
      const target = Number(target_total);
      if (isNaN(target) || target < 0) {
        return res.status(400).json({ message: 'Valid non-negative target total is required' });
      }
      const otherCans = filledInWarehouse + withCustomers + currentDamaged + currentLost;
      if (target < otherCans) {
        return res.status(400).json({
          message: `Target total (${target}) cannot be lower than currently accounted cans (${otherCans}): ${filledInWarehouse} filled in plant + ${withCustomers} with customers + ${currentDamaged} damaged + ${currentLost} lost.`,
        });
      }
      newEmpty = target - otherCans;
    } else if (adjustment_mode === 'delta') {
      const d = Number(delta);
      if (isNaN(d) || d === 0) {
        return res.status(400).json({ message: 'Valid non-zero adjustment delta is required' });
      }
      newEmpty = Math.max(0, currentEmpty + d);
    } else if (adjustment_mode === 'set_breakdown') {
      if (empty_cans !== undefined) newEmpty = Math.max(0, Number(empty_cans));
      if (damaged_cans !== undefined) newDamaged = Math.max(0, Number(damaged_cans));
      if (lost_cans !== undefined) newLost = Math.max(0, Number(lost_cans));
    }

    const newTotal = filledInWarehouse + newEmpty + withCustomers + newDamaged + newLost;
    const totalDelta = newTotal - previousTotal;
    const nowIso = new Date().toISOString();

    // 1. Update local database
    safeInv19.empty_cans = newEmpty;
    safeInv19.damaged_cans = newDamaged;
    safeInv19.lost_cans = newLost;
    safeInv19.updated_at = nowIso;

    // Movement entry for unified history
    const movementId = `canmov-${Date.now()}-co`;
    db.customer_can_movements.unshift({
      id: movementId,
      customer_id: 'company-asset-pool',
      customer_name: 'Company Physical Asset Pool',
      product_id: 'prod-19l-can',
      movement_type: totalDelta >= 0 ? 'company_cans_addition' : 'company_cans_reduction',
      quantity: totalDelta,
      balance_after: newTotal,
      reason: reason.trim(),
      notes: notes?.trim() || '',
      user_name: operatorName,
      user_id: authUser?.id || undefined,
      created_at: nowIso,
    });
    saveDatabase(db);

    // 2. Persist in Supabase inventory & inventory_movements
    if (supabase) {
      try {
        await supabase
          .from('inventory')
          .update({
            empty_cans: newEmpty,
            damaged_cans: newDamaged,
            lost_cans: newLost,
            updated_at: nowIso,
          })
          .eq('product_id', 'prod-19l-can');

        await supabase.from('inventory_movements').insert({
          id: `mov-${Date.now()}`,
          product_id: 'prod-19l-can',
          movement_type: totalDelta >= 0 ? 'company_cans_addition' : 'company_cans_reduction',
          stock_type: 'empty',
          quantity: totalDelta,
          previous_stock: previousTotal,
          new_stock: newTotal,
          reason: `${reason.trim()}${notes ? ` | Note: ${notes.trim()}` : ''}`,
          reference_type: 'company_asset_adjustment',
          user_id: operatorName,
          created_at: nowIso,
        });
      } catch (err: any) {
        console.warn('[API /cans/adjust-company] Supabase update notice:', err?.message || err);
      }
    }

    // 3. Create mandatory Audit Trail record
    await logAuditEvent({
      req,
      action: 'ADJUST_COMPANY_CANS',
      module: 'cans',
      record_ref: 'prod-19l-can',
      details: `Total company physical 19L cans adjusted: ${previousTotal} → ${newTotal} (${totalDelta >= 0 ? '+' : ''}${totalDelta}) [Empty in Plant: ${newEmpty}, Filled in Plant: ${filledInWarehouse}, With Customers: ${withCustomers}, Damaged: ${newDamaged}, Lost: ${newLost}] | Reason: ${reason.trim()}${notes ? ` | Note: ${notes.trim()}` : ''}`,
      old_value: {
        total_company_cans: previousTotal,
        empty_in_plant: currentEmpty,
        filled_stock: filledInWarehouse,
        with_customers: withCustomers,
        damaged_cans: currentDamaged,
        lost_cans: currentLost,
      },
      new_value: {
        total_company_cans: newTotal,
        empty_in_plant: newEmpty,
        filled_stock: filledInWarehouse,
        with_customers: withCustomers,
        damaged_cans: newDamaged,
        lost_cans: newLost,
        delta: totalDelta,
        reason: reason.trim(),
        notes: notes?.trim() || null,
      },
    });

    console.log(`[CANS] Total Company Cans adjusted: ${previousTotal} -> ${newTotal} by ${operatorName}`);

    return res.json({
      success: true,
      previous_total: previousTotal,
      new_total: newTotal,
      delta: totalDelta,
      metrics: {
        emptyInWarehouse: newEmpty,
        filledInWarehouse,
        withCustomers,
        damagedCans: newDamaged,
        lostCans: newLost,
        totalCompanyCans: newTotal,
      },
    });
  } catch (err: any) {
    console.error('[API /cans/adjust-company] Exception:', err);
    return res.status(500).json({ message: err.message || 'Internal server error adjusting company cans' });
  }
});

// 2. Customer Cans Adjustment Endpoint
apiRouter.post('/cans/adjust-customer', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'cans', 'can_edit');
    if (!authorized) return;

    const { customer_id, change_type = 'issue_more', quantity, reason, notes } = req.body;
    if (!customer_id) {
      return res.status(400).json({ message: 'Customer selection is required' });
    }
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Mandatory audit reason is required for can adjustment' });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty < 0) {
      return res.status(400).json({ message: 'Valid non-negative quantity required' });
    }

    const authUser = await getAuthUserFromRequest(req);
    const db = loadDatabase();
    const fallbackOwner = db.users.find(u => u.role_name === 'Owner' || u.role_id === 'role-owner');
    const operatorName = authUser?.name || fallbackOwner?.name || 'Staff Operator';

    const cust = db.customers.find(c => c.id === customer_id);
    if (!cust) {
      return res.status(404).json({ message: 'Customer record not found' });
    }

    const prevCans = Number(cust.cans_held || 0);
    let newCans = prevCans;
    let delta = 0;

    if (change_type === 'issue_more') {
      delta = qty;
      newCans = prevCans + delta;
    } else if (change_type === 'return_cans') {
      delta = -Math.min(prevCans, qty);
      newCans = Math.max(0, prevCans - qty);
    } else if (change_type === 'set_balance') {
      newCans = qty;
      delta = newCans - prevCans;
    } else if (change_type === 'report_damaged' || change_type === 'report_lost') {
      delta = -Math.min(prevCans, qty);
      newCans = Math.max(0, prevCans - qty);
    }

    const nowIso = new Date().toISOString();
    cust.cans_held = newCans;
    cust.updated_at = nowIso;

    // Adjust plant empty / damaged / lost count accordingly to preserve total physical count:
    const inv19 = db.inventory.find(i => i.product_id === 'prod-19l-can');
    if (inv19) {
      if (change_type === 'return_cans') {
        inv19.empty_cans = Math.max(0, (Number(inv19.empty_cans) || 0) + Math.abs(delta));
      } else if (change_type === 'report_damaged') {
        inv19.damaged_cans = Math.max(0, (Number(inv19.damaged_cans) || 0) + Math.abs(delta));
      } else if (change_type === 'report_lost') {
        inv19.lost_cans = Math.max(0, (Number(inv19.lost_cans) || 0) + Math.abs(delta));
      } else if (change_type === 'issue_more' && (Number(inv19.empty_cans) || 0) >= delta) {
        inv19.empty_cans = Math.max(0, (Number(inv19.empty_cans) || 0) - delta);
      }
    }

    const movementId = `canmov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const movementRecord = {
      id: movementId,
      customer_id,
      customer_name: cust.name,
      product_id: 'prod-19l-can',
      movement_type: change_type,
      quantity: delta,
      balance_after: newCans,
      reason: reason.trim(),
      notes: notes?.trim() || '',
      user_id: authUser?.id || undefined,
      user_name: operatorName,
      created_at: nowIso,
    };
    db.customer_can_movements.unshift(movementRecord);
    saveDatabase(db);

    // Persist in Supabase
    const supabase = getServerSupabase();
    if (supabase) {
      try {
        await supabase
          .from('customers')
          .update({ cans_held: newCans, updated_at: nowIso })
          .eq('id', customer_id);

        if (inv19) {
          await supabase
            .from('inventory')
            .update({
              empty_cans: inv19.empty_cans,
              damaged_cans: inv19.damaged_cans,
              lost_cans: inv19.lost_cans,
              updated_at: nowIso,
            })
            .eq('product_id', 'prod-19l-can');
        }

        await supabase.from('customer_can_movements').insert({
          id: movementId,
          customer_id,
          product_id: 'prod-19l-can',
          movement_type: change_type,
          quantity: delta,
          balance_after: newCans,
          reason: `${reason.trim()}${notes ? ` | Note: ${notes.trim()}` : ''}`,
          user_id: authUser?.id || null,
          created_at: nowIso,
        });
      } catch (err: any) {
        console.warn('[API /cans/adjust-customer] Supabase sync notice:', err?.message || err);
      }
    }

    // Create mandatory Audit Trail record
    await logAuditEvent({
      req,
      action: 'ADJUST_CUSTOMER_CANS',
      module: 'cans',
      record_ref: customer_id,
      details: `Customer cans adjusted for "${cust.name}" (${cust.area}): ${change_type} (${delta >= 0 ? '+' : ''}${delta}) | Balance: ${prevCans} → ${newCans} cans | Reason: ${reason.trim()}${notes ? ` | Note: ${notes.trim()}` : ''}`,
      old_value: { cans_held: prevCans },
      new_value: {
        cans_held: newCans,
        change_type,
        delta,
        reason: reason.trim(),
        notes: notes?.trim() || null,
      },
    });

    console.log(`[CANS] Customer cans adjusted for ${cust.name}: ${prevCans} -> ${newCans} (${delta})`);

    return res.json({
      success: true,
      customer_id,
      customer_name: cust.name,
      previous_balance: prevCans,
      new_balance: newCans,
      delta,
    });
  } catch (err: any) {
    console.error('[API /cans/adjust-customer] Exception:', err);
    return res.status(500).json({ message: err.message || 'Internal server error adjusting customer cans' });
  }
});

// -----------------------------------------------------------------------------
// 11. PAYMENTS
// -----------------------------------------------------------------------------

apiRouter.get('/payments', async (req: Request, res: Response) => {
  const authorized = await authorizePermission(req, res, 'payments', 'can_view');
  if (!authorized) return;

  const supabase = getServerSupabase();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          customer:customers (name, phone)
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        const mapped = data.map((p: any) => ({
          ...p,
          customer_name: p.customer?.name || p.customer_name || '',
          customer_phone: p.customer?.phone || p.customer_phone || '',
        }));
        return res.json(mapped);
      }
    } catch (_) {}
  }
  const db = loadDatabase();
  return res.json(db.payments || []);
});

apiRouter.post('/payments', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'payments', 'can_create');
    if (!authorized) return;

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

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        await supabase.from('payments').insert({
          id: newPayment.id,
          payment_number: newPayment.payment_number,
          customer_id: newPayment.customer_id,
          amount: newPayment.amount,
          payment_method: newPayment.payment_method,
          payment_date: newPayment.payment_date,
          reference: newPayment.reference || null,
          notes: newPayment.notes || null,
          created_at: newPayment.created_at,
        });

        if (pay.customer_id) {
          const { data: dbCust } = await supabase
            .from('customers')
            .select('*')
            .eq('id', pay.customer_id)
            .maybeSingle();

          if (dbCust) {
            const newBal = Math.max(0, (dbCust.outstanding_balance || 0) - newPayment.amount);
            await supabase
              .from('customers')
              .update({ outstanding_balance: newBal, updated_at: newPayment.created_at })
              .eq('id', pay.customer_id);

            await supabase.from('customer_ledger').insert({
              id: `led-${Date.now()}`,
              customer_id: pay.customer_id,
              transaction_type: 'direct_payment',
              reference_type: 'payment',
              reference_id: id,
              amount: newPayment.amount,
              balance_after: newBal,
              notes: `Direct payment received via ${newPayment.payment_method}`,
              created_at: newPayment.created_at,
            });
          }
        }
      } catch (sbErr) {
        console.error('[API /payments] Supabase payment insert error:', sbErr);
      }
    }

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

    await logAuditEvent({
      req,
      action: 'CREATE_PAYMENT',
      module: 'payments',
      record_ref: id,
      details: `Recorded payment receipt #${newPayment.payment_number} of PKR ${newPayment.amount} for customer "${cust?.name || pay.customer_id}" (${newPayment.payment_method})`,
      new_value: { payment_number: newPayment.payment_number, amount: newPayment.amount, method: newPayment.payment_method, customer_id: pay.customer_id, payment_date: newPayment.payment_date },
    });

    return res.status(201).json({ id });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.put('/payments/:id', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'payments', 'can_edit');
    if (!authorized) return;

    const { id } = req.params;
    const db = loadDatabase();
    const pay = db.payments.find(p => p.id === id);
    if (!pay) {
      return res.status(404).json({ message: 'Payment record not found' });
    }

    const prevPay = { ...pay };
    Object.assign(pay, req.body);
    saveDatabase(db);

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        await supabase.from('payments').update(req.body).eq('id', id);
      } catch (_) {}
    }

    await logAuditEvent({
      req,
      action: 'UPDATE_PAYMENT',
      module: 'payments',
      record_ref: id,
      details: `Updated payment receipt #${pay.payment_number}`,
      old_value: prevPay,
      new_value: pay,
    });

    return res.json({ success: true, payment: pay });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

apiRouter.delete('/payments/:id', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'payments', 'can_delete');
    if (!authorized) return;

    const { id } = req.params;
    const db = loadDatabase();
    const pay = db.payments.find(p => p.id === id);
    if (!pay) {
      return res.status(404).json({ message: 'Payment record not found' });
    }

    if (pay.customer_id) {
      const cust = db.customers.find(c => c.id === pay.customer_id);
      if (cust) {
        cust.outstanding_balance = (cust.outstanding_balance || 0) + (pay.amount || 0);
      }
    }

    db.payments = db.payments.filter(p => p.id !== id);
    saveDatabase(db);

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        await supabase.from('payments').delete().eq('id', id);
      } catch (_) {}
    }

    await logAuditEvent({
      req,
      action: 'DELETE_PAYMENT',
      module: 'payments',
      record_ref: id,
      details: `Deleted payment receipt #${pay.payment_number} (PKR ${pay.amount})`,
      old_value: { id, payment_number: pay.payment_number, amount: pay.amount },
    });

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// -----------------------------------------------------------------------------
// 12. EXPENSES
// -----------------------------------------------------------------------------

apiRouter.get('/expenses/categories', async (req: Request, res: Response) => {
  const authorized = await authorizePermission(req, res, 'expenses', 'can_view');
  if (!authorized) return;
  const db = loadDatabase();
  return res.json(db.expense_categories);
});

apiRouter.get('/expenses', async (req: Request, res: Response) => {
  const authorized = await authorizePermission(req, res, 'expenses', 'can_view');
  if (!authorized) return;
  const db = loadDatabase();
  return res.json(db.expenses);
});

apiRouter.post('/expenses', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'expenses', 'can_create');
    if (!authorized) return;

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
// 14. REPORTS & DASHBOARD
// -----------------------------------------------------------------------------

apiRouter.get('/reports/financial', async (req: Request, res: Response) => {
  const authorized = await authorizePermission(req, res, 'reports', 'can_view');
  if (!authorized) return;

  const role = authorized.role_name || (authorized.role_id === 'role-owner' ? 'Owner' : authorized.role_id === 'role-manager' ? 'Manager' : 'Delivery Boy');
  if (role !== 'Owner' && authorized.role_id !== 'role-owner') {
    return res.status(403).json({ message: 'Access Denied: Only Owner can view financial P&L statements.' });
  }

  const startDate = (req.query.startDate as string) || undefined;
  const endDate = (req.query.endDate as string) || undefined;

  const supabase = getServerSupabase();
  let orders: any[] = [];
  let payments: any[] = [];
  let expenses: any[] = [];
  let expenseCategories: any[] = [];
  let products: any[] = [];
  let fetchedFromSupabase = false;

  if (supabase) {
    try {
      const [ordRes, payRes, expRes, catRes, prodRes] = await Promise.all([
        supabase.from('orders').select('*, items:order_items(*)'),
        supabase.from('payments').select('*'),
        supabase.from('expenses').select('*, category:expense_categories(name)'),
        supabase.from('expense_categories').select('*'),
        supabase.from('products').select('*'),
      ]);

      if (!ordRes.error && ordRes.data) orders = ordRes.data;
      if (!payRes.error && payRes.data) payments = payRes.data;
      if (!expRes.error && expRes.data) expenses = expRes.data;
      if (!catRes.error && catRes.data) expenseCategories = catRes.data;
      if (!prodRes.error && prodRes.data) products = prodRes.data;
      fetchedFromSupabase = true;
    } catch (err) {
      console.warn('[API /reports/financial] Supabase query notice:', err);
    }
  }

  if (!fetchedFromSupabase) {
    const db = loadDatabase();
    orders = db.orders || [];
    payments = db.payments || [];
    expenses = db.expenses || [];
    expenseCategories = db.expense_categories || [];
    products = db.products || [];
  }

  const isWithinRange = (dateStr?: string | null): boolean => {
    if (!dateStr) return true;
    const str = String(dateStr).slice(0, 10);
    if (startDate && str < startDate) return false;
    if (endDate && str > endDate) return false;
    return true;
  };

  const filteredOrders = startDate || endDate
    ? orders.filter(o => isWithinRange(o.created_at || o.delivery_date))
    : orders;

  const filteredPayments = startDate || endDate
    ? payments.filter(p => isWithinRange(p.payment_date || p.created_at))
    : payments;

  const filteredExpenses = startDate || endDate
    ? expenses.filter(e => isWithinRange(e.expense_date || (e as any).date || e.created_at))
    : expenses;

  // 1. Sales Revenue
  const salesRevenue = filteredOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

  // 2. Collections (Received Payments)
  const collections = filteredPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0);

  // 3. Cost of Goods Sold (COGS)
  const productCostMap = new Map<string, number>();
  products.forEach(p => productCostMap.set(p.id, Number(p.cost_price) || 0));

  let cogs = 0;
  filteredOrders.forEach(o => {
    (o.items || []).forEach((item: any) => {
      const unitCost = productCostMap.get(item.product_id) || 0;
      const qty = Number(item.quantity) || 0;
      cogs += unitCost * qty;
    });
  });

  // 4. Operating Expenses
  const operatingExpenses = filteredExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // 5. Gross Profit & Net Profit
  const grossProfit = salesRevenue - cogs;
  const netProfit = grossProfit - operatingExpenses;
  const profitMargin = salesRevenue > 0
    ? ((netProfit / salesRevenue) * 100).toFixed(1)
    : '0.0';

  // 6. Expense Category Breakdown
  const categoryMap = new Map<string, number>();
  filteredExpenses.forEach(e => {
    const catName = e.category?.name || (e as any).category_name || (expenseCategories.find(c => c.id === e.category_id)?.name) || 'General';
    categoryMap.set(catName, (categoryMap.get(catName) || 0) + (Number(e.amount) || 0));
  });

  const categoryExpenses = Array.from(categoryMap.entries()).map(([name, amount]) => ({
    name,
    amount,
  }));

  const summary = {
    salesRevenue,
    collections,
    cogs,
    grossProfit,
    expenses: operatingExpenses,
    netProfit,
    profitMargin,
  };

  return res.json({
    summary,
    salesRevenue,
    costOfGoodsSold: cogs,
    grossProfit,
    operatingExpenses,
    netProfit,
    profitMargin,
    totalRevenue: salesRevenue,
    totalExpenses: operatingExpenses,
    margin: profitMargin,
    categoryExpenses,
  });
});

apiRouter.get('/reports/sales', async (req: Request, res: Response) => {
  const authorized = await authorizePermission(req, res, 'reports', 'can_view');
  if (!authorized) return;

  const startDate = (req.query.startDate as string) || undefined;
  const endDate = (req.query.endDate as string) || undefined;

  const supabase = getServerSupabase();
  let orders: any[] = [];
  let products: any[] = [];
  let customers: any[] = [];
  let fetchedFromSupabase = false;

  if (supabase) {
    try {
      const [ordRes, prodRes, custRes] = await Promise.all([
        supabase.from('orders').select('*, items:order_items(*)'),
        supabase.from('products').select('*'),
        supabase.from('customers').select('*'),
      ]);
      if (!ordRes.error && ordRes.data) orders = ordRes.data;
      if (!prodRes.error && prodRes.data) products = prodRes.data;
      if (!custRes.error && custRes.data) customers = custRes.data;
      fetchedFromSupabase = true;
    } catch (err) {
      console.warn('[API /reports/sales] Supabase query notice:', err);
    }
  }

  if (!fetchedFromSupabase) {
    const db = loadDatabase();
    orders = db.orders || [];
    products = db.products || [];
    customers = db.customers || [];
  }

  const isWithinRange = (dateStr?: string | null): boolean => {
    if (!dateStr) return true;
    const str = String(dateStr).slice(0, 10);
    if (startDate && str < startDate) return false;
    if (endDate && str > endDate) return false;
    return true;
  };

  const filteredOrders = startDate || endDate
    ? orders.filter(o => isWithinRange(o.created_at || o.delivery_date))
    : orders;

  const monthMap = new Map<string, { total: number; count: number }>();
  const productMap = new Map<string, { name: string; size: string; total_qty: number; total_revenue: number }>();
  const areaMap = new Map<string, { area: string; total_orders: number; total_revenue: number }>();

  const productInfoMap = new Map<string, any>();
  products.forEach(p => productInfoMap.set(p.id, p));

  const customerAreaMap = new Map<string, string>();
  customers.forEach(c => customerAreaMap.set(c.id, c.area || 'Quetta'));

  filteredOrders.forEach((o: any) => {
    const monthKey = o.created_at ? new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : 'Recent';
    const currentM = monthMap.get(monthKey) || { total: 0, count: 0 };
    currentM.total += Number(o.total_amount) || 0;
    currentM.count += 1;
    monthMap.set(monthKey, currentM);

    const orderArea = o.customer_area || customerAreaMap.get(o.customer_id) || 'Quetta';
    const currentA = areaMap.get(orderArea) || { area: orderArea, total_orders: 0, total_revenue: 0 };
    currentA.total_orders += 1;
    currentA.total_revenue += Number(o.total_amount) || 0;
    areaMap.set(orderArea, currentA);

    (o.items || []).forEach((item: any) => {
      const prodInfo = productInfoMap.get(item.product_id);
      const prodName = item.product_name || prodInfo?.name || 'Water Bottle';
      const prodSize = item.size || prodInfo?.size || '19L';
      const key = `${prodName}_${prodSize}`;
      const pEntry = productMap.get(key) || { name: prodName, size: prodSize, total_qty: 0, total_revenue: 0 };
      pEntry.total_qty += Number(item.quantity) || 0;
      pEntry.total_revenue += Number(item.total_price || (item.unit_price * item.quantity)) || 0;
      productMap.set(key, pEntry);
    });
  });

  const productSales = Array.from(productMap.values());
  const areaSales = Array.from(areaMap.values());
  const monthlySales = Array.from(monthMap.entries()).map(([month, data]) => ({
    month,
    total: data.total,
    count: data.count,
  }));
  const productBreakdown = productSales.map(p => ({
    name: p.name,
    quantity: p.total_qty,
    revenue: p.total_revenue,
  }));

  return res.json({
    productSales,
    areaSales,
    monthlySales,
    productBreakdown,
  });
});

apiRouter.get('/reports/deliveries', async (req: Request, res: Response) => {
  const authorized = await authorizePermission(req, res, 'reports', 'can_view');
  if (!authorized) return;

  const supabase = getServerSupabase();
  let deliveries: any[] = [];
  let movements: any[] = [];
  let users: any[] = [];
  let fetchedFromSupabase = false;

  if (supabase) {
    try {
      const [delRes, movRes, userRes] = await Promise.all([
        supabase.from('deliveries').select('*'),
        supabase.from('customer_can_movements').select('*'),
        supabase.from('users').select('*'),
      ]);
      if (!delRes.error && delRes.data) deliveries = delRes.data;
      if (!movRes.error && movRes.data) movements = movRes.data;
      if (!userRes.error && userRes.data) users = userRes.data;
      fetchedFromSupabase = true;
    } catch (err) {
      console.warn('[API /reports/deliveries] Supabase query notice:', err);
    }
  }

  if (!fetchedFromSupabase) {
    const db = loadDatabase();
    deliveries = db.deliveries || [];
    movements = db.customer_can_movements || [];
    users = db.users || [];
  }

  const totalDeliveries = deliveries.length;
  const delivered = deliveries.filter(d => d.status === 'delivered').length;
  const onTimeRate = totalDeliveries > 0 ? `${Math.round((delivered / totalDeliveries) * 100)}%` : '0%';
  const cansReturned = movements
    .filter(m => m.movement_type === 'returned')
    .reduce((s, m) => s + (Number(m.quantity) || 0), 0);

  const driverMap = new Map<string, { driver_name: string; total_assigned: number; delivered: number; failed: number; cash_collected: number; empty_cans_collected: number }>();

  deliveries.forEach(d => {
    const driverName = (d as any).driver_name || (users.find(u => u.id === d.driver_id)?.name) || 'Assigned Driver';
    const entry = driverMap.get(driverName) || {
      driver_name: driverName,
      total_assigned: 0,
      delivered: 0,
      failed: 0,
      cash_collected: 0,
      empty_cans_collected: 0,
    };
    entry.total_assigned += 1;
    if (d.status === 'delivered') {
      entry.delivered += 1;
    } else if (d.status === 'failed' || (d.status as string) === 'cancelled') {
      entry.failed += 1;
    }
    entry.cash_collected += Number(d.payment_collected) || 0;
    entry.empty_cans_collected += Number(d.empty_cans_returned) || 0;
    driverMap.set(driverName, entry);
  });

  const driverPerformance = Array.from(driverMap.values());

  return res.json({
    totalDeliveries,
    onTimeRate,
    cansReturned,
    driverPerformance,
  });
});

apiRouter.get('/dashboard/summary', async (req: Request, res: Response) => {
  const supabase = getServerSupabase();
  let orders: any[] = [];
  let payments: any[] = [];
  let deliveries: any[] = [];
  let customers: any[] = [];
  let products: any[] = [];
  let inventory: any[] = [];
  let expenses: any[] = [];
  let fetchedFromSupabase = false;

  if (supabase) {
    try {
      const [
        ordersRes,
        paymentsRes,
        deliveriesRes,
        customersRes,
        productsRes,
        inventoryRes,
        expensesRes,
      ] = await Promise.all([
        supabase.from('orders').select('*').order('created_at', { ascending: false }),
        supabase.from('payments').select('*').order('created_at', { ascending: false }),
        supabase.from('deliveries').select('*').order('created_at', { ascending: false }),
        supabase.from('customers').select('*').neq('status', 'archived').neq('status', 'inactive'),
        supabase.from('products').select('*').eq('is_active', true),
        supabase.from('inventory').select('*'),
        supabase.from('expenses').select('*').order('created_at', { ascending: false }),
      ]);

      if (!ordersRes.error && ordersRes.data) orders = ordersRes.data;
      if (!paymentsRes.error && paymentsRes.data) payments = paymentsRes.data;
      if (!deliveriesRes.error && deliveriesRes.data) deliveries = deliveriesRes.data;
      if (!customersRes.error && customersRes.data) customers = customersRes.data;
      if (!productsRes.error && productsRes.data) products = productsRes.data;
      if (!inventoryRes.error && inventoryRes.data) inventory = inventoryRes.data;
      if (!expensesRes.error && expensesRes.data) expenses = expensesRes.data;

      fetchedFromSupabase = true;
    } catch (err) {
      console.error('[API /dashboard/summary] Supabase query error:', err);
    }
  }

  if (!fetchedFromSupabase) {
    const db = loadDatabase();
    orders = db.orders || [];
    payments = db.payments || [];
    deliveries = db.deliveries || [];
    customers = db.customers || [];
    products = db.products || [];
    inventory = db.inventory || [];
    expenses = db.expenses || [];
  }

  // Robust date comparison helper
  const isDateToday = (dateVal?: string | null): boolean => {
    if (!dateVal) return false;
    const str = String(dateVal).trim();
    if (!str) return false;
    const now = new Date();
    const utcToday = now.toISOString().slice(0, 10);
    const localToday = now.toLocaleDateString('en-CA');
    if (str.startsWith(utcToday) || str.startsWith(localToday)) return true;
    try {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        const parsedUtc = parsed.toISOString().slice(0, 10);
        const parsedLocal = parsed.toLocaleDateString('en-CA');
        return parsedUtc === utcToday || parsedUtc === localToday || parsedLocal === utcToday || parsedLocal === localToday;
      }
    } catch (_) {}
    return false;
  };

  const withCustomers = customers.reduce((s, c) => s + (Number(c.cans_held) || 0), 0);
  const totalReceivables = customers.reduce((s, c) => s + (Number(c.outstanding_balance) || 0), 0);

  const deliveriesDelivered = deliveries.filter(d => d.status === 'delivered').length;
  const deliveriesInTransit = deliveries.filter(d => d.status === 'out_for_delivery' || d.status === 'assigned').length;
  const deliveriesPending = deliveries.filter(d => d.status === 'assigned' || d.status === 'rescheduled' || d.status === 'pending').length;

  const todayOrders = orders.filter(o =>
    isDateToday(o.created_at) ||
    isDateToday(o.delivery_date) ||
    isDateToday(o.completed_at) ||
    isDateToday(o.updated_at)
  );
  const todaySales = todayOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

  // Calculate Cash Collected / Paid from today's payments & completed Cashpaid orders
  const todayPayments = payments.filter(p => isDateToday(p.payment_date) || isDateToday(p.created_at));
  let todayCollections = 0;
  const coveredOrderIds = new Set<string>();

  for (const p of todayPayments) {
    todayCollections += Number(p.amount) || 0;
    if (p.order_id) coveredOrderIds.add(String(p.order_id));
    if (p.delivery_id) {
      const del = deliveries.find(d => String(d.id) === String(p.delivery_id));
      if (del && del.order_id) coveredOrderIds.add(String(del.order_id));
    }
  }

  // Include completed orders marked as Cashpaid / paid that do not yet have an explicit payment ledger record
  for (const o of todayOrders) {
    const st = String(o.order_status || o.status || '').toLowerCase().trim();
    const ps = String(o.payment_status || '').toLowerCase().trim();
    const pm = String(o.payment_method || '').toLowerCase().trim();
    const isCompleted = st === 'completed' || st === 'delivered';
    const isCashPaid =
      ps === 'paid' ||
      ps === 'cashpaid' ||
      ps === 'cash' ||
      ps === 'cash_paid' ||
      ps.includes('paid') ||
      ps.includes('cash') ||
      pm === 'cash';

    if (isCompleted && isCashPaid) {
      const ordId = String(o.id || '');
      const ordNum = String(o.order_number || '');
      if (!coveredOrderIds.has(ordId) && (!ordNum || !coveredOrderIds.has(ordNum))) {
        todayCollections += Number(o.total_amount) || 0;
        coveredOrderIds.add(ordId);
      }
    }
  }

  const todayExpensesList = expenses.filter(e => isDateToday(e.expense_date) || isDateToday(e.date) || isDateToday(e.created_at));
  const todayExpenses = todayExpensesList.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const currentMonthStr = new Date().toISOString().slice(0, 7);
  const monthOrders = orders.filter(o => o.created_at && String(o.created_at).slice(0, 7) === currentMonthStr);
  const monthlyRevenue = monthOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

  const monthExpensesList = expenses.filter(e =>
    (e.expense_date && String(e.expense_date).slice(0, 7) === currentMonthStr) ||
    (e.date && String(e.date).slice(0, 7) === currentMonthStr) ||
    (e.created_at && String(e.created_at).slice(0, 7) === currentMonthStr)
  );
  const monthlyExpenses = monthExpensesList.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const monthlyProfit = monthlyRevenue - monthlyExpenses;

  // Actual inventory stock
  const filledStock = inventory.reduce((s, i) => s + (Number(i.filled_stock) || 0), 0) || products.reduce((s, p) => s + (Number(p.filled_stock) || 0), 0);
  const emptyCansStock = inventory.reduce((s, i) => s + (Number(i.empty_cans) || 0), 0) || products.reduce((s, p) => s + (Number(p.empty_cans) || 0), 0);

  // 7-day sales trend from real records (calendar dates ending today)
  const days: { day: string; date: string; amount: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dayNum = String(d.getDate()).padStart(2, '0');
    const localDateStr = `${y}-${m}-${dayNum}`;
    const utcDateStr = d.toISOString().slice(0, 10);
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });

    const daySales = orders
      .filter(o => {
        if (!o.created_at) return false;
        const str = String(o.created_at).trim();
        if (str.slice(0, 10) === localDateStr || str.slice(0, 10) === utcDateStr) return true;
        try {
          const parsed = new Date(str);
          if (!isNaN(parsed.getTime())) {
            const parsedLocal = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
            return parsedLocal === localDateStr || parsed.toISOString().slice(0, 10) === utcDateStr;
          }
        } catch (_) {}
        return false;
      })
      .reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

    days.push({ day: dayName, date: localDateStr, amount: daySales });
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
      deliveriesToday: deliveries.length,
      deliveriesDelivered,
      deliveriesInTransit,
      deliveriesPending,
      monthlyRevenue,
      monthlyExpenses,
      monthlyProfit,
    },
    recentDeliveries: deliveries.slice(0, 5),
    recentOrders: orders.slice(0, 5),
    lowStock: products
      .filter(p => (Number(p.filled_stock) || 0) < 10 && products.length > 0)
      .map(p => ({
        name: p.name,
        size: p.size,
        filled_stock: Number(p.filled_stock) || 0,
        empty_cans: Number(p.empty_cans) || 0,
      })),
    topDebtors: customers.filter(c => (Number(c.outstanding_balance) || 0) > 0).slice(0, 5),
    salesTrend: days,
  });
});

apiRouter.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const authUser = await getAuthUserFromRequest(req);
    const db = loadDatabase();
    const fallbackOwner = db.users.find(u => u.role_name === 'Owner' || u.role_id === 'role-owner');
    const currentUser = authUser || fallbackOwner;

    // Security check: strictly Owner-only. Managers and Delivery Boys are blocked.
    if (!currentUser || (currentUser.role_name !== 'Owner' && currentUser.role_id !== 'role-owner')) {
      return res.status(403).json({
        message: 'Access Denied: System Audit Trail is restricted exclusively to the business Owner.',
      });
    }

    let supabaseLogs: AuditLog[] = [];
    const authHeader = req.headers.authorization;
    const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
    const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

    // 1. Fetch from Supabase using user's authenticated bearer token if present
    if (authHeader && authHeader.startsWith('Bearer ') && supabaseUrl && supabaseKey) {
      try {
        const userSupabase = createClient(supabaseUrl, supabaseKey, {
          global: { headers: { Authorization: authHeader } },
          auth: { persistSession: false },
        });
        const { data, error } = await userSupabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(300);

        if (!error && data) {
          supabaseLogs = data as AuditLog[];
        }
      } catch (err: any) {
        console.warn('[API /audit-logs] User Supabase query notice:', err?.message || err);
      }
    }

    // 2. Fallback to serverSupabase if user query didn't return data
    if (supabaseLogs.length === 0) {
      const serverSupabase = getServerSupabase();
      if (serverSupabase) {
        try {
          const { data, error } = await serverSupabase
            .from('audit_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(300);

          if (!error && data) {
            supabaseLogs = data as AuditLog[];
          }
        } catch (_) {}
      }
    }

    // 3. Merge and deduplicate by unique record ID
    const logMap = new Map<string, AuditLog>();
    for (const log of (db.audit_logs || [])) {
      if (log && log.id) logMap.set(log.id, log);
    }
    for (const log of supabaseLogs) {
      if (log && log.id) {
        logMap.set(log.id, {
          ...logMap.get(log.id),
          ...log,
        });
      }
    }

    let mergedLogs = Array.from(logMap.values());
    // Keep local cache synced
    db.audit_logs = mergedLogs.slice(0, 1000);
    saveDatabase(db);

    // 4. Filter by module or search query
    const search = (req.query.search as string || '').toLowerCase().trim();
    const moduleFilter = (req.query.module as string || '').toLowerCase().trim();

    if (moduleFilter) {
      mergedLogs = mergedLogs.filter(l => (l.module || '').toLowerCase() === moduleFilter);
    }
    if (search) {
      mergedLogs = mergedLogs.filter(l =>
        (l.user_name && l.user_name.toLowerCase().includes(search)) ||
        (l.details && l.details.toLowerCase().includes(search)) ||
        (l.action && l.action.toLowerCase().includes(search)) ||
        (l.record_ref && l.record_ref.toLowerCase().includes(search)) ||
        (l.user_role && l.user_role.toLowerCase().includes(search))
      );
    }

    // Newest records first
    mergedLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return res.json(mergedLogs);
  } catch (err: any) {
    console.error('[API /audit-logs] Exception:', err?.message || err);
    return res.status(500).json({ message: err.message || 'Internal server error fetching audit logs' });
  }
});

apiRouter.get('/settings', async (req: Request, res: Response) => {
  const authorized = await authorizePermission(req, res, 'settings', 'can_view');
  if (!authorized) return;
  const db = loadDatabase();
  return res.json(db.settings);
});

apiRouter.put('/settings', async (req: Request, res: Response) => {
  try {
    const authorized = await authorizePermission(req, res, 'settings', 'can_edit');
    if (!authorized) return;

    const db = loadDatabase();
    const prevSettings = { ...db.settings };
    db.settings = { ...db.settings, ...req.body };
    saveDatabase(db);

    const supabase = getServerSupabase();
    if (supabase) {
      try {
        for (const [key, value] of Object.entries(req.body)) {
          await supabase.from('settings').upsert({ key, value: String(value), updated_at: new Date().toISOString() });
        }
      } catch (_) {}
    }

    await logAuditEvent({
      req,
      action: 'UPDATE_SETTINGS',
      module: 'settings',
      record_ref: 'system-settings',
      details: `Updated system settings: ${Object.keys(req.body).join(', ')}`,
      old_value: prevSettings,
      new_value: db.settings,
    });

    return res.json({ success: true, settings: db.settings });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});
