import React from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  LayoutDashboard,
  Users,
  ShoppingBag,
  Truck,
  Droplets,
  Package,
  RotateCcw,
  CreditCard,
  Receipt,
  TruckIcon,
  Shield,
  BarChart3,
  History,
  Settings,
  X,
  Sparkles,
} from 'lucide-react';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  module: string;
  badge?: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onNavigate,
  isOpen,
  onClose,
}) => {
  const { hasPermission, user } = useAuth();

  const navGroups: NavGroup[] = [
    {
      group: 'Overview',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, module: 'dashboard' },
      ],
    },
    {
      group: 'Commercial & Sales',
      items: [
        { id: 'customers', label: 'Customers', icon: Users, module: 'customers' },
        { id: 'orders', label: 'Orders & Sales', icon: ShoppingBag, module: 'orders' },
        { id: 'deliveries', label: 'Deliveries & Routes', icon: Truck, module: 'deliveries' },
        { id: 'products', label: 'Products & Cans', icon: Package, module: 'products' },
      ],
    },
    {
      group: 'Production & Stock',
      items: [
        { id: 'production', label: 'Water Filling / Plant', icon: Droplets, module: 'production' },
        { id: 'inventory', label: 'Finished Stock & Store', icon: Package, module: 'inventory' },
        { id: 'cans', label: 'Empty Can Tracking', icon: RotateCcw, module: 'cans' },
      ],
    },
    {
      group: 'Finance & Accounts',
      items: [
        { id: 'payments', label: 'Payments & Ledgers', icon: CreditCard, module: 'payments' },
        { id: 'expenses', label: 'Operating Expenses', icon: Receipt, module: 'expenses' },
        { id: 'suppliers', label: 'Suppliers & Vendors', icon: TruckIcon, module: 'suppliers' },
      ],
    },
    {
      group: 'Management',
      items: [
        { id: 'reports', label: 'Reports & P&L', icon: BarChart3, module: 'reports' },
        { id: 'staff', label: 'Staff & Roles', icon: Shield, module: 'staff' },
        { id: 'audit', label: 'Audit Trail', icon: History, module: 'audit' },
        { id: 'settings', label: 'Settings', icon: Settings, module: 'settings' },
      ],
    },
  ];

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-40 w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800 transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-slate-800/80 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-sky-600 to-cyan-400 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
              <Droplets className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                <span>AAB E ARWA</span>
              </div>
              <div className="text-[10px] uppercase font-semibold text-sky-400 tracking-wider">
                Water Management
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-md lg:hidden cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation List */}
        <div className="flex-1 px-3 py-4 overflow-y-auto space-y-6">
          {navGroups.map((group) => {
            // Filter items user has permission to view
            const visibleItems = group.items.filter((item) => hasPermission(item.module, 'can_view'));
            if (visibleItems.length === 0) return null;

            return (
              <div key={group.group} className="space-y-1">
                <div className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {group.group}
                </div>
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = currentPage === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onNavigate(item.id);
                        if (window.innerWidth < 1024) onClose();
                      }}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-sky-600 text-white shadow-xs font-semibold'
                          : 'text-slate-350 hover:text-white hover:bg-slate-800/60'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <Icon
                          className={`w-4 h-4 ${
                            isActive ? 'text-white' : 'text-slate-400'
                          }`}
                        />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-sky-500/20 text-sky-300 font-mono">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* User Card at Bottom */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-slate-800/40">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <div className="truncate flex-1">
              <div className="text-xs font-semibold text-white truncate">{user?.name}</div>
              <div className="text-[10px] text-slate-400 truncate">{user?.role_name}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
