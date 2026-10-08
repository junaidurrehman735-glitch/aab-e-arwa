import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User, Permission } from '../types/index.ts';
import { api, setAuthToken } from '../lib/api.ts';
import { useToast } from './ToastContext.tsx';

interface AuthContextValue {
  user: User | null;
  permissions: Permission[];
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, pass: string) => Promise<boolean>;
  logout: () => void;
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

  const logout = useCallback(() => {
    setUser(null);
    setPermissions([]);
    setAuthToken(null);
    localStorage.removeItem('aab_user');
    localStorage.removeItem('aab_perms');
    toast.info('Signed out of session');
  }, [toast]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get<{ user: User; permissions: Permission[] }>('/auth/me');
      setUser(res.user);
      setPermissions(res.permissions);
      localStorage.setItem('aab_user', JSON.stringify(res.user));
      localStorage.setItem('aab_perms', JSON.stringify(res.permissions));
    } catch {
      logout();
    } finally {
      setIsLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    const token = localStorage.getItem('aab_auth_token');
    if (token) {
      refreshUser();
    } else {
      setIsLoading(false);
    }

    const onExpired = () => {
      logout();
      toast.error('Session expired. Please log in again.');
    };
    window.addEventListener('auth:expired', onExpired);
    return () => window.removeEventListener('auth:expired', onExpired);
  }, [refreshUser, logout, toast]);

  const login = async (email: string, pass: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const res = await api.post<{ token: string; user: User; permissions: Permission[] }>('/auth/login', {
        email,
        password: pass,
      });

      setAuthToken(res.token);
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

  const hasPermission = (
    module: string,
    action: 'can_view' | 'can_create' | 'can_edit' | 'can_approve' | 'can_delete' = 'can_view'
  ): boolean => {
    if (!user) return false;
    // Super admin / owner has all permissions
    if (user.role_id === 'role-owner') return true;

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
        login,
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
