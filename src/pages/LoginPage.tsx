import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { BrandAssets } from '../assets/branding.ts';
import { Droplets, Shield, Lock, Mail, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, isLoading, isSupabaseReady } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsSubmitting(true);
    await login(email, password);
    setIsSubmitting(false);
  };

  return (
    <div className="min-h-screen flex bg-slate-950 text-slate-100 selection:bg-sky-500 selection:text-white">
      {/* Left Visual Column */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden flex-col justify-between p-12 bg-slate-900 border-r border-slate-800">
        <div className="absolute inset-0 z-0 opacity-40">
          <img
            src={BrandAssets.fillingPlant}
            alt="Water Plant Facility"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover filter brightness-75 contrast-125"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/40" />
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-cyan-400 flex items-center justify-center text-white shadow-lg shadow-sky-500/25">
              <Droplets className="w-6 h-6" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-white block">AAB E ARWA</span>
              <span className="text-xs uppercase font-semibold text-sky-400 tracking-wider">
                Pure Drinking Water System
              </span>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-lg space-y-4">
          <h2 className="text-3xl font-bold tracking-tight text-white leading-tight">
            Enterprise water operations & supply chain management.
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Synchronized bottle filling, inventory control, route delivery logistics, empty can tracking, customer ledgers, and real-time financial reporting.
          </p>

          <div className="pt-4 grid grid-cols-2 gap-3 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Real-time empty can balance</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Running customer ledgers</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Enforced Owner, Manager & Delivery Boy roles</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Supabase PostgreSQL Single Source of Truth</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs text-slate-500">
          AAB E ARWA Management System · Production Release
        </div>
      </div>

      {/* Right Form Column */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-slate-950">
        <div className="w-full max-w-md space-y-6">
          {/* Mobile Brand Header */}
          <div className="lg:hidden flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500 to-cyan-400 flex items-center justify-center text-white shadow-lg">
              <Droplets className="w-6 h-6" />
            </div>
            <div>
              <span className="text-lg font-bold text-white block">AAB E ARWA</span>
              <span className="text-[11px] text-sky-400 uppercase font-semibold">Management System</span>
            </div>
          </div>

          {!isSupabaseReady && (
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-semibold text-amber-300">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Supabase Configuration Notice</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Ensure <code className="text-amber-300 font-mono">VITE_SUPABASE_URL</code> and <code className="text-amber-300 font-mono">VITE_SUPABASE_PUBLISHABLE_KEY</code> are set in your environment variables.
              </p>
            </div>
          )}

          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Staff Sign In</h2>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Enter your enterprise credentials to access the management portal. Access is restricted to authorized personnel. User accounts are provisioned exclusively by the Owner/Administrator.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Staff Email Address *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="staff@aabearwa.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">Password *</label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold tracking-wide transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <span>{isSubmitting ? 'Authenticating with Supabase...' : 'Sign In to Operations'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Role Access Information */}
          <div className="pt-6 border-t border-slate-900">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3">
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>Role Permissions & Authorization</span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">Owner</div>
                  <div className="text-[11px] text-slate-400">Full business ownership, financials, approvals, system settings, staff management</div>
                </div>
                <span className="px-2 py-0.5 bg-sky-500/10 border border-sky-500/30 text-sky-400 text-[10px] font-semibold rounded">
                  All Modules
                </span>
              </div>
              <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">Manager</div>
                  <div className="text-[11px] text-slate-400">Operational oversight, stock filling, orders, deliveries (no financial or staff access)</div>
                </div>
                <span className="px-2 py-0.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-[10px] font-semibold rounded">
                  Operations
                </span>
              </div>
              <div className="p-3 bg-slate-900/60 border border-slate-800/80 rounded-lg flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-200">Delivery Boy</div>
                  <div className="text-[11px] text-slate-400">Assigned deliveries only, customer drop-off details, returned empty cans collection</div>
                </div>
                <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold rounded">
                  Routes & Cans
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
