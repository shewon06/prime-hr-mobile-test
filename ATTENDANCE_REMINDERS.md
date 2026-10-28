# PRIME HR NEXT LEVEL — Automatic Attendance Reminders

Configured on 28 October 2026 in Supabase project `qkhcojaouueypkgrzlov`.

## When notifications run

| Sri Lanka time (Asia/Colombo) | UTC / pg_cron schedule | Job | Notification kind |
| --- | --- | --- | --- |
| Every day 08:30 | `0 3 * * *` | `prime-hr-daily-0830-check-in` | `attendance_check_in_reminder` |
| Every day 17:00 | `30 11 * * *` | `prime-hr-daily-1700-check-out` | `attendance_check_out_reminder` |

These timings are valid because the project's `cron.timezone` is `GMT` and Sri Lanka stays UTC+05:30. All seven days are currently enabled. To limit to weekdays use day-of-week 1-5 in each job; to include Saturday use 1-6.

## Recipient logic

The server sends reminders only to linked, active employee accounts with active profiles and with an employment joining date not in the future.

- 08:30: skip employees who already marked regular Check In or Field Duty for the Sri Lanka work date.
- 17:00: only employees with an open attendance record for the Sri Lanka work date (Check In / Field Duty but no Check Out).
- Both: skip employees whose approved leave covers the local date.
- Database function `private.send_prime_attendance_reminders(p_phase text)` uses a deterministic day/phase UUID for `source_id`, combined with notification kind and recipient to avoid duplicates on retries.

## Delivery and navigation

The function inserts records into `public.employee_notifications`; the existing trigger queues Web Push messages, and the existing `prime-hr-background-push` job dispatches them. The Employee Mobile App inbox displays them. Its **Open Attendance** control routes to the Attendance screen. With phone notifications enabled and the installed PWA/OS supporting Push, system banners can appear even if the app is closed; actual device delivery depends on Push subscription and the operating system. Do not claim delivery for unregistered devices. The app supports iOS 16.4+ only when added to Home Screen and notifications have been allowed.

## Operations and safety

- The new reminders do **not** create, modify or close attendance records; employees must still mark GPS-backed Check In / Field Duty / Check Out themselves.
- No existing staff or attendance records were edited during deployment.
- The function is in the private schema and execute rights are withheld from anonymous and authenticated app users.
- The migration is `prime_hr_daily_0830_1700_attendance_push_reminders`.
- Inspect scheduled jobs via `select jobname,schedule,active from cron.job where jobname like 'prime-hr-daily-%';`.
- Inspect future execution records in `cron.job_run_details` and push delivery results in `public.push_delivery_queue`.
- The first cron execution after setup provides the real end-to-end server confirmation; live iPhone receipt remains to be tested on a subscribed device.
