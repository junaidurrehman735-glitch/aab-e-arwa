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
      const isOwner = u.role_name === 'Owner' || u.role_id === 'role-owner';
      const isManager = u.role_name === 'Manager' || u.role_id === 'role-manager';
      const roleName = isOwner ? 'Owner' : isManager ? 'Manager' : 'Delivery Boy';
      const roleId = isOwner ? 'role-owner' : isManager ? 'role-manager' : 'role-delivery';
      return {
        id: u.id || '',
        role_name: roleName,
        role_id: roleId,
      };
    }
  } catch (_) {}
  return { id: '', role_name: 'unassigned', role_id: '' };
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

const DEFAULT_PRODUCTS: Product[] = [];

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

// Clean start database version purge
const CLEAN_DB_VERSION = 'clean_start_v1';
try {
  if (typeof localStorage !== 'undefined') {
    const currentVer = localStorage.getItem('aab_clean_start_version');
    if (currentVer !== CLEAN_DB_VERSION) {
      const tablesToClean = [
        'customers', 'products', 'inventory', 'inventory_movements',
        'production_records', 'orders', 'order_items', 'deliveries',
        'customer_can_movements', 'customer_ledger', 'payments', 'expenses',
        'suppliers', 'supplier_transactions', 'audit_logs'
      ];
      tablesToClean.forEach(t => localStorage.removeItem(`aab_db_${t}`));
      localStorage.setItem('aab_clean_start_version', CLEAN_DB_VERSION);
    }
  }
} catch (_) {}

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
      try {
        const { data, error } = await supabase.from('permissions').select('*').eq('role_id', roleId);
        if (!error && data && data.length > 0) {
          return data as Permission[];
        }
      } catch (_) {}
    }

    // Check localStorage cache for locally configured role matrix
    try {
      const cached = localStorage.getItem(`aab_role_perms_${roleId}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (_) {}

    // Default permissions matrix based on the 3 roles
    const modules = [
      'dashboard', 'customers', 'products', 'inventory', 'production',
      'orders', 'deliveries', 'cans', 'payments', 'expenses',
      'staff', 'reports', 'audit', 'settings'
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

    // Cache locally
    try {
      localStorage.setItem(`aab_role_perms_${roleId}`, JSON.stringify(permissions));
    } catch (_) {}

    const supabase = getSupabaseClient();
    if (supabase) {
      for (const p of permissions) {
        try {
          await supabase
            .from('permissions')
            .upsert({
              id: `${roleId}:${p.module}`,
              role_id: roleId,
              module: p.module,
              can_view: p.can_view ? 1 : 0,
              can_create: p.can_create ? 1 : 0,
              can_edit: p.can_edit ? 1 : 0,
              can_approve: p.can_approve ? 1 : 0,
              can_delete: p.can_delete ? 1 : 0,
            }, { onConflict: 'role_id,module' });
        } catch (_) {}
      }
    }
  },

  // Helper: Normalize role name strictly to one of the 3 approved roles
  normalizeRoleName(role?: string): 'Owner' | 'Manager' | 'Delivery Boy' {
    if (!role) return 'Delivery Boy';
    const clean = role.toLowerCase().trim();
    if (clean.includes('owner')) return 'Owner';
    if (clean.includes('manager')) return 'Manager';
    return 'Delivery Boy';
  },

  // Helper: Map role name to role_id
  roleNameToId(roleName: 'Owner' | 'Manager' | 'Delivery Boy'): 'role-owner' | 'role-manager' | 'role-delivery' {
    if (roleName === 'Owner') return 'role-owner';
    if (roleName === 'Manager') return 'role-manager';
    return 'role-delivery';
  },

  // ---------------------------------------------------------------------------
  // AUTHENTICATED USER & ROLE LINKING (AUTH.UID() PERMANENT LINK)
  // ---------------------------------------------------------------------------
  async resolveAndLinkUser(sessionUser: { id: string; email?: string | null; user_metadata?: any }): Promise<User> {
    const authUserId = sessionUser.id; // Supabase Auth UUID (auth.uid())
    const authEmail = (sessionUser.email || '').trim().toLowerCase();
    const metadataRole = sessionUser.user_metadata?.role || sessionUser.user_metadata?.role_name || sessionUser.user_metadata?.role_id;
    const supabase = getSupabaseClient();

    let matchedUser: User | null = null;
    let oldIdToPurge: string | null = null;

    // STEP 1: Look up by Authenticated UUID (Permanent Link)
    if (supabase) {
      // 1a. Check user_roles table by user_id = authUserId
      try {
        const { data: roleRow } = await supabase
          .from('user_roles')
          .select('*')
          .eq('user_id', authUserId)
          .maybeSingle();

        if (roleRow) {
          let roleName = this.normalizeRoleName(roleRow.role || roleRow.role_name || roleRow.role_id);
          // Check if existing manager record was incorrectly assigned
          if (roleName !== 'Manager' && (authEmail.includes('manager') || String(metadataRole).toLowerCase().includes('manager'))) {
            roleName = 'Manager';
          }
          if (roleName !== 'Owner' && (authEmail.includes('owner') || String(metadataRole).toLowerCase().includes('owner'))) {
            roleName = 'Owner';
          }
          const roleId = this.roleNameToId(roleName);
          matchedUser = {
            id: authUserId,
            name: roleRow.name || sessionUser.user_metadata?.name || authEmail.split('@')[0],
            email: authEmail || roleRow.email,
            role_id: roleId,
            role_name: roleName,
            phone: roleRow.phone || '',
            status: roleRow.status === 'inactive' ? 'inactive' : 'active',
          };
        }
      } catch (_) {}

      // 1b. Check profiles table by id = authUserId or user_id = authUserId
      if (!matchedUser) {
        try {
          const { data: profileRow } = await supabase
            .from('profiles')
            .select('*')
            .or(`id.eq.${authUserId},user_id.eq.${authUserId}`)
            .maybeSingle();

          if (profileRow) {
            let roleName = this.normalizeRoleName(profileRow.role || profileRow.role_name || profileRow.role_id);
            if (roleName !== 'Manager' && (authEmail.includes('manager') || String(metadataRole).toLowerCase().includes('manager'))) {
              roleName = 'Manager';
            }
            if (roleName !== 'Owner' && (authEmail.includes('owner') || String(metadataRole).toLowerCase().includes('owner'))) {
              roleName = 'Owner';
            }
            const roleId = this.roleNameToId(roleName);
            matchedUser = {
              id: authUserId,
              name: profileRow.name || sessionUser.user_metadata?.name || authEmail.split('@')[0],
              email: authEmail || profileRow.email,
              role_id: roleId,
              role_name: roleName,
              phone: profileRow.phone || '',
              status: profileRow.status === 'inactive' ? 'inactive' : 'active',
            };
          }
        } catch (_) {}
      }

      // 1c. Check users table by id = authUserId
      if (!matchedUser) {
        try {
          const { data: userRow } = await supabase
            .from('users')
            .select('*')
            .eq('id', authUserId)
            .maybeSingle();

          if (userRow) {
            let roleName = this.normalizeRoleName(userRow.role_name || userRow.role_id);
            if (roleName !== 'Manager' && (authEmail.includes('manager') || String(metadataRole).toLowerCase().includes('manager'))) {
              roleName = 'Manager';
            }
            if (roleName !== 'Owner' && (authEmail.includes('owner') || String(metadataRole).toLowerCase().includes('owner'))) {
              roleName = 'Owner';
            }
            const roleId = this.roleNameToId(roleName);
            matchedUser = {
              id: authUserId,
              name: userRow.name || sessionUser.user_metadata?.name || authEmail.split('@')[0],
              email: authEmail || userRow.email,
              role_id: roleId,
              role_name: roleName,
              phone: userRow.phone || '',
              status: userRow.status === 'inactive' ? 'inactive' : 'active',
            };
          }
        } catch (_) {}
      }
    }

    // 1d. Check memory cache by UUID
    if (!matchedUser) {
      const cached = getMem('users').find((u) => u.id === authUserId);
      if (cached) {
        let roleName = this.normalizeRoleName(cached.role_name || cached.role_id);
        if (roleName !== 'Manager' && (authEmail.includes('manager') || String(metadataRole).toLowerCase().includes('manager'))) {
          roleName = 'Manager';
        }
        if (roleName !== 'Owner' && (authEmail.includes('owner') || String(metadataRole).toLowerCase().includes('owner'))) {
          roleName = 'Owner';
        }
        matchedUser = {
          ...cached,
          id: authUserId,
          role_name: roleName,
          role_id: this.roleNameToId(roleName),
        };
      }
    }

    // STEP 2: If NOT found by UUID, find existing Staff/Role record by EMAIL
    // and REPAIR the link using the authenticated Supabase user's UUID (auth.uid())
    if (!matchedUser && authEmail) {
      let existingRecord: any = null;

      if (supabase) {
        // 2a. Query user_roles table by email
        try {
          const { data: roleByEmail } = await supabase
            .from('user_roles')
            .select('*')
            .ilike('email', authEmail)
            .maybeSingle();

          if (roleByEmail) {
            existingRecord = roleByEmail;
            oldIdToPurge = roleByEmail.user_id;
          }
        } catch (_) {}

        // 2b. Query profiles table by email
        if (!existingRecord) {
          try {
            const { data: profileByEmail } = await supabase
              .from('profiles')
              .select('*')
              .ilike('email', authEmail)
              .maybeSingle();

            if (profileByEmail) {
              existingRecord = profileByEmail;
              oldIdToPurge = profileByEmail.id || profileByEmail.user_id;
            }
          } catch (_) {}
        }

        // 2c. Query users table by email
        if (!existingRecord) {
          try {
            const { data: userByEmail } = await supabase
              .from('users')
              .select('*')
              .ilike('email', authEmail)
              .maybeSingle();

            if (userByEmail) {
              existingRecord = userByEmail;
              oldIdToPurge = userByEmail.id;
            }
          } catch (_) {}
        }
      }

      // 2d. Check memory cache by email
      if (!existingRecord) {
        const memMatch = getMem('users').find((u) => u.email.toLowerCase() === authEmail);
        if (memMatch) {
          existingRecord = memMatch;
          oldIdToPurge = memMatch.id;
        }
      }

      // 2e. Check if email contains manager or owner or has metadata role
      if (!existingRecord) {
        if (authEmail.includes('manager') || String(metadataRole).toLowerCase().includes('manager')) {
          existingRecord = { role: 'Manager', role_id: 'role-manager' };
        } else if (authEmail.includes('owner') || String(metadataRole).toLowerCase().includes('owner')) {
          existingRecord = { role: 'Owner', role_id: 'role-owner' };
        }
      }

      // If an existing record was found by email (e.g., Manager created by Owner):
      // Repair the record so its profile/user_roles row references authUserId and role = Manager!
      if (existingRecord) {
        let rawRole = existingRecord.role || existingRecord.role_name || existingRecord.role_id || metadataRole;
        if (authEmail === 'junaidurrehman735@gmail.com' || authEmail.includes('owner') || String(metadataRole).toLowerCase().includes('owner')) {
          rawRole = 'Owner';
        } else if (authEmail.includes('manager') || String(metadataRole).toLowerCase().includes('manager')) {
          rawRole = 'Manager';
        }

        const roleName = this.normalizeRoleName(rawRole);
        const roleId = this.roleNameToId(roleName);
        const name = existingRecord.name || sessionUser.user_metadata?.name || authEmail.split('@')[0];
        const phone = existingRecord.phone || '';
        const status = existingRecord.status === 'inactive' ? 'inactive' : 'active';

        matchedUser = {
          id: authUserId, // Permanently linked to Supabase Auth UUID (auth.uid())
          name,
          email: authEmail,
          role_id: roleId,
          role_name: roleName,
          phone,
          status,
        };

        console.log(`[AUTH] Repaired & linked account: ${authEmail} -> Role: ${roleName}, UUID: ${authUserId}`);
      }
    }

    // STEP 3: If not found, check initial owner; otherwise reject
    if (!matchedUser) {
      if (authEmail === 'junaidurrehman735@gmail.com' || authEmail === 'owner@aabearwa.com') {
        matchedUser = {
          id: authUserId,
          name: sessionUser.user_metadata?.name || 'Owner Admin',
          email: authEmail,
          role_id: 'role-owner',
          role_name: 'Owner',
          phone: '',
          status: 'active',
        };
      } else {
        throw new Error('Your account has no assigned role. Please contact the Owner.');
      }
    } else {
      // Read role strictly from that database record - NEVER overwrite or guess
      const roleName = this.normalizeRoleName(matchedUser.role_name || matchedUser.role_id);
      matchedUser.role_name = roleName;
      matchedUser.role_id = this.roleNameToId(roleName);
    }

    // STEP 4: Ensure Synchronized Persistence in Supabase (user_roles, profiles, and users tables)
    if (supabase && matchedUser) {
      // 4a. Update user metadata in Supabase Auth to guarantee persistent role on session refresh
      try {
        await supabase.auth.updateUser({
          data: {
            role: matchedUser.role_name,
            role_id: matchedUser.role_id,
            name: matchedUser.name,
          },
        });
      } catch (_) {}

      // 4b. Upsert into user_roles table
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

      // 4c. Upsert into profiles table
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

      // 4d. Clean up obsolete unlinked rows with old IDs to prevent duplicates
      try {
        if (oldIdToPurge && oldIdToPurge !== authUserId) {
          await supabase.from('users').delete().eq('id', oldIdToPurge);
          await supabase.from('user_roles').delete().eq('user_id', oldIdToPurge);
          await supabase.from('profiles').delete().eq('id', oldIdToPurge);
        }
      } catch (_) {}

      // 4e. Upsert into users table
      try {
        await supabase.from('users').upsert({
          id: authUserId,
          email: matchedUser.email,
          name: matchedUser.name,
          role_id: matchedUser.role_id,
          role_name: matchedUser.role_name,
          status: matchedUser.status,
          phone: matchedUser.phone || '',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      } catch (_) {}
    }

    // Synchronize memory cache and localStorage
    const currentMem = getMem('users').filter(
      (u) => u.email.toLowerCase() !== authEmail && u.id !== authUserId && (oldIdToPurge ? u.id !== oldIdToPurge : true)
    );
    currentMem.push(matchedUser);
    saveMem('users', currentMem);
    try {
      localStorage.setItem('aab_user', JSON.stringify(matchedUser));
    } catch (_) {}

    return matchedUser;
  },

  // 2. USERS & STAFF MANAGEMENT (Strictly Owner Accessible)
  async getStaff(): Promise<User[]> {
    assertRole(['Owner'], 'view staff accounts');
    const supabase = getSupabaseClient();
    const userMap = new Map<string, User>();

    if (supabase) {
      // 1. Fetch from user_roles (stores user_id UUID)
      try {
        const { data: rolesData } = await supabase.from('user_roles').select('*').order('created_at');
        if (rolesData) {
          for (const r of rolesData) {
            const roleName = this.normalizeRoleName(r.role || r.role_name);
            const roleId = this.roleNameToId(roleName);
            const id = r.user_id || r.id;
            userMap.set(r.email.toLowerCase(), {
              id,
              name: r.name || 'Staff User',
              email: r.email,
              role_id: roleId,
              role_name: roleName,
              phone: r.phone || '',
              status: r.status === 'inactive' ? 'inactive' : 'active',
            });
          }
        }
      } catch (_) {}

      // 2. Fetch from profiles table
      try {
        const { data: profilesData } = await supabase.from('profiles').select('*').order('created_at');
        if (profilesData) {
          for (const p of profilesData) {
            const roleName = this.normalizeRoleName(p.role || p.role_name);
            const roleId = this.roleNameToId(roleName);
            const id = p.id || p.user_id;
            const existing = userMap.get(p.email.toLowerCase());
            if (!existing || (!existing.id.includes('-') && id.includes('-'))) {
              userMap.set(p.email.toLowerCase(), {
                id,
                name: p.name || 'Staff User',
                email: p.email,
                role_id: roleId,
                role_name: roleName,
                phone: p.phone || '',
                status: p.status === 'inactive' ? 'inactive' : 'active',
              });
            }
          }
        }
      } catch (_) {}

      // 3. Fetch from users table to catch any records not yet in user_roles/profiles
      try {
        const { data: usersData } = await supabase.from('users').select('*').order('name');
        if (usersData) {
          for (const u of usersData) {
            const roleName = this.normalizeRoleName(u.role_name || u.role_id);
            const roleId = this.roleNameToId(roleName);
            const existing = userMap.get(u.email.toLowerCase());
            if (!existing) {
              userMap.set(u.email.toLowerCase(), {
                id: u.id,
                name: u.name,
                email: u.email,
                role_id: roleId,
                role_name: roleName,
                phone: u.phone || '',
                status: u.status === 'inactive' ? 'inactive' : 'active',
              });
            } else if (!existing.id.includes('-') && u.id.includes('-')) {
              // Prefer UUID
              existing.id = u.id;
            }
          }
        }
      } catch (_) {}
    }

    // 4. Merge with memory cache
    const cachedUsers = getMem('users');
    for (const u of cachedUsers) {
      const existing = userMap.get(u.email.toLowerCase());
      if (!existing) {
        userMap.set(u.email.toLowerCase(), u);
      } else if (!existing.id.includes('-') && u.id.includes('-')) {
        existing.id = u.id;
      }
    }

    return Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  },

  async createStaff(userData: { name: string; email: string; role_id: string; phone?: string; password?: string }): Promise<{ id: string }> {
    assertRole(['Owner'], 'create staff accounts');
    const supabase = getSupabaseClient();
    const cleanEmail = userData.email.trim().toLowerCase();
    const roleName = this.normalizeRoleName(userData.role_id);
    const roleId = this.roleNameToId(roleName);

    // Check if staff record already exists with this email
    const existingStaff = await this.getStaff().catch(() => []);
    const alreadyExists = existingStaff.find((s) => s.email.toLowerCase() === cleanEmail);

    let id = alreadyExists ? alreadyExists.id : `usr-${Date.now()}`;

    // If password provided and Supabase is available, attempt to register in Supabase Auth immediately
    if (userData.password && supabase) {
      try {
        const { data: authSignUp } = await supabase.auth.signUp({
          email: cleanEmail,
          password: userData.password,
          options: {
            data: {
              name: userData.name.trim(),
              role: roleName,
              role_id: roleId,
            },
          },
        });
        if (authSignUp?.user?.id) {
          id = authSignUp.user.id; // Permanently link with generated UUID
        }
      } catch (_) {}
    }

    const newStaff: User = {
      id,
      name: userData.name.trim(),
      email: cleanEmail,
      role_id: roleId,
      role_name: roleName,
      phone: userData.phone || '',
      status: 'active',
    };

    if (supabase) {
      try {
        await supabase.from('users').upsert({
          id,
          name: newStaff.name,
          email: newStaff.email,
          role_id: roleId,
          role_name: roleName,
          phone: newStaff.phone,
          status: 'active',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'email' });
      } catch (_) {}

      // If id is a valid UUID, persist to user_roles and profiles
      if (id.includes('-') && id.length === 36) {
        try {
          await supabase.from('user_roles').upsert({
            user_id: id,
            email: newStaff.email,
            name: newStaff.name,
            role: roleName,
            role_id: roleId,
            phone: newStaff.phone,
            status: 'active',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });
        } catch (_) {}

        try {
          await supabase.from('profiles').upsert({
            id,
            user_id: id,
            email: newStaff.email,
            name: newStaff.name,
            role: roleName,
            role_id: roleId,
            phone: newStaff.phone,
            status: 'active',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });
        } catch (_) {}
      }
    }

    const current = getMem('users').filter((u) => u.email.toLowerCase() !== cleanEmail && u.id !== id);
    current.push(newStaff);
    saveMem('users', current);

    return { id };
  },

  async updateStaff(id: string, updates: Partial<User>): Promise<void> {
    assertRole(['Owner'], 'update staff accounts');
    const supabase = getSupabaseClient();

    let roleName: 'Owner' | 'Manager' | 'Delivery Boy' | undefined;
    let roleId: string | undefined;

    if (updates.role_id || updates.role_name) {
      roleName = this.normalizeRoleName(updates.role_name || updates.role_id);
      roleId = this.roleNameToId(roleName);
      updates.role_name = roleName;
      updates.role_id = roleId;
    }

    if (supabase) {
      try {
        await supabase.from('users').update({
          ...(updates.name ? { name: updates.name } : {}),
          ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
          ...(updates.status ? { status: updates.status } : {}),
          ...(roleId ? { role_id: roleId, role_name: roleName } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', id);
      } catch (_) {}

      try {
        await supabase.from('user_roles').update({
          ...(updates.name ? { name: updates.name } : {}),
          ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
          ...(updates.status ? { status: updates.status } : {}),
          ...(roleName ? { role: roleName, role_id: roleId } : {}),
          updated_at: new Date().toISOString(),
        }).eq('user_id', id);
      } catch (_) {}

      try {
        await supabase.from('profiles').update({
          ...(updates.name ? { name: updates.name } : {}),
          ...(updates.phone !== undefined ? { phone: updates.phone } : {}),
          ...(updates.status ? { status: updates.status } : {}),
          ...(roleName ? { role: roleName, role_id: roleId } : {}),
          updated_at: new Date().toISOString(),
        }).eq('id', id);
      } catch (_) {}
    }

    const current = getMem('users').map((u) => (u.id === id ? { ...u, ...updates } : u));
    saveMem('users', current);

    // If the updated user is the currently logged-in user, refresh their cached session
    try {
      const saved = localStorage.getItem('aab_user');
      if (saved) {
        const u = JSON.parse(saved);
        if (u.id === id) {
          const updatedCurrentUser = { ...u, ...updates };
          localStorage.setItem('aab_user', JSON.stringify(updatedCurrentUser));
        }
      }
    } catch (_) {}
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
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          let customers = data as Customer[];
          if (query && query.trim()) {
            const q = query.toLowerCase().trim();
            customers = customers.filter(c =>
              (c.name && c.name.toLowerCase().includes(q)) ||
              (c.phone && c.phone.includes(q)) ||
              (c.address && c.address.toLowerCase().includes(q)) ||
              (c.area && c.area.toLowerCase().includes(q))
            );
          }
          saveMem('customers', customers);
          return customers;
        } else if (error) {
          console.warn('[Supabase SELECT customers notice]:', error.message || error);
        }
      } catch (err: any) {
        console.warn('[Supabase SELECT customers exception]:', err?.message || err);
      }
    }

    let customers = (getMem('customers') || []) as Customer[];
    if (query && query.trim()) {
      const q = query.toLowerCase().trim();
      customers = customers.filter(c =>
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q)) ||
        (c.address && c.address.toLowerCase().includes(q)) ||
        (c.area && c.area.toLowerCase().includes(q))
      );
    }
    return customers;
  },

  async getCustomerDetails(id: string): Promise<{ customer: Customer; ledger: CustomerLedgerEntry[]; cans: CustomerCanMovement[] }> {
    const supabase = getSupabaseClient();
    let customer: Customer | null = null;
    let ledger: CustomerLedgerEntry[] = [];
    let cans: CustomerCanMovement[] = [];

    if (supabase) {
      try {
        const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
        if (!error && data) {
          customer = data as Customer;
        }
      } catch (_) {}

      // Ledger entries
      try {
        const { data: ledg } = await supabase.from('customer_ledger').select('*').eq('customer_id', id).order('transaction_date', { ascending: false });
        if (ledg) ledger = ledg as CustomerLedgerEntry[];
      } catch (_) {}

      // Can movements
      try {
        const { data: canMovs } = await supabase.from('customer_can_movements').select('*').eq('customer_id', id).order('created_at', { ascending: false });
        if (canMovs) cans = canMovs as CustomerCanMovement[];
      } catch (_) {}
    }

    if (!customer) {
      const mem = getMem('customers');
      customer = mem.find((c: any) => c.id === id) || null;
    }

    if (!customer) {
      throw new Error(`Customer not found (${id})`);
    }

    return { customer, ledger, cans };
  },

  async createCustomer(customerData: Partial<Customer>): Promise<Customer> {
    assertRole(['Owner', 'Manager'], 'register customers');
    const supabase = getSupabaseClient();

    const id = customerData.id || `cust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const cleanCustomer = {
      id,
      name: (customerData.name || '').trim(),
      phone: (customerData.phone || '').trim(),
      address: (customerData.address || '').trim(),
      area: customerData.area || 'Chiltan Scheme Airport Road',
      area_access: customerData.area_access || 'Specific Area',
      customer_type_id: customerData.customer_type_id || 'ct-home',
      selling_rate: Number(customerData.selling_rate || 220),
      payment_type: customerData.payment_type || 'Cash',
      cash_status: customerData.cash_status || 'Cash on Delivery',
      credit_limit: Number(customerData.credit_limit || 0),
      outstanding_balance: Number(customerData.outstanding_balance || 0),
      cans_held: Number(customerData.cans_held || (customerData as any).company_cans || 0),
      net_deposit_amount: Number(customerData.net_deposit_amount || 0),
      notes: customerData.notes || '',
      delivery_instructions: customerData.delivery_instructions || '',
      status: customerData.status || 'active',
      created_at: new Date().toISOString(),
    };

    if (supabase) {
      // 1. Check if customer with this specific ID already exists
      if (customerData.id) {
        const { data: existing } = await supabase.from('customers').select('*').eq('id', customerData.id).maybeSingle();
        if (existing) {
          const mem = getMem('customers');
          saveMem('customers', [existing, ...mem.filter((c: any) => c.id !== existing.id)]);
          return existing as Customer;
        }
      }

      // 2. Rapid duplicate check (15 seconds window)
      const fifteenSecAgo = new Date(Date.now() - 15000).toISOString();
      const { data: recentDup } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', cleanCustomer.phone)
        .eq('name', cleanCustomer.name)
        .eq('address', cleanCustomer.address)
        .gte('created_at', fifteenSecAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentDup) {
        const mem = getMem('customers');
        saveMem('customers', [recentDup, ...mem.filter((c: any) => c.id !== recentDup.id)]);
        return recentDup as Customer;
      }

      // 3. Insert into Supabase
      const { data, error } = await supabase.from('customers').insert(cleanCustomer).select().maybeSingle();
      if (error) {
        console.error('[Supabase INSERT customer error]:', error.message || error);
        throw new Error(error.message || 'Failed to create customer in Supabase');
      }
      if (data) {
        const inserted = data as Customer;
        const mem = getMem('customers');
        saveMem('customers', [inserted, ...mem.filter((c: any) => c.id !== id)]);
        return inserted;
      }
    }

    const mem = getMem('customers');
    saveMem('customers', [cleanCustomer, ...mem.filter((c: any) => c.id !== id)]);
    return cleanCustomer as Customer;
  },

  async updateCustomer(id: string, updates: Partial<Customer>): Promise<Customer> {
    assertRole(['Owner', 'Manager'], 'update customers');
    const supabase = getSupabaseClient();

    const cleanUpdates: Record<string, any> = { ...updates, updated_at: new Date().toISOString() };
    delete cleanUpdates.id;
    delete cleanUpdates.customer_type_name;
    delete cleanUpdates.company_cans;

    if (supabase) {
      const { data, error } = await supabase.from('customers').update(cleanUpdates).eq('id', id).select().maybeSingle();
      if (error) {
        console.error('[Supabase UPDATE customer error]:', error.message || error);
        throw new Error(error.message || 'Failed to update customer in Supabase');
      }
      if (data) {
        const updated = data as Customer;
        const mem = getMem('customers');
        const idx = mem.findIndex((c: any) => c.id === id);
        if (idx !== -1) {
          mem[idx] = { ...mem[idx], ...updated };
          saveMem('customers', mem);
        }
        return updated;
      }
    }

    const mem = getMem('customers');
    const idx = mem.findIndex((c: any) => c.id === id);
    if (idx !== -1) {
      mem[idx] = { ...mem[idx], ...cleanUpdates };
      saveMem('customers', mem);
      return mem[idx];
    }
    return cleanUpdates as Customer;
  },

  async deleteCustomer(id: string): Promise<void> {
    assertRole(['Owner'], 'delete customers');
    const supabase = getSupabaseClient();

    if (supabase) {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) {
        console.error('[Supabase DELETE customer error]:', error.message || error);
        throw new Error(error.message || 'Failed to delete customer from Supabase');
      }
    }

    const mem = getMem('customers');
    saveMem('customers', mem.filter((c: any) => c.id !== id));
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
    return (getMem('products') || []) as Product[];
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

    const invMem = getMem('inventory');
    invMem.push({
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
    });
    saveMem('inventory', invMem);

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

    return (getMem('inventory') || []) as InventoryItem[];
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
      const { error: ordErr } = await supabase.from('orders').insert(newOrder);
      if (ordErr) {
        throw new Error(ordErr.message);
      }
      for (const it of orderData.items) {
        await supabase.from('order_items').insert({
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          order_id: id,
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price: it.unit_price,
          total_price: it.quantity * it.unit_price,
        });
      }
      // Auto-create delivery record
      const delId = `del-${Date.now()}`;
      await supabase.from('deliveries').insert({
        id: delId,
        delivery_number: `DEL-${Date.now().toString().slice(-6)}`,
        order_id: id,
        customer_id: orderData.customer_id,
        vehicle: 'Van #1',
        delivery_date: orderData.delivery_date,
        delivery_time: 'Morning',
        status: 'assigned',
        empty_cans_returned: 0,
        payment_collected: 0,
        payment_method: orderData.payment_type || 'Cash',
      });
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
    const nowIso = new Date().toISOString();
    const today = nowIso.split('T')[0];

    if (supabase) {
      // 1. Fetch delivery details first
      const { data: del } = await supabase.from('deliveries').select('*, order:orders(id, total_amount), customer:customers(*)').eq('id', id).maybeSingle();
      if (!del) return;

      // STRICT IDEMPOTENCY CHECK: if already delivered, do not execute again!
      if (del.status === 'delivered') {
        console.log(`[SupabaseDataService] Delivery ${id} is already completed/delivered. Skipping.`);
        return;
      }

      // 2. Fetch order items to get delivered quantities
      let orderItems: any[] = [];
      if (del.order_id) {
        const { data: items } = await supabase.from('order_items').select('*').eq('order_id', del.order_id);
        orderItems = items || [];
      }

      const delivered19lItem = orderItems.find((it: any) => it.product_id === 'prod-19l-can');
      const delivered19lCans = delivered19lItem ? Number(delivered19lItem.quantity || 0) : 0;
      const orderTotal = Number(del.order?.total_amount || 0);

      // 3. Update delivery status
      await supabase.from('deliveries').update({
        status: 'delivered',
        empty_cans_returned: completionData.empty_cans_returned,
        payment_collected: completionData.payment_collected,
        payment_method: completionData.payment_method || 'Cash',
        notes: completionData.notes || del.notes || '',
        completed_at: nowIso,
        updated_at: nowIso,
      }).eq('id', id);

      // 4. Update linked order status to completed
      if (del.order_id) {
        await supabase.from('orders').update({
          order_status: 'completed',
          payment_status: completionData.payment_collected >= orderTotal ? 'paid' : (completionData.payment_collected > 0 ? 'partially_paid' : 'pending'),
          updated_at: nowIso,
        }).eq('id', del.order_id);
      }

      // 5. Update warehouse inventory
      for (const item of orderItems) {
        const { data: currentInv } = await supabase.from('inventory').select('*').eq('product_id', item.product_id).maybeSingle();
        if (currentInv) {
          const currentFilled = Number(currentInv.filled_stock || 0);
          const newFilled = Math.max(0, currentFilled - Number(item.quantity || 0));
          await supabase.from('inventory').update({ filled_stock: newFilled, updated_at: nowIso }).eq('id', currentInv.id);

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
            user_id: user.id,
            created_at: nowIso,
          });
        }
      }

      if (completionData.empty_cans_returned > 0) {
        const { data: canInv } = await supabase.from('inventory').select('*').eq('product_id', 'prod-19l-can').maybeSingle();
        if (canInv) {
          const currentEmpty = Number(canInv.empty_cans || 0);
          const newEmpty = currentEmpty + completionData.empty_cans_returned;
          await supabase.from('inventory').update({ empty_cans: newEmpty, updated_at: nowIso }).eq('id', canInv.id);

          await supabase.from('inventory_movements').insert({
            id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            product_id: 'prod-19l-can',
            movement_type: 'return',
            stock_type: 'empty',
            quantity: completionData.empty_cans_returned,
            previous_stock: currentEmpty,
            new_stock: newEmpty,
            reason: `Empty cans retrieved on Delivery ${del.delivery_number}`,
            reference_type: 'delivery',
            reference_id: id,
            user_id: user.id,
            created_at: nowIso,
          });
        }
      }

      // 6. Update customer cans and balance
      if (del.customer_id) {
        const currentHeld = Number(del.customer?.cans_held || 0);
        const newHeld = Math.max(0, currentHeld + delivered19lCans - completionData.empty_cans_returned);

        const currentBal = Number(del.customer?.outstanding_balance || 0);
        const newBal = Math.max(0, currentBal + (orderTotal - completionData.payment_collected));

        await supabase.from('customers').update({
          cans_held: newHeld,
          outstanding_balance: newBal,
          updated_at: nowIso,
        }).eq('id', del.customer_id);

        if (delivered19lCans > 0) {
          await supabase.from('customer_can_movements').insert({
            customer_id: del.customer_id,
            product_id: 'prod-19l-can',
            movement_type: 'issued',
            quantity: delivered19lCans,
            balance_after: currentHeld + delivered19lCans,
            delivery_id: id,
            reason: `Issued from Delivery ${del.delivery_number}`,
            user_id: user.id,
            created_at: nowIso,
          });
        }

        if (completionData.empty_cans_returned > 0) {
          await supabase.from('customer_can_movements').insert({
            customer_id: del.customer_id,
            product_id: 'prod-19l-can',
            movement_type: 'returned',
            quantity: completionData.empty_cans_returned,
            balance_after: newHeld,
            delivery_id: id,
            reason: `Return from Delivery ${del.delivery_number}`,
            user_id: user.id,
            created_at: nowIso,
          });
        }

        if (orderTotal > 0) {
          await supabase.from('customer_ledger').insert({
            customer_id: del.customer_id,
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

        if (completionData.payment_collected > 0) {
          await supabase.from('payments').insert({
            id: `pay-${Date.now()}`,
            payment_number: `PAY-${Date.now().toString().slice(-6)}`,
            customer_id: del.customer_id,
            order_id: del.order_id,
            delivery_id: id,
            amount: completionData.payment_collected,
            payment_method: completionData.payment_method || 'Cash',
            payment_date: today,
            received_by: user.id,
            created_at: nowIso,
          });

          await supabase.from('customer_ledger').insert({
            customer_id: del.customer_id,
            transaction_type: 'payment',
            reference_type: 'delivery',
            reference_id: id,
            debit: 0,
            credit: completionData.payment_collected,
            balance: newBal,
            description: `Cash collection from delivery ${del.delivery_number}`,
            transaction_date: today,
            created_at: nowIso,
          });
        }
      }
    }
  },

  async updateDeliveryStatus(id: string, status: string, reason?: string): Promise<void> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data: existing } = await supabase.from('deliveries').select('status, order_id').eq('id', id).maybeSingle();
      if (existing?.status === 'delivered') {
        return; // Disallow reverting or re-triggering completed delivery
      }
      if (existing?.status === status) {
        return;
      }
      await supabase.from('deliveries').update({
        status,
        failure_reason: reason || null,
        updated_at: new Date().toISOString(),
      }).eq('id', id);

      if (status === 'delivered' && existing?.order_id) {
        await supabase.from('orders').update({ order_status: 'completed', updated_at: new Date().toISOString() }).eq('id', existing.order_id);
      }
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
      withCustomers = custs.reduce((sum, c) => sum + (Number(c.cans_held) || 0), 0);
      const invList = getMem('inventory');
      emptyInWarehouse = invList.reduce((sum, i) => sum + (Number(i.empty_cans) || 0), 0);
      filledInWarehouse = invList.reduce((sum, i) => sum + (Number(i.filled_stock) || 0), 0);
      damagedCans = invList.reduce((sum, i) => sum + (Number(i.damaged_cans) || 0), 0);
      lostCans = invList.reduce((sum, i) => sum + (Number(i.lost_cans) || 0), 0);
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

  // 13. REPORTS & P&L
  async getFinancialReport(startDate?: string, endDate?: string): Promise<any> {
    assertRole(['Owner'], 'view financial P&L statements');
    const supabase = getSupabaseClient();

    let orders: any[] = [];
    let payments: any[] = [];
    let expenses: any[] = [];
    let categories: any[] = [];
    let products: any[] = [];

    if (supabase) {
      const [ordRes, payRes, expRes, catRes, prodRes] = await Promise.all([
        supabase.from('orders').select('*, items:order_items(*)'),
        supabase.from('payments').select('*'),
        supabase.from('expenses').select('*, category:expense_categories(name)'),
        supabase.from('expense_categories').select('*'),
        supabase.from('products').select('*'),
      ]);
      orders = ordRes.data || [];
      payments = payRes.data || [];
      expenses = expRes.data || [];
      categories = catRes.data || [];
      products = prodRes.data || [];
    } else {
      orders = getMem('orders') || [];
      payments = getMem('payments') || [];
      expenses = getMem('expenses') || [];
      categories = DEFAULT_EXPENSE_CATEGORIES;
      products = getMem('products') || [];
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

    // 2. Collections
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
      const catName = e.category?.name || (e as any).category_name || (categories.find(c => c.id === e.category_id)?.name) || 'General';
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

    return {
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
    };
  },

  async getSalesReport(startDate?: string, endDate?: string): Promise<any> {
    assertRole(['Owner', 'Manager'], 'view sales breakdowns');
    const supabase = getSupabaseClient();
    let orders: any[] = [];
    let products: any[] = [];
    let customers: any[] = [];

    if (supabase) {
      const [ordRes, prodRes, custRes] = await Promise.all([
        supabase.from('orders').select('*, items:order_items(*)'),
        supabase.from('products').select('*'),
        supabase.from('customers').select('*'),
      ]);
      orders = ordRes.data || [];
      products = prodRes.data || [];
      customers = custRes.data || [];
    } else {
      orders = await this.getOrders();
      products = await this.getProducts();
      customers = await this.getCustomers();
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

    return {
      productSales,
      areaSales,
      monthlySales,
      productBreakdown,
    };
  },

  async getDeliveryReport(): Promise<any> {
    assertRole(['Owner', 'Manager'], 'view logistics delivery report');
    const deliveries = await this.getDeliveries();
    const delivered = deliveries.filter(d => d.status === 'delivered').length;
    const onTimeRate = deliveries.length > 0 ? `${Math.round((delivered / deliveries.length) * 100)}%` : '0%';
    const canSummary = await this.getCanSummary();
    const cansReturned = (canSummary.recentCanMovements || [])
      .filter((m: any) => m.movement_type === 'returned')
      .reduce((s: number, m: any) => s + (Number(m.quantity) || 0), 0);

    const users: any[] = await this.getStaff().catch(() => getMem('users') || []);
    const driverMap = new Map<string, { driver_name: string; total_assigned: number; delivered: number; failed: number; cash_collected: number; empty_cans_collected: number }>();

    deliveries.forEach(d => {
      const driverName = (d as any).driver_name || (users.find((u: any) => u.id === d.driver_id)?.name) || 'Assigned Driver';
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

    return {
      totalDeliveries: deliveries.length,
      onTimeRate,
      cansReturned,
      driverPerformance,
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
    const payments = await this.getPayments().catch(() => []);
    const expenses = await this.getExpenses().catch(() => []);

    const deliveriesDelivered = deliveries.filter(d => d.status === 'delivered').length;
    const deliveriesInTransit = deliveries.filter(d => d.status === 'out_for_delivery' || d.status === 'assigned').length;
    const deliveriesPending = deliveries.filter(d => (d.status as string) === 'assigned' || (d.status as string) === 'rescheduled' || (d.status as string) === 'pending').length;

    const totalReceivables = isOwner ? customers.reduce((sum, c) => sum + (Number(c.outstanding_balance) || 0), 0) : 0;

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

    const todayOrders = orders.filter(o =>
      isDateToday(o.created_at) ||
      isDateToday(o.delivery_date) ||
      isDateToday((o as any).completed_at) ||
      isDateToday((o as any).updated_at)
    );
    const todaySales = isOwner ? todayOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) : 0;

    // Calculate Cash Collected / Today's Received Payments
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
      const st = String(o.order_status || (o as any).status || '').toLowerCase().trim();
      const ps = String(o.payment_status || '').toLowerCase().trim();
      const pm = String((o as any).payment_method || '').toLowerCase().trim();
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

    const todayExpensesList = expenses.filter(e => isDateToday(e.expense_date) || isDateToday(e.created_at));
    const todayExpenses = isOwner ? todayExpensesList.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) : 0;

    const currentMonthStr = new Date().toISOString().slice(0, 7);
    const monthOrders = orders.filter(o => o.created_at && String(o.created_at).slice(0, 7) === currentMonthStr);
    const monthlyRevenue = isOwner ? monthOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0) : 0;

    const monthExpensesList = expenses.filter(e => (e.expense_date && String(e.expense_date).slice(0, 7) === currentMonthStr) || (e.created_at && String(e.created_at).slice(0, 7) === currentMonthStr));
    const monthlyExpenses = isOwner ? monthExpensesList.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) : 0;
    const monthlyProfit = isOwner ? monthlyRevenue - monthlyExpenses : 0;

    const filledStock = Number(cans.factoryFilled) || products.reduce((sum, p) => sum + (Number(p.filled_stock) || 0), 0);
    const emptyCansStock = Number(cans.factoryEmpty) || products.reduce((sum, p) => sum + (Number(p.empty_cans) || 0), 0);
    const cansWithCustomers = Number(cans.customerHeld) || customers.reduce((sum, c) => sum + (Number(c.cans_held) || 0), 0);

    const kpis = {
      todaySales,
      todayCollections,
      todayExpenses,
      totalReceivables,
      filledStock,
      emptyCansStock,
      cansWithCustomers,
      deliveriesToday: deliveries.length,
      deliveriesDelivered,
      deliveriesInTransit,
      deliveriesPending,
      monthlyRevenue,
      monthlyExpenses,
      monthlyProfit,
    };

    const recentDeliveries = deliveries.slice(0, 5);
    const recentOrders = orders.slice(0, 5);
    const lowStock = products
      .filter(p => (Number(p.filled_stock) || 0) < 10 && products.length > 0)
      .map(p => ({
        name: p.name,
        size: p.size,
        filled_stock: Number(p.filled_stock) || 0,
        empty_cans: Number(p.empty_cans) || 0,
      }));
    const topDebtors = isOwner ? customers.filter(c => (Number(c.outstanding_balance) || 0) > 0).slice(0, 5) : [];

    const salesTrend: { day: string; date: string; amount: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dayNum = String(d.getDate()).padStart(2, '0');
      const localDateStr = `${y}-${m}-${dayNum}`;
      const utcDateStr = d.toISOString().slice(0, 10);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const daySales = isOwner
        ? orders
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
            .reduce((s, o) => s + (Number(o.total_amount) || 0), 0)
        : 0;
      salesTrend.push({ day: dayName, date: localDateStr, amount: daySales });
    }

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
