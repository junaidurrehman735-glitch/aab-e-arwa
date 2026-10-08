import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { Order, Customer, Product, User } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import {
  ShoppingBag,
  Plus,
  Search,
  Calendar,
  DollarSign,
  Truck,
  Eye,
  CheckCircle2,
  Trash2,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';

export const OrdersPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();

  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [drivers, setDrivers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isDispatchModalOpen, setIsDispatchModalOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderDetails, setOrderDetails] = useState<any | null>(null);

  // New Order Form state
  const [orderCustomer, setOrderCustomer] = useState<Customer | null>(null);
  const [orderLines, setOrderLines] = useState<
    { product_id: string; quantity: number; unit_price: number }[]
  >([]);
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentType, setPaymentType] = useState<'Cash' | 'Credit'>('Cash');
  const [notes, setNotes] = useState('');

  // Dispatch Form state
  const [dispatchForm, setDispatchForm] = useState({
    driver_id: '',
    vehicle: 'Suzuki APV (LEA-819)',
    delivery_time: '10:00 AM',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);

      const [ordRes, custRes, prodRes, staffRes] = await Promise.all([
        api.get<Order[]>(`/orders?${params.toString()}`),
        api.get<Customer[]>('/customers'),
        api.get<Product[]>('/products'),
        api.get<User[]>('/staff'),
      ]);
      setOrders(ordRes);
      setCustomers(custRes);
      setProducts(prodRes);
      setDrivers(staffRes.filter((s) => s.role_id === 'role-delivery' || s.role_id === 'role-owner'));
    } catch (err: any) {
      toast.error(err.message || 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter]);

  const openNewOrder = () => {
    setOrderCustomer(null);
    setOrderLines([]);
    setDeliveryDate(new Date().toISOString().split('T')[0]);
    setDeliveryAddress('');
    setPaymentType('Cash');
    setNotes('');
    setIsAddModalOpen(true);
  };

  const handleSelectCustomer = (custId: string) => {
    const c = customers.find((cust) => cust.id === custId) || null;
    setOrderCustomer(c);
    if (c) {
      setDeliveryAddress(c.address);
      setPaymentType(c.payment_type);
      // Initialize with first product if line is empty
      if (products.length > 0 && orderLines.length === 0) {
        const rate = c.selling_rate > 0 ? c.selling_rate : products[0].selling_price;
        setOrderLines([{ product_id: products[0].id, quantity: 2, unit_price: rate }]);
      }
    }
  };

  const addLineItem = () => {
    if (products.length === 0) return;
    const prod = products[0];
    const rate = (orderCustomer && orderCustomer.selling_rate > 0) ? orderCustomer.selling_rate : prod.selling_price;
    setOrderLines([...orderLines, { product_id: prod.id, quantity: 1, unit_price: rate }]);
  };

  const removeLineItem = (idx: number) => {
    setOrderLines(orderLines.filter((_, i) => i !== idx));
  };

  const updateLineItem = (idx: number, field: string, val: any) => {
    const updated = [...orderLines];
    if (field === 'product_id') {
      const prod = products.find((p) => p.id === val);
      const rate = (orderCustomer && orderCustomer.selling_rate > 0) ? orderCustomer.selling_rate : (prod ? prod.selling_price : 0);
      updated[idx] = { ...updated[idx], product_id: val, unit_price: rate };
    } else {
      updated[idx] = { ...updated[idx], [field]: val };
    }
    setOrderLines(updated);
  };

  const calculateTotal = () => {
    return orderLines.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderCustomer) {
      toast.error('Please select a customer');
      return;
    }
    if (orderLines.length === 0) {
      toast.error('Please add at least one product item');
      return;
    }

    const total = calculateTotal();
    if (paymentType === 'Credit' && orderCustomer.credit_limit && orderCustomer.credit_limit > 0) {
      if (orderCustomer.outstanding_balance + total > orderCustomer.credit_limit) {
        toast.error(
          `Order total PKR ${total} exceeds customer credit limit (Balance: ${orderCustomer.outstanding_balance}, Limit: ${orderCustomer.credit_limit})`
        );
        return;
      }
    }

    try {
      const res = await api.post<{ id: string; orderNumber: string }>('/orders', {
        customer_id: orderCustomer.id,
        items: orderLines,
        delivery_date: deliveryDate,
        delivery_address: deliveryAddress,
        payment_type: paymentType,
        notes,
      });

      toast.success(`Order #${res.orderNumber} placed and confirmed!`);
      setIsAddModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to place order');
    }
  };

  const viewOrder = async (ord: Order) => {
    setSelectedOrder(ord);
    setIsDetailsModalOpen(true);
    try {
      const res = await api.get(`/orders/${ord.id}`);
      setOrderDetails(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load order details');
    }
  };

  const openDispatch = (ord: Order) => {
    setSelectedOrder(ord);
    setDispatchForm({
      driver_id: drivers[0]?.id || '',
      vehicle: 'Suzuki APV (LEA-819)',
      delivery_time: '11:00 AM',
    });
    setIsDispatchModalOpen(true);
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    try {
      await api.post('/deliveries/create-for-order', {
        order_id: selectedOrder.id,
        driver_id: dispatchForm.driver_id,
        vehicle: dispatchForm.vehicle,
        delivery_time: dispatchForm.delivery_time,
      });
      toast.success(`Delivery route created and assigned for Order #${selectedOrder.order_number}`);
      setIsDispatchModalOpen(false);
      setIsDetailsModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to assign delivery');
    }
  };

  const filteredOrders = orders.filter((o) =>
    (o.order_number.toLowerCase().includes(search.toLowerCase()) ||
     (o.customer_name && o.customer_name.toLowerCase().includes(search.toLowerCase())) ||
     (o.customer_area && o.customer_area.toLowerCase().includes(search.toLowerCase())))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Orders & Sales Processing</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Book commercial and domestic water orders, verify credit ceilings, and schedule deliveries.
          </p>
        </div>

        {hasPermission('orders', 'can_create') && (
          <button
            onClick={openNewOrder}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Book New Order</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {[
            { id: '', label: 'All Orders' },
            { id: 'confirmed', label: 'Confirmed' },
            { id: 'completed', label: 'Completed' },
            { id: 'pending', label: 'Pending' },
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

        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, area..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:bg-white"
          />
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                <th className="px-4 py-3">Order # & Customer</th>
                <th className="px-4 py-3">Delivery Date & Location</th>
                <th className="px-4 py-3">Billing & Payment</th>
                <th className="px-4 py-3">Order Status</th>
                <th className="px-4 py-3 text-right">Order Total</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    Loading orders...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                    No orders found matching filter criteria.
                  </td>
                </tr>
              ) : (
                filteredOrders.map((ord) => (
                  <tr key={ord.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono font-bold text-slate-900">{ord.order_number}</div>
                      <div className="text-slate-700 font-medium mt-0.5">{ord.customer_name}</div>
                      <div className="text-[11px] text-slate-400">{ord.customer_phone}</div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                        <Calendar className="w-3.5 h-3.5 text-sky-600" />
                        <span>{ord.delivery_date}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate max-w-xs mt-0.5">
                        {ord.customer_area}: {ord.delivery_address}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{ord.payment_type}</div>
                      <Badge
                        variant={
                          ord.payment_status === 'paid'
                            ? 'success'
                            : ord.payment_status === 'credit'
                            ? 'warning'
                            : 'neutral'
                        }
                      >
                        {ord.payment_status}
                      </Badge>
                    </td>

                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          ord.order_status === 'completed'
                            ? 'success'
                            : ord.order_status === 'confirmed'
                            ? 'info'
                            : ord.order_status === 'cancelled'
                            ? 'danger'
                            : 'neutral'
                        }
                      >
                        {ord.order_status}
                      </Badge>
                    </td>

                    <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                      PKR {ord.total_amount.toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => viewOrder(ord)}
                          className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-md transition-colors cursor-pointer"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        {ord.order_status === 'confirmed' && (
                          <button
                            onClick={() => openDispatch(ord)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-md text-[11px] font-semibold border border-sky-200 cursor-pointer"
                          >
                            <Truck className="w-3 h-3" />
                            <span>Dispatch</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: CREATE ORDER */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Book New Customer Order"
        description="Select customer, configure items, and verify available stock and credit limitations."
        maxWidth="xl"
      >
        <form onSubmit={handleCreateOrder} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Customer *</label>
              <select
                required
                value={orderCustomer?.id || ''}
                onChange={(e) => handleSelectCustomer(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
              >
                <option value="">-- Choose Customer --</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.area}) - {c.cash_status || c.payment_type} - Cans: {c.cans_held}
                  </option>
                ))}
              </select>
            </div>

            {orderCustomer && (
              <div className="sm:col-span-2 p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
                <span>
                  Company Cans: <strong>{orderCustomer.cans_held}</strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  Net Deposit: <strong>PKR {(orderCustomer.net_deposit_amount || 0).toLocaleString()}</strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  Cash Status: <strong>{orderCustomer.cash_status || 'Cash on Delivery'}</strong>
                </span>
                <span className="text-slate-300">·</span>
                <span>
                  Agreed Rate:{' '}
                  <strong>
                    {orderCustomer.selling_rate > 0 ? `PKR ${orderCustomer.selling_rate}` : 'Standard'}
                  </strong>
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Delivery Date *</label>
              <input
                type="date"
                required
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Billing Type</label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="Cash">Cash on Delivery</option>
                <option value="Credit">Credit Account</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Delivery Address *</label>
              <input
                type="text"
                required
                value={deliveryAddress}
                onChange={(e) => setDeliveryAddress(e.target.value)}
                placeholder="Full delivery location"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          {/* Product Items Table */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-800">Order Items & Bottles</label>
              <button
                type="button"
                onClick={addLineItem}
                className="text-xs text-sky-600 hover:text-sky-700 font-semibold cursor-pointer"
              >
                + Add Another Product
              </button>
            </div>

            <div className="space-y-2">
              {orderLines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  <div className="flex-1">
                    <select
                      value={line.product_id}
                      onChange={(e) => updateLineItem(idx, 'product_id', e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.size}) - Avail: {p.filled_stock}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-20">
                    <input
                      type="number"
                      min="1"
                      required
                      value={line.quantity}
                      onChange={(e) => updateLineItem(idx, 'quantity', Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-md font-bold text-center tabular-nums"
                      title="Quantity"
                    />
                  </div>

                  <div className="w-28 text-right font-mono text-xs tabular-nums font-semibold text-slate-800">
                    PKR {(line.quantity * line.unit_price).toLocaleString()}
                  </div>

                  <button
                    type="button"
                    onClick={() => removeLineItem(idx)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            <div className="p-3 bg-slate-900 text-white rounded-lg flex items-center justify-between mt-3">
              <span className="text-xs text-slate-300">Total Order Amount</span>
              <span className="text-base font-bold tabular-nums">PKR {calculateTotal().toLocaleString()}</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Instructions</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Call before delivery, gate code..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer shadow-xs"
            >
              Confirm Order
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL: ORDER DETAILS */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title={selectedOrder ? `Order #${selectedOrder.order_number}` : 'Order Details'}
        maxWidth="lg"
      >
        {orderDetails && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer:</span>
                <span className="font-semibold text-slate-900">{orderDetails.order.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phone:</span>
                <span className="font-mono text-slate-700">{orderDetails.order.customer_phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Delivery Address:</span>
                <span className="text-slate-700">{orderDetails.order.delivery_address}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Scheduled Date:</span>
                <span className="font-semibold text-slate-800">{orderDetails.order.delivery_date}</span>
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-slate-800 mb-2">Order Products</h4>
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-center">Qty</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {orderDetails.items.map((it: any) => (
                      <tr key={it.id}>
                        <td className="px-3 py-2 font-medium">{it.product_name} ({it.size})</td>
                        <td className="px-3 py-2 text-center font-bold">{it.quantity}</td>
                        <td className="px-3 py-2 text-right">PKR {it.unit_price}</td>
                        <td className="px-3 py-2 text-right font-bold">PKR {it.total_price.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {orderDetails.delivery && (
              <div className="p-3 bg-sky-50 rounded-lg border border-sky-100 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-sky-900 block">Assigned Delivery Manifest</span>
                  <span className="text-xs text-sky-700">Driver: {orderDetails.delivery.driver_name || 'Assigned'}</span>
                </div>
                <Badge variant="info">{orderDetails.delivery.status}</Badge>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsDetailsModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
              >
                Close
              </button>
              {!orderDetails.delivery && orderDetails.order.order_status === 'confirmed' && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDetailsModalOpen(false);
                    openDispatch(orderDetails.order);
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg cursor-pointer"
                >
                  Schedule Dispatch Route
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: DISPATCH ORDER */}
      <Modal
        isOpen={isDispatchModalOpen}
        onClose={() => setIsDispatchModalOpen(false)}
        title={selectedOrder ? `Dispatch Order #${selectedOrder.order_number}` : 'Dispatch Delivery'}
        maxWidth="md"
      >
        <form onSubmit={handleDispatch} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Assign Driver / Delivery Staff *</label>
            <select
              required
              value={dispatchForm.driver_id}
              onChange={(e) => setDispatchForm({ ...dispatchForm, driver_id: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            >
              <option value="">-- Choose Driver --</option>
              {drivers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.phone || 'Driver'})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle</label>
            <input
              type="text"
              value={dispatchForm.vehicle}
              onChange={(e) => setDispatchForm({ ...dispatchForm, vehicle: e.target.value })}
              placeholder="e.g. Suzuki APV LEA-819"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Expected Delivery Time</label>
            <input
              type="text"
              value={dispatchForm.delivery_time}
              onChange={(e) => setDispatchForm({ ...dispatchForm, delivery_time: e.target.value })}
              placeholder="e.g. 11:30 AM"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsDispatchModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg cursor-pointer"
            >
              Confirm Dispatch
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
