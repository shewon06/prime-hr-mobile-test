# PRIME HR NEXT LEVEL — Background Web Push

## Status (27 October 2026)
Backend Web Push dispatch is deployed as Supabase Edge Function `prime-push-dispatch` (version 2). Its scheduled invocation runs once per minute using Supabase Cron + pg_net; verified HTTP 200 for an empty queue. New employee notification database records enter a delivery queue. Employee PWA includes Push API subscription and a `push` event handler in its service worker. Existing in-app notices and leave decisions continue to work.

**End-to-end phone push delivery has not been verified:** at setup time the database had 0 opted-in push devices. Devices must enable alerts before future events can be delivered.

## Enable push notifications on each employee's own phone
1. Open the live, HTTPS Employee App with an active staff account.
2. Android: install PRIME HR to Home Screen via Chrome (recommended). iPhone/iPad: iOS 16.4+; open in Safari and Add to Home Screen, then launch that installed app.
3. Go to **Alerts** and tap **Enable Phone Alerts**. Accept the ordinary system permission prompt. This action creates a browser Push API subscription that is stored against this employee's account using Row Level Security.
4. The app should display **Background Push Enabled**; leave the app and test with a **new** real HR Leave Approved / Rejected action or a newly published HR Notice (be aware a company notice notifies all enrolled employees).
5. The push receiver opens `employee.html#alerts` when tapped; the inbox also persists any missed notifications.

Permissions cannot be granted silently. Staff can disable notifications through phone/browser Settings at any time. Push delivery is not guaranteed by iOS/Android power policies, connectivity, or third-party push gateways. We do not continuously track phone locations or send them with push alerts.

## Security architecture
- Browser config includes **only** the VAPID public key and Supabase publishable key.
- VAPID private key and server-only dispatch token are stored in a service-role-only `push_server_config` database table with RLS enabled and no grants to anon/authenticated.
- `push_subscriptions`: only the active signed-in user can create/read/change/remove subscriptions tied to their own account.
- `push_delivery_queue` is server-only. A trigger on `employee_notifications` inserts one queue entry per new leave/notice event. Cron invokes the dispatcher every minute using a secret header derived server-side from the locked table; public clients cannot invoke the queue processor successfully.
- The server only contacts HTTPS push-provider endpoints (Chrome/FCM, Firefox/Mozilla, Safari/Apple, Windows Push gateways). Stale endpoints (404/410) are removed, and failed deliveries have bounded retries.
- Do not commit private key, dispatch token, HR records or service-role keys into source files.
- Notification bodies might be visible on the phone lock screen. Avoid entering confidential details in public HR Notices.

## Deployment
- Push sender code is in `supabase/functions/prime-push-dispatch/index.ts` and is already deployed to the connected Supabase project.
- Frontend source is in `employee.js`, `sw.js`, `employee.html`, and the **public-only** VAPID key in `config.js`; Cloudflare Pages must publish the latest `main` branch.
- Edge Function has `verify_jwt=false` *only because* it requires a long, server-only custom dispatch token; a missing/invalid token returns HTTP 401.
- Do not run the new configuration/bootstrap SQL from scratch on an already configured project without checking the existing keys and Cron jobs. Rotating VAPID keys invalidates existing device subscriptions.

## Verification
- Service worker v13 or later and the latest published employee frontend are required.
- Supabase database: verify `push_subscriptions` count increases after a staff device enables notifications; do not read or expose endpoints/keys unnecessarily.
- Cron: verify `cron.job_run_details` has successful rows and `net._http_response` shows HTTP 200.
- Test with an actual subscribed Android and iPhone separately; browser-specific permission and battery behavior differs.
- A successful Edge dispatch response only means the push provider accepted the message, not that the OS displayed it.
