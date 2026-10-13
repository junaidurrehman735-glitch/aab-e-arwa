import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import {
  BarChart3,
  Download,
  Calendar,
  TrendingUp,
  DollarSign,
  Receipt,
  Truck,
  PieChart,
  ArrowUpRight,
} from 'lucide-react';

interface FinancialReportData {
  summary: {
    salesRevenue: number;
    collections: number;
    cogs: number;
    grossProfit: number;
    expenses: number;
    netProfit: number;
    profitMargin: string;
  };
  salesRevenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
  profitMargin: string;
  categoryExpenses: { name: string; amount: number }[];
}

const DEFAULT_FINANCIAL_DATA: FinancialReportData = {
  summary: {
    salesRevenue: 0,
    collections: 0,
    cogs: 0,
    grossProfit: 0,
    expenses: 0,
    netProfit: 0,
    profitMargin: '0.0',
  },
  salesRevenue: 0,
  costOfGoodsSold: 0,
  grossProfit: 0,
  operatingExpenses: 0,
  netProfit: 0,
  profitMargin: '0.0',
  categoryExpenses: [],
};

export const ReportsPage: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const isOwner = user?.role_name === 'Owner' || user?.role_id === 'role-owner';

  const [activeTab, setActiveTab] = useState<'financial' | 'sales' | 'deliveries'>(
    isOwner ? 'financial' : 'sales'
  );

  // Date Range
  const [startDate, setStartDate] = useState(
    new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  );
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  // Data states initialized with resilient defaults
  const [financialData, setFinancialData] = useState<FinancialReportData>(DEFAULT_FINANCIAL_DATA);
  const [salesData, setSalesData] = useState<any>({ productSales: [], areaSales: [] });
  const [deliveryData, setDeliveryData] = useState<any>({ driverPerformance: [] });
  const [loading, setLoading] = useState(true);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const q = `?startDate=${startDate}&endDate=${endDate}`;
      if (activeTab === 'financial') {
        if (!isOwner) {
          setFinancialData(DEFAULT_FINANCIAL_DATA);
          setLoading(false);
          return;
        }
        const res = await api.get<any>(`/reports/financial${q}`);
        if (res) {
          const s = res.summary || {};
          const safeData: FinancialReportData = {
            summary: {
              salesRevenue: Number(s.salesRevenue ?? res.salesRevenue ?? res.totalRevenue ?? 0),
              collections: Number(s.collections ?? res.collections ?? res.totalCollections ?? 0),
              cogs: Number(s.cogs ?? res.cogs ?? res.costOfGoodsSold ?? 0),
              grossProfit: Number(s.grossProfit ?? res.grossProfit ?? 0),
              expenses: Number(s.expenses ?? res.expenses ?? res.operatingExpenses ?? res.totalExpenses ?? 0),
              netProfit: Number(s.netProfit ?? res.netProfit ?? 0),
              profitMargin: String(s.profitMargin ?? res.profitMargin ?? res.margin ?? '0.0'),
            },
            salesRevenue: Number(res.salesRevenue ?? s.salesRevenue ?? res.totalRevenue ?? 0),
            costOfGoodsSold: Number(res.costOfGoodsSold ?? res.cogs ?? s.cogs ?? 0),
            grossProfit: Number(res.grossProfit ?? s.grossProfit ?? 0),
            operatingExpenses: Number(res.operatingExpenses ?? res.expenses ?? s.expenses ?? res.totalExpenses ?? 0),
            netProfit: Number(res.netProfit ?? s.netProfit ?? 0),
            profitMargin: String(res.profitMargin ?? s.profitMargin ?? res.margin ?? '0.0'),
            categoryExpenses: Array.isArray(res.categoryExpenses) ? res.categoryExpenses : [],
          };
          setFinancialData(safeData);
        } else {
          setFinancialData(DEFAULT_FINANCIAL_DATA);
        }
      } else if (activeTab === 'sales') {
        const res = await api.get<any>(`/reports/sales${q}`);
        setSalesData(res || { productSales: [], areaSales: [] });
      } else if (activeTab === 'deliveries') {
        const res = await api.get<any>('/reports/deliveries');
        setDeliveryData(res || { driverPerformance: [] });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load report analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, [activeTab, startDate, endDate]);

  const handleExport = (table: string) => {
    window.open(`/api/export/${table}`, '_blank');
    toast.success(`Exporting ${table} data to CSV...`);
  };

  // Safe Financial P&L summary referencing initialized state
  const financialSummary = financialData.summary;

  const categoryExpenses: { name: string; amount: number }[] = Array.isArray(financialData.categoryExpenses)
    ? financialData.categoryExpenses
    : [];

  const productSales: any[] = Array.isArray(salesData?.productSales)
    ? salesData.productSales
    : Array.isArray(salesData?.productBreakdown)
    ? salesData.productBreakdown.map((p: any) => ({
        name: p.name || 'Bottle',
        size: p.size || '19L',
        total_qty: Number(p.quantity || p.total_qty || 0),
        total_revenue: Number(p.revenue || p.total_revenue || 0),
      }))
    : [];

  const areaSales: any[] = Array.isArray(salesData?.areaSales)
    ? salesData.areaSales
    : [];

  const driverPerformance: any[] = Array.isArray(deliveryData?.driverPerformance)
    ? deliveryData.driverPerformance
    : [];

  if (!hasPermission('reports', 'can_view')) {
    return (
      <div className="bg-white rounded-xl border border-red-200/80 p-8 text-center max-w-md mx-auto my-12 shadow-xs space-y-4">
        <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
          !
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-900">Access Restricted</h3>
          <p className="text-xs text-slate-500 mt-1">
            Your assigned role ({user?.role_name || 'Staff'}) does not have permission to view Financial & Operational Reports.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Financial & Operational Analytics</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Profit and loss, revenue margins, delivery performance metrics, and CSV exports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleExport('orders')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Orders</span>
          </button>
          <button
            onClick={() => handleExport('customers')}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Customers</span>
          </button>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
          {isOwner && (
            <button
              onClick={() => setActiveTab('financial')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                activeTab === 'financial' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              P&L Financials
            </button>
          )}
          <button
            onClick={() => setActiveTab('sales')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === 'sales' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Sales Breakdown
          </button>
          <button
            onClick={() => setActiveTab('deliveries')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              activeTab === 'deliveries' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Driver Performance
          </button>
        </div>

        {activeTab !== 'deliveries' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Date Range:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md"
            />
          </div>
        )}
      </div>

      {/* Loading Skeleton */}
      {loading ? (
        <div className="space-y-6 animate-pulse">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 bg-slate-100 rounded-xl" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-64 bg-slate-100 rounded-xl" />
            <div className="h-64 bg-slate-100 rounded-xl" />
          </div>
        </div>
      ) : (
        <>
          {/* TAB 1: FINANCIAL P&L */}
          {activeTab === 'financial' && (
            <div className="space-y-6">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs">
                  <span className="text-xs text-slate-500 font-medium">Sales Revenue</span>
                  <div className="text-xl font-bold text-slate-900 tabular-nums mt-1">
                    PKR {(financialSummary.salesRevenue || 0).toLocaleString()}
                  </div>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">Total orders billed</span>
                </div>

                <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs">
                  <span className="text-xs text-slate-500 font-medium">Collections Received</span>
                  <div className="text-xl font-bold text-emerald-600 tabular-nums mt-1">
                    PKR {(financialSummary.collections || 0).toLocaleString()}
                  </div>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">Actual cash/bank inflow</span>
                </div>

                <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs">
                  <span className="text-xs text-slate-500 font-medium">Operating Expenses</span>
                  <div className="text-xl font-bold text-rose-600 tabular-nums mt-1">
                    PKR {(financialSummary.expenses || 0).toLocaleString()}
                  </div>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">Fuel, power, rent, repairs</span>
                </div>

                <div className="bg-white p-4.5 rounded-xl border border-slate-200/80 shadow-xs">
                  <span className="text-xs text-slate-500 font-medium">Estimated Net Profit</span>
                  <div
                    className={`text-xl font-bold tabular-nums mt-1 ${
                      financialSummary.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'
                    }`}
                  >
                    PKR {(financialSummary.netProfit || 0).toLocaleString()}
                  </div>
                  <span className="text-[11px] text-slate-400 mt-0.5 block">
                    Net Margin: {financialSummary.profitMargin}%
                  </span>
                </div>
              </div>

              {/* Statement Breakdown Table */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Profit & Loss Statement Structure</h3>
                  <div className="divide-y divide-slate-100 text-xs">
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-600 font-medium">1. Gross Water Sales Revenue</span>
                      <span className="font-bold text-slate-900 tabular-nums">
                        PKR {(financialSummary.salesRevenue || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-600 font-medium">2. Cost of Goods Sold (COGS)</span>
                      <span className="text-slate-700 tabular-nums">
                        - PKR {(financialSummary.cogs || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="py-2.5 flex justify-between bg-slate-50 px-2 rounded">
                      <span className="text-slate-800 font-bold">Gross Margin</span>
                      <span className="font-bold text-slate-900 tabular-nums">
                        PKR {(financialSummary.grossProfit || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="py-2.5 flex justify-between">
                      <span className="text-slate-600 font-medium">3. Plant & Logistics Operating Expenses</span>
                      <span className="text-rose-600 tabular-nums">
                        - PKR {(financialSummary.expenses || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="py-3 flex justify-between bg-emerald-50/60 px-2 rounded text-sm font-bold">
                      <span className="text-emerald-900">Net Operating Profit</span>
                      <span className="text-emerald-700 tabular-nums">
                        PKR {(financialSummary.netProfit || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Expenses By Category */}
                <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs space-y-3">
                  <h3 className="text-sm font-semibold text-slate-900">Expense Category Breakdown</h3>
                  <div className="divide-y divide-slate-100 text-xs tabular-nums">
                    {categoryExpenses.length === 0 ? (
                      <div className="py-4 text-slate-400 text-center">No categorized expenses in this date range.</div>
                    ) : (
                      categoryExpenses.map((ce: any) => (
                        <div key={ce.name} className="py-2.5 flex justify-between">
                          <span className="text-slate-700 font-medium">{ce.name}</span>
                          <span className="font-semibold text-rose-600">PKR {(ce.amount || 0).toLocaleString()}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SALES BREAKDOWN */}
          {activeTab === 'sales' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Product Sales */}
              <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Product-wise Sales Volume</h3>
                <div className="border border-slate-100 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5">Product</th>
                        <th className="px-3 py-2.5 text-center">Units Sold</th>
                        <th className="px-3 py-2.5 text-right">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {productSales.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-center text-slate-400">
                            No product sales recorded in this date range.
                          </td>
                        </tr>
                      ) : (
                        productSales.map((p: any) => (
                          <tr key={p.name}>
                            <td className="px-3 py-2 font-medium">{p.name} {p.size ? `(${p.size})` : ''}</td>
                            <td className="px-3 py-2 text-center font-bold text-slate-800">{p.total_qty || 0}</td>
                            <td className="px-3 py-2 text-right font-bold text-sky-700">
                              PKR {(p.total_revenue || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Area Sales */}
              <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Sector & Area Sales Volume</h3>
                <div className="border border-slate-100 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2.5">Delivery Sector</th>
                        <th className="px-3 py-2.5 text-center">Orders</th>
                        <th className="px-3 py-2.5 text-right">Total Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {areaSales.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-3 py-4 text-center text-slate-400">
                            No sector sales recorded in this date range.
                          </td>
                        </tr>
                      ) : (
                        areaSales.map((a: any) => (
                          <tr key={a.area}>
                            <td className="px-3 py-2 font-medium">{a.area}</td>
                            <td className="px-3 py-2 text-center">{a.total_orders || 0}</td>
                            <td className="px-3 py-2 text-right font-bold text-sky-700">
                              PKR {(a.total_revenue || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: DRIVER PERFORMANCE */}
          {activeTab === 'deliveries' && (
            <div className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Delivery Driver Operations Performance</h3>
              <div className="border border-slate-100 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Driver Name</th>
                      <th className="px-4 py-3 text-center">Assigned</th>
                      <th className="px-4 py-3 text-center">Delivered</th>
                      <th className="px-4 py-3 text-center">Failed</th>
                      <th className="px-4 py-3 text-right">Cash Collected</th>
                      <th className="px-4 py-3 text-right">Empty Cans Retrieved</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {driverPerformance.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                          No delivery driver activity records found.
                        </td>
                      </tr>
                    ) : (
                      driverPerformance.map((dp: any) => (
                        <tr key={dp.driver_name}>
                          <td className="px-4 py-3 font-semibold text-slate-900">{dp.driver_name}</td>
                          <td className="px-4 py-3 text-center">{dp.total_assigned || 0}</td>
                          <td className="px-4 py-3 text-center font-bold text-emerald-600">{dp.delivered || 0}</td>
                          <td className="px-4 py-3 text-center font-semibold text-rose-600">{dp.failed || 0}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900">
                            PKR {(dp.cash_collected || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-sky-700">
                            {dp.empty_cans_collected || 0} cans
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
