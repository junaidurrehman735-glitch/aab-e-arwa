import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Settings, Save, Lock, Download, Database, ShieldCheck } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const toast = useToast();

  const [settings, setSettings] = useState<Record<string, string>>({
    business_name: '',
    business_phone: '',
    business_address: '',
    currency: 'PKR',
    can_security_deposit: '1200',
    tax_rate: '0',
  });
  const [loading, setLoading] = useState(true);

  // Change password form
  const [passForm, setPassForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await api.get<Record<string, string>>('/settings');
      setSettings(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put('/settings', settings);
      toast.success('Business configuration updated successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save settings');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passForm.newPassword !== passForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }
    if (passForm.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters long');
      return;
    }

    try {
      await api.post('/auth/change-password', {
        currentPassword: passForm.currentPassword,
        newPassword: passForm.newPassword,
      });
      toast.success('Your password has been changed');
      setPassForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast.error(err.message || 'Password update failed');
    }
  };

  const handleDownloadBackup = (table: string) => {
    window.open(`/api/export/${table}`, '_blank');
    toast.success(`Exporting ${table} data to CSV...`);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Business Configuration & Settings</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          General business metadata, security controls, password management, and data backups.
        </p>
      </div>

      {/* SECTION 1: BUSINESS SETTINGS */}
      {hasPermission('settings', 'can_edit') && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <Settings className="w-5 h-5 text-sky-600" />
            <h3 className="text-sm font-semibold text-slate-900">Enterprise Profile & Branding</h3>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Business Trade Name *</label>
                <input
                  type="text"
                  required
                  value={settings.business_name || ''}
                  onChange={(e) => setSettings({ ...settings, business_name: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Official Hotline / WhatsApp *</label>
                <input
                  type="text"
                  required
                  value={settings.business_phone || ''}
                  onChange={(e) => setSettings({ ...settings, business_phone: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Plant / Premises Address</label>
                <input
                  type="text"
                  value={settings.business_address || ''}
                  onChange={(e) => setSettings({ ...settings, business_address: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Currency Code</label>
                <input
                  type="text"
                  value={settings.currency || 'PKR'}
                  onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Standard Security Deposit per Reusable Can (PKR)
                </label>
                <input
                  type="number"
                  value={settings.can_security_deposit || '1200'}
                  onChange={(e) => setSettings({ ...settings, can_security_deposit: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg font-bold tabular-nums"
                />
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                <Save className="w-4 h-4" />
                <span>Save Business Settings</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* SECTION 2: PASSWORD CHANGE */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-6 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <Lock className="w-5 h-5 text-sky-600" />
          <h3 className="text-sm font-semibold text-slate-900">Change Account Password</h3>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Current Password *</label>
            <input
              type="password"
              required
              value={passForm.currentPassword}
              onChange={(e) => setPassForm({ ...passForm, currentPassword: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">New Password *</label>
            <input
              type="password"
              required
              minLength={6}
              value={passForm.newPassword}
              onChange={(e) => setPassForm({ ...passForm, newPassword: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Confirm New Password *</label>
            <input
              type="password"
              required
              minLength={6}
              value={passForm.confirmPassword}
              onChange={(e) => setPassForm({ ...passForm, confirmPassword: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              Update Password
            </button>
          </div>
        </form>
      </div>

      {/* SECTION 3: DATA BACKUP & EXPORTS */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-6 space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
          <Database className="w-5 h-5 text-sky-600" />
          <h3 className="text-sm font-semibold text-slate-900">Database Backup & Spreadsheet Export</h3>
        </div>

        <p className="text-xs text-slate-500">
          Export verified business data records to CSV format for external spreadsheets, tax filings, or offline records.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
          {[
            { label: 'Customers & Balances', table: 'customers' },
            { label: 'Products & Sizes', table: 'products' },
            { label: 'Orders & Sales', table: 'orders' },
            { label: 'Deliveries Manifest', table: 'deliveries' },
            { label: 'Payment Receipts', table: 'payments' },
            { label: 'Operating Expenses', table: 'expenses' },
            { label: 'Inventory Stock', table: 'inventory' },
            { label: 'Suppliers & Vendors', table: 'suppliers' },
            { label: 'Full Audit Trail', table: 'audit_logs' },
          ].map((item) => (
            <button
              key={item.table}
              type="button"
              onClick={() => handleDownloadBackup(item.table)}
              className="flex items-center justify-between p-3 rounded-lg border border-slate-200 hover:border-sky-500 hover:bg-sky-50/30 text-left transition-colors cursor-pointer group"
            >
              <span className="text-xs font-semibold text-slate-700 group-hover:text-sky-900">
                {item.label}
              </span>
              <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-600" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
