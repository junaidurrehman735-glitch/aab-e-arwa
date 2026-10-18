import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../lib/api.ts';
import { DashboardSummary, Order, Customer, Delivery } from '../types/index.ts';
import { Badge } from '../components/ui/Badge.tsx';
import {
  getPakistanDateRange,
  isTimestampInRange,
  safePercentage,
  type DashboardPeriod,
} from '../lib/pakistanDate.ts';
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
  Calendar,
  Layers,
} from 'lucide-react';

const formatChartDate = (dayOrDate: string | undefined): string => {
  if (!dayOrDate) return '';
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  if (weekdays.includes(dayOrDate)) return dayOrDate;

  const trimmed = dayOrDate.trim();
  const parts = trimmed.slice(0, 10).split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m, d).toLocaleDateString('en-US', { weekday: 'short' });
    }
  }
  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return dayOrDate;
};

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
            if (slice.count <= 0 || slice.percentage <= 0) return null;
            const validPct = Math.min(100, Math.max(0, slice.percentage));
            const strokeDasharray = `${(validPct / 100) * circumference} ${circumference}`;
            const strokeDashoffset = -((accumulatedPercent / 100) * circumference);
            accumulatedPercent += validPct;

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
        <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          {total > 0 ? 'Total Orders' : 'No Orders'}
        </span>
        <span className="text-2xl font-black text-slate-900 tracking-tight leading-none mt-1 tabular-nums">
          {total}
        </span>
        <span className="text-[10px] font-medium text-slate-500 mt-0.5">In Period</span>
      </div>
    </div>
  );
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  // ONE SINGLE GLOBAL DATE-PERIOD FILTER FOR THE ENTIRE DASHBOARD
  const [dashboardPeriod, setDashboardPeriod] = useState<DashboardPeriod>('today');

  const [data, setData] = useState<DashboardSummary | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Exact Pakistan local calendar boundary for the selected Dashboard Period
  const currentRange = useMemo(() => {
    return getPakistanDateRange(dashboardPeriod);
  }, [dashboardPeriod]);

  // Fetch full dataset from Supabase / API backend
  const fetchDashboard = async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const [resSummary, resOrders, resDeliveries, resCustomers, resPayments, resExpenses] =
        await Promise.all([
          api.get<DashboardSummary>(`/dashboard/summary?period=${dashboardPeriod}`),
          api.get<Order[]>('/orders'),
          api.get<Delivery[]>('/deliveries'),
          api.get<Customer[]>('/customers'),
          api.get<any[]>('/payments').catch(() => []),
          api.get<any[]>('/expenses').catch(() => []),
        ]);

      setData(resSummary);
      setOrders(resOrders || []);
      setDeliveries(resDeliveries || []);
      setCustomers(resCustomers || []);
      setPayments(resPayments || []);
      setExpenses(resExpenses || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboard(false);
  }, []);

  // When global Dashboard Period dropdown changes, update the server summary asynchronously
  useEffect(() => {
    let isCancelled = false;
    api
      .get<DashboardSummary>(`/dashboard/summary?period=${dashboardPeriod}`)
      .then((resSummary) => {
        if (!isCancelled && resSummary) {
          setData(resSummary);
        }
      })
      .catch(() => {});

    return () => {
      isCancelled = true;
    };
  }, [dashboardPeriod]);

  // ===========================================================================
  // DATE-DEPENDENT FILTERING USING REAL SUPABASE RECORDS IN PAKISTAN TIME
  // ===========================================================================

  // 1. ORDERS IN SELECTED PERIOD
  const periodOrders = useMemo(() => {
    return (orders || []).filter((o) => {
      return isTimestampInRange(o.created_at || o.delivery_date, currentRange);
    });
  }, [orders, currentRange]);

  const totalOrdersInPeriod = periodOrders.length;

  // 2. DELIVERIES IN SELECTED PERIOD
  const periodDeliveries = useMemo(() => {
    return (deliveries || []).filter((d) => {
      return isTimestampInRange(d.delivery_date || d.created_at, currentRange);
    });
  }, [deliveries, currentRange]);

  const deliveriesDeliveredInPeriod = useMemo(() => {
    return periodDeliveries.filter((d) => d.status === 'delivered').length;
  }, [periodDeliveries]);

  const deliveriesInTransitInPeriod = useMemo(() => {
    return periodDeliveries.filter(
      (d) => d.status === 'out_for_delivery' || d.status === 'assigned'
    ).length;
  }, [periodDeliveries]);

  const deliveriesPendingInPeriod = useMemo(() => {
    return periodDeliveries.filter(
      (d) =>
        (d.status as string) === 'assigned' ||
        (d.status as string) === 'rescheduled' ||
        (d.status as string) === 'pending'
    ).length;
  }, [periodDeliveries]);

  // 3. PERIOD SALES REVENUE
  const periodSales = useMemo(() => {
    return periodOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);
  }, [periodOrders]);

  // 4. PERIOD CASH COLLECTED / PAYMENTS
  const periodCollections = useMemo(() => {
    const periodPayments = (payments || []).filter((p) => {
      return isTimestampInRange(p.payment_date || p.created_at, currentRange);
    });

    let total = 0;
    const coveredOrderIds = new Set<string>();

    for (const p of periodPayments) {
      total += Number(p.amount) || 0;
      if (p.order_id) coveredOrderIds.add(String(p.order_id));
      if (p.delivery_id) {
        const del = deliveries.find((d) => String(d.id) === String(p.delivery_id));
        if (del && del.order_id) coveredOrderIds.add(String(del.order_id));
      }
    }

    // Include completed cash-paid orders in this period that do not yet have an explicit payment ledger record
    for (const o of periodOrders) {
      const st = String(o.order_status || (o as any).status || '').toLowerCase().trim();
      const ps = String(o.payment_status || '').toLowerCase().trim();
      const pm = String((o as any).payment_method || '').toLowerCase().trim();
      const isCompleted = st === 'completed' || st === 'delivered';
      const isCashPaid =
        ps === 'paid' ||
        ps === 'cashpaid' ||
        ps === 'cash' ||
        ps === 'cash_paid' ||
        ps.includes('paid') ||
        ps.includes('cash') ||
        pm === 'cash';

      if (isCompleted && isCashPaid) {
        const ordId = String(o.id || '');
        const ordNum = String(o.order_number || '');
        if (!coveredOrderIds.has(ordId) && (!ordNum || !coveredOrderIds.has(ordNum))) {
          total += Number(o.total_amount) || 0;
          coveredOrderIds.add(ordId);
        }
      }
    }

    return total;
  }, [payments, deliveries, periodOrders, currentRange]);

  // 5. PERIOD OPERATING EXPENSES
  const periodExpenses = useMemo(() => {
    const periodExpensesList = (expenses || []).filter((e) => {
      return isTimestampInRange(e.expense_date || e.date || e.created_at, currentRange);
    });
    return periodExpensesList.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  }, [expenses, currentRange]);

  // 6. PERIOD ESTIMATED NET PROFIT
  const periodProfit = periodSales - periodExpenses;

  // ===========================================================================
  // ORDER STATUS AGGREGATION & AUDITED PERCENTAGES (NEVER NaN, NEVER > 100%)
  // ===========================================================================
  const orderStatusCounts = useMemo(() => {
    const counts = {
      delivered: 0,
      dispatched: 0,
      confirmed: 0,
      pending: 0,
      cancelled: 0,
    };

    periodOrders.forEach((o) => {
      const del = deliveries.find((d) => d.order_id === o.id);
      const delStatus = (del?.status || '').toLowerCase();
      const st = (o.order_status || '').toLowerCase();

      if (st === 'delivered' || st === 'completed' || delStatus === 'delivered') {
        counts.delivered++;
      } else if (
        st === 'dispatched' ||
        st === 'out_for_delivery' ||
        delStatus === 'out_for_delivery' ||
        delStatus === 'assigned'
      ) {
        counts.dispatched++;
      } else if (st === 'cancelled') {
        counts.cancelled++;
      } else if (st === 'pending') {
        counts.pending++;
      } else {
        counts.confirmed++;
      }
    });

    return counts;
  }, [periodOrders, deliveries]);

  const orderStatusSlices = useMemo(() => {
    return [
      {
        key: 'delivered',
        label: 'Delivered',
        count: orderStatusCounts.delivered,
        color: '#10b981', // emerald-500
        percentage: safePercentage(orderStatusCounts.delivered, totalOrdersInPeriod),
      },
      {
        key: 'dispatched',
        label: 'Out for Delivery / Dispatched',
        count: orderStatusCounts.dispatched,
        color: '#0ea5e9', // sky-500
        percentage: safePercentage(orderStatusCounts.dispatched, totalOrdersInPeriod),
      },
      {
        key: 'confirmed',
        label: 'Confirmed',
        count: orderStatusCounts.confirmed,
        color: '#6366f1', // indigo-500
        percentage: safePercentage(orderStatusCounts.confirmed, totalOrdersInPeriod),
      },
      {
        key: 'pending',
        label: 'Pending',
        count: orderStatusCounts.pending,
        color: '#f59e0b', // amber-500
        percentage: safePercentage(orderStatusCounts.pending, totalOrdersInPeriod),
      },
      {
        key: 'cancelled',
        label: 'Cancelled',
        count: orderStatusCounts.cancelled,
        color: '#f43f5e', // rose-500
        percentage: safePercentage(orderStatusCounts.cancelled, totalOrdersInPeriod),
      },
    ];
  }, [orderStatusCounts, totalOrdersInPeriod]);

  // ===========================================================================
  // TOP CUSTOMERS (STRICTLY FROM ORDERS IN SELECTED PERIOD)
  // ===========================================================================
  const rankedCustomers = useMemo(() => {
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

    periodOrders.forEach((o) => {
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

    return Array.from(customerMap.values())
      .sort((a, b) => b.orderCount - a.orderCount || b.totalBottles - a.totalBottles)
      .slice(0, 5);
  }, [periodOrders, customers]);

  const topOrderMax = rankedCustomers[0]?.orderCount || 1;

  // ===========================================================================
  // SALES TREND (CALCULATED IN PAKISTAN TIME)
  // ===========================================================================
  const normalizedSalesTrend = useMemo(() => {
    const tz = 'Asia/Karachi';
    const trendDays: { day: string; date: string; amount: number; displayLabel: string }[] = [];
    const trendLength = dashboardPeriod === 'last30days' ? 30 : 7;

    for (let i = trendLength - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const pkDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: tz });

      const [y, m, dayNum] = pkDateStr.split('-').map(Number);
      const dayStart = Date.UTC(y, m - 1, dayNum, -5, 0, 0, 0);
      const dayEnd = Date.UTC(y, m - 1, dayNum, 18, 59, 59, 999);

      const daySales = (orders || [])
        .filter((o) => {
          if (!o.created_at) return false;
          const t = new Date(o.created_at).getTime();
          return t >= dayStart && t <= dayEnd;
        })
        .reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0);

      trendDays.push({
        day: dayName,
        date: pkDateStr,
        amount: daySales,
        displayLabel: trendLength > 7 ? `${m}/${dayNum}` : dayName,
      });
    }

    return trendDays;
  }, [orders, dashboardPeriod]);

  const maxSalesTrend = useMemo(() => {
    return Math.max(...normalizedSalesTrend.map((t) => t.amount || 0), 1000);
  }, [normalizedSalesTrend]);

  // Loading Skeleton
  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 bg-slate-200/60 rounded-xl" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-200/60 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-80 bg-slate-200/60 rounded-xl" />
          <div className="h-80 bg-slate-200/60 rounded-xl" />
        </div>
      </div>
    );
  }

  // Error State
  if (error && !data) {
    return (
      <div className="p-8 text-center bg-white rounded-xl border border-rose-200">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-2" />
        <h3 className="text-sm font-semibold text-slate-800">Failed to load dashboard</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4">{error}</p>
        <button
          onClick={() => fetchDashboard(false)}
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
    lowStock = [],
    topDebtors = [],
  } = data || ({} as any);

  // STATIC CURRENT ASSET & BALANCE VALUES (CRITICAL: NEVER DATE-FILTERED)
  const staticTotalReceivables =
    kpis.totalReceivables ||
    customers.reduce((s, c) => s + (Number(c.outstanding_balance) || 0), 0);
  const staticFilledStock = kpis.filledStock || 0;
  const staticEmptyCansStock = kpis.emptyCansStock || 0;
  const staticCansWithCustomers =
    kpis.cansWithCustomers || customers.reduce((s, c) => s + (Number(c.cans_held) || 0), 0);

  return (
    <div className="space-y-6">
      {/* =========================================================================
          TOP COMMAND HEADER WITH PROMINENT SINGLE GLOBAL DASHBOARD PERIOD FILTER
          ========================================================================= */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 bg-gradient-to-r from-slate-900 via-slate-850 to-sky-950 text-white rounded-xl shadow-xs">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h2 className="text-lg font-bold tracking-tight">Plant & Operations Command</h2>
            <span className="px-2.5 py-0.5 text-[11px] font-semibold bg-sky-500/20 text-sky-300 border border-sky-400/30 rounded-full flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
              {currentRange.label}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Real-time synchronization of purified water production, delivery logistics, and cash collections.
          </p>
        </div>

        {/* CONTROLS: ONE SINGLE GLOBAL DATE-PERIOD FILTER FOR THE ENTIRE DASHBOARD */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-800/95 border border-slate-700 hover:border-slate-600 rounded-lg px-3 py-1.5 shadow-xs transition-colors">
            <Calendar className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-300 whitespace-nowrap">Dashboard Period:</span>
            <select
              value={dashboardPeriod}
              onChange={(e) => setDashboardPeriod(e.target.value as DashboardPeriod)}
              aria-label="Dashboard Period"
              className="bg-slate-900 text-white text-xs font-semibold rounded px-2.5 py-1 border border-slate-600 hover:border-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last7days">Last 7 Days</option>
              <option value="last30days">Last 30 Days</option>
              <option value="all_time">All Time</option>
            </select>
          </div>

          <button
            onClick={() => onNavigate('orders')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Order</span>
          </button>
          <button
            onClick={() => fetchDashboard(true)}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/80 rounded-lg transition-colors cursor-pointer border border-slate-700"
            title="Refresh statistics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* =========================================================================
          KPI CARDS GRID
          ========================================================================= */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. SALES (DATE-DEPENDENT) */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">
              {currentRange.label === 'All Time' ? 'All-Time' : currentRange.label + "'s"} Sales
            </span>
            <div className="p-1.5 bg-sky-50 text-sky-600 rounded-md">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              PKR {periodSales.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Confirmed {totalOrdersInPeriod} {totalOrdersInPeriod === 1 ? 'order' : 'orders'} in period
            </div>
          </div>
        </div>

        {/* 2. CASH COLLECTED (DATE-DEPENDENT) */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Cash Collected</span>
            <div className="p-1.5 bg-emerald-50 text-emerald-600 rounded-md">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-emerald-600 tabular-nums">
              PKR {periodCollections.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {currentRange.label} received payments
            </div>
          </div>
        </div>

        {/* 3. OPERATING EXPENSES (DATE-DEPENDENT) */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Operating Expenses</span>
            <div className="p-1.5 bg-rose-50 text-rose-600 rounded-md">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              PKR {periodExpenses.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Fuel, logistics, supplies in {currentRange.label.toLowerCase()}
            </div>
          </div>
        </div>

        {/* 4. OUTSTANDING BALANCES (STATIC CURRENT BALANCE - NEVER DATE-FILTERED) */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Outstanding Balances</span>
            <div className="p-1.5 bg-amber-50 text-amber-600 rounded-md">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-amber-600 tabular-nums">
              PKR {staticTotalReceivables.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Current customer credit owed (Static)
            </div>
          </div>
        </div>

        {/* 5. FILLED WATER STOCK (STATIC CURRENT INVENTORY - NEVER DATE-FILTERED) */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Filled Water Stock</span>
            <div className="p-1.5 bg-sky-50 text-sky-600 rounded-md">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              {staticFilledStock.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-500">cans</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Ready for delivery (Current)</div>
          </div>
        </div>

        {/* 6. EMPTY CANS IN PLANT (STATIC CURRENT INVENTORY - NEVER DATE-FILTERED) */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Empty Cans in Plant</span>
            <div className="p-1.5 bg-slate-100 text-slate-600 rounded-md">
              <RotateCcw className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              {staticEmptyCansStock.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-500">cans</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Awaiting sanitization & fill (Current)
            </div>
          </div>
        </div>

        {/* 7. CANS WITH CUSTOMERS (STATIC CURRENT INVENTORY - NEVER DATE-FILTERED) */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Cans With Customers</span>
            <div className="p-1.5 bg-cyan-50 text-cyan-600 rounded-md">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-cyan-700 tabular-nums">
              {staticCansWithCustomers.toLocaleString()}{' '}
              <span className="text-xs font-normal text-slate-500">cans</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Company bottles in field (Current)</div>
          </div>
        </div>

        {/* 8. DELIVERIES (DATE-DEPENDENT) */}
        <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">
              {currentRange.label === 'All Time' ? 'All-Time' : currentRange.label + "'s"} Deliveries
            </span>
            <div className="p-1.5 bg-blue-50 text-blue-600 rounded-md">
              <Truck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold text-slate-900 tabular-nums">
              {deliveriesDeliveredInPeriod} / {periodDeliveries.length}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {deliveriesInTransitInPeriod} in transit · {deliveriesPendingInPeriod} pending
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          SECTION: ORDER STATUS & TOP CUSTOMERS (BOTH RESPONDING TO GLOBAL FILTER)
          NO SEPARATE DROPDOWNS ALLOWED HERE
          ========================================================================= */}
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
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600 rounded">
                    {currentRange.label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visual distribution across lifecycle stages for {currentRange.label.toLowerCase()}
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
                <OrderStatusDonutChart
                  slices={orderStatusSlices}
                  total={totalOrdersInPeriod}
                />
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
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded tabular-nums min-w-[46px] text-right">
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
              <span>{orderStatusCounts.delivered} delivered in {currentRange.label.toLowerCase()}</span>
            </span>
          </div>
        </div>

        {/* 2. TOP CUSTOMERS DASHBOARD CARD (FILTERED BY SAME GLOBAL PERIOD) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-50 text-amber-600 rounded-md">
                    <Trophy className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">Top Customers</h3>
                  <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600 rounded">
                    {currentRange.label}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ranked by order volume placed in {currentRange.label.toLowerCase()}
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
                <p>No customer orders recorded for {currentRange.label}.</p>
                <button
                  onClick={() => onNavigate('orders')}
                  className="mt-2 text-sky-600 hover:text-sky-700 font-semibold cursor-pointer"
                >
                  Create order &rarr;
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 my-1">
                {rankedCustomers.map((cust, idx) => {
                  const rank = idx + 1;

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
                          <span className="text-slate-400 font-normal"> · PKR {cust.totalSpent.toLocaleString()}</span>
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
              Active Customers in {currentRange.label}:{' '}
              <strong className="text-slate-800 tabular-nums">{rankedCustomers.length}</strong>
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

      {/* =========================================================================
          MIDDLE SECTION: SALES TREND & FINANCIAL HEALTH (PERIOD RESPONSIVE)
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Trend */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  {dashboardPeriod === 'last30days' ? '30-Day Sales Trend' : '7-Day Sales Trend'}
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-sky-50 text-sky-700 rounded">
                  {currentRange.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Daily verified order revenue volume</p>
            </div>
            <span className="text-xs font-medium text-slate-500">
              Period Sales:{' '}
              <span className="font-bold text-slate-900 tabular-nums">
                PKR {periodSales.toLocaleString()}
              </span>
            </span>
          </div>

          <div className="h-44 flex items-end gap-2 sm:gap-3 pt-4 border-b border-slate-100">
            {normalizedSalesTrend.map((bar, idx) => {
              const heightPct = Math.min(100, Math.max(10, (bar.amount / maxSalesTrend) * 100));
              const dateLabel = bar.displayLabel || formatChartDate(bar.date) || bar.day || 'Day';
              const isTodayBar = bar.date === new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(new Date());

              return (
                <div
                  key={bar.date || idx}
                  className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group"
                >
                  <div className="text-[10px] font-mono text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                    {bar.amount > 0 ? (bar.amount / 1000).toFixed(1) + 'k' : '0'}
                  </div>
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full max-w-[40px] rounded-t-md transition-all shadow-xs ${
                      isTodayBar
                        ? 'bg-sky-600 group-hover:bg-sky-700'
                        : 'bg-sky-400 group-hover:bg-sky-500'
                    }`}
                  />
                  <span className={`text-[10px] sm:text-[11px] font-medium truncate max-w-[36px] text-center ${
                    isTodayBar ? 'text-sky-700 font-bold' : 'text-slate-500'
                  }`}>
                    {dateLabel}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-sky-500" />
                <span>Order Volume in PKR</span>
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

        {/* Period Financial Indicator */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Period Profit Indicator</h3>
              </div>
              <Badge variant={periodProfit >= 0 ? 'success' : 'danger'}>
                {periodProfit >= 0 ? 'Profitable' : 'Loss'}
              </Badge>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Calculated from verified sales & expenses for {currentRange.label.toLowerCase()}
            </p>
          </div>

          <div className="my-5 p-4 bg-slate-50 rounded-lg space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">{currentRange.label} Revenue</span>
              <span className="font-semibold text-slate-800 tabular-nums">
                PKR {periodSales.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">{currentRange.label} Operating Expenses</span>
              <span className="font-semibold text-rose-600 tabular-nums">
                - PKR {periodExpenses.toLocaleString()}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-sm font-bold">
              <span className="text-slate-900">Estimated Net Profit</span>
              <span
                className={`tabular-nums ${
                  periodProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                PKR {periodProfit.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 bg-sky-50/50 p-2.5 rounded-md border border-sky-100">
            <span className="font-semibold text-sky-900">Audit Rule: </span>
            Profit figures derive solely from recorded sales, confirmed payments, and itemized plant operating expenses within the selected period.
          </div>
        </div>
      </div>

      {/* =========================================================================
          LOWER SECTION: DELIVERIES IN MOTION & TOP RECEIVABLES / LOW STOCK
          ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Deliveries in Motion (Filtered for selected period) */}
        <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Deliveries in Motion</h3>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-600 rounded">
                  {currentRange.label}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Route status for {currentRange.label.toLowerCase()}
              </p>
            </div>
            <button
              onClick={() => onNavigate('deliveries')}
              className="text-xs text-sky-600 hover:text-sky-700 font-medium cursor-pointer"
            >
              View All ({periodDeliveries.length})
            </button>
          </div>

          {periodDeliveries.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400">
              No deliveries recorded for {currentRange.label}.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {periodDeliveries.slice(0, 5).map((del) => (
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

        {/* Top Debtors & Low Stock Alerts (STATIC CURRENT ASSET/BALANCE STATES) */}
        <div className="space-y-6">
          {/* Low Stock Alerts (Static Current Inventory) */}
          {lowStock.length > 0 && (
            <div className="bg-amber-50/70 border border-amber-200/80 p-4 rounded-xl">
              <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Low Stock Warning (Current)</span>
              </div>
              <div className="space-y-1.5">
                {lowStock.map((ls: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs text-amber-900">
                    <span>
                      {ls.name} ({ls.size})
                    </span>
                    <span className="font-bold tabular-nums">{ls.filled_stock} cans left</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Outstanding Customers (Static Current Balance) */}
          <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Top Outstanding Receivables</h3>
                <p className="text-xs text-slate-500 mt-0.5">Customers with highest credit balances (Current)</p>
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
                <div className="py-8 text-center text-xs text-slate-400">
                  No outstanding customer balances.
                </div>
              ) : (
                topDebtors.map((cust: any) => (
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
