import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { BrandAssets } from '../../assets/branding.ts';
import {
  Menu,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  Building2,
  Calendar,
  ChevronDown,
} from 'lucide-react';

interface HeaderProps {
  currentTitle: string;
  onToggleSidebar: () => void;
  onNavigate: (page: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTitle,
  onToggleSidebar,
  onNavigate,
}) => {
  const { user, logout } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);

  const todayStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between h-16 px-4 md:px-6 bg-white/95 backdrop-blur-md border-b border-slate-200/80 transition-all">
      {/* Zone 1: Sidebar Toggle & Context Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg lg:hidden transition-colors cursor-pointer"
          aria-label="Toggle navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="hidden md:inline text-xs font-medium text-slate-400">AAB E ARWA /</span>
          <h1 className="text-base font-semibold text-slate-900 tracking-tight">{currentTitle}</h1>
        </div>
      </div>

      {/* Zone 2: Date Context */}
      <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
        <Calendar className="w-3.5 h-3.5 text-sky-600" />
        <span className="tabular-nums font-medium">{todayStr}</span>
        <span className="text-slate-300">·</span>
        <span className="inline-flex items-center gap-1.5 text-emerald-600 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Plant Online
        </span>
      </div>

      {/* Zone 3: User Profile & Quick Actions */}
      <div className="relative flex items-center gap-2">
        <button
          onClick={() => setProfileOpen(!profileOpen)}
          className="flex items-center gap-2.5 p-1.5 pr-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left cursor-pointer border border-transparent hover:border-slate-200"
        >
          <img
            src={BrandAssets.leadAvatar}
            alt={user?.name || 'User'}
            referrerPolicy="no-referrer"
            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          <div className="hidden sm:block">
            <div className="text-xs font-semibold text-slate-800 leading-tight">{user?.name}</div>
            <div className="text-[11px] text-slate-500 leading-tight">{user?.role_name}</div>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
        </button>

        {profileOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setProfileOpen(false)}
            />
            <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl border border-slate-200 shadow-xl py-1 z-50 animate-in fade-in zoom-in-95">
              <div className="px-3.5 py-2.5 border-b border-slate-100">
                <p className="text-xs font-semibold text-slate-900">{user?.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-sky-700 bg-sky-50 px-2 py-0.5 rounded font-medium">
                  <ShieldCheck className="w-3 h-3 shrink-0" />
                  <span>{user?.role_name}</span>
                </div>
              </div>

              <div className="py-1">
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate('settings');
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                >
                  <Building2 className="w-4 h-4 text-slate-400" />
                  <span>System Settings</span>
                </button>
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    onNavigate('staff');
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer text-left"
                >
                  <UserIcon className="w-4 h-4 text-slate-400" />
                  <span>Staff Directory</span>
                </button>
              </div>

              <div className="border-t border-slate-100 pt-1">
                <button
                  onClick={() => {
                    setProfileOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
};
