import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { DashboardSummary } from '../types/index.ts';
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
} from 'lucide-react';

interface DashboardPageProps {
  onNavigate: (page: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<DashboardSummary>('/dashboard/summary');
      setData(res);
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

  const { kpis, recentDeliveries, recentOrders, lowStock, topDebtors, salesTrend } = data;

  const maxSalesTrend = Math.max(...salesTrend.map((t) => t.amount), 1000);

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
              PKR {kpis.todayCollections.toLocaleString()}
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
              {topDebtors.map((cust) => (
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
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
