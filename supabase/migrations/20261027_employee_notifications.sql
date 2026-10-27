-- PRIME HR Next Level: Notifications migration applied on 2026-10-27
-- Private alerts after HR Notice publication and leave approval/rejection.
create table if not exists public.employee_notifications (
 id uuid primary key default gen_random_uuid(),
 recipient_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('leave_approved','leave_rejected','hr_notice')),
 title text not null check(length(title) between 1 and 180),
 body text not null check(length(body) between 1 and 1500),
 source_id uuid not null,
 created_at timestamptz not null default now(),
 read_at timestamptz,
 constraint employee_notification_unique_event unique(recipient_id,kind,source_id)
);
create index if not exists employee_notifications_user_time_idx
 on public.employee_notifications(recipient_id,created_at desc);
alter table public.employee_notifications enable row level security;
revoke all on public.employee_notifications from anon,authenticated;
grant select on public.employee_notifications to authenticated;
grant update(read_at) on public.employee_notifications to authenticated;
drop policy if exists employee_notifications_self_read on public.employee_notifications;
create policy employee_notifications_self_read on public.employee_notifications for select to authenticated
 using ((select private.is_active()) and recipient_id=(select auth.uid()));
drop policy if exists employee_notifications_self_mark_read on public.employee_notifications;
create policy employee_notifications_self_mark_read on public.employee_notifications for update to authenticated
 using ((select private.is_active()) and recipient_id=(select auth.uid()))
 with check ((select private.is_active()) and recipient_id=(select auth.uid()));

create or replace function private.notify_leave_status()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_uid uuid;
begin
 if new.status not in ('approved','rejected') or old.status is not distinct from new.status then return new;end if;
 select e.auth_user_id into target_uid from public.employees e
 join public.profiles p on p.id=e.auth_user_id and p.is_active=true
 where e.id=new.employee_id and e.status='active';
 if target_uid is null then return new;end if;
 insert into public.employee_notifications(recipient_id,kind,title,body,source_id)
 values(
 target_uid,
 case when new.status='approved' then 'leave_approved' else 'leave_rejected' end,
 case when new.status='approved' then 'Leave Approved' else 'Leave Rejected' end,
 coalesce(new.kind,'Leave')||' leave ('||to_char(new.from_date,'DD Mon YYYY')||
 ' to '||to_char(new.to_date,'DD Mon YYYY')||') has been '||new.status||'.',new.id
 ) on conflict(recipient_id,kind,source_id) do nothing;
 return new;
end $$;
revoke all on function private.notify_leave_status() from public,anon,authenticated;
drop trigger if exists prime_notify_leave_status on public.leave_requests;
create trigger prime_notify_leave_status after update of status on public.leave_requests
 for each row execute function private.notify_leave_status();

create or replace function private.notify_published_hr_notice()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.published is not true or (tg_op='UPDATE' and old.published is true) then return new;end if;
 insert into public.employee_notifications(recipient_id,kind,title,body,source_id)
 select e.auth_user_id,'hr_notice',left('New HR Notice: '||new.title,180),
        left(new.content,1500),new.id
 from public.employees e join public.profiles p on p.id=e.auth_user_id
 where e.auth_user_id is not null and e.status='active' and p.is_active=true
 on conflict(recipient_id,kind,source_id) do nothing;
 return new;
end $$;
revoke all on function private.notify_published_hr_notice() from public,anon,authenticated;
drop trigger if exists prime_notify_hr_notice on public.hr_notices;
create trigger prime_notify_hr_notice after insert or update of published on public.hr_notices
 for each row execute function private.notify_published_hr_notice();

-- Only add to Realtime publication once (new project vs. already applied).
do $$
begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists (
  select 1 from pg_publication_tables where pubname='supabase_realtime'
    and schemaname='public' and tablename='employee_notifications'
 ) then
  alter publication supabase_realtime add table public.employee_notifications;
 end if;
end $$;
