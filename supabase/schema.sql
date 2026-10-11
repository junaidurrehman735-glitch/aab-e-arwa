-- ==============================================================================
-- AAB E ARWA - Premium Drinking Water Management System
-- Production Supabase PostgreSQL Database Schema & Row-Level Security (RLS)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS & CONSTANTS
-- Permitted Application Roles: ONLY Owner, Manager, Delivery Boy
-- ==============================================================================

-- ROLES TABLE
CREATE TABLE IF NOT EXISTS public.roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure strictly the 3 approved roles exist
INSERT INTO public.roles (id, name, description, is_system) VALUES
  ('role-owner', 'Owner', 'Full business ownership, financial control, user/role management, and system administration', true),
  ('role-manager', 'Manager', 'Operations oversight, bottle filling, stock dispatch, delivery routing, and supplier logistics', true),
  ('role-delivery', 'Delivery Boy', 'Route deliveries, empty bottle collection, customer drop-offs, and cash receipt', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- DELETE any obsolete roles
DELETE FROM public.roles WHERE id NOT IN ('role-owner', 'role-manager', 'role-delivery');

-- PERMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.permissions (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  can_view INTEGER DEFAULT 1,
  can_create INTEGER DEFAULT 0,
  can_edit INTEGER DEFAULT 0,
  can_approve INTEGER DEFAULT 0,
  can_delete INTEGER DEFAULT 0,
  UNIQUE(role_id, module)
);

-- USER PROFILES TABLE (Linked with Supabase Auth auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Owner', 'Manager', 'Delivery Boy')),
  role_id TEXT NOT NULL DEFAULT 'role-delivery',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- USER ROLES & PROFILES TABLE (Linked directly to auth.users by UUID)
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('Owner', 'Manager', 'Delivery Boy')),
  role_id TEXT NOT NULL DEFAULT 'role-delivery',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- USER CATALOG TABLE (Maps auth.users.id UUID to profile records)
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY, -- Maps to auth.users.id UUID or pre-provisioned ID
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role_id TEXT NOT NULL REFERENCES public.roles(id),
  role_name TEXT NOT NULL DEFAULT 'Delivery Boy',
  phone TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- CUSTOMER TYPES TABLE
CREATE TABLE IF NOT EXISTS public.customer_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  default_discount NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.customer_types (id, name, description, default_discount) VALUES
  ('ct-home', 'Residential Home', 'Residential households & domestic consumers', 0),
  ('ct-restaurant', 'Restaurant', 'Restaurants, cafes, food service & caterers', 0),
  ('ct-office', 'Office', 'Corporate workplaces, offices & commercial premises', 0),
  ('ct-shop', 'Shop', 'Retail marts, grocery stores & commercial outlets', 0),
  ('ct-other', 'Other', 'Other customer classifications', 0)
ON CONFLICT (id) DO NOTHING;

-- DELIVERY AREAS TABLE
CREATE TABLE IF NOT EXISTS public.delivery_areas (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  city TEXT DEFAULT 'Quetta',
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.delivery_areas (id, name) VALUES
  ('area-chiltan', 'Chiltan Scheme Airport Road'),
  ('area-nawakilli', 'Nawa Killi Bypass'),
  ('area-jinnah', 'Main Jinnah Road'),
  ('area-quetta-ave', 'Quetta Avenue City'),
  ('area-hazara', 'Hazara Town'),
  ('area-mariabad', 'Mariabad')
ON CONFLICT (id) DO NOTHING;

-- CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY DEFAULT ('cust-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  address TEXT NOT NULL,
  area TEXT NOT NULL,
  area_access TEXT DEFAULT 'Specific Area',
  customer_type_id TEXT REFERENCES public.customer_types(id),
  selling_rate NUMERIC DEFAULT 0,
  payment_type TEXT DEFAULT 'Cash',
  cash_status TEXT DEFAULT 'Cash on Delivery',
  credit_limit NUMERIC DEFAULT 0,
  outstanding_balance NUMERIC DEFAULT 0,
  cans_held INTEGER DEFAULT 0,
  net_deposit_amount NUMERIC DEFAULT 0,
  notes TEXT,
  delivery_instructions TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- PRODUCTS TABLE (19L, 1.5L, 500ml)
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  size TEXT NOT NULL,
  unit TEXT NOT NULL,
  selling_price NUMERIC NOT NULL,
  cost_price NUMERIC DEFAULT 0,
  is_reusable INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.products (id, name, size, unit, selling_price, cost_price, is_reusable, is_active) VALUES
  ('prod-19l-can', 'AAB E ARWA 19L Premium Water Can', '19 Liter', 'Can', 220, 65, 1, 1),
  ('prod-1.5l-bottle', 'AAB E ARWA 1.5L Drinking Water (Pack of 6)', '1.5 Liter (6-Pack)', 'Pack', 360, 190, 0, 1),
  ('prod-500ml-bottle', 'AAB E ARWA 500ml Mineral Water (Pack of 12)', '500ml (12-Pack)', 'Pack', 520, 310, 0, 1)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  size = EXCLUDED.size,
  unit = EXCLUDED.unit;

-- INVENTORY TABLE
CREATE TABLE IF NOT EXISTS public.inventory (
  id TEXT PRIMARY KEY DEFAULT ('inv-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  product_id TEXT NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  filled_stock INTEGER DEFAULT 0,
  empty_cans INTEGER DEFAULT 0,
  damaged_cans INTEGER DEFAULT 0,
  lost_cans INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.inventory (id, product_id, filled_stock, empty_cans, damaged_cans, lost_cans) VALUES
  ('inv-19l', 'prod-19l-can', 350, 280, 5, 2),
  ('inv-1.5l', 'prod-1.5l-bottle', 90, 0, 0, 0),
  ('inv-500ml', 'prod-500ml-bottle', 110, 0, 0, 0)
ON CONFLICT (product_id) DO NOTHING;

-- INVENTORY MOVEMENTS (Stock Audit Trail)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id TEXT PRIMARY KEY DEFAULT ('mov-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  product_id TEXT NOT NULL REFERENCES public.products(id),
  movement_type TEXT NOT NULL,
  stock_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  previous_stock INTEGER,
  new_stock INTEGER,
  reason TEXT,
  reference_type TEXT,
  reference_id TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- PRODUCTION RECORDS (Water Filling Plant)
CREATE TABLE IF NOT EXISTS public.production_records (
  id TEXT PRIMARY KEY DEFAULT ('prd-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  product_id TEXT NOT NULL REFERENCES public.products(id),
  quantity_filled INTEGER NOT NULL,
  source_tank TEXT,
  notes TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY DEFAULT ('ord-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  order_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES public.customers(id),
  total_amount NUMERIC NOT NULL,
  payment_type TEXT NOT NULL DEFAULT 'Cash',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  order_status TEXT NOT NULL DEFAULT 'pending',
  delivery_date DATE NOT NULL,
  delivery_address TEXT NOT NULL,
  notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.order_items (
  id TEXT PRIMARY KEY DEFAULT ('item-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL
);

-- DELIVERIES TABLE
CREATE TABLE IF NOT EXISTS public.deliveries (
  id TEXT PRIMARY KEY DEFAULT ('del-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  delivery_number TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL REFERENCES public.orders(id),
  customer_id TEXT NOT NULL REFERENCES public.customers(id),
  driver_id TEXT,
  vehicle TEXT,
  delivery_date DATE NOT NULL,
  delivery_time TEXT,
  status TEXT NOT NULL DEFAULT 'assigned',
  empty_cans_returned INTEGER DEFAULT 0,
  payment_collected NUMERIC DEFAULT 0,
  payment_method TEXT,
  failure_reason TEXT,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- DELIVERY ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.delivery_items (
  id TEXT PRIMARY KEY DEFAULT ('ditem-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  delivery_id TEXT NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL
);

-- CUSTOMER CAN MOVEMENTS (Empty Can Tracking)
CREATE TABLE IF NOT EXISTS public.customer_can_movements (
  id TEXT PRIMARY KEY DEFAULT ('canmov-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  customer_id TEXT NOT NULL REFERENCES public.customers(id),
  product_id TEXT REFERENCES public.products(id),
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  delivery_id TEXT REFERENCES public.deliveries(id),
  reason TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- PAYMENTS TABLE (Financial)
CREATE TABLE IF NOT EXISTS public.payments (
  id TEXT PRIMARY KEY DEFAULT ('pay-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  payment_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES public.customers(id),
  order_id TEXT REFERENCES public.orders(id),
  delivery_id TEXT REFERENCES public.deliveries(id),
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL,
  payment_date DATE NOT NULL,
  reference TEXT,
  notes TEXT,
  received_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- CUSTOMER LEDGER TABLE (Financial)
CREATE TABLE IF NOT EXISTS public.customer_ledger (
  id TEXT PRIMARY KEY DEFAULT ('ledg-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  customer_id TEXT NOT NULL REFERENCES public.customers(id),
  transaction_type TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  debit NUMERIC DEFAULT 0,
  credit NUMERIC DEFAULT 0,
  balance NUMERIC NOT NULL,
  description TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- EXPENSE CATEGORIES TABLE
CREATE TABLE IF NOT EXISTS public.expense_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.expense_categories (id, name, description) VALUES
  ('exp-fuel', 'Fuel & Delivery Logistics', 'Diesel and petrol for delivery vans'),
  ('exp-salaries', 'Staff Salaries & Wages', 'Monthly payroll'),
  ('exp-utilities', 'Utilities & Electricity', 'RO plant electricity dues'),
  ('exp-vehicle', 'Vehicle Maintenance & Repairs', 'Maintenance and tyre replacements'),
  ('exp-packaging', 'Packaging & Caps & Seals', 'Caps and sanitary seal films'),
  ('exp-chemicals', 'Filtration & Consumables', 'Membrane cleaner, mineral dosing'),
  ('exp-other', 'General & Miscellaneous', 'General plant supplies')
ON CONFLICT (id) DO NOTHING;

-- EXPENSES TABLE (Financial)
CREATE TABLE IF NOT EXISTS public.expenses (
  id TEXT PRIMARY KEY DEFAULT ('exp-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  category_id TEXT NOT NULL REFERENCES public.expense_categories(id),
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  paid_by TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  expense_date DATE NOT NULL,
  user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SUPPLIERS TABLE
CREATE TABLE IF NOT EXISTS public.suppliers (
  id TEXT PRIMARY KEY DEFAULT ('sup-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT NOT NULL,
  address TEXT,
  materials_supplied TEXT,
  outstanding_payable NUMERIC DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- SUPPLIER TRANSACTIONS TABLE
CREATE TABLE IF NOT EXISTS public.supplier_transactions (
  id TEXT PRIMARY KEY DEFAULT ('suptxn-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  supplier_id TEXT NOT NULL REFERENCES public.suppliers(id),
  transaction_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY DEFAULT ('aud-' || substring(replace(uuid_generate_v4()::text, '-', ''), 1, 12)),
  user_id TEXT,
  user_name TEXT,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  record_ref TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- SETTINGS TABLE
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.settings (key, value, description) VALUES
  ('business_name', 'AAB E ARWA Premium Drinking Water', 'Official Business Name'),
  ('business_phone', '+92 300 1234567', 'Primary Hotline'),
  ('business_address', 'Plot 42, Industrial Zone, Water Filtration Estate', 'Plant Address'),
  ('currency', 'PKR', 'System Currency Symbol'),
  ('can_security_deposit', '1200', 'Standard Deposit per Reusable Can')
ON CONFLICT (key) DO NOTHING;

-- ==============================================================================
-- 3. ROW LEVEL SECURITY (RLS) & HELPER FUNCTIONS
-- ==============================================================================

-- Helper function to extract user's role from public.profiles, public.user_roles, public.users, or fallback
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- 1. Check public.profiles table (linked by UUID)
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid() OR user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  -- 2. Check public.user_roles table (linked by UUID)
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  -- 3. Fallback to public.users table
  SELECT role_name INTO v_role
  FROM public.users
  WHERE id = auth.uid()::text
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  -- 4. Check by verified email claim in JWT for initial role pairing
  IF auth.jwt() ->> 'email' IS NOT NULL THEN
    SELECT role INTO v_role
    FROM public.user_roles
    WHERE lower(email) = lower(auth.jwt() ->> 'email')
    LIMIT 1;

    IF v_role IS NOT NULL THEN
      RETURN v_role;
    END IF;

    SELECT role INTO v_role
    FROM public.profiles
    WHERE lower(email) = lower(auth.jwt() ->> 'email')
    LIMIT 1;

    IF v_role IS NOT NULL THEN
      RETURN v_role;
    END IF;
  END IF;

  RETURN 'Delivery Boy';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_can_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_areas ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- RLS POLICIES FOR DELIVERY AREAS
-- ------------------------------------------------------------------------------
CREATE POLICY "all_view_delivery_areas" ON public.delivery_areas
  FOR SELECT TO authenticated, anon USING (true);

CREATE POLICY "owner_manager_manage_delivery_areas" ON public.delivery_areas
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

-- ------------------------------------------------------------------------------
-- RLS POLICIES FOR USERS / STAFF MANAGEMENT & ROLES
-- Owner: full access. Manager/Delivery Boy: view and link their own profile/role.
-- ------------------------------------------------------------------------------
CREATE POLICY "owner_full_profiles_access" ON public.profiles
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'Owner');

CREATE POLICY "user_view_own_profile_record" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'));

CREATE POLICY "user_update_own_profile_record" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  WITH CHECK (id = auth.uid() OR user_id = auth.uid());

CREATE POLICY "owner_full_user_roles_access" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'Owner');

CREATE POLICY "user_view_own_role" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'));

CREATE POLICY "user_update_own_role" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "owner_full_users_access" ON public.users
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'Owner');

CREATE POLICY "user_view_own_profile" ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid()::text OR lower(email) = lower(auth.jwt() ->> 'email'));

CREATE POLICY "user_update_own_profile" ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid()::text OR lower(email) = lower(auth.jwt() ->> 'email'));

-- ------------------------------------------------------------------------------
-- RLS POLICIES FOR ROLES & PERMISSIONS
-- All authenticated can view roles, only Owner can modify
-- ------------------------------------------------------------------------------
CREATE POLICY "authenticated_view_roles" ON public.roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "owner_manage_roles" ON public.roles
  FOR ALL TO authenticated USING (public.current_user_role() = 'Owner');

CREATE POLICY "authenticated_view_permissions" ON public.permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "owner_manage_permissions" ON public.permissions
  FOR ALL TO authenticated USING (public.current_user_role() = 'Owner');

-- ------------------------------------------------------------------------------
-- RLS POLICIES FOR FINANCIAL TABLES (Expenses, Payments, Ledger)
-- Owner: full access. Manager & Delivery Boy: DENIED.
-- ------------------------------------------------------------------------------
CREATE POLICY "owner_full_expenses_access" ON public.expenses
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'Owner');

CREATE POLICY "owner_full_expense_categories_access" ON public.expense_categories
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'Owner');

CREATE POLICY "owner_full_payments_access" ON public.payments
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'Owner');

CREATE POLICY "owner_full_customer_ledger_access" ON public.customer_ledger
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'Owner');

-- ------------------------------------------------------------------------------
-- RLS POLICIES FOR SETTINGS
-- Owner: full access. Others: read only non-sensitive.
-- ------------------------------------------------------------------------------
CREATE POLICY "owner_full_settings_access" ON public.settings
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'Owner');

CREATE POLICY "authenticated_view_settings" ON public.settings
  FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

-- ------------------------------------------------------------------------------
-- RLS POLICIES FOR OPERATIONAL TABLES (Customers, Products, Inventory)
-- Owner & Manager: full operational access.
-- Delivery Boy: read customer info, assigned deliveries, record returned cans.
-- ------------------------------------------------------------------------------
CREATE POLICY "owner_manager_full_customers" ON public.customers
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

CREATE POLICY "delivery_boy_view_customers" ON public.customers
  FOR SELECT TO authenticated
  USING (public.current_user_role() = 'Delivery Boy');

CREATE POLICY "all_authenticated_view_products" ON public.products
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "owner_manager_manage_products" ON public.products
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

CREATE POLICY "owner_manager_manage_inventory" ON public.inventory
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

CREATE POLICY "all_authenticated_view_inventory" ON public.inventory
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "owner_manager_manage_inventory_movements" ON public.inventory_movements
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

CREATE POLICY "owner_manager_manage_production" ON public.production_records
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

-- ------------------------------------------------------------------------------
-- RLS POLICIES FOR DELIVERIES & ORDERS
-- Owner & Manager: full access.
-- Delivery Boy: assigned deliveries only.
-- ------------------------------------------------------------------------------
CREATE POLICY "owner_manager_full_orders" ON public.orders
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

CREATE POLICY "delivery_boy_view_assigned_orders" ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'Delivery Boy' AND
    id IN (SELECT order_id FROM public.deliveries WHERE driver_id = auth.uid()::text)
  );

CREATE POLICY "owner_manager_full_order_items" ON public.order_items
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

CREATE POLICY "owner_manager_full_deliveries" ON public.deliveries
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

CREATE POLICY "delivery_boy_view_assigned_deliveries" ON public.deliveries
  FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'Delivery Boy' AND driver_id = auth.uid()::text
  );

CREATE POLICY "delivery_boy_update_assigned_deliveries" ON public.deliveries
  FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'Delivery Boy' AND driver_id = auth.uid()::text
  )
  WITH CHECK (
    public.current_user_role() = 'Delivery Boy' AND driver_id = auth.uid()::text
  );

CREATE POLICY "owner_manager_full_can_movements" ON public.customer_can_movements
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

CREATE POLICY "delivery_boy_insert_can_movements" ON public.customer_can_movements
  FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'Delivery Boy');

CREATE POLICY "owner_manager_full_suppliers" ON public.suppliers
  FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

CREATE POLICY "owner_manager_full_audit_logs" ON public.audit_logs
  FOR ALL TO authenticated
  USING (public.current_user_role() = 'Owner');

CREATE POLICY "all_authenticated_insert_audit_logs" ON public.audit_logs
  FOR INSERT TO authenticated WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- BACKEND & CENTRAL SYNC POLICIES (FOR SERVER API PROXY USING ANON KEY)
-- ------------------------------------------------------------------------------
CREATE POLICY "anon_customers_access" ON public.customers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_orders_access" ON public.orders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_order_items_access" ON public.order_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_deliveries_access" ON public.deliveries FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_delivery_items_access" ON public.delivery_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_products_access" ON public.products FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_inventory_access" ON public.inventory FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_can_movements_access" ON public.customer_can_movements FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_customer_types_access" ON public.customer_types FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_roles_access" ON public.roles FOR SELECT TO anon USING (true);
CREATE POLICY "anon_permissions_access" ON public.permissions FOR SELECT TO anon USING (true);
CREATE POLICY "anon_suppliers_access" ON public.suppliers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_expenses_access" ON public.expenses FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_expense_categories_access" ON public.expense_categories FOR SELECT TO anon USING (true);
CREATE POLICY "anon_payments_access" ON public.payments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_ledger_access" ON public.customer_ledger FOR ALL TO anon USING (true) WITH CHECK (true);

-- ==============================================================================
-- 6. PERFORMANCE INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_customers_area ON public.customers(area);
CREATE INDEX IF NOT EXISTS idx_customers_type ON public.customers(customer_type_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON public.customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers(phone);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_date ON public.orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON public.deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_date ON public.deliveries(delivery_date);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries(status);
CREATE INDEX IF NOT EXISTS idx_can_movements_customer ON public.customer_can_movements(customer_id);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON public.customer_ledger(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON public.payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers(name);

-- ==============================================================================
-- 4. POSTGREST SCHEMA ACCESS & PERMISSIONS (ENABLE CLIENT ACCESS ACROSS DEVICES)
-- ==============================================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated;

-- ==============================================================================
-- 5. OWNER INITIAL ACCOUNT SEEDING & ROLE RESTORATION
-- ==============================================================================
-- Automatically map the primary owner account (junaidurrehman735@gmail.com)
-- and any pre-existing owner accounts to the Owner role across all profile tables.
DO $$
DECLARE
  v_owner_uid UUID;
BEGIN
  SELECT id INTO v_owner_uid FROM auth.users WHERE lower(email) = 'junaidurrehman735@gmail.com' LIMIT 1;
  IF v_owner_uid IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, email, name, role, role_id, status)
    VALUES (v_owner_uid, 'junaidurrehman735@gmail.com', 'Owner Admin', 'Owner', 'role-owner', 'active')
    ON CONFLICT (email) DO UPDATE SET
      user_id = v_owner_uid,
      role = 'Owner',
      role_id = 'role-owner',
      status = 'active',
      updated_at = now();

    INSERT INTO public.profiles (id, user_id, email, name, role, role_id, status)
    VALUES (v_owner_uid, v_owner_uid, 'junaidurrehman735@gmail.com', 'Owner Admin', 'Owner', 'role-owner', 'active')
    ON CONFLICT (email) DO UPDATE SET
      id = v_owner_uid,
      user_id = v_owner_uid,
      role = 'Owner',
      role_id = 'role-owner',
      status = 'active',
      updated_at = now();

    INSERT INTO public.users (id, name, email, role_id, role_name, status)
    VALUES (v_owner_uid::text, 'Owner Admin', 'junaidurrehman735@gmail.com', 'role-owner', 'Owner', 'active')
    ON CONFLICT (email) DO UPDATE SET
      id = v_owner_uid::text,
      role_id = 'role-owner',
      role_name = 'Owner',
      status = 'active',
      updated_at = now();
  END IF;
END $$;

