import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { DashboardSummary, Order, Customer, Delivery } from '../types/index.ts';
import { Badge } from '../components/ui/Badge.tsx';
import {
  DollarSign,
  TrendingUp,
  Receipt,
  Users,
  Package,
  RotateCcw,
  Truck,
  AlertTriangle,
  ArrowUpRight,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle,
  ShoppingBag,
  Trophy,
  ChevronRight,
  Flame,
} from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (page: string) => void;
}

// Donut/Ring Chart for Real Order Status Distribution
const OrderStatusDonutChart: React.FC<{
  slices: { label: string; count: number; color: string; percentage: number }[];
  total: number;
}> = ({ slices, total }) => {
  const size = 160;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;

  let accumulatedPercent = 0;

  return (
    <div className="relative flex items-center justify-center shrink-0">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
        {/* Background Track */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke="#f1f5f9"
          strokeWidth={strokeWidth}
        />
        {total > 0 &&
          slices.map((slice) => {
            if (slice.count === 0) return null;
            const strokeDasharray = `${(slice.percentage / 100) * circumference} ${circumference}`;
            const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
            accumulatedPercent += slice.percentage;

            return (
              <circle
                key={slice.label}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={slice.color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                className="transition-all duration-500 ease-out"
              />
            );
          })}
      </svg>
      {/* Center Total Count */}
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">Total Orders</span>
        <span className="text-2xl font-black text-slate-900 tracking-tight leading-none mt-1 tabular-nums">
          {total}
        </span>
        <span className="text-[10px] font-medium text-slate-500 mt-0.5">Records</span>
      </div>
    </div>
  );
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resSummary, resOrders, resDeliveries, resCustomers] = await Promise.all([
        api.get<DashboardSummary>('/dashboard/summary'),
        api.get<Order[]>('/orders'),
        api.get<Delivery[]>('/deliveries'),
        api.get<Customer[]>('/customers'),
      ]);
      setData(resSummary);
      setOrders(resOrders || []);
      setDeliveries(resDeliveries || []);
      setCustomers(resCustomers || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-200/60 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-80 bg-slate-200/60 rounded-xl lg:col-span-2" />
          <div className="h-80 bg-slate-200/60 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-rose-200">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-slate-800">Failed to load dashboard</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4">{error}</p>
        <button
          onClick={fetchDashboard}
          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-sky-600 rounded-lg cursor-pointer"
        >
          Try Again
        </button>
      </div>
    );
  }

  const {
    kpis = {
      todaySales: 0,
      todayCollections: 0,
      todayExpenses: 0,
      totalReceivables: 0,
      filledStock: 0,
      emptyCansStock: 0,
      cansWithCustomers: 0,
      deliveriesToday: 0,
      deliveriesDelivered: 0,
      deliveriesInTransit: 0,
      deliveriesPending: 0,
      monthlyRevenue: 0,
      monthlyExpenses: 0,
      monthlyProfit: 0,
    },
    recentDeliveries = [],
    recentOrders = [],
    lowStock = [],
    topDebtors = [],
    salesTrend = [],
  } = data || ({} as any);

  const maxSalesTrend = Math.max(...(salesTrend || []).map((t) => t?.amount || 0), 1000);

  // 1. ORDER STATUS AGGREGATION FROM REAL SUPABASE / DATABASE RECORDS
  const orderStatusCounts = {
    delivered: 0,
    dispatched: 0,
    confirmed: 0,
    pending: 0,
    cancelled: 0,
  };

  orders.forEach((o) => {
    const del = deliveries.find((d) => d.order_id === o.id);
    const delStatus = (del?.status || '').toLowerCase();
    const st = (o.order_status || '').toLowerCase();

    if (st === 'delivered' || st === 'completed' || delStatus === 'delivered') {
      orderStatusCounts.delivered++;
    } else if (
      st === 'dispatched' ||
      st === 'out_for_delivery' ||
      delStatus === 'out_for_delivery' ||
      delStatus === 'assigned'
    ) {
      orderStatusCounts.dispatched++;
    } else if (st === 'cancelled') {
      orderStatusCounts.cancelled++;
    } else if (st === 'pending') {
      orderStatusCounts.pending++;
    } else {
      orderStatusCounts.confirmed++;
    }
  });

  const totalOrders = orders.length;

  const orderStatusSlices = [
    {
      key: 'delivered',
      label: 'Delivered',
      count: orderStatusCounts.delivered,
      color: '#10b981', // emerald-500
      percentage: totalOrders > 0 ? (orderStatusCounts.delivered / totalOrders) * 100 : 0,
    },
    {
      key: 'dispatched',
      label: 'Out for Delivery / Dispatched',
      count: orderStatusCounts.dispatched,
      color: '#0ea5e9', // sky-500
      percentage: totalOrders > 0 ? (orderStatusCounts.dispatched / totalOrders) * 100 : 0,
    },
    {
      key: 'confirmed',
      label: 'Confirmed',
      count: orderStatusCounts.confirmed,
      color: '#6366f1', // indigo-500
      percentage: totalOrders > 0 ? (orderStatusCounts.confirmed / totalOrders) * 100 : 0,
    },
    {
      key: 'pending',
      label: 'Pending',
      count: orderStatusCounts.pending,
      color: '#f59e0b', // amber-500
      percentage: totalOrders > 0 ? (orderStatusCounts.pending / totalOrders) * 100 : 0,
    },
    {
      key: 'cancelled',
      label: 'Cancelled',
      count: orderStatusCounts.cancelled,
      color: '#f43f5e', // rose-500
      percentage: totalOrders > 0 ? (orderStatusCounts.cancelled / totalOrders) * 100 : 0,
    },
  ];

  // 2. TOP CUSTOMERS (RANKED BY HIGHEST NUMBER OF REAL ORDERS)
  const customerMap = new Map<
    string,
    {
      id: string;
      name: string;
      area: string;
      phone: string;
      orderCount: number;
      totalBottles: number;
      totalSpent: number;
    }
  >();

  orders.forEach((o) => {
    const custKey = o.customer_id || o.customer_name || 'unknown';
    const cObj = customers.find((c) => c.id === o.customer_id);
    const name = (o.customer_name || cObj?.name || 'Customer').replace(' (Temp)', '');
    const area = o.customer_area || cObj?.area || 'Quetta';
    const phone = o.customer_phone || cObj?.phone || '';

    const itemsQty = (o.items || []).reduce(
      (s: number, it: any) => s + (Number(it.quantity) || 0),
      0
    );
    const existing = customerMap.get(custKey) || {
      id: custKey,
      name,
      area,
      phone,
      orderCount: 0,
      totalBottles: 0,
      totalSpent: 0,
    };
    existing.orderCount += 1;
    existing.totalBottles += itemsQty;
    existing.totalSpent += Number(o.total_amount) || 0;
    customerMap.set(custKey, existing);
  });

  const rankedCustomers = Array.from(customerMap.values())
    .sort((a, b) => b.orderCount - a.orderCount || b.totalBottles - a.totalBottles)
    .slice(0, 5);

  const topOrderMax = rankedCustomers[0]?.orderCount || 1;

  // Real Cash Collected / Paid aggregation (ensures completed Cashpaid orders are included)
  let displayedCollections = Number(kpis.todayCollections) || 0;
  if (displayedCollections === 0 && orders.length > 0) {
    const isDateToday = (d?: string | null) => {
      if (!d) return false;
      const str = String(d).trim();
      const now = new Date();
      const utc = now.toISOString().slice(0, 10);
      const loc = now.toLocaleDateString('en-CA');
      return str.startsWith(utc) || str.startsWith(loc);
    };
    const completedCashOrders = orders.filter((o) => {
      const st = String(o.order_status || (o as any).status || '').toLowerCase();
      const ps = String(o.payment_status || '').toLowerCase();
      const pm = String((o as any).payment_method || '').toLowerCase();
      const isCompleted = st === 'completed' || st === 'delivered';
      const isCashPaid =
        ps === 'paid' ||
        ps === 'cashpaid' ||
        ps === 'cash' ||
        ps.includes('paid') ||
        ps.includes('cash') ||
        pm === 'cash';
      const isTodayOrder =
        isDateToday(o.created_at) || isDateToday(o.delivery_date) || isDateToday((o as any).completed_at);
      return isCompleted && isCashPaid && isTodayOrder;
    });
    if (completedCashOrders.length > 0) {
      displayedCollections = completedCashOrders.reduce(
        (sum, o) => sum + (Number(o.total_amount) || 0),
        0
      );
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900 to-sky-950 text-white rounded-xl shadow-xs">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Plant & Operations Command</h2>
          <p className="text-xs text-slate-300 mt-0.5">
            Real-time synchronization of purified water production, delivery logistics, and cash collections.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onNavigate('orders')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Order</span>
          </button>
          <button
            onClick={() => onNavigate('production')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer border border-slate-700"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Record Filling</span>
          </button>
          <button
            onClick={fetchDashboard}
            className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 rounded-lg transition-colors cursor-pointer border border-slate-700"
            title="Refresh statistics"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Today's Sales */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Today's Sales</span>
            <div className="p-1.5 bg-sky-50 text-sky-600 rounded-md">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              PKR {kpis.todaySales.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Confirmed today's orders</div>
          </div>
        </div>

        {/* Today's Collections */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Cash Collected</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-md">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-emerald-600 tabular-nums">
              PKR {displayedCollections.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Today's received payments</div>
          </div>
        </div>

        {/* Today's Expenses */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Today's Expenses</span>
            <div className="p-1.5 bg-rose-50 text-rose-600 rounded-md">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              PKR {kpis.todayExpenses.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Fuel, logistics, supplies</div>
          </div>
        </div>

        {/* Total Receivables */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Outstanding Balances</span>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-md">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-amber-600 tabular-nums">
              PKR {kpis.totalReceivables.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Total customer credit owed</div>
          </div>
        </div>

        {/* Filled Stock */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Filled Water Stock</span>
            <div className="p-1.5 bg-sky-50 text-sky-600 rounded-md">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              {kpis.filledStock.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-500">cans</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Ready for dispatch</div>
          </div>
        </div>

        {/* Empty Cans in Warehouse */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Empty Cans in Plant</span>
            <div className="p-1.5 bg-slate-100 text-slate-600 rounded-md">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              {kpis.emptyCansStock.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-500">cans</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Awaiting sanitization & fill</div>
          </div>
        </div>

        {/* Cans with Customers */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Cans With Customers</span>
            <div className="p-1.5 bg-cyan-50 text-cyan-600 rounded-md">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-cyan-700 tabular-nums">
              {kpis.cansWithCustomers.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-500">cans</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Company bottles in field</div>
          </div>
        </div>

        {/* Deliveries Today */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Today's Deliveries</span>
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              {kpis.deliveriesDelivered} / {kpis.deliveriesToday}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {kpis.deliveriesInTransit} in transit · {kpis.deliveriesPending} pending
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: ORDER STATUS & TOP CUSTOMERS (CONNECTED TO REAL SUPABASE RECORDS) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. ORDER STATUS DASHBOARD CARD */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-sky-50 text-sky-600 rounded-md">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">Order Status</h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time visual distribution across order lifecycle stages
                </p>
              </div>
              <button
                onClick={() => onNavigate('orders')}
                className="text-xs text-sky-600 hover:text-sky-700 font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>Manage Orders</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6 my-3">
              {/* Clean Donut / Ring Chart */}
              <div className="shrink-0 flex items-center justify-center p-2">
                <OrderStatusDonutChart slices={orderStatusSlices} total={totalOrders} />
              </div>

              {/* Status Breakdown Legend & Real Counts */}
              <div className="flex-1 w-full space-y-2">
                {orderStatusSlices.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50/80 transition-colors border border-transparent hover:border-slate-100"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="text-xs font-medium text-slate-700 truncate">{item.label}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-slate-900 tabular-nums">
                        {item.count}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded tabular-nums min-w-[42px] text-right">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Context Footer */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>
                Active in pipeline:{' '}
                <strong className="text-slate-800 tabular-nums">
                  {orderStatusCounts.confirmed + orderStatusCounts.dispatched + orderStatusCounts.pending}
                </strong>
              </span>
            </span>
            <span className="text-emerald-700 font-medium flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span>{orderStatusCounts.delivered} delivered</span>
            </span>
          </div>
        </div>

        {/* 2. TOP CUSTOMERS DASHBOARD CARD */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-50 text-amber-600 rounded-md">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">Top Customers</h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ranked by verified order volume from Supabase records
                </p>
              </div>
              <button
                onClick={() => onNavigate('customers')}
                className="text-xs text-sky-600 hover:text-sky-700 font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>View All</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {rankedCustomers.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p>No customer order history recorded yet.</p>
                <button
                  onClick={() => onNavigate('orders')}
                  className="mt-2 text-sky-600 hover:text-sky-700 font-semibold"
                >
                  Create first order
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 my-1">
                {rankedCustomers.map((cust, idx) => {
                  const rank = idx + 1;
                  const pct = Math.min(100, Math.max(15, (cust.orderCount / topOrderMax) * 100));

                  return (
                    <div key={cust.id} className="py-2.5 flex items-center justify-between gap-3 group">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Rank Badge */}
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            rank === 1
                              ? 'bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs'
                              : rank === 2
                              ? 'bg-slate-200 text-slate-700 border border-slate-300'
                              : rank === 3
                              ? 'bg-amber-50 text-amber-900 border border-amber-200'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {rank}
                        </div>

                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
                            <span>{cust.name}</span>
                            {rank === 1 && (
                              <span className="px-1.5 py-0.2 text-[9px] font-bold bg-amber-100 text-amber-800 rounded">
                                Top Buyer
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            <span>{cust.area}</span>
                            {cust.phone && (
                              <>
                                <span className="mx-1 text-slate-300">·</span>
                                <span className="font-mono text-[10px]">{cust.phone}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-bold text-slate-900 tabular-nums">
                          {cust.orderCount} {cust.orderCount === 1 ? 'order' : 'orders'}
                        </div>
                        <div className="text-[11px] text-sky-700 font-medium tabular-nums mt-0.5">
                          {cust.totalBottles} bottles
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Context Footer */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>
              Total Registered Customers:{' '}
              <strong className="text-slate-800 tabular-nums">{customers.length}</strong>
            </span>
            <button
              onClick={() => onNavigate('customers')}
              className="text-sky-600 hover:text-sky-700 font-semibold cursor-pointer"
            >
              Open directory &rarr;
            </button>
          </div>
        </div>
      </div>

      {/* Middle Section: Sales Trend & Financial Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Trend (Last 7 Days) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">7-Day Sales Trend</h3>
              <p className="text-xs text-slate-500 mt-0.5">Daily order revenue volume</p>
            </div>
            <span className="text-xs font-medium text-slate-500">
              Total MTD: <span className="font-bold text-slate-900 tabular-nums">PKR {kpis.monthlyRevenue.toLocaleString()}</span>
            </span>
          </div>

          <div className="h-44 flex items-end gap-3 pt-4 border-b border-slate-100">
            {salesTrend.map((bar) => {
              const heightPct = Math.min(100, Math.max(12, (bar.amount / maxSalesTrend) * 100));
              const dateLabel = new Date(bar.day).toLocaleDateString('en-US', { weekday: 'short' });
              return (
                <div key={bar.day} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group">
                  <div className="text-[10px] font-mono text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                    {bar.amount > 0 ? (bar.amount / 1000).toFixed(1) + 'k' : '0'}
                  </div>
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-full max-w-[40px] bg-sky-500 group-hover:bg-sky-600 rounded-t-md transition-all shadow-xs"
                  />
                  <span className="text-[11px] font-medium text-slate-500">{dateLabel}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" />
                <span>Sales Volume</span>
              </span>
            </div>
            <button
              onClick={() => onNavigate('reports')}
              className="text-sky-600 hover:text-sky-700 font-medium inline-flex items-center gap-1 cursor-pointer"
            >
              <span>View full P&L</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Month Financial Indicator */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Monthly Profit Indicator</h3>
              <Badge variant={kpis.monthlyProfit >= 0 ? 'success' : 'danger'}>
                {kpis.monthlyProfit >= 0 ? 'Profitable' : 'Loss'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">Calculated from verified sales & expenses</p>
          </div>

          <div className="my-5 p-4 bg-slate-50 rounded-lg space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">MTD Revenue</span>
              <span className="font-semibold text-slate-800 tabular-nums">
                PKR {kpis.monthlyRevenue.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">MTD Operating Expenses</span>
              <span className="font-semibold text-rose-600 tabular-nums">
                - PKR {kpis.monthlyExpenses.toLocaleString()}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-sm font-bold">
              <span className="text-slate-900">Estimated Net Profit</span>
              <span className={`tabular-nums ${kpis.monthlyProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                PKR {kpis.monthlyProfit.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 bg-sky-50/50 p-2.5 rounded-md border border-sky-100">
            <span className="font-semibold text-sky-900">Audit Rule: </span>
            Profit figures derive solely from recorded sales, confirmed payments, and itemized plant operating expenses.
          </div>
        </div>
      </div>

      {/* Lower Section: Today's Deliveries & Top Outstanding Debtors */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Deliveries */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Deliveries in Motion</h3>
              <p className="text-xs text-slate-500 mt-0.5">Latest dispatched route status</p>
            </div>
            <button
              onClick={() => onNavigate('deliveries')}
              className="text-xs text-sky-600 hover:text-sky-700 font-medium cursor-pointer"
            >
              View All ({kpis.deliveriesToday})
            </button>
          </div>

          {recentDeliveries.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">No deliveries scheduled today yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentDeliveries.map((del) => (
                <div key={del.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {del.customer_name}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">#{del.delivery_number}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                      <span>{del.customer_area}</span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span>Driver: {del.driver_name || 'Unassigned'}</span>
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-3">
                    <Badge
                      variant={
                        del.status === 'delivered'
                          ? 'success'
                          : del.status === 'out_for_delivery'
                          ? 'warning'
                          : 'info'
                      }
                    >
                      {del.status === 'delivered'
                        ? 'Delivered'
                        : del.status === 'out_for_delivery'
                        ? 'On Route'
                        : 'Assigned'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Debtors & Low Stock Alerts */}
        <div className="space-y-6">
          {/* Low Stock Alerts if any */}
          {lowStock.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200/80 p-4 rounded-xl">
              <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Low Stock Warning</span>
              </div>
              <div className="space-y-1.5">
                {lowStock.map((ls, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs text-amber-900">
                    <span>{ls.name} ({ls.size})</span>
                    <span className="font-bold tabular-nums">{ls.filled_stock} cans left</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Outstanding Customers */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Top Outstanding Receivables</h3>
                <p className="text-xs text-slate-500 mt-0.5">Customers with highest credit balances</p>
              </div>
              <button
                onClick={() => onNavigate('customers')}
                className="text-xs text-sky-600 hover:text-sky-700 font-medium cursor-pointer"
              >
                Manage Customers
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {topDebtors.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">No outstanding customer balances.</div>
              ) : (
                topDebtors.map((cust) => (
                  <div key={cust.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate">{cust.name}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                        <span>{cust.area}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-medium text-sky-700">{cust.cans_held} cans held</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-bold text-rose-600 tabular-nums">
                        PKR {cust.outstanding_balance.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        Deposit: PKR {(cust.net_deposit_amount || 0).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
