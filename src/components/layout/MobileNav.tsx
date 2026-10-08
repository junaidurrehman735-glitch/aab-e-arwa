import React from 'react';
import { LayoutDashboard, Truck, Users, ShoppingBag, Menu } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.tsx';

interface MobileNavProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onOpenSidebar: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({
  currentPage,
  onNavigate,
  onOpenSidebar,
}) => {
  const { hasPermission } = useAuth();

  const tabs = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard, module: 'dashboard' },
    { id: 'deliveries', label: 'Deliveries', icon: Truck, module: 'deliveries' },
    { id: 'customers', label: 'Customers', icon: Users, module: 'customers' },
    { id: 'orders', label: 'Orders', icon: ShoppingBag, module: 'orders' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 lg:hidden bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-2 py-1.5 flex items-center justify-around shadow-lg">
      {tabs.map((tab) => {
        if (!hasPermission(tab.module, 'can_view')) return null;
        const Icon = tab.icon;
        const isActive = currentPage === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onNavigate(tab.id)}
            className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg text-[10px] font-medium transition-colors cursor-pointer ${
              isActive ? 'text-sky-600 font-semibold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className={`w-5 h-5 mb-0.5 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
            <span>{tab.label}</span>
          </button>
        );
      })}

      <button
        onClick={onOpenSidebar}
        className="flex flex-col items-center justify-center py-1 px-3 rounded-lg text-[10px] font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
      >
        <Menu className="w-5 h-5 mb-0.5 text-slate-400" />
        <span>Menu</span>
      </button>
    </nav>
  );
};
