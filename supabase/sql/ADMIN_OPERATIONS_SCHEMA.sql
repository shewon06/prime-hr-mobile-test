-- PRIME HR NEXT LEVEL | Admin Operations reference schema
-- LIVE project migrations already applied on 2026-10-27:
--   prime_hr_payroll_draft_approval_controls
--   prime_hr_leave_entitlements_and_approved_letter_templates
-- Maintain this source for reviewing/deploying schema to a NEW project;
-- do NOT paste over a production database without checking existing policies.
-- Depends on public.employees, private.is_hr(), private.is_admin(),
-- private.is_self_employee(), and Supabase Auth created by base schema.sql.

create table if not exists public.hr_payroll_entries(
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.employees(id),
 period_month date not null check(extract(day from period_month)=1),
 basic_pay numeric(14,2) not null default 0 check(basic_pay>=0),
 allowance_pay numeric(14,2) not null default 0 check(allowance_pay>=0),
 overtime_pay numeric(14,2) not null default 0 check(overtime_pay>=0),
 other_earnings numeric(14,2) not null default 0 check(other_earnings>=0),
 employee_epf numeric(14,2) not null default 0 check(employee_epf>=0),
 income_tax numeric(14,2) not null default 0 check(income_tax>=0),
 other_deductions numeric(14,2) not null default 0 check(other_deductions>=0),
 employer_epf numeric(14,2) not null default 0 check(employer_epf>=0),
 employer_etf numeric(14,2) not null default 0 check(employer_etf>=0),
 gross_pay numeric(14,2) generated always as
  (basic_pay+allowance_pay+overtime_pay+other_earnings) stored,
 net_pay numeric(14,2) generated always as
  (basic_pay+allowance_pay+overtime_pay+other_earnings-employee_epf-income_tax-other_deductions) stored,
 status text not null default 'draft' check(status in ('draft','approved','paid')),
 notes text,created_by uuid not null references auth.users(id),
 approved_by uuid references auth.users(id),
 approved_at timestamptz,paid_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(employee_id,period_month),
 constraint payroll_nonnegative_net check(
   basic_pay+allowance_pay+overtime_pay+other_earnings>=employee_epf+income_tax+other_deductions)
);
create index if not exists payroll_month_idx on public.hr_payroll_entries(period_month,status);
alter table public.hr_payroll_entries enable row level security;
revoke all on public.hr_payroll_entries from anon,authenticated;
grant select,insert,update on public.hr_payroll_entries to authenticated;
create policy hr_payroll_read on public.hr_payroll_entries for select to authenticated using((select private.is_hr()));
create policy hr_payroll_create on public.hr_payroll_entries for insert to authenticated
 with check((select private.is_hr()) and status='draft' and created_by=(select auth.uid())
 and approved_by is null and approved_at is null and paid_at is null);
create policy hr_payroll_edit on public.hr_payroll_entries for update to authenticated
 using((select private.is_hr())) with check((select private.is_hr()));
create or replace function private.validate_prime_payroll_transition()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if old.status in ('approved','paid') and (
     new.employee_id is distinct from old.employee_id or
     new.period_month is distinct from old.period_month or
     new.basic_pay is distinct from old.basic_pay or
     new.allowance_pay is distinct from old.allowance_pay or
     new.overtime_pay is distinct from old.overtime_pay or
     new.other_earnings is distinct from old.other_earnings or
     new.employee_epf is distinct from old.employee_epf or
     new.income_tax is distinct from old.income_tax or
     new.other_deductions is distinct from old.other_deductions or
     new.employer_epf is distinct from old.employer_epf or
     new.employer_etf is distinct from old.employer_etf or
     new.notes is distinct from old.notes
  ) then raise exception 'Approved payroll is locked';end if;
  if new.created_by is distinct from old.created_by then raise exception 'Creator cannot change';end if;
  if old.status='draft' and new.status='draft' then
    if new.approved_by is not null or new.approved_at is not null or new.paid_at is not null then
       raise exception 'Draft cannot have approval/payment metadata';end if;
  elsif old.status='draft' and new.status='approved' then
    if not private.is_admin() then raise exception 'Admin approval required';end if;
    new.approved_by:=auth.uid();new.approved_at:=now();new.paid_at:=null;
  elsif old.status='approved' and new.status='paid' then
    if not private.is_admin() then raise exception 'Admin payment confirmation required';end if;
    new.paid_at:=now();
  elsif new.status is distinct from old.status then
    raise exception 'Invalid payroll state transition';
  else
    if new.approved_by is distinct from old.approved_by or new.approved_at is distinct from old.approved_at or
       new.paid_at is distinct from old.paid_at then
       raise exception 'Approval timestamps cannot be modified';end if;
  end if;
  new.updated_at:=now();
 end if;
 return new;
end $$;
revoke all on function private.validate_prime_payroll_transition() from public,anon,authenticated;
create trigger prime_payroll_guard before update on public.hr_payroll_entries
for each row execute function private.validate_prime_payroll_transition();

create table if not exists public.hr_leave_entitlements(
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.employees(id),
 leave_year integer not null check(leave_year between 2020 and 2100),
 leave_type text not null check(leave_type in ('Annual','Casual','Medical')),
 entitled_days numeric(7,2) not null check(entitled_days>=0 and entitled_days<=366),
 carried_days numeric(7,2) not null default 0 check(carried_days>=0 and carried_days<=366),
 notes text,updated_at timestamptz not null default now(),
 unique(employee_id,leave_year,leave_type)
);
alter table public.hr_leave_entitlements enable row level security;
revoke all on public.hr_leave_entitlements from anon,authenticated;
grant select,insert,update on public.hr_leave_entitlements to authenticated;
create policy hr_leave_entitlements_read on public.hr_leave_entitlements for select to authenticated
 using((select private.is_hr()) or (select private.is_self_employee(employee_id)));
create policy hr_leave_entitlements_create on public.hr_leave_entitlements for insert to authenticated with check((select private.is_hr()));
create policy hr_leave_entitlements_update on public.hr_leave_entitlements for update to authenticated
 using((select private.is_hr())) with check((select private.is_hr()));

create table if not exists public.hr_letter_templates(
 id uuid primary key default gen_random_uuid(),
 template_name text not null unique check(length(trim(template_name)) between 3 and 130),
 designation_match text,
 language text not null default 'en' check(language in ('en','si','ta')),
 subject text not null check(length(trim(subject)) between 3 and 250),
 body text not null check(length(body) between 30 and 30000),
 status text not null default 'draft' check(status in ('draft','approved')),
 version integer not null default 1,
 updated_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
alter table public.hr_letter_templates enable row level security;
revoke all on public.hr_letter_templates from anon,authenticated;
grant select,insert,update on public.hr_letter_templates to authenticated;
create policy hr_letter_templates_read on public.hr_letter_templates for select to authenticated using((select private.is_hr()));
create policy hr_letter_templates_create on public.hr_letter_templates for insert to authenticated
 with check((select private.is_admin()) and updated_by=(select auth.uid()));
create policy hr_letter_templates_update on public.hr_letter_templates for update to authenticated
 using((select private.is_admin())) with check((select private.is_admin()) and updated_by=(select auth.uid()));
create or replace function private.prime_template_version()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then new.version:=old.version+1;new.updated_at:=now();end if;
 return new;
end $$;
revoke all on function private.prime_template_version() from public,anon,authenticated;
create trigger prime_letter_template_version before update on public.hr_letter_templates
for each row execute function private.prime_template_version();

create table if not exists public.hr_letter_drafts(
 id uuid primary key default gen_random_uuid(),
 template_id uuid references public.hr_letter_templates(id),
 employee_id uuid not null references public.employees(id),
 document_no text not null unique check(length(trim(document_no)) between 3 and 75),
 template_version integer,subject text not null,rendered_body text not null,
 status text not null default 'draft' check(status in ('draft','approved','issued','void')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),issued_at timestamptz
);
alter table public.hr_letter_drafts enable row level security;
revoke all on public.hr_letter_drafts from anon,authenticated;
grant select,insert,update on public.hr_letter_drafts to authenticated;
create policy hr_letter_drafts_read on public.hr_letter_drafts for select to authenticated using((select private.is_hr()));
create policy hr_letter_drafts_create on public.hr_letter_drafts for insert to authenticated
 with check((select private.is_hr()) and created_by=(select auth.uid()) and status='draft');
create policy hr_letter_drafts_edit on public.hr_letter_drafts for update to authenticated
 using((select private.is_hr())) with check((select private.is_hr()));
create or replace function private.prime_letter_draft_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.status in ('issued','void') then raise exception 'Finalized letters are immutable';end if;
 if new.employee_id is distinct from old.employee_id or new.created_by is distinct from old.created_by
  or new.template_id is distinct from old.template_id then
    raise exception 'Letter identity cannot change';end if;
 if old.status='draft' and new.status='approved' then
  if not private.is_admin() then raise exception 'Admin approval required';end if;
 elsif old.status='approved' and new.status='issued' then
  if not private.is_admin() then raise exception 'Admin issuance required';end if;
  new.issued_at:=now();
 elsif new.status='void' then
  if not private.is_admin() then raise exception 'Admin authorization required';end if;
 elsif new.status is distinct from old.status then raise exception 'Invalid letter status change';end if;
 if old.status='approved' and (new.rendered_body is distinct from old.rendered_body
  or new.subject is distinct from old.subject or new.document_no is distinct from old.document_no)
 then raise exception 'Approved letter content is immutable';end if;
 return new;
end $$;
revoke all on function private.prime_letter_draft_guard() from public,anon,authenticated;
create trigger prime_letter_draft_guard before update on public.hr_letter_drafts
for each row execute function private.prime_letter_draft_guard();


-- Live migration: prime_hr_atomic_letter_issuance_register
-- One DB transaction: letter can only become "issued" when the legacy
-- letter_register record has also been written successfully.
create or replace function private.prime_register_issued_letter()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.status is distinct from 'issued' and new.status='issued' then
  insert into public.letter_register(employee_id,letter_type,document_no,issued_on,status,notes)
  values(
   new.employee_id,new.subject,new.document_no,
   (now() at time zone 'Asia/Colombo')::date,'issued',
   'Issued from approved PRIME HR letter draft; immutable snapshot'
  );
 end if;
 return new;
end $$;
revoke all on function private.prime_register_issued_letter() from public,anon,authenticated;
create trigger prime_register_issued_letter
 after update of status on public.hr_letter_drafts
 for each row execute function private.prime_register_issued_letter();
