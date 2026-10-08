import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { ProductionRecord, Product } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { Droplets, Plus, Calendar, Clock, CheckCircle2, ShieldCheck } from 'lucide-react';

export const ProductionPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();

  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState({
    product_id: '',
    quantity_filled: '50',
    source_tank: 'Main RO Storage Tank A',
    notes: 'TDS tested 105 ppm, pH 7.3. UV and Ozone online.',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [recRes, prodRes] = await Promise.all([
        api.get<ProductionRecord[]>('/production'),
        api.get<Product[]>('/products'),
      ]);
      setRecords(recRes);
      setProducts(prodRes);
      if (prodRes.length > 0 && !form.product_id) {
        setForm((prev) => ({ ...prev, product_id: prodRes[0].id }));
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load production batches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRecordProduction = async (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Number(form.quantity_filled);
    if (!form.product_id || isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid filled quantity');
      return;
    }

    try {
      await api.post('/production', {
        product_id: form.product_id,
        quantity_filled: qty,
        source_tank: form.source_tank,
        notes: form.notes,
      });

      toast.success(`Production batch of ${qty} units recorded & warehouse stock updated!`);
      setIsModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to record production batch');
    }
  };

  const totalFilledToday = records
    .filter((r) => r.created_at.startsWith(new Date().toISOString().split('T')[0]))
    .reduce((sum, r) => sum + r.quantity_filled, 0);

  const totalFilledMonth = records.reduce((sum, r) => sum + r.quantity_filled, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Water Filling & Plant Production</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Log purification batches, bottle sanitization runs, source storage tanks, and stock generation.
          </p>
        </div>

        {hasPermission('production', 'can_create') && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Record Production Run</span>
          </button>
        )}
      </div>

      {/* Production KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium">Today's Total Bottling</span>
            <div className="text-2xl font-bold text-sky-600 tabular-nums mt-1">
              {totalFilledToday.toLocaleString()} <span className="text-xs font-normal text-slate-500">units</span>
            </div>
          </div>
          <div className="p-3 bg-sky-50 text-sky-600 rounded-xl">
            <Droplets className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium">Month-to-Date Bottling</span>
            <div className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
              {totalFilledMonth.toLocaleString()} <span className="text-xs font-normal text-slate-500">units</span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 text-slate-700 rounded-xl">
            <Calendar className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500 font-medium">Quality & TDS Standards</span>
            <div className="text-sm font-bold text-emerald-600 flex items-center gap-1 mt-1">
              <ShieldCheck className="w-4 h-4" />
              <span>Compliant (100 - 120 ppm)</span>
            </div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Production Run Log Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Plant Bottling Batches</h3>
          <span className="text-xs text-slate-400">Total Batches: {records.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Product Filled</th>
                <th className="px-4 py-3 text-right">Quantity Filled</th>
                <th className="px-4 py-3">Source Buffer Tank</th>
                <th className="px-4 py-3">Plant Operator</th>
                <th className="px-4 py-3">Quality & Batch Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Loading production records...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No water bottling batches recorded yet.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3 text-slate-500 font-mono">
                      {new Date(r.created_at).toLocaleDateString()} {new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {r.product_name} ({r.size})
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-sky-700">
                      +{r.quantity_filled} units
                    </td>
                    <td className="px-4 py-3 text-slate-700">{r.source_tank || 'Main Tank'}</td>
                    <td className="px-4 py-3 text-slate-600">{r.user_name || 'Plant Staff'}</td>
                    <td className="px-4 py-3 text-slate-500 truncate max-w-sm">{r.notes || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RECORD PRODUCTION MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Record Water Bottling Run"
        description="Fills clean reusable cans from tank, automatically increments finished stock and consumes sanitized empty bottles."
        maxWidth="md"
      >
        <form onSubmit={handleRecordProduction} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select Product *</label>
            <select
              required
              value={form.product_id}
              onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            >
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.size}) - Empty Stock: {p.empty_cans || 0}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Quantity Filled *</label>
            <input
              type="number"
              min="1"
              required
              value={form.quantity_filled}
              onChange={(e) => setForm({ ...form, quantity_filled: e.target.value })}
              placeholder="e.g. 50"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg font-bold tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Source Water Tank</label>
            <select
              value={form.source_tank}
              onChange={(e) => setForm({ ...form, source_tank: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            >
              <option value="Main RO Storage Tank A">Main RO Storage Tank A (10,000 L)</option>
              <option value="Mineral Buffer Tank B">Mineral Buffer Tank B (5,000 L)</option>
              <option value="Chilled Line Tank C">Chilled Line Tank C (3,000 L)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Batch / Quality Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="TDS test reading, UV check, cap seals verified..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="p-3 bg-sky-50 rounded-lg border border-sky-100 text-[11px] text-sky-900">
            <strong>System Synchronization:</strong> Increases finished stock by +{form.quantity_filled} and creates an audited inventory entry under your credentials.
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
              Save Production Run
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
