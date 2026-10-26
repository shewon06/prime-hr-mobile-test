-- Migration already APPLIED to Supabase project qkhcojaouueypkgrzlov.
-- This file records the employee-number account preparation for reproducible setup.
alter table public.profiles add column if not exists must_change_password boolean not null default false;
alter table public.employees add column if not exists phone text;
alter table public.employees add column if not exists national_id text;
alter table public.employees add column if not exists address text;
alter table public.employees add column if not exists date_of_birth date;
alter table public.employees add column if not exists emergency_contact text;
alter table public.employees add column if not exists employment_type text;
alter table public.employees add column if not exists bank_name text;
alter table public.employees add column if not exists bank_branch text;
alter table public.employees add column if not exists bank_account text;
alter table public.employees add column if not exists epf_no text;
alter table public.employees add column if not exists etf_no text;
alter table public.employees add column if not exists basic_salary numeric(14,2) check(basic_salary is null or basic_salary>=0);
alter table public.employees add column if not exists vehicle_allowance numeric(14,2) check(vehicle_allowance is null or vehicle_allowance>=0);
alter table public.employees add column if not exists hired_by uuid references auth.users(id) on delete set null;
create unique index if not exists employees_code_case_insensitive on public.employees(upper(staff_code));
create index if not exists employees_phone_ix on public.employees(phone);
create index if not exists employees_hired_by_idx on public.employees(hired_by);
comment on column public.employees.phone is 'Staff contact only; never required for authentication.';
comment on column public.profiles.must_change_password is 'Staff must rotate Admin-issued temporary password.';
revoke update on public.employees from authenticated;
grant update(full_name,email,designation,department,branch_id,joined_on,status,phone,national_id,address,date_of_birth,emergency_contact,employment_type,bank_name,bank_branch,bank_account,epf_no,etf_no,basic_salary,vehicle_allowance) on public.employees to authenticated;
revoke update(must_change_password) on public.profiles from authenticated;
-- Admin-only Edge Function provisions immutable staff_code and auth_user_id using service role.
