-- Supabase migrations applied 2026-10-27; this reference file is for source versioning.
-- Migration 1: prime_hr_staff_groups_field_activity_reports
alter table public.employees add column if not exists staff_group text not null default 'office';
-- Constrain allowed team values in the database.
alter table public.employees add constraint employees_staff_group_allowed
  check (staff_group in ('office','sales','plantation'));
grant update(staff_group) on public.employees to authenticated;
create table if not exists public.field_activity_reports(
 id uuid primary key default gen_random_uuid(),
 employee_id uuid not null references public.employees(id) on delete cascade,
 staff_group text not null check (staff_group in ('sales','plantation')),
 activity_type text not null check(
   (staff_group='sales' and activity_type in ('customer_visit','prospecting','follow_up','collection','other_sales')) or
   (staff_group='plantation' and activity_type in ('site_visit','field_inspection','planting','maintenance','other_plantation'))
 ),
 location_name text not null check (length(trim(location_name)) between 2 and 180),
 notes text check (notes is null or length(notes)<=1000),
 latitude double precision not null check (latitude between -90 and 90 and latitude::text not in ('NaN','Infinity','-Infinity')),
 longitude double precision not null check (longitude between -180 and 180 and longitude::text not in ('NaN','Infinity','-Infinity')),
 accuracy_m double precision not null check (accuracy_m between 0 and 1000 and accuracy_m::text not in ('NaN','Infinity','-Infinity')),
 created_at timestamptz not null default now()
);
create index if not exists field_activity_employee_time_idx on public.field_activity_reports(employee_id,created_at desc);
create index if not exists field_activity_group_time_idx on public.field_activity_reports(staff_group,created_at desc);
alter table public.field_activity_reports enable row level security;
revoke all on public.field_activity_reports from anon,authenticated;
grant select on public.field_activity_reports to authenticated;
grant insert(employee_id,staff_group,activity_type,location_name,notes,latitude,longitude,accuracy_m) on public.field_activity_reports to authenticated;
create policy field_activity_select on public.field_activity_reports for select to authenticated
 using (
  (select private.is_hr()) or ((select private.is_active()) and employee_id in (
    select e.id from public.employees e where e.auth_user_id=(select auth.uid()) and e.status='active'
  ))
 );
-- Migration 2: prime_hr_field_activity_requires_active_check_in
create policy field_activity_insert on public.field_activity_reports for insert to authenticated
 with check (
   (select private.is_active()) and exists (
      select 1 from public.employees e join public.attendance a on a.employee_id=e.id
      where e.id=employee_id and e.auth_user_id=(select auth.uid())
      and e.status='active' and e.staff_group=staff_group
      and e.staff_group in ('sales','plantation')
      and a.work_date=(now() at time zone 'Asia/Colombo')::date
      and a.check_in is not null and a.check_out is null
   )
 );
comment on table public.field_activity_reports is
 'Manual Sales / Plantation work updates. One GPS snapshot per explicit submission, never background tracking.';
