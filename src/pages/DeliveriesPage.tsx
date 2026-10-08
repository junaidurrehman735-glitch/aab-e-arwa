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

  const fetchDeliveries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (driverFilter) params.append('driverId', driverFilter);
      if (areaFilter) params.append('area', areaFilter);
      if (dateFilter) params.append('date', dateFilter);

      const [delRes, staffRes] = await Promise.all([
        api.get<Delivery[]>(`/deliveries?${params.toString()}`),
        api.get<User[]>('/staff'),
      ]);
      setDeliveries(delRes);
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
    if (!selectedDelivery) return;

    try {
      await api.post(`/deliveries/${selectedDelivery.id}/complete`, {
        empty_cans_returned: Number(completeForm.empty_cans_returned),
        payment_collected: Number(completeForm.payment_collected),
        payment_method: completeForm.payment_method,
        notes: completeForm.notes,
      });

      toast.success(
        `Delivery ${selectedDelivery.delivery_number} marked DELIVERED! Stock, empty cans, and customer ledger updated.`
      );
      setIsCompleteModalOpen(false);
      fetchDeliveries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete delivery');
    }
  };

  const handleUpdateStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDelivery) return;

    try {
      await api.put(`/deliveries/${selectedDelivery.id}/status`, statusForm);
      toast.success(`Delivery status updated to ${statusForm.status}`);
      setIsStatusModalOpen(false);
      fetchDeliveries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status');
    }
  };

  const markOutForDelivery = async (del: Delivery) => {
    try {
      await api.put(`/deliveries/${del.id}/status`, { status: 'out_for_delivery' });
      toast.success(`Delivery ${del.delivery_number} is now OUT FOR DELIVERY`);
      fetchDeliveries();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Delivery & Route Management</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Driver dispatch, bottle delivery confirmation, empty can retrieval, and cash collection.
          </p>
        </div>
      </div>

      {/* Filter Tabs & Selectors */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        {/* Status segment buttons */}
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {[
            { id: '', label: 'All Routes' },
            { id: 'assigned', label: 'Assigned' },
            { id: 'out_for_delivery', label: 'Out for Delivery' },
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
          </select>

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
          <div className="bg-white p-12 text-center text-xs text-slate-400 rounded-xl border border-slate-200">
            No deliveries found for the selected criteria.
          </div>
        ) : (
          deliveries.map((del) => (
            <div
              key={del.id}
              className={`p-4 sm:p-5 rounded-xl border transition-all bg-white shadow-xs ${
                del.status === 'delivered'
                  ? 'border-emerald-200/60 bg-emerald-50/15'
                  : del.status === 'out_for_delivery'
                  ? 'border-sky-300 bg-sky-50/20'
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
                    <span className="text-slate-300">·</span>
                    <span className="text-xs font-semibold text-sky-900">{del.customer_name}</span>
                    <Badge
                      variant={
                        del.status === 'delivered'
                          ? 'success'
                          : del.status === 'out_for_delivery'
                          ? 'warning'
                          : del.status === 'failed'
                          ? 'danger'
                          : 'info'
                      }
                    >
                      {del.status === 'delivered'
                        ? 'Delivered'
                        : del.status === 'out_for_delivery'
                        ? 'Out For Delivery'
                        : del.status === 'failed'
                        ? 'Delivery Failed'
                        : 'Assigned'}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1 text-slate-700">
                      <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                      <span>{del.customer_area}: {del.customer_address}</span>
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="flex items-center gap-1 font-mono">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      {del.customer_phone}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 pt-1">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      <span>Date: {del.delivery_date}</span>
                    </span>
                    <span className="text-slate-300">·</span>
                    <span>Driver: <strong className="text-slate-700">{del.driver_name || 'Unassigned'}</strong></span>
                    {del.vehicle && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span>Vehicle: {del.vehicle}</span>
                      </>
                    )}
                    {del.notes && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="text-amber-800 italic">"{del.notes}"</span>
                      </>
                    )}
                  </div>
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
                        <span>Completed</span>
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
                      {del.status === 'assigned' && (
                        <button
                          onClick={() => markOutForDelivery(del)}
                          className="px-3 py-1.5 text-xs font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg transition-colors cursor-pointer"
                        >
                          Mark On Route
                        </button>
                      )}

                      <button
                        onClick={() => openCompleteModal(del)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Complete Delivery</span>
                      </button>

                      <button
                        onClick={() => {
                          setSelectedDelivery(del);
                          setStatusForm({
                            status: del.status,
                            failure_reason: del.failure_reason || '',
                          });
                          setIsStatusModalOpen(true);
                        }}
                        className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="Update Status / Issue"
                      >
                        ···
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
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
                onClick={() => setIsCompleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-sm cursor-pointer"
              >
                Confirm Delivery Completion
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
