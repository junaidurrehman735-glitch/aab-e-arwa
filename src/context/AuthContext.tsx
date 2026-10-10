import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Permission } from '../types/index.ts';
import { api, setAuthToken } from '../lib/api.ts';
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase.ts';
import { useToast } from './ToastContext.tsx';

interface AuthContextValue {
  user: User | null;
  permissions: Permission[];
  isAuthenticated: boolean;
  isLoading: boolean;
  isSupabaseReady: boolean;
  login: (email: string, pass: string) => Promise<boolean>;
  signUp: (email: string, pass: string, name: string, role?: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => Promise<void>;
  hasPermission: (module: string, action?: 'can_view' | 'can_create' | 'can_edit' | 'can_approve' | 'can_delete') => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('aab_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [permissions, setPermissions] = useState<Permission[]>(() => {
    const saved = localStorage.getItem('aab_perms');
    return saved ? JSON.parse(saved) : [];
  });
  const [isLoading, setIsLoading] = useState(true);
  const toast = useToast();
  const supabase = getSupabaseClient();
  const isSupabaseReady = isSupabaseConfigured();

  const logout = useCallback(async (notify: boolean = true) => {
    try {
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (_) {}
    setUser(null);
    setPermissions([]);
    setAuthToken(null);
    localStorage.removeItem('aab_user');
    localStorage.removeItem('aab_perms');
    if (notify) {
      toast.info('Signed out of session');
    }
  }, [supabase, toast]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<{ user: User; permissions: Permission[] }>('/auth/me');
      setUser(res.user);
      setPermissions(res.permissions);
      localStorage.setItem('aab_user', JSON.stringify(res.user));
      localStorage.setItem('aab_perms', JSON.stringify(res.permissions));
    } catch {
      logout(false);
    } finally {
      setIsLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        if (supabase) {
          const sessionTimeout = new Promise<{ data: { session: null } }>((resolve) =>
            setTimeout(() => resolve({ data: { session: null } }), 2000)
          );
          const { data: { session } } = await Promise.race([
            supabase.auth.getSession(),
            sessionTimeout,
          ]);

          if (session?.access_token) {
            setAuthToken(session.access_token);
            await refreshUser();
            return;
          }
        }

        const existingToken = localStorage.getItem('aab_auth_token');
        if (existingToken) {
          await refreshUser();
        }
      } catch (err) {
        console.warn('Session initialization warning:', err);
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initAuth();

    // Listen to Supabase auth events
    let subscription: { unsubscribe: () => void } | null = null;
    if (supabase) {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (session?.access_token) {
            setAuthToken(session.access_token);
            await refreshUser();
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setPermissions([]);
          setAuthToken(null);
          localStorage.removeItem('aab_user');
          localStorage.removeItem('aab_perms');
        }
      });
      subscription = data.subscription;
    }

    const onExpired = () => {
      logout();
      toast.error('Session expired. Please log in again.');
    };
    window.addEventListener('auth:expired', onExpired);

    return () => {
      mounted = false;
      if (subscription) subscription.unsubscribe();
      window.removeEventListener('auth:expired', onExpired);
    };
  }, [supabase, refreshUser, logout, toast]);

  const login = async (email: string, pass: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      if (!supabase) {
        throw new Error('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your environment.');
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass,
      });

      if (error) {
        throw new Error(error.message);
      }

      if (!data.session) {
        throw new Error('No session returned from Supabase. Please check email confirmation.');
      }

      setAuthToken(data.session.access_token);

      // Fetch user profile and permissions from backend
      const res = await api.get<{ user: User; permissions: Permission[] }>('/auth/me');
      setUser(res.user);
      setPermissions(res.permissions);
      localStorage.setItem('aab_user', JSON.stringify(res.user));
      localStorage.setItem('aab_perms', JSON.stringify(res.permissions));
      toast.success(`Welcome back, ${res.user.name}`);
      return true;
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (
    email: string,
    pass: string,
    name: string,
    role: string = 'Owner'
  ): Promise<{ success: boolean; message?: string }> => {
    setIsLoading(true);
    try {
      if (!supabase) {
        throw new Error('Supabase is not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your environment.');
      }

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: pass,
        options: {
          data: {
            name: name.trim(),
            role: role,
          },
        },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data.session) {
        setAuthToken(data.session.access_token);
        const res = await api.get<{ user: User; permissions: Permission[] }>('/auth/me');
        setUser(res.user);
        setPermissions(res.permissions);
        localStorage.setItem('aab_user', JSON.stringify(res.user));
        localStorage.setItem('aab_perms', JSON.stringify(res.permissions));
        toast.success(`Account created! Welcome, ${res.user.name}`);
        return { success: true };
      } else {
        toast.info('Sign up successful! Please check your email inbox to confirm your account.');
        return { success: true, message: 'Check your email for confirmation link.' };
      }
    } catch (err: any) {
      toast.error(err.message || 'Sign up failed');
      return { success: false, message: err.message };
    } finally {
      setIsLoading(false);
    }
  };

  const hasPermission = (
    module: string,
    action: 'can_view' | 'can_create' | 'can_edit' | 'can_approve' | 'can_delete' = 'can_view'
  ): boolean => {
    if (!user) return false;
    const role = user.role_name || (user.role_id === 'role-owner' ? 'Owner' : user.role_id === 'role-manager' ? 'Manager' : 'Delivery Boy');

    // 1. Owner has unrestricted access to all modules and financials
    if (role === 'Owner' || user.role_id === 'role-owner') return true;

    // 2. Manager has operational access only (strictly no financial or user/role management)
    if (role === 'Manager' || user.role_id === 'role-manager') {
      const financialOrAdminModules = ['payments', 'expenses', 'staff', 'settings'];
      if (financialOrAdminModules.includes(module)) return false;
      return true;
    }

    // 3. Delivery Boy can ONLY access assigned deliveries/orders, customer info, delivery status, and returned cans
    if (role === 'Delivery Boy' || user.role_id === 'role-delivery') {
      if (module === 'dashboard' && action === 'can_view') return true;
      if (module === 'deliveries' && (action === 'can_view' || action === 'can_create' || action === 'can_edit')) return true;
      if (module === 'cans' && (action === 'can_view' || action === 'can_edit')) return true;
      if (module === 'customers' && action === 'can_view') return true;
      return false;
    }

    const perm = permissions.find((p) => p.module === module);
    if (!perm) return false;
    return perm[action] === 1;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        permissions,
        isAuthenticated: !!user,
        isLoading,
        isSupabaseReady,
        login,
        signUp,
        logout,
        hasPermission,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
