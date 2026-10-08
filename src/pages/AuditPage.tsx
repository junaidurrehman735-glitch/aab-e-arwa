import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { AuditLog } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { History, Search, Filter, ShieldCheck, Clock } from 'lucide-react';

export const AuditPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (moduleFilter) params.append('module', moduleFilter);

      const res = await api.get<AuditLog[]>(`/audit-logs?${params.toString()}`);
      setLogs(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [search, moduleFilter]);

  const getActionBadgeVariant = (action: string) => {
    if (action.includes('DELETE')) return 'danger';
    if (action.includes('CREATE') || action.includes('COMPLETE')) return 'success';
    if (action.includes('ADJUST') || action.includes('UPDATE')) return 'warning';
    return 'neutral';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">System Audit Trail & Security Log</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Immutable transaction history for all operational entries, stock shifts, financial events, and user logins.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search audit details or user..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:bg-white"
          />
        </div>

        <select
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
        >
          <option value="">All System Modules</option>
          <option value="auth">Authentication</option>
          <option value="customers">Customers</option>
          <option value="orders">Orders</option>
          <option value="deliveries">Deliveries</option>
          <option value="inventory">Inventory</option>
          <option value="production">Production</option>
          <option value="cans">Empty Cans</option>
          <option value="payments">Payments</option>
          <option value="expenses">Expenses</option>
          <option value="staff">Staff & Roles</option>
          <option value="settings">Settings</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">User & Identity</th>
                <th className="px-4 py-3">Action Type</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Audited Details & Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    No audit records found matching query.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-mono">
                      {new Date(l.created_at).toLocaleDateString()} {new Date(l.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{l.user_name || 'System Operator'}</div>
                    </td>

                    <td className="px-4 py-3">
                      <Badge variant={getActionBadgeVariant(l.action)}>{l.action}</Badge>
                    </td>

                    <td className="px-4 py-3 font-medium text-slate-700 capitalize">
                      {l.module}
                    </td>

                    <td className="px-4 py-3 text-slate-700 max-w-md truncate">
                      {l.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
