import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { Delivery, User, Order, APPROVED_DELIVERY_AREAS } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import {
  Truck,
  RotateCcw,
  DollarSign,
  Phone,
  MapPin,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  Package,
  Plus,
  Search,
  Filter,
  Check,
  Loader2,
} from 'lucide-react';

export const DeliveriesPage: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const toast = useToast();

  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Complete Delivery Modal
  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [completeForm, setCompleteForm] = useState({
    empty_cans_returned: '0',
    payment_collected: '0',
    payment_method: 'Cash',
    notes: '',
  });

  // Status Change Modal (for failed/rescheduled)
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [statusForm, setStatusForm] = useState({
    status: 'out_for_delivery',
    failure_reason: '',
  });

  // Rapid Submission / Concurrency Lock states
  const [isCompletingDelivery, setIsCompletingDelivery] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const isDeliveryBoy = user?.role_id === 'role-delivery' || user?.role_name === 'Delivery Boy';

  const fetchDeliveries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (isDeliveryBoy) {
        params.append('driverId', user?.id || '');
      } else if (driverFilter) {
        params.append('driverId', driverFilter);
      }
      if (areaFilter) params.append('area', areaFilter);
      if (dateFilter) params.append('date', dateFilter);

      const [delRes, staffRes] = await Promise.all([
        api.get<Delivery[]>(`/deliveries?${params.toString()}`),
        api.get<User[]>('/staff'),
      ]);

      let result = delRes || [];
      if (isDeliveryBoy && user?.id) {
        result = result.filter((d: any) => d.driver_id === user.id);
      }
      setDeliveries(result);
      setDrivers(staffRes.filter((s) => s.role_id === 'role-delivery' || s.role_id === 'role-owner'));
    } catch (err: any) {
      toast.error(err.message || 'Failed to load deliveries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
  }, [statusFilter, driverFilter, areaFilter, dateFilter]);

  const openCompleteModal = (del: Delivery) => {
    setSelectedDelivery(del);
    setCompleteForm({
      empty_cans_returned: '0',
      payment_collected: String(del.total_amount || 0),
      payment_method: 'Cash',
      notes: '',
    });
    setIsCompleteModalOpen(true);
  };

  const handleCompleteDelivery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDelivery || isCompletingDelivery) return;
    setIsCompletingDelivery(true);

    const idempotencyKey = `comp-${selectedDelivery.id}-${Date.now()}`;

    try {
      await api.post(`/deliveries/${selectedDelivery.id}/complete`, {
        idempotency_key: idempotencyKey,
        empty_cans_returned: Number(completeForm.empty_cans_returned),
        payment_collected: Number(completeForm.payment_collected),
        payment_method: completeForm.payment_method,
        notes: completeForm.notes,
      }, {
        'x-idempotency-key': idempotencyKey,
      });

      toast.success(
        `Delivery ${selectedDelivery.delivery_number} marked DELIVERED! Stock, empty cans, and customer ledger updated.`
      );
      setIsCompleteModalOpen(false);
      fetchDeliveries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete delivery');
    } finally {
      setIsCompletingDelivery(false);
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDelivery || isUpdatingStatus) return;
    setIsUpdatingStatus(true);

    try {
      await api.put(`/deliveries/${selectedDelivery.id}/status`, statusForm);
      toast.success(`Delivery status updated to ${statusForm.status}`);
      setIsStatusModalOpen(false);
      fetchDeliveries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Delivery & Route Management</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Assigned route deliveries, bottle drop-off verification, empty can retrieval, and cash collection.
          </p>
        </div>
      </div>

      {/* Filter Tabs & Selectors */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Status segment buttons */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {[
            { id: '', label: 'All Routes' },
            { id: 'assigned', label: 'Assigned / Ready' },
            { id: 'delivered', label: 'Delivered' },
            { id: 'failed', label: 'Failed' },
          ].map((st) => (
            <button
              key={st.id}
              onClick={() => setStatusFilter(st.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                statusFilter === st.id
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-medium"
          >
            <option value="">All Delivery Areas</option>
            {APPROVED_DELIVERY_AREAS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
            <option value="__temporary__">Temporary / Other Areas</option>
          </select>

          {isDeliveryBoy ? (
            <div className="px-3 py-1.5 text-xs bg-sky-50 text-sky-800 border border-sky-200 rounded-lg font-semibold flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-sky-600" />
              <span>Driver: {user?.name || 'Assigned Driver'}</span>
            </div>
          ) : (
            <select
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            >
              <option value="">All Drivers</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}

          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
          />
        </div>
      </div>

      {/* Deliveries List / Cards */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white p-12 text-center text-xs text-slate-400 rounded-xl border border-slate-200">
            Loading delivery manifests...
          </div>
        ) : deliveries.length === 0 ? (
          <div className="bg-white p-12 text-center text-slate-400 rounded-xl border border-slate-200">
            <Truck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="font-medium text-slate-500 text-xs">No deliveries yet</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Deliveries are created automatically when customer orders are booked.</p>
          </div>
        ) : (
          deliveries.map((del) => {
            const itemsList = del.items || [];
            const totalBottles = itemsList.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 0), 0) || 1;
            const itemsSummary = itemsList.length > 0
              ? itemsList.map((it: any) => `${it.quantity}x ${it.product_name || '19L Bottle'}`).join(', ')
              : `${totalBottles}x 19L Water Bottle`;

            return (
              <div
                key={del.id}
                className={`p-4 sm:p-5 rounded-xl border transition-all bg-white shadow-xs ${
                  del.status === 'delivered'
                    ? 'border-emerald-200/60 bg-emerald-50/15'
                    : del.status === 'failed'
                    ? 'border-rose-200 bg-rose-50/20'
                    : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Left Information */}
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">
                        {del.delivery_number}
                      </span>
                      {del.order_number && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span className="font-mono text-[11px] text-slate-500 font-semibold">
                            Order #{del.order_number}
                          </span>
                        </>
                      )}
                      <span className="text-slate-300">·</span>
                      <span className="text-xs font-semibold text-sky-900">{del.customer_name}</span>
                      <Badge
                        variant={
                          del.status === 'delivered'
                            ? 'success'
                            : del.status === 'failed'
                            ? 'danger'
                            : 'info'
                        }
                      >
                        {del.status === 'delivered'
                          ? 'Delivered'
                          : del.status === 'failed'
                          ? 'Delivery Failed'
                          : 'Assigned / Ready'}
                      </Badge>
                    </div>

                    {/* Customer Contact & Address */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="flex items-center gap-1 text-slate-700">
                        <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span><strong>{del.customer_area}:</strong> {del.customer_address}</span>
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="flex items-center gap-1 font-mono text-slate-700">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {del.customer_phone}
                      </span>
                    </div>

                    {/* Order Items & 19L Quantity */}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md">
                        <Package className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>Items: <strong>{itemsSummary}</strong></span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200/80 px-2 py-1 rounded-md">
                        <span>19L Bottle Qty: {totalBottles}</span>
                      </span>
                    </div>

                    {/* Schedule & Driver Details */}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-0.5">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>Delivery Date: <strong>{del.delivery_date}</strong></span>
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Time: <strong>{del.delivery_time || 'Morning'}</strong></span>
                      </span>
                      {!isDeliveryBoy && del.driver_name && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span>Driver: <strong className="text-slate-700">{del.driver_name}</strong></span>
                        </>
                      )}
                      {del.vehicle && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span>Vehicle: {del.vehicle}</span>
                        </>
                      )}
                    </div>

                    {/* Delivery Instructions */}
                    {(del.notes || (del as any).instructions) && (
                      <div className="flex items-start gap-1.5 text-xs text-amber-900 bg-amber-50/90 border border-amber-200/80 px-2.5 py-1.5 rounded-md mt-1 max-w-xl">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                        <span><strong>Delivery Instructions:</strong> {del.notes || (del as any).instructions}</span>
                      </div>
                    )}

                    {del.failure_reason && del.status === 'failed' && (
                      <div className="flex items-start gap-1.5 text-xs text-rose-900 bg-rose-50 border border-rose-200/80 px-2.5 py-1.5 rounded-md mt-1 max-w-xl">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <span><strong>Failure Reason:</strong> {del.failure_reason}</span>
                      </div>
                    )}
                  </div>

                  {/* Right Status & Actions */}
                  <div className="flex flex-wrap items-center justify-between md:justify-end gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Order Total</div>
                      <div className="text-sm font-bold text-slate-900 tabular-nums">
                        PKR {del.total_amount ? del.total_amount.toLocaleString() : '0'}
                      </div>
                    </div>

                    {del.status === 'delivered' ? (
                      <div className="text-right pl-3 border-l border-slate-100">
                        <div className="text-[11px] text-emerald-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Delivered</span>
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          Returned: <strong>{del.empty_cans_returned} cans</strong>
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          Paid: <strong>PKR {del.payment_collected.toLocaleString()}</strong>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          disabled={isCompletingDelivery}
                          onClick={() => openCompleteModal(del)}
                          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors cursor-pointer"
                        >
                          <Check className="w-4 h-4" />
                          <span>Complete Delivery</span>
                        </button>

                        <button
                          disabled={isCompletingDelivery}
                          onClick={() => {
                            setSelectedDelivery(del);
                            setStatusForm({
                              status: 'failed',
                              failure_reason: del.failure_reason || '',
                            });
                            setIsStatusModalOpen(true);
                          }}
                          className="flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                          title="Mark delivery as failed / customer unavailable"
                        >
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                          <span>Failed</span>
                        </button>

                        <button
                          disabled={isCompletingDelivery}
                          onClick={() => {
                            setSelectedDelivery(del);
                            setStatusForm({
                              status: del.status,
                              failure_reason: del.failure_reason || '',
                            });
                            setIsStatusModalOpen(true);
                          }}
                          className="p-2 text-xs text-slate-400 hover:text-slate-800 hover:bg-slate-100 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
                          title="More Options"
                        >
                          ···
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MASTER MODAL: COMPLETE DELIVERY */}
      <Modal
        isOpen={isCompleteModalOpen}
        onClose={() => setIsCompleteModalOpen(false)}
        title={
          selectedDelivery
            ? `Complete Delivery #${selectedDelivery.delivery_number}`
            : 'Complete Delivery'
        }
        description="Verify bottle drop-off, record collected empty cans, and enter customer cash payment."
        maxWidth="lg"
      >
        {selectedDelivery && (
          <form onSubmit={handleCompleteDelivery} className="space-y-5">
            {/* Context Summary Box */}
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/80 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-slate-900">{selectedDelivery.customer_name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Destination:</span>
                <span className="text-slate-700">{selectedDelivery.customer_address}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Order Total:</span>
                <span className="font-bold text-slate-900 tabular-nums">
                  PKR {(selectedDelivery.total_amount || 0).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Empty Cans Collected from Customer *
                </label>
                <div className="relative">
                  <RotateCcw className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min="0"
                    required
                    value={completeForm.empty_cans_returned}
                    onChange={(e) =>
                      setCompleteForm({ ...completeForm, empty_cans_returned: e.target.value })
                    }
                    placeholder="0"
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg font-bold tabular-nums focus:bg-white"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Adds to warehouse empty-can stock and credits customer's can held balance.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Collected (PKR) *
                </label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="number"
                    min="0"
                    required
                    value={completeForm.payment_collected}
                    onChange={(e) =>
                      setCompleteForm({ ...completeForm, payment_collected: e.target.value })
                    }
                    className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg font-bold tabular-nums text-emerald-700 focus:bg-white"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Enter 0 if delivered on credit without immediate cash collection.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={completeForm.payment_method}
                  onChange={(e) =>
                    setCompleteForm({ ...completeForm, payment_method: e.target.value })
                  }
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="Cash">Cash on Delivery</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Online / Mobile Wallet">Online / Mobile Wallet</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Delivery Notes</label>
                <input
                  type="text"
                  value={completeForm.notes}
                  onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })}
                  placeholder="Gate receiver signature, etc."
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>
            </div>

            {/* System Automated Synchronizations Display */}
            <div className="p-3 bg-sky-50/70 rounded-lg border border-sky-100 text-[11px] text-sky-950 space-y-1">
              <span className="font-semibold block text-sky-900">Automated Business Synchronizations:</span>
              <ul className="list-disc pl-4 space-y-0.5 text-sky-800">
                <li>Deducts delivered filled water inventory from warehouse</li>
                <li>Credits returned empty cans back to empty stock</li>
                <li>Updates customer company can balance (+delivered -returned)</li>
                <li>Debits order total to customer ledger</li>
                <li>Credits collected payment and updates live receivable balance</li>
              </ul>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isCompletingDelivery}
                onClick={() => setIsCompleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCompletingDelivery}
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm cursor-pointer flex items-center gap-2"
              >
                {isCompletingDelivery && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{isCompletingDelivery ? 'Completing Delivery...' : 'Confirm Delivery Completion'}</span>
              </button>
            </div>
          </form>
        )}
      </Modal>

      {/* STATUS CHANGE MODAL */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title="Update Route Status"
        maxWidth="md"
      >
        <form onSubmit={handleUpdateStatus} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Route Status</label>
            <select
              value={statusForm.status}
              onChange={(e) => setStatusForm({ ...statusForm, status: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            >
              <option value="assigned">Assigned</option>
              <option value="out_for_delivery">Out for Delivery</option>
              <option value="rescheduled">Rescheduled</option>
              <option value="failed">Failed / Customer Unavailable</option>
            </select>
          </div>

          {(statusForm.status === 'failed' || statusForm.status === 'rescheduled') && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Reason</label>
              <input
                type="text"
                required
                value={statusForm.failure_reason}
                onChange={(e) =>
                  setStatusForm({ ...statusForm, failure_reason: e.target.value })
                }
                placeholder="e.g. Gate locked, customer rescheduled to tomorrow..."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsStatusModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg cursor-pointer"
            >
              Update Status
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
