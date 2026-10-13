import { SupabaseDataService } from './supabaseService.ts';
import { getSupabaseClient } from './supabase.ts';
import type { User, Permission } from '../types/index.ts';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

function getAuthToken(): string | null {
  return localStorage.getItem('aab_auth_token');
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('aab_auth_token', token);
  } else {
    localStorage.removeItem('aab_auth_token');
  }
}

// -----------------------------------------------------------------------------
// Direct Supabase PostgreSQL Router & Role Access Control
// -----------------------------------------------------------------------------

async function handleSupabaseRoute<T>(method: string, endpoint: string, body?: any): Promise<T> {
  const cleanPath = endpoint.split('?')[0].replace(/^\/api/, '');
  const pathParts = cleanPath.split('/').filter(Boolean);

  // 1. AUTH & PROFILE (PERMANENT SUPABASE AUTH.UID() LINKING)
  if (pathParts[0] === 'auth' && pathParts[1] === 'resolve') {
    const sessionUser = body?.user;
    if (!sessionUser) {
      throw new ApiError('Session user object with UUID required', 400);
    }
    const user = await SupabaseDataService.resolveAndLinkUser(sessionUser);
    const permissions = await SupabaseDataService.getRolePermissions(user.role_id);
    return { user, permissions } as unknown as T;
  }

  if (pathParts[0] === 'auth' && pathParts[1] === 'me') {
    const supabase = getSupabaseClient();
    let user: User | null = null;

    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        user = await SupabaseDataService.resolveAndLinkUser(session.user);
      }
    }

    if (!user) {
      const saved = localStorage.getItem('aab_user');
      if (saved) {
        user = JSON.parse(saved);
      }
    }

    if (!user) {
      throw new ApiError('Authentication required', 401);
    }

    if (user.status === 'inactive') {
      throw new ApiError('Your account has been deactivated. Please contact the business Owner.', 403);
    }

    const permissions = await SupabaseDataService.getRolePermissions(user.role_id);
    return { user, permissions } as unknown as T;
  }

  if (pathParts[0] === 'auth' && pathParts[1] === 'change-password') {
    const supabase = getSupabaseClient();
    if (!supabase) {
      throw new ApiError('Supabase is not configured', 500);
    }
    const { error } = await supabase.auth.updateUser({ password: body.newPassword });
    if (error) {
      throw new ApiError(error.message, 400);
    }
    return { success: true } as unknown as T;
  }

  // 2. ROLES
  if (pathParts[0] === 'roles') {
    if (pathParts.length === 1) {
      return (await SupabaseDataService.getRoles()) as unknown as T;
    }
    if (pathParts[2] === 'permissions') {
      const roleId = pathParts[1];
      if (method === 'GET') {
        return (await SupabaseDataService.getRolePermissions(roleId)) as unknown as T;
      }
      if (method === 'PUT') {
        await SupabaseDataService.updateRolePermissions(roleId, body.permissions);
        return { success: true } as unknown as T;
      }
    }
  }

  // 3. STAFF MANAGEMENT
  if (pathParts[0] === 'staff') {
    if (method === 'GET') {
      return (await SupabaseDataService.getStaff()) as unknown as T;
    }
    if (method === 'POST') {
      return (await SupabaseDataService.createStaff(body)) as unknown as T;
    }
    if (method === 'PUT' && pathParts[1]) {
      await SupabaseDataService.updateStaff(pathParts[1], body);
      return { success: true } as unknown as T;
    }
  }

  // 4. CUSTOMERS
  if (pathParts[0] === 'customers') {
    if (pathParts[1] === 'types') {
      return (await SupabaseDataService.getCustomerTypes()) as unknown as T;
    }
    if (method === 'GET' && !pathParts[1]) {
      return (await SupabaseDataService.getCustomers()) as unknown as T;
    }
    if (method === 'GET' && pathParts[1]) {
      return (await SupabaseDataService.getCustomerDetails(pathParts[1])) as unknown as T;
    }
    if (method === 'POST') {
      return (await SupabaseDataService.createCustomer(body)) as unknown as T;
    }
    if (method === 'PUT' && pathParts[1]) {
      await SupabaseDataService.updateCustomer(pathParts[1], body);
      return { success: true } as unknown as T;
    }
    if (method === 'DELETE' && pathParts[1]) {
      await SupabaseDataService.deleteCustomer(pathParts[1]);
      return { success: true } as unknown as T;
    }
  }

  // 5. PRODUCTS
  if (pathParts[0] === 'products') {
    if (method === 'GET') {
      return (await SupabaseDataService.getProducts()) as unknown as T;
    }
    if (method === 'POST') {
      return (await SupabaseDataService.createProduct(body)) as unknown as T;
    }
    if (method === 'PUT' && pathParts[1]) {
      await SupabaseDataService.updateProduct(pathParts[1], body);
      return { success: true } as unknown as T;
    }
  }

  // 6. INVENTORY
  if (pathParts[0] === 'inventory') {
    if (pathParts[1] === 'movements') {
      return (await SupabaseDataService.getInventoryMovements()) as unknown as T;
    }
    if (pathParts[1] === 'adjust' && method === 'POST') {
      await SupabaseDataService.adjustInventory(body);
      return { success: true } as unknown as T;
    }
    if (method === 'GET') {
      return (await SupabaseDataService.getInventory()) as unknown as T;
    }
  }

  // 7. PRODUCTION
  if (pathParts[0] === 'production') {
    if (method === 'GET') {
      return (await SupabaseDataService.getProductionRecords()) as unknown as T;
    }
    if (method === 'POST') {
      await SupabaseDataService.createProductionRecord(body);
      return { success: true } as unknown as T;
    }
  }

  // 8. ORDERS
  if (pathParts[0] === 'orders') {
    if (method === 'GET') {
      return (await SupabaseDataService.getOrders()) as unknown as T;
    }
    if (method === 'POST') {
      return (await SupabaseDataService.createOrder(body)) as unknown as T;
    }
  }

  // 9. DELIVERIES
  if (pathParts[0] === 'deliveries') {
    if (pathParts[1] === 'create-for-order' && method === 'POST') {
      return (await SupabaseDataService.createDeliveryForOrder(body)) as unknown as T;
    }
    if (pathParts[2] === 'complete' && method === 'POST') {
      await SupabaseDataService.completeDelivery(pathParts[1], body);
      return { success: true } as unknown as T;
    }
    if (pathParts[2] === 'status' && method === 'PUT') {
      await SupabaseDataService.updateDeliveryStatus(pathParts[1], body.status, body.failure_reason);
      return { success: true } as unknown as T;
    }
    if (method === 'GET') {
      return (await SupabaseDataService.getDeliveries()) as unknown as T;
    }
  }

  // 10. CANS
  if (pathParts[0] === 'cans') {
    if (pathParts[1] === 'summary') {
      return (await SupabaseDataService.getCanSummary()) as unknown as T;
    }
    if (pathParts[1] === 'adjust-customer' && method === 'POST') {
      await SupabaseDataService.adjustCustomerCans(body);
      return { success: true } as unknown as T;
    }
  }

  // 11. PAYMENTS
  if (pathParts[0] === 'payments') {
    if (method === 'GET') {
      return (await SupabaseDataService.getPayments()) as unknown as T;
    }
    if (method === 'POST') {
      return (await SupabaseDataService.createPayment(body)) as unknown as T;
    }
  }

  // 12. EXPENSES
  if (pathParts[0] === 'expenses') {
    if (pathParts[1] === 'categories') {
      return (await SupabaseDataService.getExpenseCategories()) as unknown as T;
    }
    if (method === 'GET') {
      return (await SupabaseDataService.getExpenses()) as unknown as T;
    }
    if (method === 'POST') {
      return (await SupabaseDataService.createExpense(body)) as unknown as T;
    }
  }

  // 14. REPORTS
  if (pathParts[0] === 'reports') {
    const qStr = endpoint.includes('?') ? endpoint.split('?')[1] : '';
    const qParams = new URLSearchParams(qStr);
    const startDate = qParams.get('startDate') || undefined;
    const endDate = qParams.get('endDate') || undefined;

    if (pathParts[1] === 'financial') {
      return (await SupabaseDataService.getFinancialReport(startDate, endDate)) as unknown as T;
    }
    if (pathParts[1] === 'sales') {
      return (await SupabaseDataService.getSalesReport(startDate, endDate)) as unknown as T;
    }
    if (pathParts[1] === 'deliveries') {
      return (await SupabaseDataService.getDeliveryReport()) as unknown as T;
    }
  }

  // 15. DASHBOARD
  if (pathParts[0] === 'dashboard') {
    return (await SupabaseDataService.getDashboardSummary()) as unknown as T;
  }

  // 16. SETTINGS
  if (pathParts[0] === 'settings') {
    if (method === 'GET') {
      return (await SupabaseDataService.getSettings()) as unknown as T;
    }
    if (method === 'PUT') {
      await SupabaseDataService.updateSettings(body);
      return { success: true } as unknown as T;
    }
  }

  // 17. AUDIT LOGS
  if (pathParts[0] === 'audit-logs') {
    return (await SupabaseDataService.getAuditLogs()) as unknown as T;
  }

  throw new ApiError(`Route ${method} ${cleanPath} not found`, 404);
}

// -----------------------------------------------------------------------------
// Production Single Source of Truth API Client (Cross-Device Synchronized)
// -----------------------------------------------------------------------------

async function requestServer<T>(method: string, endpoint: string, body?: any, customHeaders?: Record<string, string>): Promise<T> {
  const token = getAuthToken();
  const cleanPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = cleanPath.startsWith('/api') ? cleanPath : `/api${cleanPath}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders || {}),
  };

  if (body && typeof body === 'object' && body.idempotency_key && !headers['x-idempotency-key']) {
    headers['x-idempotency-key'] = String(body.idempotency_key);
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Pass active user ID header if cached in memory
  try {
    const saved = localStorage.getItem('aab_user');
    if (saved) {
      const u = JSON.parse(saved);
      if (u.id) headers['x-user-id'] = u.id;
    }
  } catch (_) {}

  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      // If 405 Method Not Allowed or 404 Not Found returned by static router on serverless, fallback seamlessly:
      if (res.status === 405 || res.status === 404) {
        console.warn(`[API] Server returned HTTP ${res.status} for ${method} ${url}, executing direct Supabase fallback:`, endpoint);
        return handleSupabaseRoute<T>(method, endpoint, body);
      }
      const errorJson = await res.json().catch(() => ({ message: res.statusText }));
      throw new ApiError(errorJson.message || `Request failed with status ${res.status}`, res.status, errorJson);
    }

    return (await res.json()) as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    // If server network error, try fallback handler
    console.warn(`[API] Server request ${method} ${url} failed, attempting fallback:`, err.message);
    return handleSupabaseRoute<T>(method, endpoint, body);
  }
}

export const api = {
  get: async <T>(endpoint: string, headers?: Record<string, string>): Promise<T> => {
    return requestServer<T>('GET', endpoint, undefined, headers);
  },
  post: async <T>(endpoint: string, body?: any, headers?: Record<string, string>): Promise<T> => {
    return requestServer<T>('POST', endpoint, body, headers);
  },
  put: async <T>(endpoint: string, body?: any, headers?: Record<string, string>): Promise<T> => {
    return requestServer<T>('PUT', endpoint, body, headers);
  },
  delete: async <T>(endpoint: string, headers?: Record<string, string>): Promise<T> => {
    return requestServer<T>('DELETE', endpoint, undefined, headers);
  },
};
