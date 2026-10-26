-- PRIME HR NEXT LEVEL • Initial cloud HR schema • 2026-10-26
-- REVIEW AND TEST IN AN EMPTY SUPABASE PROJECT. NO REAL EMPLOYEE DATA BEFORE PRIVACY & SECURITY REVIEW.
-- Uses row level security for data isolation. Attendance GPS is collected ONLY at check-in/check-out.
create extension if not exists pgcrypto;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null,
 full_name text not null default '',
 role text not null default 'employee' check(role in ('employee','hr','admin')),
 is_active boolean not null default false,
 created_at timestamptz not null default now()
);
create unique index if not exists profile_emails_unique on public.profiles(lower(email));
create table if not exists public.branches (
 id uuid primary key default gen_random_uuid(),
 name text not null unique,
 created_at timestamptz not null default now()
);
create table if not exists public.employees (
 id uuid primary key default gen_random_uuid(),
 staff_code text not null unique,
 full_name text not null,
 email text,
 designation text not null,
 department text,
 branch_id uuid references public.branches(id),
 joined_on date,
 status text not null default 'active' check(status in ('active','on_leave','exited')),
 auth_user_id uuid unique references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create unique index if not exists employee_email_unique on public.employees(lower(email)) where email is not null;
create index if not exists employee_branch_ix on public.employees(branch_id);
create index if not exists employee_auth_ix on public.employees(auth_user_id);
create table if not exists public.attendance (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.employees(id),
 work_date date not null,
 check_in timestamptz not null,
 check_out timestamptz,
 mode text not null default 'office' check(mode in ('office','field')),
 unique(employee_id,work_date),
 constraint attendance_checkout_order check(check_out is null or check_out >= check_in)
);
create index if not exists attendance_day_ix on public.attendance(work_date desc);
-- Separated location table: GPS hidden from generic attendance queries.
create table if not exists public.attendance_locations (
 id uuid primary key default gen_random_uuid(),
 attendance_id uuid not null references public.attendance(id) on delete cascade,
 employee_id uuid not null references public.employees(id),
 event_type text not null check(event_type in ('check_in','check_out')),
 latitude double precision not null check(latitude between -90 and 90),
 longitude double precision not null check(longitude between -180 and 180),
 accuracy_m double precision not null check(accuracy_m >= 0 and accuracy_m <= 1000),
 recorded_at timestamptz not null default now(),
 unique(attendance_id,event_type)
);
create index if not exists location_time_ix on public.attendance_locations(recorded_at desc);
create index if not exists location_emp_ix on public.attendance_locations(employee_id,recorded_at desc);
create table if not exists public.leave_requests (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.employees(id),
 kind text not null check(kind in ('Annual','Casual','Medical','No-pay')),
 from_date date not null,
 to_date date not null,
 reason text not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 decided_by uuid references public.profiles(id),
 decided_at timestamptz,
 created_at timestamptz not null default now(),
 constraint leave_date_order check(to_date >= from_date)
);
create index if not exists leave_status_ix on public.leave_requests(status,created_at desc);
create table if not exists public.candidates (
 id uuid primary key default gen_random_uuid(),
 full_name text not null,
 email text,
 position text not null,
 branch_id uuid references public.branches(id),
 stage text not null default 'Applied' check(stage in ('Applied','Screening','Interview','Offer','Hired','Rejected')),
 notes text,
 created_at timestamptz not null default now()
);
create table if not exists public.hr_notices (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 content text not null,
 published boolean not null default false,
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
create table if not exists public.notice_reads (
 notice_id uuid not null references public.hr_notices(id) on delete cascade,
 employee_user_id uuid not null references auth.users(id) on delete cascade,
 acknowledged_at timestamptz not null default now(),
 primary key(notice_id,employee_user_id)
);
create table if not exists public.kpis (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.employees(id),
 period_month date not null,
 target_amount numeric(16,2) not null default 0 check(target_amount>=0),
 achieved_amount numeric(16,2) not null default 0 check(achieved_amount>=0),
 notes text,
 unique(employee_id,period_month)
);
create table if not exists public.assets (
 id uuid primary key default gen_random_uuid(),
 asset_tag text not null unique,
 description text not null,
 assigned_to uuid references public.employees(id),
 status text not null default 'available' check(status in ('available','assigned','repair','returned')),
 notes text,
 created_at timestamptz not null default now()
);
create table if not exists public.letter_register (
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.employees(id),
 letter_type text not null,
 document_no text not null unique,
 issued_on date,
 status text not null default 'draft' check(status in ('draft','approved','issued','void')),
 notes text,
 created_at timestamptz not null default now()
);
create table if not exists public.audit_log (
 id bigint generated always as identity primary key,
 occurred_at timestamptz not null default now(),
 actor_id uuid,
 action text not null,
 entity text not null,
 record_id uuid,
 details jsonb not null default '{}'::jsonb
);
-- This trigger creates an INACTIVE employee account; only the verified admin can activate users.
create or replace function private.create_user_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,email,full_name,role,is_active)
 values(new.id,lower(coalesce(new.email,'')),coalesce(new.raw_user_meta_data->>'full_name',''),'employee',false)
 on conflict(id) do nothing;
 return new;
end $$;
drop trigger if exists prime_hr_new_user on auth.users;
create trigger prime_hr_new_user after insert on auth.users
for each row execute function private.create_user_profile();

-- All privileged predicates live in PRIVATE (not Data API-exposed) schema.
create or replace function private.is_active()
returns boolean language sql stable security definer set search_path='' as $$
 select exists (select 1 from public.profiles where id=auth.uid() and is_active)
$$;
create or replace function private.is_hr()
returns boolean language sql stable security definer set search_path='' as $$
 select exists (select 1 from public.profiles where id=auth.uid() and is_active and role in ('admin','hr'))
$$;
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select exists (select 1 from public.profiles where id=auth.uid() and is_active and role='admin')
$$;
create or replace function private.is_self_employee(p_emp uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.is_active() and exists (
   select 1 from public.employees where id=p_emp and auth_user_id=auth.uid()
 )
$$;
create or replace function private.own_active_employee()
returns uuid language sql stable security definer set search_path='' as $$
 select id from public.employees
 where auth_user_id=auth.uid() and status='active' and private.is_active()
 limit 1
$$;
revoke all on function private.create_user_profile() from public,anon,authenticated;
revoke all on function private.is_active() from public,anon;
revoke all on function private.is_hr() from public,anon;
revoke all on function private.is_admin() from public,anon;
revoke all on function private.is_self_employee(uuid) from public,anon;
revoke all on function private.own_active_employee() from public,anon;
grant execute on function private.is_active(),private.is_hr(),private.is_admin(),private.is_self_employee(uuid),private.own_active_employee() to authenticated;

-- The public API is INVOKER, calling a tightly validated private privileged write.
create or replace function private.perform_attendance(p_action text,p_lat double precision,p_lng double precision,p_accuracy double precision,p_mode text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_emp uuid;v_id uuid;v_now timestamptz:=now();v_day date:=(now() at time zone 'Asia/Colombo')::date;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 v_emp:=private.own_active_employee();
 if v_emp is null then raise exception 'No approved, active employee linked to this login';end if;
 if p_action not in ('check_in','check_out') then raise exception 'Invalid attendance action';end if;
 if p_lat is null or p_lng is null or p_accuracy is null
    or p_lat::text in ('NaN','Infinity','-Infinity')
    or p_lng::text in ('NaN','Infinity','-Infinity')
    or p_accuracy::text in ('NaN','Infinity','-Infinity')
    or p_lat not between -90 and 90 or p_lng not between -180 and 180
    or p_accuracy not between 0 and 1000
 then raise exception 'Valid current GPS coordinates (accuracy <= 1000 m) required';end if;
 if p_mode not in ('office','field') then raise exception 'Invalid attendance mode';end if;
 if p_action='check_in' then
   insert into public.attendance(employee_id,work_date,check_in,mode)
   values(v_emp,v_day,v_now,p_mode)
   on conflict(employee_id,work_date) do nothing returning id into v_id;
   if v_id is null then raise exception 'Already checked in today';end if;
 else
   update public.attendance set check_out=v_now
   where employee_id=v_emp and work_date=v_day and check_out is null
   returning id into v_id;
   if v_id is null then raise exception 'No open check-in for today';end if;
 end if;
 insert into public.attendance_locations(attendance_id,employee_id,event_type,latitude,longitude,accuracy_m,recorded_at)
 values(v_id,v_emp,p_action,p_lat,p_lng,p_accuracy,v_now);
 insert into public.audit_log(actor_id,action,entity,record_id,details)
 values(auth.uid(),p_action,'attendance',v_id,jsonb_build_object('gps_accuracy_m',p_accuracy));
 return v_id;
end $$;
revoke all on function private.perform_attendance(text,double precision,double precision,double precision,text) from public,anon;
grant execute on function private.perform_attendance(text,double precision,double precision,double precision,text) to authenticated;
create or replace function public.hr_mark_attendance(
 p_action text, p_lat double precision, p_lng double precision,
 p_accuracy double precision, p_mode text default 'office'
) returns uuid language sql security invoker set search_path='' as $$
 select private.perform_attendance(p_action,p_lat,p_lng,p_accuracy,p_mode)
$$;
revoke all on function public.hr_mark_attendance(text,double precision,double precision,double precision,text) from public,anon;
grant execute on function public.hr_mark_attendance(text,double precision,double precision,double precision,text) to authenticated;

-- Enable explicit RLS and least-privilege API grants.
alter table public.profiles enable row level security;
alter table public.branches enable row level security;
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.attendance_locations enable row level security;
alter table public.leave_requests enable row level security;
alter table public.candidates enable row level security;
alter table public.hr_notices enable row level security;
alter table public.notice_reads enable row level security;
alter table public.kpis enable row level security;
alter table public.assets enable row level security;
alter table public.letter_register enable row level security;
alter table public.audit_log enable row level security;
revoke all on public.profiles,public.branches,public.employees,public.attendance,
 public.attendance_locations,public.leave_requests,public.candidates,public.hr_notices,
 public.notice_reads,public.kpis,public.assets,public.letter_register,public.audit_log
 from anon,authenticated;

grant select on public.profiles to authenticated;
grant update(role,is_active) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
 using(id=(select auth.uid()) or (select private.is_hr()));
create policy profiles_update on public.profiles for update to authenticated
 using((select private.is_admin())) with check((select private.is_admin()));

grant select on public.branches to authenticated;
grant insert,update on public.branches to authenticated;
create policy branches_read on public.branches for select to authenticated using((select private.is_active()));
create policy branches_write on public.branches for insert to authenticated with check((select private.is_admin()));
create policy branches_edit on public.branches for update to authenticated using((select private.is_admin())) with check((select private.is_admin()));

grant select,insert,update on public.employees to authenticated;
create policy employee_read on public.employees for select to authenticated
 using((select private.is_hr()) or (select private.is_self_employee(id)));
create policy employee_add on public.employees for insert to authenticated with check((select private.is_hr()));
create policy employee_edit on public.employees for update to authenticated using((select private.is_hr())) with check((select private.is_hr()));

grant select on public.attendance to authenticated;
create policy attendance_read on public.attendance for select to authenticated
 using((select private.is_hr()) or (select private.is_self_employee(employee_id)));
-- GPS location is visible to HR/admin only; NOT visible to regular employees.
grant select on public.attendance_locations to authenticated;
create policy gps_hr_read on public.attendance_locations for select to authenticated using((select private.is_hr()));
-- No client insert/update/delete permissions on either attendance or GPS locations.

grant select,insert,update on public.leave_requests to authenticated;
create policy leave_read on public.leave_requests for select to authenticated using(
 (select private.is_hr()) or (select private.is_self_employee(employee_id))
);
create policy leave_add on public.leave_requests for insert to authenticated with check(
 employee_id=(select private.own_active_employee()) and status='pending'
 and decided_by is null and decided_at is null
);
create policy leave_hr_edit on public.leave_requests for update to authenticated using((select private.is_hr())) with check((select private.is_hr()));

grant select,insert,update on public.candidates to authenticated;
create policy candidates_hr_read on public.candidates for select to authenticated using((select private.is_hr()));
create policy candidates_hr_add on public.candidates for insert to authenticated with check((select private.is_hr()));
create policy candidates_hr_edit on public.candidates for update to authenticated using((select private.is_hr())) with check((select private.is_hr()));

grant select,insert,update on public.hr_notices to authenticated;
create policy notices_read on public.hr_notices for select to authenticated using(
 (select private.is_hr()) or (published=true and (select private.is_active()))
);
create policy notices_add on public.hr_notices for insert to authenticated with check(
 (select private.is_hr()) and created_by=(select auth.uid())
);
create policy notices_edit on public.hr_notices for update to authenticated using((select private.is_hr())) with check((select private.is_hr()));

grant select,insert on public.notice_reads to authenticated;
create policy reads_select on public.notice_reads for select to authenticated using(
 employee_user_id=(select auth.uid()) or (select private.is_hr())
);
create policy reads_insert on public.notice_reads for insert to authenticated with check(
 employee_user_id=(select auth.uid()) and (select private.is_active()) and
 exists(select 1 from public.hr_notices n where n.id=notice_id and n.published=true)
);

grant select,insert,update on public.kpis to authenticated;
create policy kpis_read on public.kpis for select to authenticated using(
 (select private.is_hr()) or (select private.is_self_employee(employee_id))
);
create policy kpis_add on public.kpis for insert to authenticated with check((select private.is_hr()));
create policy kpis_edit on public.kpis for update to authenticated using((select private.is_hr())) with check((select private.is_hr()));

grant select,insert,update on public.assets to authenticated;
create policy assets_read on public.assets for select to authenticated using(
 (select private.is_hr()) or (assigned_to is not null and (select private.is_self_employee(assigned_to)))
);
create policy assets_add on public.assets for insert to authenticated with check((select private.is_hr()));
create policy assets_edit on public.assets for update to authenticated using((select private.is_hr())) with check((select private.is_hr()));

grant select,insert,update on public.letter_register to authenticated;
create policy letters_read on public.letter_register for select to authenticated using(
 (select private.is_hr()) or ((status='issued') and (select private.is_self_employee(employee_id)))
);
create policy letters_add on public.letter_register for insert to authenticated with check((select private.is_hr()));
create policy letters_edit on public.letter_register for update to authenticated using((select private.is_hr())) with check((select private.is_hr()));
-- Audit logs viewable to admin ONLY (writes by privileged RPC).
grant select on public.audit_log to authenticated;
create policy audit_admin_read on public.audit_log for select to authenticated using((select private.is_admin()));

insert into public.branches(name) values
 ('Gampaha Head Office'),('Kiribathgoda'),('Kandy Office Complex'),('Gampola'),('Nuwara Eliya')
on conflict(name) do nothing;

-- SECURITY BOOTSTRAP: After you create and confirm your own login, manually execute
-- UPDATE public.profiles SET role='admin',is_active=true WHERE email=lower('ADMIN@EXAMPLE.COM');
-- Never put real passwords / service-role secrets / NIC / payroll data into GitHub.
-- Production TODO: explicit employer location/privacy notice, approved retention (e.g. 90 days),
-- automatic deletion and audit review, MFA admin, location anti-spoofing and RLS integration tests.
