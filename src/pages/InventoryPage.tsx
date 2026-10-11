import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { InventoryItem, InventoryMovement, Product } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import {
  Package,
  RotateCcw,
  AlertTriangle,
  History,
  Plus,
  Sliders,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
} from 'lucide-react';

export const InventoryPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Tab
  const [activeTab, setActiveTab] = useState<'stock' | 'movements'>('stock');

  // Adjustment Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    product_id: '',
    stock_type: 'filled_stock',
    quantity: '1',
    reason: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [invRes, movRes] = await Promise.all([
        api.get<InventoryItem[]>('/inventory'),
        api.get<InventoryMovement[]>('/inventory/movements'),
      ]);
      setInventory(invRes);
      setMovements(movRes);
      if (invRes.length > 0 && !adjustForm.product_id) {
        setAdjustForm((prev) => ({ ...prev, product_id: invRes[0].product_id }));
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustForm.reason) {
      toast.error('Audit rule: Adjustment reason is mandatory');
      return;
    }

    try {
      await api.post('/inventory/adjust', {
        product_id: adjustForm.product_id,
        stock_type: adjustForm.stock_type,
        quantity: Number(adjustForm.quantity),
        reason: adjustForm.reason,
      });

      toast.success('Inventory adjusted and audit log created!');
      setIsAdjustModalOpen(false);
      setAdjustForm({
        product_id: inventory[0]?.product_id || '',
        stock_type: 'filled_stock',
        quantity: '1',
        reason: '',
      });
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Adjustment failed');
    }
  };

  const openAdjustFor = (item: InventoryItem, defaultType: string = 'filled_stock') => {
    setAdjustForm({
      product_id: item.product_id,
      stock_type: defaultType,
      quantity: '1',
      reason: '',
    });
    setIsAdjustModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Warehouse & Stock Control</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Filled water ready for delivery, empty sanitized cans, and audited physical inventory movements.
          </p>
        </div>

        {hasPermission('inventory', 'can_edit') && (
          <button
            onClick={() => setIsAdjustModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
          >
            <Sliders className="w-4 h-4" />
            <span>Audit Adjustment</span>
          </button>
        )}
      </div>

      {/* Segment Tab Selector */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('stock')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            activeTab === 'stock'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Finished Stock & Store
        </button>
        <button
          onClick={() => setActiveTab('movements')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            activeTab === 'movements'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Stock Audit Movements ({movements.length})
        </button>
      </div>

      {/* TAB 1: CURRENT INVENTORY */}
      {activeTab === 'stock' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                  <th className="px-4 py-3">Product / Bottle Size</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Filled Stock (Ready)</th>
                  <th className="px-4 py-3 text-right">Empty Cans (Warehouse)</th>
                  <th className="px-4 py-3 text-right">Damaged</th>
                  <th className="px-4 py-3 text-right">Lost</th>
                  <th className="px-4 py-3 text-right">Adjust Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      Loading inventory levels...
                    </td>
                  </tr>
                ) : inventory.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                      <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="font-medium text-slate-500">No inventory records yet</p>
                      <p className="text-xs text-slate-400 mt-0.5">Warehouse inventory tracks finished stock and empty cans when products are cataloged.</p>
                    </td>
                  </tr>
                ) : (
                  inventory.map((inv) => (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-900">{inv.product_name}</div>
                        <div className="text-[11px] text-slate-500">{inv.size} ({inv.unit})</div>
                      </td>

                      <td className="px-4 py-3">
                        <Badge variant={inv.is_reusable ? 'info' : 'neutral'}>
                          {inv.is_reusable ? 'Reusable Can' : 'Disposable Pack'}
                        </Badge>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-bold text-sm ${
                            inv.filled_stock < 30 ? 'text-rose-600' : 'text-slate-900'
                          }`}
                        >
                          {inv.filled_stock}
                        </span>
                        {inv.filled_stock < 30 && (
                          <span className="block text-[10px] text-rose-500 font-semibold">Low Stock</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {inv.is_reusable ? (
                          <span className="font-semibold text-slate-800">{inv.empty_cans}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {inv.is_reusable && inv.damaged_cans > 0 ? (
                          <span className="font-semibold text-rose-600">{inv.damaged_cans}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {inv.is_reusable && inv.lost_cans > 0 ? (
                          <span className="font-semibold text-amber-600">{inv.lost_cans}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {hasPermission('inventory', 'can_edit') && (
                          <button
                            onClick={() => openAdjustFor(inv)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-md cursor-pointer"
                          >
                            <Sliders className="w-3 h-3" />
                            <span>Adjust</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: AUDIT MOVEMENTS */}
      {activeTab === 'movements' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Audit Trail of Stock Movements
            </h3>
            <span className="text-xs text-slate-400">Every change requires a verified cause</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">Movement Type</th>
                  <th className="px-4 py-3">Stock Sub-category</th>
                  <th className="px-4 py-3 text-right">Quantity</th>
                  <th className="px-4 py-3">Reason / Details</th>
                  <th className="px-4 py-3">Logged By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  movements.map((mov) => (
                    <tr key={mov.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-3 text-slate-500 font-mono">
                        {new Date(mov.created_at).toLocaleDateString()} {new Date(mov.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{mov.product_name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={mov.quantity > 0 ? 'success' : 'neutral'}>
                          {mov.movement_type.replace('_', ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{mov.stock_type.replace('_', ' ')}</td>
                      <td
                        className={`px-4 py-3 text-right font-bold ${
                          mov.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}
                      >
                        {mov.quantity > 0 ? `+${mov.quantity}` : mov.quantity}
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{mov.reason || '-'}</td>
                      <td className="px-4 py-3 text-slate-500">{mov.user_name || 'System'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AUDIT ADJUSTMENT MODAL */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title="Audited Stock Adjustment"
        description="Manual stock corrections require a documented reason and create an immutable audit record."
        maxWidth="md"
      >
        <form onSubmit={handleAdjustStock} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Select Product *</label>
            <select
              required
              value={adjustForm.product_id}
              onChange={(e) => setAdjustForm({ ...adjustForm, product_id: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            >
              {inventory.map((inv) => (
                <option key={inv.product_id} value={inv.product_id}>
                  {inv.product_name} ({inv.size})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Stock Category *</label>
              <select
                value={adjustForm.stock_type}
                onChange={(e) => setAdjustForm({ ...adjustForm, stock_type: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="filled_stock">Filled Water Stock</option>
                <option value="empty_cans">Empty Cans</option>
                <option value="damaged_cans">Damaged Cans</option>
                <option value="lost_cans">Lost Cans</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Adjustment Quantity *
              </label>
              <input
                type="number"
                required
                value={adjustForm.quantity}
                onChange={(e) => setAdjustForm({ ...adjustForm, quantity: e.target.value })}
                placeholder="e.g. +10 or -5"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-bold tabular-nums"
              />
              <span className="text-[10px] text-slate-400">Use negative for reductions</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Mandatory Reason for Adjustment *
            </label>
            <textarea
              rows={2}
              required
              value={adjustForm.reason}
              onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
              placeholder="e.g. Broken valve write-off, physical cycle count calibration, bottle leak detected..."
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
              Commit Adjustment
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
