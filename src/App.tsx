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
import { ProductionPage } from './pages/ProductionPage.tsx';
import { OrdersPage } from './pages/OrdersPage.tsx';
import { DeliveriesPage } from './pages/DeliveriesPage.tsx';
import { CansPage } from './pages/CansPage.tsx';
import { PaymentsPage } from './pages/PaymentsPage.tsx';
import { ExpensesPage } from './pages/ExpensesPage.tsx';
import { SuppliersPage } from './pages/SuppliersPage.tsx';
import { StaffPage } from './pages/StaffPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { AuditPage } from './pages/AuditPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';

function MainLayout() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [currentPage, setCurrentPage] = useState<string>('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
    inventory: 'Stock & Warehouse',
    production: 'Water Filling / Plant',
    orders: 'Customer Orders',
    deliveries: 'Delivery Logistics & Routes',
    cans: 'Empty Can Asset Reconciliation',
    payments: 'Payments & Collections',
    expenses: 'Operating Expenses',
    suppliers: 'Vendors & Suppliers',
    staff: 'Staff & Role Permissions',
    reports: 'Financial Reports & P&L',
    audit: 'Audit Security Trail',
    settings: 'Business Settings',
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <DashboardPage onNavigate={setCurrentPage} />;
      case 'customers':
        return <CustomersPage />;
      case 'products':
        return <ProductsPage />;
      case 'inventory':
        return <InventoryPage />;
      case 'production':
        return <ProductionPage />;
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
      case 'suppliers':
        return <SuppliersPage />;
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

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <MainLayout />
      </AuthProvider>
    </ToastProvider>
  );
}
