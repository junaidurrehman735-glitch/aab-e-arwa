import React, { useState, useEffect } from 'react';
import { api } from '../lib/api.ts';
import {
  Customer,
  CustomerType,
  CustomerLedgerEntry,
  CustomerCanMovement,
  Order,
  Payment,
  APPROVED_DELIVERY_AREAS,
  APPROVED_CUSTOMER_TYPES,
  CUSTOMER_TYPE_IDS,
  LEGACY_CUSTOMER_TYPE_NAMES,
  CASH_STATUSES,
  CashStatus,
} from '../types/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useToast } from '../context/ToastContext.tsx';
import { Modal } from '../components/ui/Modal.tsx';
import { Badge } from '../components/ui/Badge.tsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.tsx';
import {
  Users,
  Search,
  Plus,
  Phone,
  RotateCcw,
  Receipt,
  Eye,
  Edit2,
  Trash2,
  DollarSign,
  ShieldCheck,
  Building2,
  MapPin,
  Tag,
  CreditCard,
  CheckCircle2,
  Clock,
  AlertCircle,
  HelpCircle,
  Loader2,
} from 'lucide-react';

interface CustomerDetailsData {
  customer: Customer;
  orders: Order[];
  deliveries: any[];
  payments: Payment[];
  canMovements: CustomerCanMovement[];
  ledger: CustomerLedgerEntry[];
}

export const CustomersPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const toast = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [types, setTypes] = useState<CustomerType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedCashStatus, setSelectedCashStatus] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // In-flight submission guards
  const [isSubmittingCustomer, setIsSubmittingCustomer] = useState(false);
  const [isUpdatingCustomer, setIsUpdatingCustomer] = useState(false);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerDetails, setCustomerDetails] = useState<CustomerDetailsData | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'ledger' | 'cans' | 'orders' | 'payments'>('ledger');

  // Form states - strict adherence to updated fields
  const [isCustomArea, setIsCustomArea] = useState(false);
  const [customAreaName, setCustomAreaName] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    area: APPROVED_DELIVERY_AREAS[0] as string,
    customer_type_id: CUSTOMER_TYPE_IDS['Residential Home'],
    selling_rate: '',
    cash_status: 'Cash on Delivery' as CashStatus,
    payment_type: 'Cash' as 'Cash' | 'Credit',
    company_cans: '0',
    net_deposit_amount: '0',
    status: 'active' as 'active' | 'inactive',
    notes: '',
    delivery_instructions: '',
  });

  // Quick payment form
  const [payFormData, setPayFormData] = useState({
    amount: '',
    payment_method: 'Cash',
    payment_date: new Date().toISOString().split('T')[0],
    reference: '',
    notes: '',
  });

  // Quick deposit adjustment form
  const [depositFormData, setDepositFormData] = useState({
    amount: '',
    action: 'add' as 'add' | 'refund' | 'set',
    notes: '',
  });

  const fetchCustomers = async () => {
    setLoading(true);
    setDbError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (selectedArea) params.append('area', selectedArea);
      if (selectedType) params.append('type', selectedType);
      if (selectedCashStatus) params.append('cashStatus', selectedCashStatus);

      const [custRes, typeRes] = await Promise.all([
        api.get<Customer[]>(`/customers?${params.toString()}`),
        api.get<CustomerType[]>('/customers/types').catch(() => []),
      ]);
      setCustomers(Array.isArray(custRes) ? custRes : []);
      if (Array.isArray(typeRes) && typeRes.length > 0) {
        setTypes(typeRes);
      }
    } catch (err: any) {
      console.error('[Fetch Customers Error]:', err);
      const msg = err.message || 'Failed to load customers from Supabase';
      setDbError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [search, selectedArea, selectedType, selectedCashStatus]);

  const viewCustomerDetails = async (cust: Customer) => {
    setSelectedCustomer(cust);
    setIsDetailsModalOpen(true);
    setDetailsLoading(true);
    try {
      const res = await api.get<CustomerDetailsData>(`/customers/${cust.id}`);
      setCustomerDetails(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load customer details');
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmittingCustomer) return;

    if (!formData.name.trim()) {
      toast.error('Customer name is required');
      return;
    }
    if (!formData.phone.trim()) {
      toast.error('Customer phone number is required');
      return;
    }
    if (!formData.address.trim()) {
      toast.error('Customer address is required');
      return;
    }

    const effectiveArea = isCustomArea
      ? customAreaName.trim()
      : (formData.area || APPROVED_DELIVERY_AREAS[0]);

    if (isCustomArea && !effectiveArea) {
      toast.error('Please enter a temporary area name (e.g. Alamabad)');
      return;
    }

    setIsSubmittingCustomer(true);
    const customerId = `cust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const idempotencyKey = `cust-req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
      const payload = {
        id: customerId,
        idempotency_key: idempotencyKey,
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        area: effectiveArea,
        area_access: 'Specific Area',
        customer_type_id: formData.customer_type_id || CUSTOMER_TYPE_IDS['Residential Home'],
        selling_rate: Number(formData.selling_rate) || 220,
        payment_type: formData.payment_type || 'Cash',
        cash_status: formData.cash_status || 'Cash on Delivery',
        credit_limit: 0,
        outstanding_balance: 0,
        cans_held: Number(formData.company_cans) || 0,
        net_deposit_amount: Number(formData.net_deposit_amount) || 0,
        notes: formData.notes || '',
        delivery_instructions: formData.delivery_instructions || '',
        status: formData.status || 'active',
      };

      const res = await api.post<Customer>('/customers', payload, {
        'x-idempotency-key': idempotencyKey,
      });
      toast.success(`Customer "${res?.name || formData.name}" registered in Supabase database`);
      setIsAddModalOpen(false);
      resetForm();
      await fetchCustomers();
    } catch (err: any) {
      console.error('[Create Customer Error]:', err);
      toast.error(err.message || 'Failed to create customer');
    } finally {
      setIsSubmittingCustomer(false);
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer || isUpdatingCustomer) return;
    if (!formData.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    const effectiveArea = isCustomArea
      ? customAreaName.trim()
      : (formData.area || APPROVED_DELIVERY_AREAS[0]);

    if (isCustomArea && !effectiveArea) {
      toast.error('Please enter a temporary area name (e.g. Alamabad)');
      return;
    }

    setIsUpdatingCustomer(true);
    try {
      await api.put(`/customers/${selectedCustomer.id}`, {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        address: formData.address.trim(),
        area: effectiveArea,
        customer_type_id: formData.customer_type_id,
        selling_rate: Number(formData.selling_rate) || 0,
        payment_type: formData.payment_type,
        cash_status: formData.cash_status,
        cans_held: Number(formData.company_cans) || 0,
        net_deposit_amount: Number(formData.net_deposit_amount) || 0,
        notes: formData.notes,
        delivery_instructions: formData.delivery_instructions,
        status: formData.status,
      });
      toast.success('Customer updated successfully in Supabase');
      setIsEditModalOpen(false);
      await fetchCustomers();
      if (isDetailsModalOpen) {
        viewCustomerDetails({
          ...selectedCustomer,
          ...formData,
          area: effectiveArea,
          cans_held: Number(formData.company_cans) || 0,
          net_deposit_amount: Number(formData.net_deposit_amount) || 0,
          selling_rate: Number(formData.selling_rate) || 0,
        } as any);
      }
    } catch (err: any) {
      console.error('[Update Customer Error]:', err);
      toast.error(err.message || 'Failed to update customer');
    } finally {
      setIsUpdatingCustomer(false);
    }
  };

  const handleDeleteCustomer = async () => {
    if (!selectedCustomer || isDeletingCustomer) return;
    setIsDeletingCustomer(true);
    try {
      const res = await api.delete<{ success: boolean; archived?: boolean; message?: string }>(
        `/customers/${selectedCustomer.id}`
      );
      if (res?.archived) {
        toast.info(res.message || 'Customer has historical records and was safely archived.');
      } else {
        toast.success(res?.message || 'Customer profile removed successfully from Supabase');
      }
      setIsDeleteConfirmOpen(false);
      setIsDetailsModalOpen(false);
      setSelectedCustomer(null);
      await fetchCustomers();
    } catch (err: any) {
      console.error('[Delete Customer Error]:', err);
      toast.error(err.message || 'Failed to remove customer');
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    try {
      await api.post('/payments', {
        customer_id: selectedCustomer.id,
        amount: Number(payFormData.amount),
        payment_method: payFormData.payment_method,
        payment_date: payFormData.payment_date,
        reference: payFormData.reference,
        notes: payFormData.notes,
      });
      toast.success('Payment recorded and customer ledger updated');
      setIsPaymentModalOpen(false);
      setPayFormData({
        amount: '',
        payment_method: 'Cash',
        payment_date: new Date().toISOString().split('T')[0],
        reference: '',
        notes: '',
      });
      fetchCustomers();
      viewCustomerDetails(selectedCustomer);
    } catch (err: any) {
      toast.error(err.message || 'Failed to record payment');
    }
  };

  const handleAdjustDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    try {
      const res = await api.post<{ net_deposit_amount: number; message: string }>(
        `/customers/${selectedCustomer.id}/deposit`,
        depositFormData
      );
      toast.success(`Security deposit updated! Current held: PKR ${res.net_deposit_amount.toLocaleString()}`);
      setIsDepositModalOpen(false);
      setDepositFormData({ amount: '', action: 'add', notes: '' });
      fetchCustomers();
      if (selectedCustomer) {
        viewCustomerDetails({ ...selectedCustomer, net_deposit_amount: res.net_deposit_amount });
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to update deposit');
    }
  };

  const resetForm = () => {
    setIsCustomArea(false);
    setCustomAreaName('');
    setFormData({
      name: '',
      phone: '',
      address: '',
      area: APPROVED_DELIVERY_AREAS[0],
      customer_type_id: CUSTOMER_TYPE_IDS['Residential Home'],
      selling_rate: '',
      cash_status: 'Cash on Delivery',
      payment_type: 'Cash',
      company_cans: '0',
      net_deposit_amount: '0',
      status: 'active',
      notes: '',
      delivery_instructions: '',
    });
  };

  const openEdit = (cust: Customer) => {
    setSelectedCustomer(cust);
    const legacyTypeName = cust.customer_type_name
      ? LEGACY_CUSTOMER_TYPE_NAMES[cust.customer_type_name.trim().toLowerCase()]
      : undefined;
    const matchedType = types.find(
      (t) => t.id === cust.customer_type_id || t.name === legacyTypeName
    );
    const isFixed = APPROVED_DELIVERY_AREAS.includes(cust.area as any);
    if (isFixed) {
      setIsCustomArea(false);
      setCustomAreaName('');
    } else {
      setIsCustomArea(true);
      setCustomAreaName(cust.area || '');
    }
    setFormData({
      name: cust.name,
      phone: cust.phone,
      address: cust.address,
      area: cust.area || APPROVED_DELIVERY_AREAS[0],
      customer_type_id: matchedType?.id || CUSTOMER_TYPE_IDS[legacyTypeName || 'Other'],
      selling_rate: cust.selling_rate > 0 ? String(cust.selling_rate) : '',
      cash_status: (cust.cash_status as CashStatus) || 'Cash on Delivery',
      payment_type: cust.payment_type || 'Cash',
      company_cans: String(cust.cans_held || 0),
      net_deposit_amount: String(cust.net_deposit_amount || 0),
      status: cust.status || 'active',
      notes: cust.notes || '',
      delivery_instructions: cust.delivery_instructions || '',
    });
    setIsEditModalOpen(true);
  };

  const getCashStatusBadge = (status?: string) => {
    if (status === 'Paid') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          Paid
        </span>
      );
    }
    if (status === 'Pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3 text-amber-600" />
          Pending
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
        <CreditCard className="w-3 h-3 text-sky-600" />
        Cash on Delivery
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Customer Management</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage customer profiles, agreed selling rates, company-held reusable bottles, cash status, and security deposits.
          </p>
        </div>
        {hasPermission('customers', 'can_create') && (
          <button
            onClick={() => {
              resetForm();
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer shadow-xs shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Customer</span>
          </button>
        )}
      </div>

      {/* Supabase Database Status / Error Notice */}
      {dbError && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold text-amber-900">Supabase Database Notice</p>
            <p className="mt-0.5 text-amber-800">{dbError}</p>
            {(dbError.includes('schema cache') || dbError.includes('PGRST205') || dbError.includes('not found')) && (
              <p className="mt-2 text-[11px] text-amber-900 bg-amber-100/80 p-2.5 rounded-lg border border-amber-200 leading-relaxed">
                <span className="font-semibold">Setup Required:</span> The PostgreSQL table <code className="bg-amber-200/60 px-1 py-0.5 rounded font-mono">public.customers</code> was not found in your Supabase project (<code className="bg-amber-200/60 px-1 py-0.5 rounded font-mono">dfzduewbtosfzbcvsyao</code>). Please open your Supabase Dashboard &gt; SQL Editor and execute <code className="bg-amber-200/60 px-1 py-0.5 rounded font-mono">supabase-schema.sql</code> to create all tables and RLS permissions.
              </p>
            )}
          </div>
          <button
            onClick={() => fetchCustomers()}
            className="px-2.5 py-1 text-xs bg-amber-200 hover:bg-amber-300 text-amber-900 rounded-lg font-medium transition-colors cursor-pointer shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name, phone, address..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 focus:bg-white"
          />
        </div>

        {/* Delivery Area Filter - ONLY the 5 approved areas */}
        <select
          value={selectedArea}
          onChange={(e) => setSelectedArea(e.target.value)}
          className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
        >
          <option value="">All Delivery Areas</option>
          {APPROVED_DELIVERY_AREAS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
          <option value="__temporary__">Temporary / Other Areas</option>
        </select>

        {/* Customer Type Filter - ONLY the approved customer types */}
        <select
          value={selectedType}
          onChange={(e) => setSelectedType(e.target.value)}
          className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
        >
          <option value="">All Customer Types</option>
          {APPROVED_CUSTOMER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        {/* Cash Status Filter */}
        <select
          value={selectedCashStatus}
          onChange={(e) => setSelectedCashStatus(e.target.value)}
          className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
        >
          <option value="">All Cash Statuses</option>
          {CASH_STATUSES.map((cs) => (
            <option key={cs} value={cs}>
              {cs}
            </option>
          ))}
        </select>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/75 text-[11px] font-semibold uppercase text-slate-500 tracking-wider">
                <th className="px-4 py-3">Customer & Contact</th>
                <th className="px-4 py-3">Delivery Area / Sector</th>
                <th className="px-4 py-3">Customer Type</th>
                <th className="px-4 py-3 text-right">Agreed Selling Rate</th>
                <th className="px-4 py-3 text-center">Cash Status</th>
                <th className="px-4 py-3 text-center">Company Cans</th>
                <th className="px-4 py-3 text-right">Net Deposit Amount</th>
                <th className="px-4 py-3 text-right">Outstanding Balance</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                    Loading customer directory...
                  </td>
                </tr>
              ) : customers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-medium text-slate-500">No customers yet</p>
                    <p className="text-xs text-slate-400 mt-0.5">Click "Add New Customer" above to register your first customer.</p>
                  </td>
                </tr>
              ) : (
                customers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-900">{cust.name}</div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span className="flex items-center gap-1 font-mono">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {cust.phone}
                        </span>
                        {cust.whatsapp && (
                          <a
                            href={`https://wa.me/${cust.whatsapp.replace(/\D/g, '')}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-emerald-600 hover:text-emerald-700 font-medium"
                            title="WhatsApp Customer"
                          >
                            WA
                          </a>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <div className="text-slate-900 font-medium flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                        <span>{cust.area}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 truncate max-w-[190px] mt-0.5">
                        {cust.address}
                      </div>
                    </td>

                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {cust.customer_type_name || 'Residential Home'}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">
                      {cust.selling_rate > 0 ? (
                        <span className="font-semibold text-slate-900">PKR {cust.selling_rate}</span>
                      ) : (
                        <span className="text-slate-400 italic">Standard</span>
                      )}
                    </td>

                    <td className="px-4 py-3 text-center">
                      {getCashStatusBadge(cust.cash_status)}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-50 text-sky-800 font-bold tabular-nums">
                        <RotateCcw className="w-3 h-3 text-sky-600" />
                        {cust.cans_held}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className="font-semibold text-slate-800">
                        PKR {(cust.net_deposit_amount || 0).toLocaleString()}
                      </span>
                    </td>

                    <td className="px-4 py-3 text-right tabular-nums">
                      <div
                        className={`font-bold ${
                          cust.outstanding_balance > 0 ? 'text-rose-600' : 'text-slate-600'
                        }`}
                      >
                        PKR {cust.outstanding_balance.toLocaleString()}
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => viewCustomerDetails(cust)}
                          className="p-1.5 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-md transition-colors cursor-pointer"
                          title="View Ledger & Profile"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {hasPermission('customers', 'can_edit') && (
                          <button
                            onClick={() => openEdit(cust)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                            title="Edit Customer Profile"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                        {hasPermission('customers', 'can_delete') && (
                          <button
                            onClick={() => {
                              setSelectedCustomer(cust);
                              setIsDeleteConfirmOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            title="Delete / Remove Customer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ======================================================= */}
      {/* MODAL 1: ADD CUSTOMER PROFILE                            */}
      {/* ======================================================= */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Customer Profile"
        description="Register customer account with approved delivery area, agreed pricing, company cans, cash status, and bottle deposit."
        maxWidth="xl"
      >
        <form onSubmit={handleCreateCustomer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Apex Office or Tariq Khan"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number *</label>
              <input
                type="text"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="0300 1234567"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Street Address *</label>
              <input
                type="text"
                required
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="House / Office #, Street, Landmark"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
              />
            </div>

            {/* B. DELIVERY AREA / SECTOR * - Fixed areas + Temporary Area */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">Delivery Area / Sector *</label>
                {isCustomArea && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomArea(false);
                      setCustomAreaName('');
                      setFormData((prev) => ({ ...prev, area: APPROVED_DELIVERY_AREAS[0] }));
                    }}
                    className="text-[11px] text-sky-600 hover:text-sky-800 font-medium cursor-pointer"
                  >
                    Select fixed area
                  </button>
                )}
              </div>

              {!isCustomArea ? (
                <select
                  required
                  value={formData.area}
                  onChange={(e) => {
                    if (e.target.value === '__add_temporary__') {
                      setIsCustomArea(true);
                      setCustomAreaName('');
                      setFormData((prev) => ({ ...prev, area: '' }));
                    } else {
                      setFormData((prev) => ({ ...prev, area: e.target.value }));
                    }
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-medium"
                >
                  {APPROVED_DELIVERY_AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                  <option value="__add_temporary__" className="text-sky-600 font-semibold">
                    + Add Temporary Area
                  </option>
                </select>
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    required
                    value={customAreaName}
                    onChange={(e) => {
                      setCustomAreaName(e.target.value);
                      setFormData((prev) => ({ ...prev, area: e.target.value }));
                    }}
                    placeholder="Enter temporary area name (e.g. Alamabad)"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-sky-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-sky-500 font-medium"
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Temporary area: saved only for this customer and not added to the main Delivery Area dropdown.
                  </p>
                </div>
              )}
            </div>

            {/* A. CUSTOMER TYPE - Residential Home, Restaurant, Office, Shop, Other */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Type</label>
              <select
                value={formData.customer_type_id}
                onChange={(e) => setFormData({ ...formData, customer_type_id: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
              >
                {types.length > 0
                  ? types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))
                  : APPROVED_CUSTOMER_TYPES.map((t) => (
                      <option key={t} value={CUSTOMER_TYPE_IDS[t]}>
                        {t}
                      </option>
                    ))}
              </select>
            </div>

            {/* D. AGREED SELLING RATE (PKR) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Agreed Selling Rate (PKR)</label>
              <input
                type="number"
                value={formData.selling_rate}
                onChange={(e) => setFormData({ ...formData, selling_rate: e.target.value })}
                placeholder="Standard rate or custom (e.g. 220)"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-semibold"
              />
            </div>

            {/* E. CASH STATUS - Cash on Delivery, Paid, Pending */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cash Status</label>
              <select
                value={formData.cash_status}
                onChange={(e) => setFormData({ ...formData, cash_status: e.target.value as CashStatus })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-medium"
              >
                {CASH_STATUSES.map((cs) => (
                  <option key={cs} value={cs}>
                    {cs}
                  </option>
                ))}
              </select>
            </div>

            {/* F. COMPANY CANS WITH CUSTOMER - Numeric */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Company Cans With Customer</label>
              <input
                type="number"
                min="0"
                value={formData.company_cans}
                onChange={(e) => setFormData({ ...formData, company_cans: e.target.value })}
                placeholder="0, 1, 2, 3 or higher"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-semibold"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Number of company-owned 19L/20L cans currently held by customer.
              </span>
            </div>

            {/* G. NET DEPOSIT AMOUNT (PKR) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Net Deposit Amount (PKR)</label>
              <input
                type="number"
                min="0"
                value={formData.net_deposit_amount}
                onChange={(e) => setFormData({ ...formData, net_deposit_amount: e.target.value })}
                placeholder="e.g. 1500 per bottle"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-semibold"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Total bottle security deposit held from customer (e.g. PKR 1,500).
              </span>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Special Delivery Instructions</label>
              <textarea
                rows={2}
                value={formData.delivery_instructions}
                onChange={(e) => setFormData({ ...formData, delivery_instructions: e.target.value })}
                placeholder="e.g. Deliver before 9:00 AM, ring side bell, basement delivery..."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              disabled={isSubmittingCustomer}
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmittingCustomer}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs"
            >
              {isSubmittingCustomer ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating Customer...</span>
                </>
              ) : (
                <span>Save Customer Profile</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ======================================================= */}
      {/* MODAL 2: EDIT CUSTOMER PROFILE                           */}
      {/* ======================================================= */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Customer Profile"
        description="Update customer details, approved area, agreed selling rate, cans held, cash status, and deposit."
        maxWidth="xl"
      >
        <form onSubmit={handleUpdateCustomer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number *</label>
              <input
                type="text"
                required
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Street Address *</label>
              <input
                type="text"
                required
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
              />
            </div>

            {/* B. DELIVERY AREA / SECTOR * - Fixed areas + Temporary Area */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">Delivery Area / Sector *</label>
                {isCustomArea && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomArea(false);
                      setCustomAreaName('');
                      setFormData((prev) => ({ ...prev, area: APPROVED_DELIVERY_AREAS[0] }));
                    }}
                    className="text-[11px] text-sky-600 hover:text-sky-800 font-medium cursor-pointer"
                  >
                    Select fixed area
                  </button>
                )}
              </div>

              {!isCustomArea ? (
                <select
                  required
                  value={formData.area}
                  onChange={(e) => {
                    if (e.target.value === '__add_temporary__') {
                      setIsCustomArea(true);
                      setCustomAreaName('');
                      setFormData((prev) => ({ ...prev, area: '' }));
                    } else {
                      setFormData((prev) => ({ ...prev, area: e.target.value }));
                    }
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-medium"
                >
                  {APPROVED_DELIVERY_AREAS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                  <option value="__add_temporary__" className="text-sky-600 font-semibold">
                    + Add Temporary Area
                  </option>
                </select>
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="text"
                    required
                    value={customAreaName}
                    onChange={(e) => {
                      setCustomAreaName(e.target.value);
                      setFormData((prev) => ({ ...prev, area: e.target.value }));
                    }}
                    placeholder="Enter temporary area name (e.g. Alamabad)"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-sky-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-sky-500 font-medium"
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-500 leading-tight">
                    Temporary area: saved only for this customer and not added to the main Delivery Area dropdown.
                  </p>
                </div>
              )}
            </div>

            {/* A. CUSTOMER TYPE */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Type</label>
              <select
                value={formData.customer_type_id}
                onChange={(e) => setFormData({ ...formData, customer_type_id: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
              >
                {types.length > 0
                  ? types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))
                  : APPROVED_CUSTOMER_TYPES.map((t) => (
                      <option key={t} value={CUSTOMER_TYPE_IDS[t]}>
                        {t}
                      </option>
                    ))}
              </select>
            </div>

            {/* D. AGREED SELLING RATE (PKR) */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Agreed Selling Rate (PKR)</label>
              <input
                type="number"
                value={formData.selling_rate}
                onChange={(e) => setFormData({ ...formData, selling_rate: e.target.value })}
                placeholder="Agreed price per bottle"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-semibold"
              />
            </div>

            {/* E. CASH STATUS */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Cash Status</label>
              <select
                value={formData.cash_status}
                onChange={(e) => setFormData({ ...formData, cash_status: e.target.value as CashStatus })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-medium"
              >
                {CASH_STATUSES.map((cs) => (
                  <option key={cs} value={cs}>
                    {cs}
                  </option>
                ))}
              </select>
            </div>

            {/* F. COMPANY CANS WITH CUSTOMER - Editable! */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Company Cans With Customer</label>
              <input
                type="number"
                min="0"
                value={formData.company_cans}
                onChange={(e) => setFormData({ ...formData, company_cans: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-semibold"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Editable live bottle balance with customer.
              </span>
            </div>

            {/* G. NET DEPOSIT AMOUNT (PKR) - Editable! */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Net Deposit Amount (PKR)</label>
              <input
                type="number"
                min="0"
                value={formData.net_deposit_amount}
                onChange={(e) => setFormData({ ...formData, net_deposit_amount: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-semibold"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                Total bottle security deposit held from customer.
              </span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Account Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 mb-1">Special Delivery Instructions</label>
              <textarea
                rows={2}
                value={formData.delivery_instructions}
                onChange={(e) => setFormData({ ...formData, delivery_instructions: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              disabled={isUpdatingCustomer}
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUpdatingCustomer}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs"
            >
              {isUpdatingCustomer ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Updating Profile...</span>
                </>
              ) : (
                <span>Update Profile</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ======================================================= */}
      {/* MODAL 3: CUSTOMER PROFILE DETAILS & AUDIT LEDGER         */}
      {/* ======================================================= */}
      <Modal
        isOpen={isDetailsModalOpen}
        onClose={() => setIsDetailsModalOpen(false)}
        title={selectedCustomer ? `${selectedCustomer.name}` : 'Customer Profile Details'}
        maxWidth="2xl"
      >
        {detailsLoading || !customerDetails ? (
          <div className="py-12 text-center text-xs text-slate-400">Loading ledger & statement...</div>
        ) : (
          <div className="space-y-6">
            {/* Top Stat Summary Header */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200/80">
              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-400 block">Outstanding Balance</span>
                <span
                  className={`text-base font-bold tabular-nums ${
                    customerDetails.customer.outstanding_balance > 0 ? 'text-rose-600' : 'text-slate-800'
                  }`}
                >
                  PKR {customerDetails.customer.outstanding_balance.toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Ledger Due
                </span>
              </div>

              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-400 block">Company Cans With Customer</span>
                <span className="text-base font-bold text-sky-700 tabular-nums">
                  {customerDetails.customer.cans_held} cans
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Reusable Bottles
                </span>
              </div>

              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-400 block">Net Deposit Amount</span>
                <span className="text-base font-bold text-emerald-700 tabular-nums">
                  PKR {(customerDetails.customer.net_deposit_amount || 0).toLocaleString()}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Bottle Security Held
                </span>
              </div>

              <div>
                <span className="text-[10px] font-semibold uppercase text-slate-400 block">Agreed Selling Rate</span>
                <span className="text-base font-bold text-slate-900 tabular-nums">
                  {customerDetails.customer.selling_rate > 0
                    ? `PKR ${customerDetails.customer.selling_rate}`
                    : 'Standard'}
                </span>
                <span className="text-[10px] text-slate-500 block mt-0.5">
                  Per 19L Bottle
                </span>
              </div>
            </div>

            {/* Customer Information Cards */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-lg text-xs">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Delivery Area</span>
                  <span className="font-semibold text-slate-800 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-sky-600" />
                    {customerDetails.customer.area}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Customer Type</span>
                  <span className="font-semibold text-slate-800">
                    {customerDetails.customer.customer_type_name || 'Residential Home'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Cash Status</span>
                  <div className="mt-0.5">{getCashStatusBadge(customerDetails.customer.cash_status)}</div>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Contact / Phone</span>
                  <span className="font-mono text-slate-800 font-medium">{customerDetails.customer.phone}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setDepositFormData({
                      amount: '',
                      action: 'add',
                      notes: '',
                    });
                    setIsDepositModalOpen(true);
                  }}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-medium cursor-pointer"
                  title="Adjust or refund bottle deposit"
                >
                  Adjust Deposit
                </button>
                {hasPermission('customers', 'can_edit') && (
                  <button
                    onClick={() => openEdit(customerDetails.customer)}
                    className="px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-xs font-medium cursor-pointer flex items-center gap-1"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* Quick Actions Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg">
                <button
                  onClick={() => setActiveTab('ledger')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    activeTab === 'ledger'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Running Ledger
                </button>
                <button
                  onClick={() => setActiveTab('cans')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    activeTab === 'cans'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Can Statement
                </button>
                <button
                  onClick={() => setActiveTab('orders')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    activeTab === 'orders'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Orders ({customerDetails.orders.length})
                </button>
                <button
                  onClick={() => setActiveTab('payments')}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                    activeTab === 'payments'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Payments ({customerDetails.payments.length})
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPaymentModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Receive Payment</span>
                </button>
                {hasPermission('customers', 'can_delete') && (
                  <button
                    onClick={() => setIsDeleteConfirmOpen(true)}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete Customer Profile"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* TAB CONTENT 1: RUNNING LEDGER */}
            {activeTab === 'ledger' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Audit-Verified Financial Ledger</span>
                  <span className="font-mono">Real Running Balance</span>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Description</th>
                        <th className="px-3 py-2 text-right">Debit (Sale)</th>
                        <th className="px-3 py-2 text-right">Credit (Paid)</th>
                        <th className="px-3 py-2 text-right font-bold">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {customerDetails.ledger.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-slate-400">
                            No ledger transactions recorded yet.
                          </td>
                        </tr>
                      ) : (
                        customerDetails.ledger.map((entry) => (
                          <tr key={entry.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-500">{entry.transaction_date}</td>
                            <td className="px-3 py-2 text-slate-800 font-medium">{entry.description}</td>
                            <td className="px-3 py-2 text-right text-rose-600">
                              {entry.debit > 0 ? `PKR ${entry.debit.toLocaleString()}` : '-'}
                            </td>
                            <td className="px-3 py-2 text-right text-emerald-600">
                              {entry.credit > 0 ? `PKR ${entry.credit.toLocaleString()}` : '-'}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-slate-900">
                              PKR {entry.balance.toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB CONTENT 2: CAN STATEMENT */}
            {activeTab === 'cans' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Company Bottle In/Out Movement Log</span>
                  <span className="font-semibold text-sky-700">
                    Net Balance: {customerDetails.customer.cans_held} cans with customer
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Timestamp</th>
                        <th className="px-3 py-2">Movement Type</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Balance After</th>
                        <th className="px-3 py-2">Reason / Ref</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {customerDetails.canMovements.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-4 text-center text-slate-400">
                            No can movements recorded yet.
                          </td>
                        </tr>
                      ) : (
                        customerDetails.canMovements.map((cm) => (
                          <tr key={cm.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-500">
                              {new Date(cm.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant={cm.quantity > 0 ? 'info' : 'success'}>
                                {cm.movement_type.replace('_', ' ')}
                              </Badge>
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-bold ${
                                cm.quantity > 0 ? 'text-sky-600' : 'text-emerald-600'
                              }`}
                            >
                              {cm.quantity > 0 ? `+${cm.quantity}` : cm.quantity}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-800">
                              {cm.balance_after} cans
                            </td>
                            <td className="px-3 py-2 text-slate-500 truncate max-w-xs">{cm.reason || '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB CONTENT 3: ORDERS */}
            {activeTab === 'orders' && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Order #</th>
                      <th className="px-3 py-2">Delivery Date</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Total Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customerDetails.orders.map((ord) => (
                      <tr key={ord.id}>
                        <td className="px-3 py-2 font-mono font-semibold">{ord.order_number}</td>
                        <td className="px-3 py-2 text-slate-600">{ord.delivery_date}</td>
                        <td className="px-3 py-2">
                          <Badge variant={ord.order_status === 'completed' ? 'success' : 'warning'}>
                            {ord.order_status}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right font-bold tabular-nums">
                          PKR {ord.total_amount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* TAB CONTENT 4: PAYMENTS */}
            {activeTab === 'payments' && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Receipt #</th>
                      <th className="px-3 py-2">Payment Date</th>
                      <th className="px-3 py-2">Method</th>
                      <th className="px-3 py-2 text-right">Amount Received</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {customerDetails.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2 font-mono font-semibold">{p.payment_number}</td>
                        <td className="px-3 py-2 text-slate-600">{p.payment_date}</td>
                        <td className="px-3 py-2 text-slate-700">{p.payment_method}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-600">
                          PKR {p.amount.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ======================================================= */}
      {/* MODAL 4: RECORD PAYMENT                                  */}
      {/* ======================================================= */}
      <Modal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        title="Record Customer Payment"
        description={selectedCustomer ? `Receive payment from ${selectedCustomer.name}` : ''}
        maxWidth="md"
      >
        <form onSubmit={handleRecordPayment} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Amount (PKR) *</label>
            <input
              type="number"
              required
              min="1"
              value={payFormData.amount}
              onChange={(e) => setPayFormData({ ...payFormData, amount: e.target.value })}
              placeholder="e.g. 2500"
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
              <select
                value={payFormData.payment_method}
                onChange={(e) => setPayFormData({ ...payFormData, payment_method: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Cheque">Cheque</option>
                <option value="Online / Easypaisa / JazzCash">Online / Mobile Wallet</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Date</label>
              <input
                type="date"
                required
                value={payFormData.payment_date}
                onChange={(e) => setPayFormData({ ...payFormData, payment_date: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reference / Cheque #</label>
            <input
              type="text"
              value={payFormData.reference}
              onChange={(e) => setPayFormData({ ...payFormData, reference: e.target.value })}
              placeholder="Bank transaction ID or receipt #"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <input
              type="text"
              value={payFormData.notes}
              onChange={(e) => setPayFormData({ ...payFormData, notes: e.target.value })}
              placeholder="Any additional remarks"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsPaymentModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg cursor-pointer"
            >
              Post Payment
            </button>
          </div>
        </form>
      </Modal>

      {/* ======================================================= */}
      {/* MODAL 5: ADJUST BOTTLE SECURITY DEPOSIT                  */}
      {/* ======================================================= */}
      <Modal
        isOpen={isDepositModalOpen}
        onClose={() => setIsDepositModalOpen(false)}
        title="Adjust Bottle Security Deposit"
        description={
          selectedCustomer
            ? `Update net security deposit for ${selectedCustomer.name}. Current deposit: PKR ${(selectedCustomer.net_deposit_amount || 0).toLocaleString()}`
            : 'Adjust Deposit'
        }
        maxWidth="md"
      >
        <form onSubmit={handleAdjustDeposit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Adjustment Action</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setDepositFormData({ ...depositFormData, action: 'add' })}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  depositFormData.action === 'add'
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                + Add Deposit
              </button>
              <button
                type="button"
                onClick={() => setDepositFormData({ ...depositFormData, action: 'refund' })}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  depositFormData.action === 'refund'
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                - Refund Deposit
              </button>
              <button
                type="button"
                onClick={() => setDepositFormData({ ...depositFormData, action: 'set' })}
                className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors cursor-pointer ${
                  depositFormData.action === 'set'
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                Set Exact Total
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {depositFormData.action === 'set' ? 'New Total Net Deposit (PKR) *' : 'Amount (PKR) *'}
            </label>
            <input
              type="number"
              required
              min="0"
              value={depositFormData.amount}
              onChange={(e) => setDepositFormData({ ...depositFormData, amount: e.target.value })}
              placeholder={depositFormData.action === 'set' ? 'e.g. 3000' : 'e.g. 1500'}
              className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:border-sky-500 font-bold"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Reason / Notes</label>
            <input
              type="text"
              value={depositFormData.notes}
              onChange={(e) => setDepositFormData({ ...depositFormData, notes: e.target.value })}
              placeholder="e.g. Customer returned 1 bottle and received PKR 1,500 refund"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setIsDepositModalOpen(false)}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-lg cursor-pointer"
            >
              Confirm Deposit Adjustment
            </button>
          </div>
        </form>
      </Modal>

      {/* CONFIRM DELETE DIALOG */}
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleDeleteCustomer}
        isLoading={isDeletingCustomer}
        title="Remove Customer Profile"
        message={
          selectedCustomer
            ? `Are you sure you want to remove this customer (${selectedCustomer.name})? If this customer has existing orders or transactions, their account will be safely archived to preserve financial records.`
            : ''
        }
        confirmLabel="Remove Customer"
      />
    </div>
  );
};
