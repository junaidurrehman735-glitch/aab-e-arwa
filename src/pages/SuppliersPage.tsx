import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import { Supplier, SupplierTransaction } from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { TruckIcon, Plus, Phone, DollarSign, Eye, MapPin, Package } from 'lucide-react';

export const SuppliersPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierTransactions, setSupplierTransactions] = useState<SupplierTransaction[]>([]);

  // Add Supplier Form
  const [addForm, setAddForm] = useState({
    name: '',
    contact_person: '',
    phone: '',
    address: '',
    materials_supplied: '',
    opening_payable: '0',
    notes: '',
  });

  // Transaction Form
  const [txForm, setTxForm] = useState({
    transaction_type: 'payment',
    amount: '',
    description: '',
    transaction_date: new Date().toISOString().split('T')[0],
  });

  const fetchSuppliers = async () => {
    setLoading(true);
    try {
      const res = await api.get<Supplier[]>('/suppliers');
      setSuppliers(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const viewSupplier = async (sup: Supplier) => {
    setSelectedSupplier(sup);
    setIsDetailsModalOpen(true);
    try {
      const res = await api.get<{ supplier: Supplier; transactions: SupplierTransaction[] }>(
        `/suppliers/${sup.id}`
      );
      setSupplierTransactions(res.transactions);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load supplier details');
    }
  };

  const handleAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name || !addForm.phone) {
      toast.error('Name and phone are required');
      return;
    }

    try {
      await api.post('/suppliers', addForm);
      toast.success('Supplier added successfully');
      setIsAddModalOpen(false);
      setAddForm({
        name: '',
        contact_person: '',
        phone: '',
        address: '',
        materials_supplied: '',
        opening_payable: '0',
        notes: '',
      });
      fetchSuppliers();
    } catch (err: any) {
      toast.error(err.message || 'Failed to add supplier');
    }
  };

  const openTx = (sup: Supplier, type: 'payment' | 'purchase') => {
    setSelectedSupplier(sup);
    setTxForm({
      transaction_type: type,
      amount: '',
      description: type === 'payment' ? 'Payment released' : 'Raw material order',
      transaction_date: new Date().toISOString().split('T')[0],
    });
    setIsTxModalOpen(true);
  };

  const handleRecordTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplier) return;
    const amt = Number(txForm.amount);
    if (isNaN(amt) || amt <= 0) {
      toast.error('Valid positive amount is required');
      return;
    }

    try {
      await api.post(`/suppliers/${selectedSupplier.id}/transaction`, {
        ...txForm,
        amount: amt,
      });

      toast.success('Supplier transaction recorded and balance updated');
      setIsTxModalOpen(false);
      fetchSuppliers();
      if (isDetailsModalOpen) {
        viewSupplier(selectedSupplier);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to record transaction');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Suppliers & Vendor Payables</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Polycarbonate bottle manufacturers, cap/seal vendors, and water mineral chemical distributors.
          </p>
        </div>

        {hasPermission('suppliers', 'can_create') && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add Vendor / Supplier</span>
          </button>
        )}
      </div>

      {/* Suppliers Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                <th className="px-4 py-3">Vendor / Company</th>
                <th className="px-4 py-3">Contact Person & Phone</th>
                <th className="px-4 py-3">Materials Supplied</th>
                <th className="px-4 py-3 text-right">Outstanding Payable</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    Loading suppliers...
                  </td>
                </tr>
              ) : suppliers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-400">
                    No suppliers added yet.
                  </td>
                </tr>
              ) : (
                suppliers.map((sup) => (
                  <tr key={sup.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900">{sup.name}</div>
                      <div className="text-[11px] text-slate-400 truncate max-w-xs">{sup.address}</div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{sup.contact_person || '-'}</div>
                      <div className="text-[11px] text-slate-500 font-mono">{sup.phone}</div>
                    </td>

                    <td className="px-4 py-3 text-slate-600 max-w-sm truncate">
                      {sup.materials_supplied}
                    </td>

                    <td className="px-4 py-3 text-right font-bold text-slate-900">
                      PKR {sup.outstanding_payable.toLocaleString()}
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => viewSupplier(sup)}
                          className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-md transition-colors cursor-pointer"
                          title="View Statement"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openTx(sup, 'payment')}
                          className="px-2.5 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors cursor-pointer"
                        >
                          Pay
                        </button>
                        <button
                          onClick={() => openTx(sup, 'purchase')}
                          className="px-2.5 py-1 text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-md transition-colors cursor-pointer"
                        >
                          Bill
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADD SUPPLIER MODAL */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Vendor / Supplier"
        description="Register bottle manufacturer, cap provider, or water mineral distributor."
        maxWidth="md"
      >
        <form onSubmit={handleAddSupplier} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Company / Vendor Name *</label>
            <input
              type="text"
              required
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              placeholder="e.g. Apex PolyTech Containers Ltd."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Person</label>
              <input
                type="text"
                value={addForm.contact_person}
                onChange={(e) => setAddForm({ ...addForm, contact_person: e.target.value })}
                placeholder="Focal person"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number *</label>
              <input
                type="text"
                required
                value={addForm.phone}
                onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                placeholder="0300 1234567"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Factory / Office Address</label>
            <input
              type="text"
              value={addForm.address}
              onChange={(e) => setAddForm({ ...addForm, address: e.target.value })}
              placeholder="Industrial estate, city..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Materials Supplied</label>
            <input
              type="text"
              value={addForm.materials_supplied}
              onChange={(e) => setAddForm({ ...addForm, materials_supplied: e.target.value })}
              placeholder="e.g. 19L Reusable Cans, 55mm Caps, Shrink Seals"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Opening Payable Due (PKR)</label>
            <input
              type="number"
              value={addForm.opening_payable}
              onChange={(e) => setAddForm({ ...addForm, opening_payable: e.target.value })}
              placeholder="0"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg tabular-nums"
            />
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
              Save Supplier
            </button>
          </div>
        </form>
      </Modal>

      {/* RECORD TRANSACTION MODAL */}
      <Modal
        isOpen={isTxModalOpen}
        onClose={() => setIsTxModalOpen(false)}
        title={selectedSupplier ? `${txForm.transaction_type === 'payment' ? 'Disburse Payment to' : 'Record Purchase Bill from'} ${selectedSupplier.name}` : ''}
        maxWidth="md"
      >
        <form onSubmit={handleRecordTx} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Transaction Type</label>
            <select
              value={txForm.transaction_type}
              onChange={(e) => setTxForm({ ...txForm, transaction_type: e.target.value })}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            >
              <option value="payment">Payment Disbursed (Reduces Payable)</option>
              <option value="purchase">Materials Purchase Invoice (Increases Payable)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (PKR) *</label>
            <input
              type="number"
              min="1"
              required
              value={txForm.amount}
              onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
              placeholder="e.g. 15000"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg font-bold tabular-nums"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Invoice / Cheque Description *</label>
            <input
              type="text"
              required
              value={txForm.description}
              onChange={(e) => setTxForm({ ...txForm, description: e.target.value })}
              placeholder="e.g. 200 units 19L cans delivery, Invoice # 9042"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsTxModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 rounded-lg cursor-pointer"
            >
              Post Transaction
            </button>
          </div>
        </form>
      </Modal>

      {/* SUPPLIER DETAILS MODAL */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title={selectedSupplier ? `${selectedSupplier.name} - Ledger` : 'Vendor Statement'}
        maxWidth="lg"
      >
        {selectedSupplier && (
          <div className="space-y-4">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500">Current Outstanding Payable:</span>
                <div className="text-base font-bold text-slate-900 tabular-nums">
                  PKR {selectedSupplier.outstanding_payable.toLocaleString()}
                </div>
              </div>
              <Badge variant="neutral">Verified Ledger</Badge>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 tabular-nums">
                  {supplierTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-4 text-center text-slate-400">
                        No transactions found.
                      </td>
                    </tr>
                  ) : (
                    supplierTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="px-3 py-2 text-slate-500">{tx.transaction_date}</td>
                        <td className="px-3 py-2">
                          <Badge variant={tx.transaction_type === 'payment' ? 'success' : 'info'}>
                            {tx.transaction_type}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-slate-700">{tx.description}</td>
                        <td className="px-3 py-2 text-right font-bold">
                          PKR {tx.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
