import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ToastProvider } from './context/ToastContext.tsx';
import { Header } from './components/layout/Header.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { MobileNav } from './components/layout/MobileNav.tsx';

// Pages
import { LoginPage } from './pages/LoginPage.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { CustomersPage } from './pages/CustomersPage.tsx';
import { ProductsPage } from './pages/ProductsPage.tsx';
import { InventoryPage } from './pages/InventoryPage.tsx';
import { OrdersPage } from './pages/OrdersPage.tsx';
import { DeliveriesPage } from './pages/DeliveriesPage.tsx';
import { CansPage } from './pages/CansPage.tsx';
import { PaymentsPage } from './pages/PaymentsPage.tsx';
import { ExpensesPage } from './pages/ExpensesPage.tsx';
import { StaffPage } from './pages/StaffPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { AuditPage } from './pages/AuditPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';

function MainLayout() {
  const { isAuthenticated, isLoading, user, hasPermission } = useAuth();
  const [currentPage, setCurrentPage] = useState<string>(() => {
    const saved = localStorage.getItem('aab_user');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        if (u.role_name === 'Delivery Boy' || u.role_id === 'role-delivery') {
          return 'deliveries';
        }
      } catch (_) {}
    }
    return 'dashboard';
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Default route redirection based on role
  React.useEffect(() => {
    if (user) {
      const isDeliveryBoy = user.role_name === 'Delivery Boy' || user.role_id === 'role-delivery';
      if (isDeliveryBoy) {
        if (currentPage === 'dashboard' || !hasPermission(currentPage, 'can_view')) {
          setCurrentPage('deliveries');
        }
      } else {
        if (!hasPermission(currentPage, 'can_view')) {
          setCurrentPage(hasPermission('dashboard', 'can_view') ? 'dashboard' : 'orders');
        }
      }
    }
  }, [user?.id, user?.role_name, user?.role_id]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold tracking-wider uppercase text-sky-400">
            AAB E ARWA · Loading Session
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const pageTitles: Record<string, string> = {
    dashboard: 'Operations Dashboard',
    customers: 'Customer Accounts',
    products: 'Products & Bottle Sizes',
    inventory: 'Warehouse Inventory',
    orders: 'Customer Orders',
    deliveries: 'Delivery Logistics & Routes',
    cans: 'Empty Can Asset Reconciliation',
    payments: 'Payments & Collections',
    expenses: 'Operating Expenses',
    staff: 'Staff & Role Permissions',
    reports: 'Financial Reports & P&L',
    audit: 'Audit Security Trail',
    settings: 'Business Settings',
  };

  const renderPage = () => {
    const isDeliveryBoy = user?.role_name === 'Delivery Boy' || user?.role_id === 'role-delivery';

    // Role-based route guard: verify module permission before rendering
    if (!hasPermission(currentPage, 'can_view')) {
      return (
        <div className="bg-white rounded-xl border border-red-200/80 p-8 text-center max-w-md mx-auto my-12 shadow-xs space-y-4">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
            !
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Access Restricted</h3>
            <p className="text-xs text-slate-500 mt-1">
              Your assigned role ({user?.role_name || 'Staff'}) does not have permission to access the {pageTitles[currentPage] || currentPage} module.
            </p>
          </div>
          <button
            onClick={() => setCurrentPage(isDeliveryBoy ? 'deliveries' : 'dashboard')}
            className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {isDeliveryBoy ? 'Go to Deliveries' : 'Return to Dashboard'}
          </button>
        </div>
      );
    }

    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage onNavigate={setCurrentPage} />;
      case 'customers':
        return <CustomersPage />;
      case 'products':
        return <ProductsPage />;
      case 'inventory':
        return <InventoryPage />;
      case 'orders':
        return <OrdersPage />;
      case 'deliveries':
        return <DeliveriesPage />;
      case 'cans':
        return <CansPage />;
      case 'payments':
        return <PaymentsPage />;
      case 'expenses':
        return <ExpensesPage />;
      case 'staff':
        return <StaffPage />;
      case 'reports':
        return <ReportsPage />;
      case 'audit':
        return <AuditPage />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <DashboardPage onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop & Mobile Drawer Sidebar */}
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Viewport Container */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64 transition-all">
        {/* Top Bar Header */}
        <Header
          currentTitle={pageTitles[currentPage] || 'Dashboard'}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onNavigate={setCurrentPage}
        />

        {/* Dynamic Page Canvas */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 pb-20 lg:pb-8 max-w-7xl w-full mx-auto">
          {renderPage()}
        </main>

        {/* Mobile Quick Thumb Navigation */}
        <MobileNav
          currentPage={currentPage}
          onNavigate={setCurrentPage}
          onOpenSidebar={() => setIsSidebarOpen(true)}
        />
      </div>
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-6 text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
              !
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Application Loading Error</h2>
              <p className="text-xs text-slate-400 mt-1">
                {this.state.error?.message || 'An unexpected rendering error occurred.'}
              </p>
            </div>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Reset Session & Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <MainLayout />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
