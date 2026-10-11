-- ==============================================================================
-- AAB E ARWA - PREMIUM DRINKING WATER MANAGEMENT SYSTEM
-- COMPLETE SUPABASE POSTGRESQL PRODUCTION DATABASE SCHEMA & RLS MIGRATION
-- ==============================================================================
-- Safe to execute on a brand new, empty Supabase project SQL Editor.
-- Idempotent: Uses IF NOT EXISTS, DROP POLICY IF EXISTS, and ON CONFLICT handling.
-- Creates all tables, relations, indexes, role functions, RLS policies, permissions,
-- and seed data matching the current application codebase.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. APPLICATION ROLES & PERMISSIONS
-- ------------------------------------------------------------------------------

-- ROLES TABLE
CREATE TABLE IF NOT EXISTS public.roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_system BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Seed strictly the 3 approved business roles
INSERT INTO public.roles (id, name, description, is_system) VALUES
  ('role-owner', 'Owner', 'Full business ownership, financial control, user/role management, and system administration', true),
  ('role-manager', 'Manager', 'Operations oversight, bottle filling, stock dispatch, delivery routing, and supplier logistics', true),
  ('role-delivery', 'Delivery Boy', 'Route deliveries, empty bottle collection, customer drop-offs, and cash receipt', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- PERMISSIONS TABLE
CREATE TABLE IF NOT EXISTS public.permissions (
  id TEXT PRIMARY KEY DEFAULT ('perm-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  role_id TEXT NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  can_view INTEGER DEFAULT 1,
  can_create INTEGER DEFAULT 0,
  can_edit INTEGER DEFAULT 0,
  can_approve INTEGER DEFAULT 0,
  can_delete INTEGER DEFAULT 0,
  UNIQUE(role_id, module)
);

-- Seed default permissions matrix
INSERT INTO public.permissions (id, role_id, module, can_view, can_create, can_edit, can_approve, can_delete) VALUES
  -- Owner: Full control over every module
  ('perm-own-dash', 'role-owner', 'dashboard', 1, 1, 1, 1, 1),
  ('perm-own-cust', 'role-owner', 'customers', 1, 1, 1, 1, 1),
  ('perm-own-prod', 'role-owner', 'products', 1, 1, 1, 1, 1),
  ('perm-own-inv', 'role-owner', 'inventory', 1, 1, 1, 1, 1),
  ('perm-own-fill', 'role-owner', 'production', 1, 1, 1, 1, 1),
  ('perm-own-ord', 'role-owner', 'orders', 1, 1, 1, 1, 1),
  ('perm-own-del', 'role-owner', 'deliveries', 1, 1, 1, 1, 1),
  ('perm-own-cans', 'role-owner', 'cans', 1, 1, 1, 1, 1),
  ('perm-own-pay', 'role-owner', 'payments', 1, 1, 1, 1, 1),
  ('perm-own-exp', 'role-owner', 'expenses', 1, 1, 1, 1, 1),
  ('perm-own-sup', 'role-owner', 'suppliers', 1, 1, 1, 1, 1),
  ('perm-own-staff', 'role-owner', 'staff', 1, 1, 1, 1, 1),
  ('perm-own-rep', 'role-owner', 'reports', 1, 1, 1, 1, 1),
  ('perm-own-aud', 'role-owner', 'audit', 1, 1, 1, 1, 1),
  ('perm-own-set', 'role-owner', 'settings', 1, 1, 1, 1, 1),

  -- Manager: Operations oversight, blocked from finance/staff/settings
  ('perm-mgr-dash', 'role-manager', 'dashboard', 1, 1, 1, 1, 1),
  ('perm-mgr-cust', 'role-manager', 'customers', 1, 1, 1, 1, 1),
  ('perm-mgr-prod', 'role-manager', 'products', 1, 1, 1, 1, 1),
  ('perm-mgr-inv', 'role-manager', 'inventory', 1, 1, 1, 1, 1),
  ('perm-mgr-fill', 'role-manager', 'production', 1, 1, 1, 1, 1),
  ('perm-mgr-ord', 'role-manager', 'orders', 1, 1, 1, 1, 1),
  ('perm-mgr-del', 'role-manager', 'deliveries', 1, 1, 1, 1, 1),
  ('perm-mgr-cans', 'role-manager', 'cans', 1, 1, 1, 1, 1),
  ('perm-mgr-pay', 'role-manager', 'payments', 0, 0, 0, 0, 0),
  ('perm-mgr-exp', 'role-manager', 'expenses', 0, 0, 0, 0, 0),
  ('perm-mgr-sup', 'role-manager', 'suppliers', 1, 1, 1, 1, 1),
  ('perm-mgr-staff', 'role-manager', 'staff', 0, 0, 0, 0, 0),
  ('perm-mgr-rep', 'role-manager', 'reports', 1, 0, 0, 0, 0),
  ('perm-mgr-aud', 'role-manager', 'audit', 0, 0, 0, 0, 0),
  ('perm-mgr-set', 'role-manager', 'settings', 0, 0, 0, 0, 0),

  -- Delivery Boy: Route deliveries, empty bottle collection, customer drop-offs
  ('perm-del-dash', 'role-delivery', 'dashboard', 1, 0, 0, 0, 0),
  ('perm-del-cust', 'role-delivery', 'customers', 1, 0, 0, 0, 0),
  ('perm-del-prod', 'role-delivery', 'products', 1, 0, 0, 0, 0),
  ('perm-del-inv', 'role-delivery', 'inventory', 0, 0, 0, 0, 0),
  ('perm-del-fill', 'role-delivery', 'production', 0, 0, 0, 0, 0),
  ('perm-del-ord', 'role-delivery', 'orders', 0, 0, 0, 0, 0),
  ('perm-del-del', 'role-delivery', 'deliveries', 1, 1, 1, 0, 0),
  ('perm-del-cans', 'role-delivery', 'cans', 1, 1, 1, 0, 0),
  ('perm-del-pay', 'role-delivery', 'payments', 0, 0, 0, 0, 0),
  ('perm-del-exp', 'role-delivery', 'expenses', 0, 0, 0, 0, 0),
  ('perm-del-sup', 'role-delivery', 'suppliers', 0, 0, 0, 0, 0),
  ('perm-del-staff', 'role-delivery', 'staff', 0, 0, 0, 0, 0),
  ('perm-del-rep', 'role-delivery', 'reports', 0, 0, 0, 0, 0),
  ('perm-del-aud', 'role-delivery', 'audit', 0, 0, 0, 0, 0),
  ('perm-del-set', 'role-delivery', 'settings', 0, 0, 0, 0, 0)
ON CONFLICT (role_id, module) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. USER ACCOUNTS & PROFILES (LINKED TO AUTH.USERS)
-- ------------------------------------------------------------------------------

-- USER ROLES TABLE
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

-- USER PROFILES TABLE
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

-- USERS TABLE (General directory mapping string ID or UUID to profile)
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role_id TEXT NOT NULL REFERENCES public.roles(id) ON UPDATE CASCADE,
  role_name TEXT NOT NULL DEFAULT 'Delivery Boy',
  phone TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 4. CUSTOMER MANAGEMENT & CUSTOMER TYPES
-- ------------------------------------------------------------------------------

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
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- CUSTOMERS TABLE
CREATE TABLE IF NOT EXISTS public.customers (
  id TEXT PRIMARY KEY DEFAULT ('cust-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT NOT NULL,
  whatsapp TEXT,
  address TEXT NOT NULL,
  area TEXT NOT NULL,
  area_access TEXT DEFAULT 'Specific Area',
  customer_type_id TEXT REFERENCES public.customer_types(id) ON UPDATE CASCADE ON DELETE SET NULL,
  customer_type_name TEXT,
  selling_rate NUMERIC DEFAULT 220,
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

-- ------------------------------------------------------------------------------
-- 5. PRODUCTS & INVENTORY MANAGEMENT
-- ------------------------------------------------------------------------------

-- PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  size TEXT NOT NULL,
  unit TEXT NOT NULL,
  selling_price NUMERIC NOT NULL,
  cost_price NUMERIC DEFAULT 0,
  is_reusable INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  filled_stock INTEGER DEFAULT 0,
  empty_cans INTEGER DEFAULT 0,
  damaged_cans INTEGER DEFAULT 0,
  lost_cans INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.products (id, name, size, unit, selling_price, cost_price, is_reusable, is_active, filled_stock, empty_cans) VALUES
  ('prod-19l-can', 'AAB E ARWA 19L Premium Water Can', '19 Liter', 'Can', 220, 65, 1, 1, 350, 280),
  ('prod-1.5l-bottle', 'AAB E ARWA 1.5L Drinking Water (Pack of 6)', '1.5 Liter (6-Pack)', 'Pack', 360, 190, 0, 1, 90, 0),
  ('prod-500ml-bottle', 'AAB E ARWA 500ml Mineral Water (Pack of 12)', '500ml (12-Pack)', 'Pack', 520, 310, 0, 1, 110, 0)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  size = EXCLUDED.size,
  unit = EXCLUDED.unit,
  selling_price = EXCLUDED.selling_price;

-- INVENTORY TABLE
CREATE TABLE IF NOT EXISTS public.inventory (
  id TEXT PRIMARY KEY DEFAULT ('inv-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  product_id TEXT NOT NULL UNIQUE REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT,
  size TEXT,
  unit TEXT,
  selling_price NUMERIC,
  cost_price NUMERIC,
  is_reusable INTEGER DEFAULT 1,
  filled_stock INTEGER DEFAULT 0,
  empty_cans INTEGER DEFAULT 0,
  damaged_cans INTEGER DEFAULT 0,
  lost_cans INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.inventory (id, product_id, product_name, size, unit, selling_price, cost_price, is_reusable, filled_stock, empty_cans, damaged_cans, lost_cans) VALUES
  ('inv-19l', 'prod-19l-can', 'AAB E ARWA 19L Premium Water Can', '19 Liter', 'Can', 220, 65, 1, 350, 280, 5, 2),
  ('inv-1.5l', 'prod-1.5l-bottle', 'AAB E ARWA 1.5L Drinking Water (Pack of 6)', '1.5 Liter (6-Pack)', 'Pack', 360, 190, 0, 90, 0, 0, 0),
  ('inv-500ml', 'prod-500ml-bottle', 'AAB E ARWA 500ml Mineral Water (Pack of 12)', '500ml (12-Pack)', 'Pack', 520, 310, 0, 110, 0, 0, 0)
ON CONFLICT (product_id) DO NOTHING;

-- INVENTORY MOVEMENTS (Stock Audit Trail)
CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id TEXT PRIMARY KEY DEFAULT ('mov-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT,
  size TEXT,
  movement_type TEXT NOT NULL,
  stock_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  previous_stock INTEGER,
  new_stock INTEGER,
  reason TEXT,
  reference_type TEXT,
  reference_id TEXT,
  user_id TEXT,
  user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- PRODUCTION RECORDS (Water Plant Bottle Filling)
CREATE TABLE IF NOT EXISTS public.production_records (
  id TEXT PRIMARY KEY DEFAULT ('prd-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT,
  size TEXT,
  quantity_filled INTEGER NOT NULL,
  source_tank TEXT,
  notes TEXT,
  user_id TEXT,
  user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 6. ORDERS & DELIVERIES
-- ------------------------------------------------------------------------------

-- ORDERS TABLE
CREATE TABLE IF NOT EXISTS public.orders (
  id TEXT PRIMARY KEY DEFAULT ('ord-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  order_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_phone TEXT,
  customer_area TEXT,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  payment_type TEXT NOT NULL DEFAULT 'Cash',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  order_status TEXT NOT NULL DEFAULT 'pending',
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
  delivery_address TEXT NOT NULL,
  notes TEXT,
  created_by TEXT,
  created_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ORDER ITEMS TABLE
CREATE TABLE IF NOT EXISTS public.order_items (
  id TEXT PRIMARY KEY DEFAULT ('item-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT,
  size TEXT,
  unit TEXT,
  quantity INTEGER NOT NULL,
  unit_price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL
);

-- DELIVERIES TABLE
CREATE TABLE IF NOT EXISTS public.deliveries (
  id TEXT PRIMARY KEY DEFAULT ('del-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  delivery_number TEXT NOT NULL UNIQUE,
  order_id TEXT NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_number TEXT,
  total_amount NUMERIC,
  customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  customer_area TEXT,
  driver_id TEXT,
  driver_name TEXT,
  vehicle TEXT,
  delivery_date DATE NOT NULL DEFAULT CURRENT_DATE,
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
  id TEXT PRIMARY KEY DEFAULT ('ditem-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  delivery_id TEXT NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_name TEXT,
  quantity INTEGER NOT NULL
);

-- ------------------------------------------------------------------------------
-- 7. EMPTY CAN TRACKING & CUSTOMER CAN MOVEMENTS
-- ------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.customer_can_movements (
  id TEXT PRIMARY KEY DEFAULT ('canmov-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_name TEXT,
  product_id TEXT REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT,
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  delivery_id TEXT REFERENCES public.deliveries(id) ON DELETE SET NULL,
  reason TEXT,
  user_id TEXT,
  user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 8. PAYMENTS & CUSTOMER LEDGERS
-- ------------------------------------------------------------------------------

-- PAYMENTS TABLE
CREATE TABLE IF NOT EXISTS public.payments (
  id TEXT PRIMARY KEY DEFAULT ('pay-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  payment_number TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  customer_name TEXT,
  customer_phone TEXT,
  order_id TEXT REFERENCES public.orders(id) ON DELETE SET NULL,
  delivery_id TEXT REFERENCES public.deliveries(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT,
  notes TEXT,
  received_by TEXT,
  received_by_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- CUSTOMER LEDGER TABLE
CREATE TABLE IF NOT EXISTS public.customer_ledger (
  id TEXT PRIMARY KEY DEFAULT ('ledg-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  customer_id TEXT NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL,
  reference_type TEXT,
  reference_id TEXT,
  debit NUMERIC DEFAULT 0,
  credit NUMERIC DEFAULT 0,
  balance NUMERIC NOT NULL,
  description TEXT NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 9. EXPENSE CATEGORIES & EXPENSES
-- ------------------------------------------------------------------------------

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
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- EXPENSES TABLE
CREATE TABLE IF NOT EXISTS public.expenses (
  id TEXT PRIMARY KEY DEFAULT ('exp-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  category_id TEXT NOT NULL REFERENCES public.expense_categories(id) ON DELETE RESTRICT,
  category_name TEXT,
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  paid_by TEXT NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'Cash',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id TEXT,
  user_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 10. SUPPLIERS & VENDOR TRANSACTIONS
-- ------------------------------------------------------------------------------

-- SUPPLIERS TABLE
CREATE TABLE IF NOT EXISTS public.suppliers (
  id TEXT PRIMARY KEY DEFAULT ('sup-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
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
  id TEXT PRIMARY KEY DEFAULT ('suptxn-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  supplier_id TEXT NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  description TEXT NOT NULL,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------------------------
-- 11. AUDIT LOGS & SETTINGS
-- ------------------------------------------------------------------------------

-- AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY DEFAULT ('aud-' || substring(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
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
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value;

-- ------------------------------------------------------------------------------
-- 12. PERFORMANCE INDEXES
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers (name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON public.customers (phone);
CREATE INDEX IF NOT EXISTS idx_customers_area ON public.customers (area);
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON public.customers (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products (is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_product ON public.inventory (product_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_product ON public.inventory_movements (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_product ON public.production_records (product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON public.orders (order_number);
CREATE INDEX IF NOT EXISTS idx_orders_date ON public.orders (delivery_date);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_order ON public.deliveries (order_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON public.deliveries (driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON public.deliveries (status);
CREATE INDEX IF NOT EXISTS idx_del_items_del ON public.delivery_items (delivery_id);
CREATE INDEX IF NOT EXISTS idx_can_mov_customer ON public.customer_can_movements (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON public.payments (customer_id);
CREATE INDEX IF NOT EXISTS idx_ledger_customer ON public.customer_ledger (customer_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses (category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses (expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_suppliers_name ON public.suppliers (name);
CREATE INDEX IF NOT EXISTS idx_suptxn_supplier ON public.supplier_transactions (supplier_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_roles_email ON public.user_roles (lower(email));
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (lower(email));
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (lower(email));

-- ------------------------------------------------------------------------------
-- 13. ROLE RESOLUTION & SECURITY DEFINER FUNCTION
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- 1. Check verified email claim in JWT for Owner designation
  IF auth.jwt() ->> 'email' IS NOT NULL THEN
    IF lower(auth.jwt() ->> 'email') = 'junaidurrehman735@gmail.com' THEN
      RETURN 'Owner';
    END IF;
  END IF;

  -- 2. Check public.user_roles table (linked by UUID)
  SELECT role INTO v_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  -- 3. Check public.profiles table (linked by UUID)
  SELECT role INTO v_role
  FROM public.profiles
  WHERE id = auth.uid() OR user_id = auth.uid()
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  -- 4. Check public.users table
  SELECT role_name INTO v_role
  FROM public.users
  WHERE id = auth.uid()::text
  LIMIT 1;

  IF v_role IS NOT NULL THEN
    RETURN v_role;
  END IF;

  -- 5. Check email in user_roles/profiles if JWT email is present
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

  -- 6. Check user_metadata in JWT token
  IF (auth.jwt() -> 'user_metadata' ->> 'role') IS NOT NULL THEN
    RETURN auth.jwt() -> 'user_metadata' ->> 'role';
  END IF;

  RETURN 'Delivery Boy';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ------------------------------------------------------------------------------
-- 14. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- Enable RLS across every table
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
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

-- Drop any previous policies to guarantee idempotent re-runs
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- SERVER / BACKEND PROXY POLICIES (anon role via VITE_SUPABASE_PUBLISHABLE_KEY)
-- ------------------------------------------------------------------------------
-- Allows the central application backend server proxy to execute synchronized CRUD
CREATE POLICY "anon_server_all_roles" ON public.roles FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_permissions" ON public.permissions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_user_roles" ON public.user_roles FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_profiles" ON public.profiles FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_users" ON public.users FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_customer_types" ON public.customer_types FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_customers" ON public.customers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_products" ON public.products FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_inventory" ON public.inventory FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_inventory_movements" ON public.inventory_movements FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_production_records" ON public.production_records FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_orders" ON public.orders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_order_items" ON public.order_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_deliveries" ON public.deliveries FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_delivery_items" ON public.delivery_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_can_movements" ON public.customer_can_movements FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_payments" ON public.payments FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_customer_ledger" ON public.customer_ledger FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_expense_categories" ON public.expense_categories FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_expenses" ON public.expenses FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_suppliers" ON public.suppliers FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_supplier_transactions" ON public.supplier_transactions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_audit_logs" ON public.audit_logs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_server_all_settings" ON public.settings FOR ALL TO anon USING (true) WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- AUTHENTICATED USER POLICIES (CLIENT-SIDE RBAC)
-- ------------------------------------------------------------------------------

-- ROLES & PERMISSIONS
CREATE POLICY "auth_view_roles" ON public.roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner_manage_roles" ON public.roles FOR ALL TO authenticated USING (public.current_user_role() = 'Owner');

CREATE POLICY "auth_view_permissions" ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner_manage_permissions" ON public.permissions FOR ALL TO authenticated USING (public.current_user_role() = 'Owner');

-- USER PROFILES & ACCOUNTS
CREATE POLICY "owner_all_profiles" ON public.profiles FOR ALL TO authenticated USING (public.current_user_role() = 'Owner');
CREATE POLICY "user_view_own_profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'));
CREATE POLICY "user_update_own_profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  WITH CHECK (id = auth.uid() OR user_id = auth.uid());

CREATE POLICY "owner_all_user_roles" ON public.user_roles FOR ALL TO authenticated USING (public.current_user_role() = 'Owner');
CREATE POLICY "user_view_own_user_role" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'));
CREATE POLICY "user_update_own_user_role" ON public.user_roles FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR lower(email) = lower(auth.jwt() ->> 'email'))
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "owner_all_users" ON public.users FOR ALL TO authenticated USING (public.current_user_role() = 'Owner');
CREATE POLICY "manager_view_users" ON public.users FOR SELECT TO authenticated USING (public.current_user_role() = 'Manager');
CREATE POLICY "user_view_own_user_record" ON public.users FOR SELECT TO authenticated
  USING (id = auth.uid()::text OR lower(email) = lower(auth.jwt() ->> 'email'));
CREATE POLICY "user_update_own_user_record" ON public.users FOR UPDATE TO authenticated
  USING (id = auth.uid()::text OR lower(email) = lower(auth.jwt() ->> 'email'));

-- CUSTOMER TYPES
CREATE POLICY "auth_view_customer_types" ON public.customer_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner_manage_customer_types" ON public.customer_types FOR ALL TO authenticated USING (public.current_user_role() = 'Owner');

-- CUSTOMERS
CREATE POLICY "owner_manager_manage_customers" ON public.customers FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));
CREATE POLICY "delivery_boy_view_customers" ON public.customers FOR SELECT TO authenticated
  USING (public.current_user_role() = 'Delivery Boy');

-- PRODUCTS
CREATE POLICY "auth_view_products" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner_manager_manage_products" ON public.products FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

-- INVENTORY
CREATE POLICY "auth_view_inventory" ON public.inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "owner_manager_manage_inventory" ON public.inventory FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

CREATE POLICY "owner_manager_inventory_movements" ON public.inventory_movements FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

-- PRODUCTION
CREATE POLICY "owner_manager_production_records" ON public.production_records FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

-- ORDERS & ORDER ITEMS
CREATE POLICY "owner_manager_orders" ON public.orders FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));
CREATE POLICY "delivery_boy_view_assigned_orders" ON public.orders FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'Delivery Boy' AND
    id IN (SELECT order_id FROM public.deliveries WHERE driver_id = auth.uid()::text)
  );

CREATE POLICY "owner_manager_order_items" ON public.order_items FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));
CREATE POLICY "delivery_boy_view_order_items" ON public.order_items FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'Delivery Boy' AND
    order_id IN (SELECT order_id FROM public.deliveries WHERE driver_id = auth.uid()::text)
  );

-- DELIVERIES & DELIVERY ITEMS
CREATE POLICY "owner_manager_deliveries" ON public.deliveries FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));
CREATE POLICY "delivery_boy_view_assigned_deliveries" ON public.deliveries FOR SELECT TO authenticated
  USING (public.current_user_role() = 'Delivery Boy' AND driver_id = auth.uid()::text);
CREATE POLICY "delivery_boy_update_assigned_deliveries" ON public.deliveries FOR UPDATE TO authenticated
  USING (public.current_user_role() = 'Delivery Boy' AND driver_id = auth.uid()::text)
  WITH CHECK (public.current_user_role() = 'Delivery Boy' AND driver_id = auth.uid()::text);

CREATE POLICY "owner_manager_delivery_items" ON public.delivery_items FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));
CREATE POLICY "delivery_boy_delivery_items" ON public.delivery_items FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'Delivery Boy' AND
    delivery_id IN (SELECT id FROM public.deliveries WHERE driver_id = auth.uid()::text)
  );

-- EMPTY CAN MOVEMENTS
CREATE POLICY "owner_manager_can_movements" ON public.customer_can_movements FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));
CREATE POLICY "delivery_boy_insert_can_movements" ON public.customer_can_movements FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'Delivery Boy');
CREATE POLICY "delivery_boy_view_can_movements" ON public.customer_can_movements FOR SELECT TO authenticated
  USING (public.current_user_role() = 'Delivery Boy');

-- PAYMENTS (FINANCIAL)
CREATE POLICY "owner_manage_payments" ON public.payments FOR ALL TO authenticated
  USING (public.current_user_role() = 'Owner');
CREATE POLICY "manager_insert_view_payments" ON public.payments FOR ALL TO authenticated
  USING (public.current_user_role() = 'Manager');
CREATE POLICY "delivery_boy_insert_payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'Delivery Boy');

-- CUSTOMER LEDGER (FINANCIAL)
CREATE POLICY "owner_manage_customer_ledger" ON public.customer_ledger FOR ALL TO authenticated
  USING (public.current_user_role() = 'Owner');
CREATE POLICY "manager_view_customer_ledger" ON public.customer_ledger FOR SELECT TO authenticated
  USING (public.current_user_role() = 'Manager');

-- EXPENSES (FINANCIAL)
CREATE POLICY "owner_manage_expenses" ON public.expenses FOR ALL TO authenticated
  USING (public.current_user_role() = 'Owner');
CREATE POLICY "owner_manage_expense_categories" ON public.expense_categories FOR ALL TO authenticated
  USING (public.current_user_role() = 'Owner');
CREATE POLICY "manager_view_expense_categories" ON public.expense_categories FOR SELECT TO authenticated
  USING (public.current_user_role() = 'Manager');

-- SUPPLIERS & TRANSACTIONS
CREATE POLICY "owner_manager_suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));
CREATE POLICY "owner_manager_supplier_txns" ON public.supplier_transactions FOR ALL TO authenticated
  USING (public.current_user_role() IN ('Owner', 'Manager'));

-- AUDIT LOGS
CREATE POLICY "owner_view_audit_logs" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.current_user_role() = 'Owner');
CREATE POLICY "auth_insert_audit_logs" ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (true);

-- SETTINGS
CREATE POLICY "owner_manage_settings" ON public.settings FOR ALL TO authenticated
  USING (public.current_user_role() = 'Owner');
CREATE POLICY "manager_view_settings" ON public.settings FOR SELECT TO authenticated
  USING (public.current_user_role() = 'Manager');

-- ------------------------------------------------------------------------------
-- 15. AUTOMATIC AUTH USER ONBOARDING TRIGGER
-- ------------------------------------------------------------------------------
-- Automatically links newly created Supabase Auth accounts to profiles and roles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT := 'Delivery Boy';
  v_role_id TEXT := 'role-delivery';
BEGIN
  IF lower(new.email) = 'junaidurrehman735@gmail.com' OR (new.raw_user_meta_data->>'role') = 'Owner' THEN
    v_role := 'Owner';
    v_role_id := 'role-owner';
  ELSIF (new.raw_user_meta_data->>'role') = 'Manager' OR (new.raw_user_meta_data->>'role_id') = 'role-manager' THEN
    v_role := 'Manager';
    v_role_id := 'role-manager';
  ELSIF (new.raw_user_meta_data->>'role') = 'Delivery Boy' OR (new.raw_user_meta_data->>'role_id') = 'role-delivery' THEN
    v_role := 'Delivery Boy';
    v_role_id := 'role-delivery';
  END IF;

  INSERT INTO public.profiles (id, user_id, email, name, role, role_id, status, phone)
  VALUES (
    new.id,
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    v_role,
    v_role_id,
    'active',
    new.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (email) DO UPDATE SET
    id = new.id,
    user_id = new.id,
    role = v_role,
    role_id = v_role_id,
    status = 'active',
    updated_at = now();

  INSERT INTO public.user_roles (user_id, email, name, role, role_id, status, phone)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    v_role,
    v_role_id,
    'active',
    new.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (email) DO UPDATE SET
    user_id = new.id,
    role = v_role,
    role_id = v_role_id,
    status = 'active',
    updated_at = now();

  INSERT INTO public.users (id, name, email, role_id, role_name, status, phone)
  VALUES (
    new.id::text,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    v_role_id,
    v_role,
    'active',
    new.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (email) DO UPDATE SET
    id = new.id::text,
    role_id = v_role_id,
    role_name = v_role,
    status = 'active',
    updated_at = now();

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ------------------------------------------------------------------------------
-- 16. POSTGREST SCHEMA ACCESS & PERMISSIONS
-- ------------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 17. INITIAL OWNER ROLE ATTACHMENT
-- ------------------------------------------------------------------------------
-- Immediately links junaidurrehman735@gmail.com to the Owner role if already registered
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
