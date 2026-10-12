import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Settings, Save, Lock, Download, Database, ShieldCheck, Users, Plus, UserCheck, UserX, Shield } from 'lucide-react';
import { Modal } from '../components/ui/Modal.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { User } from '../types/index.ts';

export const SettingsPage: React.FC = () => {
  const { hasPermission, user } = useAuth();
  const toast = useToast();
  const isOwner = user?.role_name === 'Owner' || user?.role_id === 'role-owner';

  const [settings, setSettings] = useState<Record<string, string>>({
    business_name: '',
    business_phone: '',
    business_address: '',
    currency: 'PKR',
    can_security_deposit: '1200',
    tax_rate: '0',
  });
  const [loading, setLoading] = useState(true);

  // User Management State (Owner Only)
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [isAddUserModalOpen, setIsAddUserModalOpen] = useState(false);
  const [newUserForm, setNewUserForm] = useState({
    name: '',
    email: '',
    role_id: 'role-manager',
    phone: '',
  });

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

  const fetchStaffUsers = async () => {
    if (!isOwner) return;
    setLoadingUsers(true);
    try {
      const res = await api.get<User[]>('/staff');
      setStaffUsers(res);
    } catch (err: any) {
      console.warn('Failed to load user list:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    if (isOwner) {
      fetchStaffUsers();
    }
  }, [isOwner]);

  const handleRoleChange = async (userId: string, newRoleId: string) => {
    const roleName = newRoleId === 'role-owner' ? 'Owner' : newRoleId === 'role-manager' ? 'Manager' : 'Delivery Boy';
    try {
      await api.put(`/staff/${userId}`, { role_id: newRoleId, role_name: roleName });
      toast.success(`Role updated to ${roleName}`);
      fetchStaffUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update role');
    }
  };

  const handleToggleStatus = async (userToToggle: User) => {
    const newStatus = userToToggle.status === 'active' ? 'inactive' : 'active';
    try {
      await api.put(`/staff/${userToToggle.id}`, { status: newStatus });
      toast.success(`User account ${newStatus === 'active' ? 'activated' : 'deactivated'}`);
      fetchStaffUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserForm.name || !newUserForm.email) {
      toast.error('Name and email are required');
      return;
    }

    try {
      await api.post('/staff', newUserForm);
      const assignedRole = newUserForm.role_id === 'role-owner' ? 'Owner' : newUserForm.role_id === 'role-manager' ? 'Manager' : 'Delivery Boy';
      toast.success(`User account provisioned as ${assignedRole}. Will link to Supabase Auth UUID upon sign-in.`);
      setIsAddUserModalOpen(false);
      setNewUserForm({ name: '', email: '', role_id: 'role-manager', phone: '' });
      fetchStaffUsers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create user');
    }
  };

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

      {/* SECTION 2: OWNER-ONLY APPLICATION USER & ROLE MANAGEMENT */}
      {isOwner && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center">
                <Users className="w-4.5 h-4.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">Application User & Role Management</h3>
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded">
                    Owner Exclusive
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Manage Owner, Manager, and Delivery Boy access. Accounts are permanently linked to Supabase Auth UUID.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsAddUserModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors cursor-pointer shadow-xs shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Add / Provision User</span>
            </button>
          </div>

          {loadingUsers ? (
            <div className="py-8 text-center text-xs text-slate-400">Loading user catalog...</div>
          ) : staffUsers.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No additional user accounts registered yet. Click &quot;Add / Provision User&quot; to create staff access.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/70 text-slate-600 font-semibold">
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3">Supabase Auth Link</th>
                    <th className="py-2.5 px-3">Assigned Role</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffUsers.map((u) => {
                    const isUUID = u.id && u.id.includes('-') && u.id.length === 36;
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-900">{u.name}</div>
                          <div className="text-[11px] text-slate-500">{u.email}</div>
                          {u.phone && <div className="text-[10px] text-slate-400">{u.phone}</div>}
                        </td>
                        <td className="py-2.5 px-3">
                          {isUUID ? (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <ShieldCheck className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span className="font-mono truncate max-w-[120px]">{u.id}</span>
                            </div>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              Pending First Login Link
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            value={u.role_id}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            className="px-2.5 py-1 text-xs font-semibold bg-white border border-slate-200 rounded-md focus:border-sky-500 focus:outline-hidden cursor-pointer"
                          >
                            <option value="role-owner">Owner (Full Business Control)</option>
                            <option value="role-manager">Manager (Operations Only)</option>
                            <option value="role-delivery">Delivery Boy (Field Logistics)</option>
                          </select>
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant={u.status === 'active' ? 'success' : 'neutral'}>
                            {u.status === 'active' ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(u)}
                            className={`p-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                              u.status === 'active'
                                ? 'text-amber-700 hover:bg-amber-50'
                                : 'text-emerald-700 hover:bg-emerald-50'
                            }`}
                            title={u.status === 'active' ? 'Deactivate user' : 'Activate user'}
                          >
                            {u.status === 'active' ? (
                              <>
                                <UserX className="w-3.5 h-3.5 text-amber-600" />
                                <span>Deactivate</span>
                              </>
                            ) : (
                              <>
                                <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Activate</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* SECTION 3: PASSWORD CHANGE */}
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

      {/* PROVISION USER MODAL (OWNER EXCLUSIVE) */}
      <Modal
        isOpen={isAddUserModalOpen}
        onClose={() => setIsAddUserModalOpen(false)}
        title="Provision Application User Account"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Asad Rehman"
              value={newUserForm.name}
              onChange={(e) => setNewUserForm({ ...newUserForm, name: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address *</label>
            <input
              type="email"
              required
              placeholder="e.g. manager@aabearwa.com"
              value={newUserForm.email}
              onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Used to match Supabase Authentication user upon sign-in.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Application Role *</label>
            <select
              required
              value={newUserForm.role_id}
              onChange={(e) => setNewUserForm({ ...newUserForm, role_id: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            >
              <option value="role-owner">Owner (Full Business Control & Financials)</option>
              <option value="role-manager">Manager (Plant Operations, Inventory, Logistics)</option>
              <option value="role-delivery">Delivery Boy (Field Routes, Can Collection)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
            <input
              type="text"
              placeholder="+92 300 1234567"
              value={newUserForm.phone}
              onChange={(e) => setNewUserForm({ ...newUserForm, phone: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddUserModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors cursor-pointer shadow-xs"
            >
              Provision Account
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
