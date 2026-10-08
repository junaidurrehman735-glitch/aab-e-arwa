import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';
import { BrandAssets } from '../assets/branding.ts';
import { Droplets, Shield, Lock, Mail, ArrowRight, CheckCircle2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const demoAccounts = [
    { role: 'Owner / Super Admin', email: 'owner@aabearwa.com', pass: 'admin123', desc: 'Full business management & permissions' },
    { role: 'Manager', email: 'manager@aabearwa.com', pass: 'manager123', desc: 'Operations oversight & staff supervision' },
    { role: 'Accountant', email: 'accountant@aabearwa.com', pass: 'account123', desc: 'Ledgers, payments, expenses, P&L' },
    { role: 'Sales Staff', email: 'sales@aabearwa.com', pass: 'sales123', desc: 'Customer orders & rate management' },
    { role: 'Filling Staff', email: 'filling@aabearwa.com', pass: 'filling123', desc: 'Water production & bottle warehouse' },
    { role: 'Delivery Driver', email: 'delivery@aabearwa.com', pass: 'delivery123', desc: 'Route delivery, can returns, cash collection' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setIsSubmitting(true);
    await login(email, password);
    setIsSubmitting(false);
  };

  const handleQuickLogin = async (accEmail: string, accPass: string) => {
    setEmail(accEmail);
    setPassword(accPass);
    setIsSubmitting(true);
    await login(accEmail, accPass);
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
              <span>Multi-role access control</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-sky-400 shrink-0" />
              <span>Accurate P&L analytics</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-xs text-slate-500">
          AAB E ARWA Management System · Version 2026.1
        </div>
      </div>

      {/* Right Form Column */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 bg-slate-950">
        <div className="w-full max-w-md space-y-8">
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

          <div>
            <h2 className="text-2xl font-bold tracking-tight text-white">Staff Sign In</h2>
            <p className="text-xs text-slate-400 mt-1">
              Enter your credentials or choose a pre-configured staff role below.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Staff Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@aabearwa.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-sky-500 focus:ring-1 focus:ring-sky-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">Password</label>
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
              <span>{isSubmitting ? 'Verifying Credentials...' : 'Sign In to Dashboard'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Demo Role Switcher */}
          <div className="pt-6 border-t border-slate-900">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3">
              <Shield className="w-3.5 h-3.5 text-sky-400" />
              <span>Instant Role Access (Demo Profiles)</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {demoAccounts.map((acc) => (
                <button
                  key={acc.email}
                  type="button"
                  onClick={() => handleQuickLogin(acc.email, acc.pass)}
                  disabled={isSubmitting}
                  className="p-2.5 bg-slate-900/80 hover:bg-slate-850 border border-slate-800 hover:border-sky-500/50 rounded-lg text-left transition-all cursor-pointer group"
                >
                  <div className="text-xs font-semibold text-slate-200 group-hover:text-sky-400 truncate">
                    {acc.role}
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono truncate">{acc.email}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
