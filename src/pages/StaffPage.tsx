import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { User, Permission } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { Shield, Plus, Edit2, Lock, Check, UserCheck, ShieldAlert } from 'lucide-react';

export const StaffPage: React.FC = () => {
  const { hasPermission, user: currentUser } = useAuth();
  const toast = useToast();

  const [staffList, setStaffList] = useState<User[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string; description: string }[]>([]);
  const [loading, setLoading] = useState(true);

  // Tabs
  const [activeTab, setActiveTab] = useState<'users' | 'permissions'>('users');

  // Permission Matrix State
  const [selectedRole, setSelectedRole] = useState<string>('role-manager');
  const [rolePermissions, setRolePermissions] = useState<Permission[]>([]);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<User | null>(null);

  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role_id: '',
    phone: '',
  });

  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    role_id: '',
    status: 'active' as 'active' | 'inactive',
    new_password: '',
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [staffRes, rolesRes] = await Promise.all([
        api.get<User[]>('/staff'),
        api.get<{ id: string; name: string; description: string }[]>('/roles'),
      ]);
      setStaffList(staffRes);
      setRoles(rolesRes);
      if (rolesRes.length > 0 && !form.role_id) {
        setForm((prev) => ({ ...prev, role_id: rolesRes[0].id }));
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to load staff list');
    } finally {
      setLoading(false);
    }
  };

  const fetchRolePermissions = async (roleId: string) => {
    try {
      const perms = await api.get<Permission[]>(`/roles/${roleId}/permissions`);
      setRolePermissions(perms);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load role permissions');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'permissions' && selectedRole) {
      fetchRolePermissions(selectedRole);
    }
  }, [activeTab, selectedRole]);

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/staff', form);
      toast.success('Staff account created successfully');
      setIsAddModalOpen(false);
      setForm({
        name: '',
        email: '',
        password: '',
        role_id: roles[0]?.id || '',
        phone: '',
      });
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create staff account');
    }
  };

  const openEdit = (s: User) => {
    setSelectedStaff(s);
    setEditForm({
      name: s.name,
      phone: s.phone || '',
      role_id: s.role_id,
      status: s.status,
      new_password: '',
    });
    setIsEditModalOpen(true);
  };

  const handleEditStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaff) return;
    try {
      await api.put(`/staff/${selectedStaff.id}`, editForm);
      toast.success('Staff account updated successfully');
      setIsEditModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update staff account');
    }
  };

  const togglePermission = (module: string, action: 'can_view' | 'can_create' | 'can_edit' | 'can_approve' | 'can_delete') => {
    setRolePermissions((prev) =>
      prev.map((p) => {
        if (p.module === module) {
          return { ...p, [action]: p[action] === 1 ? 0 : 1 };
        }
        return p;
      })
    );
  };

  const handleSavePermissions = async () => {
    try {
      await api.put(`/roles/${selectedRole}/permissions`, {
        permissions: rolePermissions,
      });
      toast.success('Role permissions matrix saved successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to save permissions');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Staff & Access Control (RBAC)</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Individual user accounts for Owner, Manager, and Delivery Boy.
          </p>
        </div>

        {hasPermission('staff', 'can_create') && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Staff Member</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            activeTab === 'users'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Staff Directory ({staffList.length})
        </button>
        <button
          onClick={() => setActiveTab('permissions')}
          className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
            activeTab === 'permissions'
              ? 'bg-white text-slate-900 shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Role Permissions Matrix
        </button>
      </div>

      {/* TAB 1: USERS DIRECTORY */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                  <th className="px-4 py-3">Staff Name & Email</th>
                  <th className="px-4 py-3">Role / Responsibilities</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Account Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staffList.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{s.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{s.email}</div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="font-medium text-slate-800">{s.role_name}</span>
                    </td>

                    <td className="px-4 py-3 font-mono text-slate-600">
                      {s.phone || '-'}
                    </td>

                    <td className="px-4 py-3">
                      <Badge variant={s.status === 'active' ? 'success' : 'danger'}>
                        {s.status}
                      </Badge>
                    </td>

                    <td className="px-4 py-3 text-right">
                      {hasPermission('staff', 'can_edit') && (
                        <button
                          onClick={() => openEdit(s)}
                          className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-md transition-colors cursor-pointer"
                          title="Edit Account"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ROLE PERMISSION MATRIX */}
      {activeTab === 'permissions' && (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Configurable Role Permissions</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Fine-tune granular View, Create, Edit, Approve, and Delete capabilities per role.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden font-semibold"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>

              {hasPermission('staff', 'can_edit') && (
                <button
                  onClick={handleSavePermissions}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  Save Permissions Matrix
                </button>
              )}
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50/75 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-2.5">System Module</th>
                  <th className="px-4 py-2.5 text-center">View</th>
                  <th className="px-4 py-2.5 text-center">Create</th>
                  <th className="px-4 py-2.5 text-center">Edit</th>
                  <th className="px-4 py-2.5 text-center">Approve</th>
                  <th className="px-4 py-2.5 text-center">Delete</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rolePermissions.map((p) => (
                  <tr key={p.module} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-semibold text-slate-800 capitalize">
                      {p.module.replace('_', ' ')}
                    </td>
                    {(['can_view', 'can_create', 'can_edit', 'can_approve', 'can_delete'] as const).map(
                      (action) => (
                        <td key={action} className="px-4 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={p[action] === 1}
                            disabled={selectedRole === 'role-owner'} // Owner always full
                            onChange={() => togglePermission(p.module, action)}
                            className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300 disabled:opacity-50 cursor-pointer"
                          />
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ADD STAFF MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Individual Staff Account"
        description="Creates unique login credentials and associates an operational role."
        maxWidth="md"
      >
        <form onSubmit={handleAddStaff} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Asad Ullah"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address *</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="asad@aabearwa.com"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Password *</label>
            <input
              type="password"
              required
              minLength={6}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Assigned Role *</label>
              <select
                value={form.role_id}
                onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="0300 1234567"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer"
            >
              Create Account
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT STAFF MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={selectedStaff ? `Edit Account: ${selectedStaff.name}` : ''}
        maxWidth="md"
      >
        <form onSubmit={handleEditStaff} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Role</label>
              <select
                value={editForm.role_id}
                onChange={(e) => setEditForm({ ...editForm, role_id: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive / Disabled</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
            <input
              type="text"
              value={editForm.phone}
              onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reset Password (Optional)</label>
            <input
              type="password"
              value={editForm.new_password}
              onChange={(e) => setEditForm({ ...editForm, new_password: e.target.value })}
              placeholder="Leave blank to keep current password"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg cursor-pointer"
            >
              Update Staff
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
