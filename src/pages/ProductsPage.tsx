import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { Product } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { BrandAssets } from '../assets/branding.ts';
import { Package, Plus, Edit2, CheckCircle2, RotateCcw } from 'lucide-react';

export const ProductsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({
    name: '',
    size: '',
    unit: 'Can',
    selling_price: '220',
    cost_price: '65',
    is_reusable: true,
  });

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await api.get<Product[]>('/products');
      setProducts(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const openAdd = () => {
    setEditingProduct(null);
    setForm({
      name: '',
      size: '19 Liter',
      unit: 'Can',
      selling_price: '220',
      cost_price: '65',
      is_reusable: true,
    });
    setIsModalOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditingProduct(p);
    setForm({
      name: p.name,
      size: p.size,
      unit: p.unit,
      selling_price: String(p.selling_price),
      cost_price: String(p.cost_price),
      is_reusable: p.is_reusable === 1,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct.id}`, {
          ...form,
          selling_price: Number(form.selling_price),
          cost_price: Number(form.cost_price),
        });
        toast.success('Product updated successfully');
      } else {
        await api.post('/products', {
          ...form,
          selling_price: Number(form.selling_price),
          cost_price: Number(form.cost_price),
        });
        toast.success('New product created and inventory initialized');
      }
      setIsModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save product');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Products & Can Catalog</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure reusable dispenser cans, disposable mineral bottles, retail price structures, and production costs.
          </p>
        </div>

        {hasPermission('products', 'can_create') && (
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Product / Bottle</span>
          </button>
        )}
      </div>

      {/* Product Cards / Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {products.map((p) => (
          <div
            key={p.id}
            className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 flex flex-col justify-between hover:border-slate-300 transition-colors"
          >
            <div>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="w-10 h-10 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <Badge variant={p.is_reusable ? 'info' : 'neutral'}>
                  {p.is_reusable ? 'Reusable Can' : 'Disposable Pack'}
                </Badge>
              </div>

              <h3 className="text-sm font-bold text-slate-900 leading-snug">{p.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Size: {p.size} · Unit: {p.unit}</p>

              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Retail Rate:</span>
                  <span className="font-bold text-slate-900 tabular-nums">PKR {p.selling_price}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-500">Unit Cost:</span>
                  <span className="text-slate-600 tabular-nums">PKR {p.cost_price}</span>
                </div>
                <div className="flex justify-between text-xs pt-1 border-t border-slate-50">
                  <span className="text-slate-500">Margin / Unit:</span>
                  <span className="font-semibold text-emerald-600 tabular-nums">
                    PKR {p.selling_price - p.cost_price}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
              <div className="text-[11px] text-slate-500">
                Stock: <strong className="text-slate-800">{p.filled_stock || 0}</strong> in plant
              </div>

              {hasPermission('products', 'can_edit') && (
                <button
                  onClick={() => openEdit(p)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                  title="Edit Product"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* PRODUCT FORM MODAL */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingProduct ? 'Edit Product' : 'Create New Product / Can'}
        description="Add water products or container sizes dynamically to the business inventory system."
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Product Display Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. AAB E ARWA 19L Dispenser Can"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Size / Volume *</label>
              <input
                type="text"
                required
                value={form.size}
                onChange={(e) => setForm({ ...form, size: e.target.value })}
                placeholder="e.g. 19 Liter, 500ml"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Packaging Unit *</label>
              <select
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="Can">Can</option>
                <option value="Bottle">Bottle</option>
                <option value="Pack">Pack</option>
                <option value="Carton">Carton</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Selling Price (PKR) *</label>
              <input
                type="number"
                required
                min="0"
                value={form.selling_price}
                onChange={(e) => setForm({ ...form, selling_price: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-bold tabular-nums"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cost Price (PKR)</label>
              <input
                type="number"
                min="0"
                value={form.cost_price}
                onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg tabular-nums"
              />
            </div>
          </div>

          <div className="pt-2">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_reusable}
                onChange={(e) => setForm({ ...form, is_reusable: e.target.checked })}
                className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300"
              />
              <span>Reusable / Returnable Can (tracks empty bottle returns from customer)</span>
            </label>
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
              Save Product
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
