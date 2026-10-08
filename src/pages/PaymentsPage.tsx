import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { Payment, Customer } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import {
  CreditCard,
  DollarSign,
  Plus,
  Search,
  Calendar,
  CheckCircle2,
  Receipt,
  ArrowDownLeft,
} from 'lucide-react';

export const PaymentsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();

  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateFilter, setDateFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [search, setSearch] = useState('');

  // Record Payment Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    customer_id: '',
    amount: '',
    payment_method: 'Cash',
    payment_date: new Date().toISOString().split('T')[0],
    reference: '',
    notes: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFilter) params.append('date', dateFilter);
      if (customerFilter) params.append('customerId', customerFilter);

      const [payRes, custRes] = await Promise.all([
        api.get<Payment[]>(`/payments?${params.toString()}`),
        api.get<Customer[]>('/customers'),
      ]);
      setPayments(payRes);
      setCustomers(custRes);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateFilter, customerFilter]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!form.customer_id || isNaN(amt) || amt <= 0) {
      toast.error('Customer and valid positive amount are required');
      return;
    }

    try {
      await api.post('/payments', {
        ...form,
        amount: amt,
      });

      toast.success('Payment posted successfully and customer ledger credited!');
      setIsModalOpen(false);
      setForm({
        customer_id: '',
        amount: '',
        payment_method: 'Cash',
        payment_date: new Date().toISOString().split('T')[0],
        reference: '',
        notes: '',
      });
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to post payment');
    }
  };

  const totalCollectedToday = payments
    .filter((p) => p.payment_date === new Date().toISOString().split('T')[0])
    .reduce((sum, p) => sum + p.amount, 0);

  const totalCollectedAll = payments.reduce((sum, p) => sum + p.amount, 0);

  const filtered = payments.filter((p) =>
    p.payment_number.toLowerCase().includes(search.toLowerCase()) ||
    (p.customer_name && p.customer_name.toLowerCase().includes(search.toLowerCase())) ||
    (p.reference && p.reference.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Payments & Cash Collections</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Log doorstep cash receipts, bank transfers, cheque clearances, and live customer ledger credits.
          </p>
        </div>

        {hasPermission('payments', 'can_create') && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Record Received Payment</span>
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium">Today's Collections</span>
            <div className="text-2xl font-bold text-emerald-600 tabular-nums mt-1">
              PKR {totalCollectedToday.toLocaleString()}
            </div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium">Verified Receipts in Log</span>
            <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
              {payments.length} <span className="text-xs font-normal text-slate-500">transactions</span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 text-slate-700 rounded-xl">
            <Receipt className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between sm:col-span-2 lg:col-span-1">
          <div>
            <span className="text-xs text-slate-500 font-medium">Total Volume Collected</span>
            <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
              PKR {totalCollectedAll.toLocaleString()}
            </div>
          </div>
          <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
            <CreditCard className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search receipt #, customer..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:bg-white"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
          >
            <option value="">All Customers</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
          />
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                <th className="px-4 py-3">Receipt # & Date</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Payment Method</th>
                <th className="px-4 py-3">Reference / Notes</th>
                <th className="px-4 py-3">Received By</th>
                <th className="px-4 py-3 text-right">Amount Received</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Loading payment records...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No payment records found.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-slate-900">{p.payment_number}</div>
                      <div className="text-[11px] text-slate-500">{p.payment_date}</div>
                    </td>

                    <td className="px-4 py-3 font-semibold text-slate-800">
                      {p.customer_name}
                      {p.customer_phone && (
                        <div className="text-[10px] text-slate-400 font-mono">{p.customer_phone}</div>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <Badge variant="neutral">{p.payment_method}</Badge>
                    </td>

                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate">
                      {p.reference ? <span className="font-mono mr-1">[{p.reference}]</span> : null}
                      <span>{p.notes || '-'}</span>
                    </td>

                    <td className="px-4 py-3 text-slate-600">{p.received_by_name || 'Staff'}</td>

                    <td className="px-4 py-3 text-right font-bold text-emerald-600 text-sm">
                      PKR {p.amount.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECORD PAYMENT MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Record Customer Payment Receipt"
        description="Posts payment credit to customer ledger and decreases running outstanding balance."
        maxWidth="md"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select Customer *</label>
            <select
              required
              value={form.customer_id}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            >
              <option value="">-- Choose Customer --</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} - Outstanding: PKR {c.outstanding_balance}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Amount (PKR) *</label>
            <input
              type="number"
              min="1"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="e.g. 3500"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg font-bold tabular-nums text-emerald-700"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={form.payment_method}
                onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
                <option value="Online / Mobile Wallet">Online / Mobile Wallet</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date</label>
              <input
                type="date"
                required
                value={form.payment_date}
                onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / Bank Transaction ID</label>
            <input
              type="text"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
              placeholder="e.g. Cheque # 901244 or IBFT-18491"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Receipt remarks"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg cursor-pointer"
            >
              Post Payment
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
