import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { AuditLog } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import {
  History,
  Search,
  Clock,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Database,
} from 'lucide-react';

export const AuditPage: React.FC = () => {
  const { user } = useAuth();
  const toast = useToast();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const isOwner = user?.role_name === 'Owner' || user?.role_id === 'role-owner';

  const fetchLogs = async (showToast = false) => {
    if (!isOwner) return;
    setRefreshing(true);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (moduleFilter) params.append('module', moduleFilter);

      const res = await api.get<AuditLog[]>(`/audit-logs?${params.toString()}`);
      setLogs(res || []);
      if (showToast) {
        toast.success(`Loaded ${(res || []).length} audit records from Supabase`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load audit logs from database');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOwner) {
      fetchLogs();
    } else {
      setLoading(false);
    }
  }, [search, moduleFilter, isOwner]);

  const getActionBadgeVariant = (action: string) => {
    const act = (action || '').toUpperCase();
    if (act.includes('DELETE') || act.includes('CANCEL') || act.includes('FAILED') || act.includes('DEACTIVATE')) {
      return 'danger';
    }
    if (act.includes('CREATE') || act.includes('COMPLETE') || act.includes('ACTIVATE')) {
      return 'success';
    }
    if (act.includes('ADJUST') || act.includes('UPDATE') || act.includes('CONFIRM') || act.includes('ASSIGN') || act.includes('DISPATCH') || act.includes('CHANGE')) {
      return 'warning';
    }
    return 'neutral';
  };

  const getRoleBadgeClass = (role?: string) => {
    switch (role) {
      case 'Owner':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Manager':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Delivery Boy':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  // Security guard: Only Owner may view Audit Trail
  if (!isOwner) {
    return (
      <div className="bg-white rounded-xl border border-red-200/80 p-8 text-center max-w-md mx-auto my-12 shadow-xs space-y-4">
        <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
          <AlertTriangle className="w-6 h-6 text-red-600" />
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">Access Restricted: Owner Only</h3>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            The System Audit Trail & Security Log is strictly restricted to the business Owner. Managers and Delivery Boys are prohibited from viewing or modifying security audit records.
          </p>
        </div>
      </div>
    );
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const todayLogsCount = logs.filter(l => l.created_at && l.created_at.startsWith(todayStr)).length;
  const uniqueModulesCount = new Set(logs.map(l => l.module)).size;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">System Audit Trail & Security Log</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              Supabase Verified
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time, tamper-proof record of every business change, stock shift, order fulfillment, and user action.
          </p>
        </div>

        <button
          onClick={() => fetchLogs(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-sky-600' : 'text-slate-500'}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh Log'}</span>
        </button>
      </div>

      {/* KPI Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
            <History className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500">Total Audit Records</div>
            <div className="text-lg font-bold text-slate-900">{logs.length.toLocaleString()}</div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500">Today's System Actions</div>
            <div className="text-lg font-bold text-slate-900">{todayLogsCount}</div>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[11px] font-medium text-slate-500">Active Audited Modules</div>
            <div className="text-lg font-bold text-slate-900">{uniqueModulesCount}</div>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[260px] flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by action, user, record ID, or details..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:bg-white focus:border-sky-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={moduleFilter}
            onChange={(e) => setModuleFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
          >
            <option value="">All System Modules</option>
            <option value="customers">Customers</option>
            <option value="orders">Orders</option>
            <option value="deliveries">Deliveries</option>
            <option value="products">Products</option>
            <option value="inventory">Inventory & Stock</option>
            <option value="payments">Payments & Cash</option>
            <option value="staff">Staff & RBAC</option>
            <option value="settings">Settings</option>
          </select>

          {(search || moduleFilter) && (
            <button
              onClick={() => {
                setSearch('');
                setModuleFilter('');
              }}
              className="text-xs text-sky-600 hover:text-sky-800 font-semibold cursor-pointer px-2 py-1"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">User & Role</th>
                <th className="px-4 py-3">Action Type</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-4 py-3">Record Ref</th>
                <th className="px-4 py-3">Audited Details & Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-sky-500" />
                      <span className="text-xs font-medium">Loading real audit records from Supabase...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-semibold text-slate-600">No audit records found</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {search || moduleFilter
                        ? 'Try clearing the search or module filter.'
                        : 'Any action performed in Customers, Orders, Deliveries, Products, Inventory, Payments, Staff, or Settings will automatically record here.'}
                    </p>
                  </td>
                </tr>
              ) : (
                logs.map((l) => {
                  const isExpanded = expandedRow === l.id;
                  const hasValues = (l.old_value !== null && l.old_value !== undefined) || (l.new_value !== null && l.new_value !== undefined);
                  const dateObj = new Date(l.created_at);
                  const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : '';
                  const timeStr = !isNaN(dateObj.getTime()) ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';

                  return (
                    <React.Fragment key={l.id}>
                      <tr className={`hover:bg-slate-50/80 transition-colors ${isExpanded ? 'bg-sky-50/30' : ''}`}>
                        <td className="px-4 py-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                          <div className="font-semibold text-slate-800">{dateStr}</div>
                          <div className="text-slate-400 text-[10px]">{timeStr}</div>
                        </td>

                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">{l.user_name || 'System Operator'}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold border ${getRoleBadgeClass(l.user_role)}`}>
                              {l.user_role || 'Owner'}
                            </span>
                            {l.user_id && (
                              <span className="text-[10px] text-slate-400 font-mono truncate max-w-[100px]" title={l.user_id}>
                                {l.user_id.slice(0, 10)}...
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap">
                          <Badge variant={getActionBadgeVariant(l.action)}>{l.action}</Badge>
                        </td>

                        <td className="px-4 py-3 font-semibold text-slate-700 capitalize whitespace-nowrap">
                          <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-mono text-[11px]">
                            {l.module}
                          </span>
                        </td>

                        <td className="px-4 py-3 font-mono text-slate-500 text-[11px] whitespace-nowrap">
                          {l.record_ref ? (
                            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-600 border border-slate-200">
                              {l.record_ref}
                            </span>
                          ) : (
                            <span className="text-slate-300">-</span>
                          )}
                        </td>

                        <td className="px-4 py-3 text-slate-800">
                          <div className="flex items-start justify-between gap-2">
                            <div className="max-w-lg leading-relaxed text-xs">
                              {l.details}
                            </div>
                            {hasValues && (
                              <button
                                onClick={() => setExpandedRow(isExpanded ? null : l.id)}
                                className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-sky-600 hover:text-sky-800 shrink-0 cursor-pointer px-1.5 py-0.5 bg-sky-50 rounded hover:bg-sky-100"
                              >
                                <span>{isExpanded ? 'Hide Diff' : 'View Diff'}</span>
                                {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Old vs New Values Row */}
                      {isExpanded && hasValues && (
                        <tr className="bg-slate-50/70 border-t border-b border-sky-100">
                          <td colSpan={6} className="p-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-4xl text-xs">
                              {l.old_value !== null && l.old_value !== undefined && (
                                <div className="p-3 bg-white border border-rose-200 rounded-lg shadow-2xs">
                                  <div className="flex items-center gap-1.5 font-bold text-rose-700 mb-1.5 text-[11px] uppercase tracking-wider">
                                    <span>Previous Value</span>
                                  </div>
                                  <pre className="text-[11px] font-mono text-slate-700 bg-rose-50/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                                    {typeof l.old_value === 'object' ? JSON.stringify(l.old_value, null, 2) : String(l.old_value)}
                                  </pre>
                                </div>
                              )}

                              {l.new_value !== null && l.new_value !== undefined && (
                                <div className="p-3 bg-white border border-emerald-200 rounded-lg shadow-2xs">
                                  <div className="flex items-center gap-1.5 font-bold text-emerald-700 mb-1.5 text-[11px] uppercase tracking-wider">
                                    <span>New Value</span>
                                  </div>
                                  <pre className="text-[11px] font-mono text-slate-700 bg-emerald-50/50 p-2 rounded overflow-x-auto whitespace-pre-wrap">
                                    {typeof l.new_value === 'object' ? JSON.stringify(l.new_value, null, 2) : String(l.new_value)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
