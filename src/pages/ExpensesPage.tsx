import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { Expense, ExpenseCategory } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { Receipt, Plus, DollarSign, Calendar, TrendingDown, Layers } from 'lucide-react';

export const ExpensesPage: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const toast = useToast();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');

  // Add Expense Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    category_id: '',
    amount: '',
    description: '',
    paid_by: '',
    payment_method: 'Cash',
    expense_date: new Date().toISOString().split('T')[0],
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.append('categoryId', selectedCategory);
      if (selectedMonth) params.append('month', selectedMonth);

      const [expRes, catRes] = await Promise.all([
        api.get<Expense[]>(`/expenses?${params.toString()}`),
        api.get<ExpenseCategory[]>('/expenses/categories'),
      ]);
      setExpenses(expRes);
      setCategories(catRes);
      if (catRes.length > 0 && !form.category_id) {
        setForm((prev) => ({ ...prev, category_id: catRes[0].id, paid_by: user?.name || 'Staff' }));
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCategory, selectedMonth]);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!form.category_id || isNaN(amt) || amt <= 0 || !form.description) {
      toast.error('Category, positive amount, and description are required');
      return;
    }

    try {
      await api.post('/expenses', {
        ...form,
        amount: amt,
      });

      toast.success('Expense recorded successfully');
      setIsModalOpen(false);
      setForm({
        category_id: categories[0]?.id || '',
        amount: '',
        description: '',
        paid_by: user?.name || '',
        payment_method: 'Cash',
        expense_date: new Date().toISOString().split('T')[0],
      });
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record expense');
    }
  };

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Group by category for quick summary
  const categoryTotals: Record<string, number> = {};
  for (const e of expenses) {
    const cat = e.category_name || 'General';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + e.amount;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Operating Expenses</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Fuel, electricity, delivery maintenance, plant consumables, and staff salaries.
          </p>
        </div>

        {hasPermission('expenses', 'can_create') && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Record New Expense</span>
          </button>
        )}
      </div>

      {/* Top Banner KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium">Total Operating Outflow</span>
            <div className="text-2xl font-bold text-rose-600 tabular-nums mt-1">
              PKR {totalExpenses.toLocaleString()}
            </div>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
            <TrendingDown className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium">Itemized Expense Vouchers</span>
            <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
              {expenses.length} <span className="text-xs font-normal text-slate-500">records</span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 text-slate-700 rounded-xl">
            <Receipt className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium">Active Categories</span>
            <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
              {categories.length} <span className="text-xs font-normal text-slate-500">types</span>
            </div>
          </div>
          <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
            <Layers className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
          />
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Description / Purpose</th>
                <th className="px-4 py-3">Disbursed By</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Loading expenses...
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No expense records found.
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-mono">{exp.expense_date}</td>

                    <td className="px-4 py-3 font-semibold text-slate-900">
                      <Badge variant="neutral">{exp.category_name}</Badge>
                    </td>

                    <td className="px-4 py-3 text-slate-700 font-medium max-w-sm">{exp.description}</td>

                    <td className="px-4 py-3 text-slate-600">{exp.paid_by}</td>

                    <td className="px-4 py-3 text-slate-500">{exp.payment_method}</td>

                    <td className="px-4 py-3 text-right font-bold text-rose-600 text-sm">
                      PKR {exp.amount.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD EXPENSE MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Record Operating Expense"
        description="Logs operational spending to feed into real profit/loss financial reporting."
        maxWidth="md"
      >
        <form onSubmit={handleCreateExpense} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Category *</label>
            <select
              required
              value={form.category_id}
              onChange={(e) => setForm({ ...form, category_id: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Amount (PKR) *</label>
            <input
              type="number"
              min="1"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="e.g. 4500"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg font-bold tabular-nums text-rose-600"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Description *</label>
            <input
              type="text"
              required
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. Diesel fuel for van LEA-819, 50 liters"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Paid By (Person)</label>
              <input
                type="text"
                required
                value={form.paid_by}
                onChange={(e) => setForm({ ...form, paid_by: e.target.value })}
                placeholder="Driver or manager name"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>

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
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Expense Date</label>
            <input
              type="date"
              required
              value={form.expense_date}
              onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
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
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer"
            >
              Save Expense Voucher
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
