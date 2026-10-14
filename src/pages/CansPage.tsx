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
  Building2,
  UserCheck,
  CheckCircle2,
  Clock,
  Layers,
  HelpCircle,
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
  const [historyFilter, setHistoryFilter] = useState<'all' | 'customer' | 'company'>('all');

  // Unified Manual Can Adjustment Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'company' | 'customer'>('company');
  const [submitting, setSubmitting] = useState(false);

  // Form State: Total Company Cans Adjustment
  const [companyForm, setCompanyForm] = useState({
    adjustment_mode: 'set_total' as 'set_total' | 'delta',
    target_total: '',
    delta_type: 'add' as 'add' | 'subtract',
    delta_qty: '10',
    reason: '',
    notes: '',
  });

  // Form State: Customer Cans Adjustment
  const [customerForm, setCustomerForm] = useState({
    customer_id: '',
    change_type: 'issue_more' as 'issue_more' | 'return_cans' | 'set_balance' | 'report_damaged' | 'report_lost',
    quantity: '1',
    reason: '',
    notes: '',
  });

  const fetchCansSummary = async () => {
    setLoading(true);
    try {
      const res = await api.get<CanSummaryData>('/cans/summary');
      setData(res);
      // Pre-fill company target total with current total
      if (res?.metrics) {
        setCompanyForm((prev) => ({
          ...prev,
          target_total: String(res.metrics.totalCompanyCans || 0),
        }));
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load bottle tracking data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCansSummary();
  }, []);

  // Submit Company Cans Adjustment
  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyForm.reason.trim()) {
      toast.error('Mandatory audit reason is required');
      return;
    }

    setSubmitting(true);
    try {
      let payload: any = {
        adjustment_mode: companyForm.adjustment_mode,
        reason: companyForm.reason.trim(),
        notes: companyForm.notes.trim() || undefined,
      };

      if (companyForm.adjustment_mode === 'set_total') {
        const val = Number(companyForm.target_total);
        if (isNaN(val) || val < 0) {
          toast.error('Please enter a valid target total');
          setSubmitting(false);
          return;
        }
        payload.target_total = val;
      } else {
        const qty = Number(companyForm.delta_qty);
        if (isNaN(qty) || qty <= 0) {
          toast.error('Please enter a valid positive quantity');
          setSubmitting(false);
          return;
        }
        payload.adjustment_mode = 'delta';
        payload.delta = companyForm.delta_type === 'add' ? qty : -qty;
      }

      const res = await api.post<{ success: boolean; metrics?: any }>('/cans/adjust-company', payload);
      toast.success('Total Company Cans adjusted & recorded permanently in Supabase');
      setIsAdjustModalOpen(false);
      setCompanyForm((prev) => ({
        ...prev,
        reason: '',
        notes: '',
      }));
      await fetchCansSummary();
    } catch (err: any) {
      toast.error(err.message || 'Failed to adjust company physical cans');
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Customer Cans Adjustment
  const handleCustomerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.customer_id) {
      toast.error('Please select a customer');
      return;
    }
    if (!customerForm.reason.trim()) {
      toast.error('Mandatory audit reason is required');
      return;
    }

    const qty = Number(customerForm.quantity);
    if (isNaN(qty) || qty < 0) {
      toast.error('Please enter a valid non-negative quantity');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/cans/adjust-customer', {
        customer_id: customerForm.customer_id,
        change_type: customerForm.change_type,
        quantity: qty,
        reason: customerForm.reason.trim(),
        notes: customerForm.notes.trim() || undefined,
      });

      toast.success('Customer can balance updated & recorded in Supabase audit trail');
      setIsAdjustModalOpen(false);
      setCustomerForm({
        customer_id: '',
        change_type: 'issue_more',
        quantity: '1',
        reason: '',
        notes: '',
      });
      await fetchCansSummary();
    } catch (err: any) {
      toast.error(err.message || 'Failed to adjust customer cans');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRankings = (data?.customerRankings || []).filter((c) =>
    (c?.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c?.phone || '').includes(search) ||
    (c?.area || '').toLowerCase().includes(search.toLowerCase())
  );

  const selectedCustomer = (data?.customerRankings || []).find(
    (c) => c.id === customerForm.customer_id
  );

  // Live reconciliation calculations for Company Cans preview
  const currentMetrics = data?.metrics || {
    emptyInWarehouse: 0,
    filledInWarehouse: 0,
    withCustomers: 0,
    damagedCans: 0,
    lostCans: 0,
    totalCompanyCans: 0,
  };

  const currentTotal = currentMetrics.totalCompanyCans;
  let previewNewTotal = currentTotal;
  let previewDelta = 0;

  if (companyForm.adjustment_mode === 'set_total') {
    const parsed = Number(companyForm.target_total);
    if (!isNaN(parsed) && parsed >= 0) {
      previewNewTotal = parsed;
      previewDelta = previewNewTotal - currentTotal;
    }
  } else {
    const parsedQty = Number(companyForm.delta_qty);
    if (!isNaN(parsedQty) && parsedQty > 0) {
      previewDelta = companyForm.delta_type === 'add' ? parsedQty : -parsedQty;
      previewNewTotal = Math.max(0, currentTotal + previewDelta);
    }
  }

  // Live customer balance preview
  const currentCustCans = selectedCustomer ? Number(selectedCustomer.cans_held || 0) : 0;
  let previewCustNew = currentCustCans;
  let previewCustDelta = 0;
  const inputCustQty = Number(customerForm.quantity) || 0;

  if (customerForm.change_type === 'issue_more') {
    previewCustDelta = inputCustQty;
    previewCustNew = currentCustCans + previewCustDelta;
  } else if (customerForm.change_type === 'return_cans') {
    previewCustDelta = -Math.min(currentCustCans, inputCustQty);
    previewCustNew = Math.max(0, currentCustCans - inputCustQty);
  } else if (customerForm.change_type === 'set_balance') {
    previewCustNew = inputCustQty;
    previewCustDelta = previewCustNew - currentCustCans;
  } else if (customerForm.change_type === 'report_damaged' || customerForm.change_type === 'report_lost') {
    previewCustDelta = -Math.min(currentCustCans, inputCustQty);
    previewCustNew = Math.max(0, currentCustCans - inputCustQty);
  }

  // Filtered movements for history
  const allMovements = data?.recentCanMovements || [];
  const filteredMovements = allMovements.filter((m) => {
    if (historyFilter === 'company') {
      return (
        m.customer_id === 'company-asset-pool' ||
        m.movement_type.includes('company') ||
        (m.customer_name || '').toLowerCase().includes('company')
      );
    }
    if (historyFilter === 'customer') {
      return (
        m.customer_id !== 'company-asset-pool' &&
        !m.movement_type.includes('company') &&
        !(m.customer_name || '').toLowerCase().includes('company')
      );
    }
    return true;
  });

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
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Empty Can & Physical Asset Tracking</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Full reconciliation of company-owned polycarbonate 19L cans across plant, customers, and field operations.
          </p>
        </div>

        {hasPermission('cans', 'can_edit') && (
          <button
            onClick={() => {
              if (data?.metrics) {
                setCompanyForm((prev) => ({
                  ...prev,
                  target_total: String(data.metrics.totalCompanyCans || 0),
                }));
              }
              setIsAdjustModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Manual Can Adjustment</span>
          </button>
        )}
      </div>

      {/* KPI Reconciliation Banner: Filled + Empty + With Customers + Damaged + Lost = Total Company Cans */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Company Cans */}
        <div className="bg-slate-900 text-white p-4 rounded-xl border border-slate-800 shadow-xs flex flex-col justify-between col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
              Total Company Cans
            </span>
            <Building2 className="w-3.5 h-3.5 text-sky-400" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-bold tabular-nums text-white">
              {(currentMetrics.totalCompanyCans || 0).toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">Total physical assets owned</span>
        </div>

        {/* Empty in Warehouse */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Empty in Plant
          </span>
          <div className="my-2">
            <span className="text-2xl font-bold tabular-nums text-slate-800">
              {(currentMetrics.emptyInWarehouse || 0).toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">Ready for sanitization & wash</span>
        </div>

        {/* Filled in Warehouse (Product Filled Stock - Kept Separate) */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-sky-700 uppercase tracking-wider">
              Filled in Plant
            </span>
            <Package className="w-3.5 h-3.5 text-sky-500" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-bold tabular-nums text-sky-600">
              {(currentMetrics.filledInWarehouse || 0).toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">Sealed finished water stock</span>
        </div>

        {/* With Customers */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              With Customers
            </span>
            <Users className="w-3.5 h-3.5 text-cyan-600" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-bold tabular-nums text-cyan-700">
              {(currentMetrics.withCustomers || 0).toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">Field held company bottles</span>
        </div>

        {/* Damaged Cans */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Damaged Cans
            </span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-bold tabular-nums text-rose-600">
              {(currentMetrics.damagedCans || 0).toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">Cracked or decommissioned</span>
        </div>

        {/* Lost / Unreturned Cans */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Lost / Unreturned
            </span>
            <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <div className="my-2">
            <span className="text-2xl font-bold tabular-nums text-amber-600">
              {(currentMetrics.lostCans || 0).toLocaleString()}
            </span>
          </div>
          <span className="text-[10px] text-slate-400">Missing or write-off pool</span>
        </div>
      </div>

      {/* Main Grid: Customer Can Balances & Real-Time Adjustment History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customer Can Held Directory */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col">
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
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:bg-white"
              />
            </div>
          </div>

          <div className="border border-slate-100 rounded-lg overflow-hidden flex-1 max-h-[480px] overflow-y-auto">
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
                    <td colSpan={4} className="p-6 text-center text-slate-400">
                      No customer bottle balances found.
                    </td>
                  </tr>
                ) : (
                  filteredRankings.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{c.name}</div>
                        <div className="text-[11px] text-slate-500">{c.area}</div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-sky-50 text-sky-800 font-bold tabular-nums border border-sky-100">
                          <RotateCcw className="w-3 h-3 text-sky-600" />
                          {c.cans_held} cans
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-800">
                        PKR {(c.net_deposit_amount || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums text-slate-800">
                        PKR {(c.outstanding_balance || 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Date-wise Can Movements & Adjustment History */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Can Movements & Adjustment History</h3>
              <p className="text-xs text-slate-500 mt-0.5">Real-time audit records of company adjustments and customer drops</p>
            </div>

            {/* Filter Pill Tabs */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-[11px]">
              <button
                type="button"
                onClick={() => setHistoryFilter('all')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                  historyFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter('company')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                  historyFilter === 'company'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Company Assets
              </button>
              <button
                type="button"
                onClick={() => setHistoryFilter('customer')}
                className={`px-2.5 py-1 rounded font-semibold transition-colors cursor-pointer ${
                  historyFilter === 'customer'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Customer Holds
              </button>
            </div>
          </div>

          <div className="border border-slate-100 rounded-lg overflow-hidden flex-1 max-h-[480px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/75 border-b border-slate-200 sticky top-0 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2.5">Date & Target</th>
                  <th className="px-3 py-2.5 text-center">Type</th>
                  <th className="px-3 py-2.5 text-right">Change</th>
                  <th className="px-3 py-2.5 text-right">Balance</th>
                  <th className="px-3 py-2.5">Reason & Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {filteredMovements.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-slate-400">
                      No bottle adjustment movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  filteredMovements.map((m) => {
                    const isCompany =
                      m.customer_id === 'company-asset-pool' ||
                      m.movement_type.includes('company');

                    const isPositive = m.quantity > 0;
                    const dateObj = new Date(m.created_at);
                    const formattedDate = !isNaN(dateObj.getTime())
                      ? dateObj.toLocaleDateString()
                      : '';
                    const formattedTime = !isNaN(dateObj.getTime())
                      ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '';

                    return (
                      <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-slate-900 flex items-center gap-1">
                            {isCompany ? (
                              <span className="text-slate-800 flex items-center gap-1">
                                <Building2 className="w-3 h-3 text-sky-600" />
                                Company Asset Pool
                              </span>
                            ) : (
                              <span>{m.customer_name || 'Customer'}</span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {formattedDate} · {formattedTime}
                            {m.user_name && ` by ${m.user_name}`}
                          </div>
                        </td>

                        <td className="px-3 py-2.5 text-center whitespace-nowrap">
                          {isCompany ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                              Company Asset
                            </span>
                          ) : m.movement_type === 'issue_more' || m.movement_type === 'issued' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                              Issued (+)
                            </span>
                          ) : m.movement_type === 'return_cans' || m.movement_type === 'returned' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Returned (-)
                            </span>
                          ) : m.movement_type === 'set_balance' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              Set Balance
                            </span>
                          ) : (
                            <Badge variant={isPositive ? 'info' : 'warning'}>
                              {m.movement_type}
                            </Badge>
                          )}
                        </td>

                        <td
                          className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${
                            isPositive ? 'text-sky-600' : 'text-emerald-600'
                          }`}
                        >
                          {isPositive ? `+${m.quantity}` : m.quantity}
                        </td>

                        <td className="px-3 py-2.5 text-right font-semibold text-slate-800 whitespace-nowrap">
                          {m.balance_after} cans
                        </td>

                        <td className="px-3 py-2.5 text-slate-600 max-w-[180px]">
                          <div className="truncate font-medium text-slate-800 text-[11px]" title={m.reason}>
                            {m.reason || 'Audit adjustment'}
                          </div>
                          {m.notes && (
                            <div className="text-[10px] text-slate-400 truncate" title={m.notes}>
                              {m.notes}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* SINGLE UNIFIED MANUAL CAN ADJUSTMENT MODAL */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title="Manual Can Adjustment"
        description="Reconcile physical inventory or adjust customer-held bottles with verified audit records."
        maxWidth="lg"
      >
        <div className="space-y-4">
          {/* Segmented Adjustment Type Selector */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('company')}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === 'company'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Building2 className="w-4 h-4 text-sky-600" />
              <span>1. Total Company Cans</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('customer')}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                activeTab === 'customer'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="w-4 h-4 text-cyan-600" />
              <span>2. Customer Cans</span>
            </button>
          </div>

          {/* TAB 1: TOTAL COMPANY CANS ADJUSTMENT */}
          {activeTab === 'company' && (
            <form onSubmit={handleCompanySubmit} className="space-y-4 pt-1">
              {/* Asset Reconciliation Status Card */}
              <div className="p-3.5 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Current Verified Physical Cans
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-400/30">
                    Reconciled Asset Pool
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-white tabular-nums">
                    {currentTotal.toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-400">total physical 19L cans</span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-2 border-t border-slate-800 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px]">Empty Plant</span>
                    <span className="font-bold text-white tabular-nums">{currentMetrics.emptyInWarehouse}</span>
                  </div>
                  <div>
                    <span className="text-sky-300 block text-[10px]">Filled Stock</span>
                    <span className="font-bold text-sky-400 tabular-nums">{currentMetrics.filledInWarehouse}</span>
                  </div>
                  <div>
                    <span className="text-cyan-300 block text-[10px]">Customers</span>
                    <span className="font-bold text-cyan-400 tabular-nums">{currentMetrics.withCustomers}</span>
                  </div>
                  <div>
                    <span className="text-rose-300 block text-[10px]">Damaged</span>
                    <span className="font-bold text-rose-400 tabular-nums">{currentMetrics.damagedCans}</span>
                  </div>
                  <div>
                    <span className="text-amber-300 block text-[10px]">Lost</span>
                    <span className="font-bold text-amber-400 tabular-nums">{currentMetrics.lostCans}</span>
                  </div>
                </div>

                <div className="text-[10px] text-slate-400 pt-1 leading-relaxed">
                  Formula: <span className="text-slate-300 font-mono">Total Company Cans = Empty in Plant + Filled in Plant + With Customers + Damaged + Lost</span>. Product filled stock ({currentMetrics.filledInWarehouse} units) remains protected and separate.
                </div>
              </div>

              {/* Adjustment Mode Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Company Adjustment Mode *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                      companyForm.adjustment_mode === 'set_total'
                        ? 'border-sky-500 bg-sky-50/50 text-slate-900'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="comp_adj_mode"
                      checked={companyForm.adjustment_mode === 'set_total'}
                      onChange={() => setCompanyForm({ ...companyForm, adjustment_mode: 'set_total' })}
                      className="mt-0.5 text-sky-600"
                    />
                    <div>
                      <div className="font-semibold text-slate-900">Set Opening / Total Count</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Define new verified physical can total
                      </div>
                    </div>
                  </label>

                  <label
                    className={`flex items-start gap-2.5 p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                      companyForm.adjustment_mode === 'delta'
                        ? 'border-sky-500 bg-sky-50/50 text-slate-900'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="comp_adj_mode"
                      checked={companyForm.adjustment_mode === 'delta'}
                      onChange={() => setCompanyForm({ ...companyForm, adjustment_mode: 'delta' })}
                      className="mt-0.5 text-sky-600"
                    />
                    <div>
                      <div className="font-semibold text-slate-900">Add / Remove Cans (+/-)</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Purchase new or retire damaged/old cans
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Input: Target Total or Delta Quantity */}
              {companyForm.adjustment_mode === 'set_total' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    New Target Total Physical Cans *
                  </label>
                  <input
                    type="number"
                    min={currentMetrics.filledInWarehouse + currentMetrics.withCustomers + currentMetrics.damagedCans + currentMetrics.lostCans}
                    required
                    value={companyForm.target_total}
                    onChange={(e) => setCompanyForm({ ...companyForm, target_total: e.target.value })}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg font-bold tabular-nums focus:outline-hidden focus:border-sky-500"
                    placeholder="e.g. 1000"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Minimum allowed is {currentMetrics.filledInWarehouse + currentMetrics.withCustomers + currentMetrics.damagedCans + currentMetrics.lostCans} cans (cannot be less than cans currently filled, with customers, damaged, or lost).
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Action Type</label>
                    <select
                      value={companyForm.delta_type}
                      onChange={(e) => setCompanyForm({ ...companyForm, delta_type: e.target.value as 'add' | 'subtract' })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
                    >
                      <option value="add">Add / Procured Cans (+)</option>
                      <option value="subtract">Retire / Scrapped Cans (-)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity of Cans *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={companyForm.delta_qty}
                      onChange={(e) => setCompanyForm({ ...companyForm, delta_qty: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-bold tabular-nums focus:outline-hidden focus:border-sky-500"
                      placeholder="e.g. 50"
                    />
                  </div>
                </div>
              )}

              {/* Live Preview Box */}
              <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-lg text-xs space-y-1">
                <div className="font-semibold text-sky-900 flex items-center justify-between">
                  <span>Reconciliation Preview:</span>
                  <span className="font-mono">
                    {previewDelta >= 0 ? `+${previewDelta}` : previewDelta} cans
                  </span>
                </div>
                <div className="text-slate-700">
                  Total Physical Cans: <span className="font-bold text-slate-900">{currentTotal}</span> →{' '}
                  <span className="font-bold text-sky-700">{previewNewTotal}</span>
                </div>
                <div className="text-[11px] text-slate-600">
                  Empty in Plant adjusts from {currentMetrics.emptyInWarehouse} →{' '}
                  {Math.max(0, currentMetrics.emptyInWarehouse + previewDelta)}. Product filled stock stays at{' '}
                  {currentMetrics.filledInWarehouse}.
                </div>
              </div>

              {/* Mandatory Audit Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mandatory Audit Reason *
                </label>
                <input
                  type="text"
                  required
                  value={companyForm.reason}
                  onChange={(e) => setCompanyForm({ ...companyForm, reason: e.target.value })}
                  placeholder="e.g. Initial physical count baseline, 100 new cans purchased from supplier, annual plant audit"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
                />
              </div>

              {/* Additional Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Additional Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={companyForm.notes}
                  onChange={(e) => setCompanyForm({ ...companyForm, notes: e.target.value })}
                  placeholder="e.g. Verified by Owner in warehouse Bay 2; invoice #CAN-2026-90"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer transition-colors shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Saving to Supabase...' : 'Apply Company Can Adjustment'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: CUSTOMER CANS ADJUSTMENT */}
          {activeTab === 'customer' && (
            <form onSubmit={handleCustomerSubmit} className="space-y-4 pt-1">
              {/* Customer Select */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Select Customer *</label>
                <select
                  required
                  value={customerForm.customer_id}
                  onChange={(e) => setCustomerForm({ ...customerForm, customer_id: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
                >
                  <option value="">-- Choose Customer --</option>
                  {(data?.customerRankings || []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.area}) - Holds: {c.cans_held} cans
                    </option>
                  ))}
                </select>
              </div>

              {/* Selected Customer Info Box */}
              {selectedCustomer && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between text-xs">
                  <div>
                    <div className="font-semibold text-slate-900">{selectedCustomer.name}</div>
                    <div className="text-[11px] text-slate-500">{selectedCustomer.area} · {selectedCustomer.phone}</div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block uppercase">Current Hold</span>
                    <span className="text-base font-bold text-sky-700 tabular-nums">
                      {selectedCustomer.cans_held} cans
                    </span>
                  </div>
                </div>
              )}

              {/* Action and Quantity Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Action</label>
                  <select
                    value={customerForm.change_type}
                    onChange={(e) => setCustomerForm({ ...customerForm, change_type: e.target.value as any })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
                  >
                    <option value="issue_more">Issue Additional Cans (+)</option>
                    <option value="return_cans">Returned / Collected Empty (-)</option>
                    <option value="set_balance">Set Exact Can Balance</option>
                    <option value="report_damaged">Report Broken / Damaged (-)</option>
                    <option value="report_lost">Report Lost / Stolen (-)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {customerForm.change_type === 'set_balance' ? 'New Total Cans Held *' : 'Quantity of Cans *'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={customerForm.quantity}
                    onChange={(e) => setCustomerForm({ ...customerForm, quantity: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-bold tabular-nums focus:outline-hidden focus:border-sky-500"
                  />
                </div>
              </div>

              {/* Live Customer Preview */}
              {selectedCustomer && (
                <div className="p-3 bg-cyan-50/70 border border-cyan-200 rounded-lg text-xs space-y-1">
                  <div className="font-semibold text-cyan-900 flex items-center justify-between">
                    <span>Customer Balance Preview:</span>
                    <span className="font-mono">
                      {previewCustDelta >= 0 ? `+${previewCustDelta}` : previewCustDelta} cans
                    </span>
                  </div>
                  <div className="text-slate-700">
                    {selectedCustomer.name} Hold: <span className="font-bold text-slate-900">{currentCustCans}</span> →{' '}
                    <span className="font-bold text-cyan-700">{previewCustNew} cans</span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    With Customers total adjusts from {currentMetrics.withCustomers} →{' '}
                    {Math.max(0, currentMetrics.withCustomers + previewCustDelta)}.
                  </div>
                </div>
              )}

              {/* Mandatory Audit Reason */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mandatory Audit Reason *
                </label>
                <input
                  type="text"
                  required
                  value={customerForm.reason}
                  onChange={(e) => setCustomerForm({ ...customerForm, reason: e.target.value })}
                  placeholder="e.g. Physical inventory check at customer site, replacement bottle drop, extra guest party issue"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
                />
              </div>

              {/* Additional Notes */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Additional Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={customerForm.notes}
                  onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })}
                  placeholder="e.g. Customer confirmed bottle count by phone; receipt slip #221"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer transition-colors shadow-xs disabled:opacity-50"
                >
                  {submitting ? 'Saving to Supabase...' : 'Apply Customer Can Adjustment'}
                </button>
              </div>
            </form>
          )}
        </div>
      </Modal>
    </div>
  );
};
