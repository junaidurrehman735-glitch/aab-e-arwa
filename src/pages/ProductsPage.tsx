import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { Product } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { BrandAssets } from '../assets/branding.ts';
import { Package, Plus, Edit2, CheckCircle2, RotateCcw, Sliders, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export const ProductsPage: React.FC = () => {
  const { hasPermission, user } = useAuth();
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

  // Stock Adjustment State
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [stockAdjustQuantity, setStockAdjustQuantity] = useState('');
  const [stockAdjustReason, setStockAdjustReason] = useState('');
  const [isSubmittingStock, setIsSubmittingStock] = useState(false);

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

  const openAdjustStock = (p: Product) => {
    setStockProduct(p);
    setStockAdjustQuantity('');
    setStockAdjustReason('Manual Plant Stock Verification');
    setIsStockModalOpen(true);
  };

  const handleStockAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockProduct) return;
    const qty = Number(stockAdjustQuantity);
    if (isNaN(qty) || qty === 0) {
      toast.error('Please enter a non-zero adjustment quantity (e.g. +500 or -100)');
      return;
    }

    setIsSubmittingStock(true);
    try {
      const res = await api.post<any>('/inventory/adjust', {
        product_id: stockProduct.id,
        stock_type: 'filled',
        adjustment: qty,
        reason: stockAdjustReason.trim() || 'Manual Stock Adjustment',
        user_name: user?.name || 'Owner',
      });

      toast.success(
        `Stock updated in Supabase! Previous: ${res.previous_stock ?? stockProduct.filled_stock ?? 0} → New: ${res.new_stock ?? 0}`
      );
      setIsStockModalOpen(false);
      fetchProducts();
    } catch (err: any) {
      toast.error(err.message || 'Failed to adjust stock in database');
    } finally {
      setIsSubmittingStock(false);
    }
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
      {products.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center shadow-xs">
          <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No products yet</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-5">
            Your bottle and product catalog is empty. Add your 19L cans or mineral water bottles to start taking orders.
          </p>
          {hasPermission('products', 'can_create') && (
            <button
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Product</span>
            </button>
          )}
        </div>
      ) : (
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

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="text-[11px] text-slate-500">
                  Stock: <strong className="text-slate-900 font-bold tabular-nums text-xs">{p.filled_stock || 0}</strong> in plant
                </div>

                <div className="flex items-center gap-1.5">
                  {hasPermission('inventory', 'can_edit') && (
                    <button
                      onClick={() => openAdjustStock(p)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md border border-sky-200 transition-colors cursor-pointer"
                      title="Adjust Stock in Supabase"
                    >
                      <Sliders className="w-3 h-3" />
                      <span>Adjust Stock</span>
                    </button>
                  )}

                  {hasPermission('products', 'can_edit') && (
                    <button
                      onClick={() => openEdit(p)}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                      title="Edit Product"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* STOCK ADJUSTMENT MODAL */}
      <Modal
        isOpen={isStockModalOpen}
        onClose={() => setIsStockModalOpen(false)}
        title={`Adjust Stock — ${stockProduct?.name || 'Product'}`}
        description="Update on-hand warehouse bottle stock directly in Supabase PostgreSQL with historical audit movement tracking."
        maxWidth="md"
      >
        {stockProduct && (
          <form onSubmit={handleStockAdjustment} className="space-y-4">
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 block">Current Plant Stock</span>
                <span className="text-lg font-bold text-slate-900 tabular-nums">
                  {stockProduct.filled_stock || 0} {stockProduct.unit}s
                </span>
              </div>
              <Badge variant={stockProduct.is_reusable ? 'info' : 'neutral'}>
                {stockProduct.is_reusable ? 'Reusable 19L Can' : 'Disposable Bottled Pack'}
              </Badge>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Stock Adjustment Amount (+ or -) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  required
                  value={stockAdjustQuantity}
                  onChange={(e) => setStockAdjustQuantity(e.target.value)}
                  placeholder="e.g. +500 (added) or -100 (damaged/written off)"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-bold tabular-nums text-sm"
                  autoFocus
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Enter a positive number to add stock (+500) or a negative number to reduce stock (-100).
              </p>
            </div>

            {stockAdjustQuantity && !isNaN(Number(stockAdjustQuantity)) && (
              <div className="p-3 bg-sky-50 rounded-lg border border-sky-200 text-xs text-sky-900 flex items-center justify-between">
                <span>Calculated New Stock:</span>
                <span className="font-bold text-sm tabular-nums text-sky-700">
                  {Math.max(0, (stockProduct.filled_stock || 0) + Number(stockAdjustQuantity))} {stockProduct.unit}s
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason / Notes *</label>
              <input
                type="text"
                required
                value={stockAdjustReason}
                onChange={(e) => setStockAdjustReason(e.target.value)}
                placeholder="e.g. Daily RO filling shift completed, Physical count recount, Rejection"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsStockModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingStock}
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer disabled:opacity-50"
              >
                {isSubmittingStock ? 'Saving to Supabase...' : 'Confirm Stock Adjustment'}
              </button>
            </div>
          </form>
        )}
      </Modal>

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
