import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { CustomerCanMovement, Customer } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import {
  RotateCcw,
  Package,
  Users,
  AlertTriangle,
  Plus,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  History,
  FileSpreadsheet,
} from 'lucide-react';

interface CanSummaryData {
  metrics: {
    emptyInWarehouse: number;
    filledInWarehouse: number;
    withCustomers: number;
    damagedCans: number;
    lostCans: number;
    totalCompanyCans: number;
  };
  customerRankings: Customer[];
  recentCanMovements: CustomerCanMovement[];
}

export const CansPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();

  const [data, setData] = useState<CanSummaryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Adjust Customer Cans Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    customer_id: '',
    change_type: 'issue_more',
    quantity: '1',
    reason: '',
  });

  const fetchCansSummary = async () => {
    setLoading(true);
    try {
      const res = await api.get<CanSummaryData>('/cans/summary');
      setData(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load bottle tracking data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCansSummary();
  }, []);

  const handleAdjustCans = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustForm.customer_id || !adjustForm.reason) {
      toast.error('Customer and mandatory audit reason are required');
      return;
    }

    try {
      await api.post('/cans/adjust-customer', adjustForm);
      toast.success('Customer bottle balance adjusted & auditable movement recorded');
      setIsAdjustModalOpen(false);
      setAdjustForm({
        customer_id: '',
        change_type: 'issue_more',
        quantity: '1',
        reason: '',
      });
      fetchCansSummary();
    } catch (err: any) {
      toast.error(err.message || 'Failed to adjust bottles');
    }
  };

  const filteredRankings = (data?.customerRankings || []).filter((c) =>
    (c?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c?.phone || '').includes(search) ||
    (c?.area || '').toLowerCase().includes(search.toLowerCase())
  );

  const recentMovements = data?.recentCanMovements || [];

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="flex justify-between items-center">
          <div className="h-6 bg-slate-200 rounded w-1/3" />
          <div className="h-9 bg-slate-200 rounded w-32" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-slate-200/70 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 bg-slate-200/70 rounded-xl" />
          <div className="h-80 bg-slate-200/70 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Empty Can & Reusable Asset Tracking</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Full reconciliation of company-owned polycarbonate 19L/20L cans across plant, transit, and customers.
          </p>
        </div>

        {hasPermission('cans', 'can_edit') && (
          <button
            onClick={() => setIsAdjustModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Manual Can Adjustment</span>
          </button>
        )}
      </div>

      {/* KPI Reconciliation Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Reusable Bottles Owned */}
        <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 shadow-xs flex flex-col justify-between col-span-2 sm:col-span-1">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Total Company Cans
          </span>
          <div className="my-2">
            <span className="text-2xl font-bold tabular-nums text-white">
              {(data?.metrics?.totalCompanyCans || 0).toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">Total verified asset base</span>
        </div>

        {/* Empty in Warehouse */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Empty in Plant
          </span>
          <div className="my-2">
            <span className="text-2xl font-bold tabular-nums text-slate-800">
              {(data?.metrics?.emptyInWarehouse || 0).toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">Ready for sanitization</span>
        </div>

        {/* Filled in Warehouse */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Filled in Plant
          </span>
          <div className="my-2">
            <span className="text-2xl font-bold tabular-nums text-sky-600">
              {(data?.metrics?.filledInWarehouse || 0).toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">Sealed finished stock</span>
        </div>

        {/* With Customers */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            With Customers
          </span>
          <div className="my-2">
            <span className="text-2xl font-bold tabular-nums text-cyan-700">
              {(data?.metrics?.withCustomers || 0).toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">Field held company cans</span>
        </div>

        {/* Damaged */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Damaged Cans
          </span>
          <div className="my-2">
            <span className="text-2xl font-bold tabular-nums text-rose-600">
              {(data?.metrics?.damagedCans || 0).toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">Cracked or scrap</span>
        </div>

        {/* Lost */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Lost / Unreturned
          </span>
          <div className="my-2">
            <span className="text-2xl font-bold tabular-nums text-amber-600">
              {(data?.metrics?.lostCans || 0).toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">Write-off pending</span>
        </div>
      </div>

      {/* Main Grid: Customer Can Allocation List & Recent Can Movements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Can Held Directory */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Customer Bottle Hold Balances</h3>
              <p className="text-xs text-slate-500 mt-0.5">Ranked by volume of company cans held</p>
            </div>
            <div className="relative min-w-[160px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter customers..."
                className="w-full pl-8 pr-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:bg-white"
              />
            </div>
          </div>

          <div className="border border-slate-100 rounded-lg overflow-hidden max-h-[460px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/75 border-b border-slate-200 sticky top-0 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Customer & Area</th>
                  <th className="px-3 py-2.5 text-center">Company Cans</th>
                  <th className="px-3 py-2.5 text-right">Net Deposit</th>
                  <th className="px-3 py-2.5 text-right">Ledger Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRankings.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-400">
                      No customer bottle balances found.
                    </td>
                  </tr>
                ) : (
                  filteredRankings.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{c.name}</div>
                        <div className="text-[11px] text-slate-500">{c.area}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-50 text-sky-800 font-bold tabular-nums">
                          <RotateCcw className="w-3 h-3 text-sky-600" />
                          {c.cans_held} cans
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-800">
                        PKR {(c.net_deposit_amount || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-800">
                        PKR {c.outstanding_balance.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Date-wise Bottle Movements Audit Log */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Recent Bottle In/Out Movements</h3>
            <p className="text-xs text-slate-500 mt-0.5">Real-time audit log of deliveries & returns</p>
          </div>

          <div className="border border-slate-100 rounded-lg overflow-hidden max-h-[460px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/75 border-b border-slate-200 sticky top-0 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Customer & Timestamp</th>
                  <th className="px-3 py-2.5 text-center">Type</th>
                  <th className="px-3 py-2.5 text-right">Qty</th>
                  <th className="px-3 py-2.5 text-right">Hold Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {recentMovements.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-slate-400">
                      No bottle movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  recentMovements.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-slate-900">{m.customer_name}</div>
                        <div className="text-[10px] text-slate-400">
                          {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {new Date(m.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <Badge variant={m.quantity > 0 ? 'info' : 'success'}>
                          {m.movement_type === 'cans_delivered' ? 'Delivered' : m.movement_type === 'empty_returned' ? 'Returned' : m.movement_type}
                        </Badge>
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-bold ${
                          m.quantity > 0 ? 'text-sky-600' : 'text-emerald-600'
                        }`}
                      >
                        {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-800">
                        {m.balance_after} cans
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ADJUST CANS MODAL */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title="Manual Can Adjustment"
        description="Adjust customer-held company cans for special drops, lost cans, or physical reconciliation."
        maxWidth="md"
      >
        <form onSubmit={handleAdjustCans} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select Customer *</label>
            <select
              required
              value={adjustForm.customer_id}
              onChange={(e) => setAdjustForm({ ...adjustForm, customer_id: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            >
              <option value="">-- Choose Customer --</option>
              {(data?.customerRankings || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.area}) - Currently has {c.cans_held} cans
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Adjustment Action</label>
              <select
                value={adjustForm.change_type}
                onChange={(e) => setAdjustForm({ ...adjustForm, change_type: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="issue_more">Issue Additional Cans (+)</option>
                <option value="return_cans">Returned / Collected Empty (-)</option>
                <option value="report_damaged">Report Broken / Damaged (-)</option>
                <option value="report_lost">Report Lost / Stolen (-)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity of Cans *</label>
              <input
                type="number"
                min="1"
                required
                value={adjustForm.quantity}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-bold tabular-nums"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Mandatory Audit Reason *</label>
            <textarea
              rows={2}
              required
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
              placeholder="e.g. Annual audit count correction, broken neck bottle exchange, security deposit upgrade..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAdjustModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer"
            >
              Apply Can Adjustment
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
