# PRIME HR NEXT LEVEL — Admin Web + Employee Mobile

Built for PRIME Agri Business & Plantations (Pvt.) Ltd.

**Admin Web Portal:** application root `/`
**Employee Mobile Portal:** `/employee.html` (PWA installed on Home Screen opens here)

## Employee Number login — no staff email needed
All employee accounts must be created by an approved Administrator. Employees have NO self-registration or email entry. The admin provisions the employee number (case insensitive), phone, name, designation, branch and other HR master data. Password login is internally implemented with Supabase Auth and a non-deliverable synthetic email; that internal technical identifier is never requested from employees.

Approved admins use their existing email/password to open the Web Admin portal.
Staff use their EMPLOYEE NUMBER and PASSWORD in the Mobile App.

## Admin Excel Import
1. Open the Admin web address (root of your Netlify-hosted site) and sign in as Admin.
2. Choose **Staff Accounts & Excel**.
3. Download the template, or import an existing Excel (.xlsx/.xls) or CSV file.
4. Required columns: `staff_code` (or `employee_no`), `full_name`, `designation`, `branch`.
5. Supported optional fields: `phone`, `department`, `joined_on`, `status`, `national_id`, `address`, `date_of_birth`, `emergency_contact`, `employment_type`, `bank_name`, `bank_branch`, `bank_account`, `epf_no`, `etf_no`, `basic_salary`, `vehicle_allowance`.
6. Preview staff entries and press **Import All Staff & Create Logins**.
7. The Admin-only Supabase Edge Function processes batches of 25. On first creation it returns an individually generated initial password using cryptographic randomness, displayed only once to Admin.
8. Download the new credentials CSV once and hand the correct individual password **privately** to each employee. Never share the group password list in a chat group or upload it to GitHub.
9. On an existing staff number, re-import updates master details without resetting passwords. The Admin can separately reset a staff password, disable or enable login.

Employee numbers must be 2–25 characters, letters/digits plus `_` and `-`. They are immutable once linked to an Auth identity.

The employee mobile app does not require a password change at first login. Admin generates unique passwords for employees, and staff can optionally change them from Profile. Admin can reset passwords if needed.

## Modules
- Employee Master and secure account management
- GPS Check In / Check Out, field or office mode and authoritative server time
- GPS attendance report and Maps links visible only to authorized HR/Admin
- Leave applications and HR approval/rejection
- Recruitment pipeline and branch master
- Company notices, acknowledgements
- KPI tracker, Asset Register, HR Letter Register
- Mobile-first Employee Portal with Employee Number login
- Responsive Admin Web Portal, with HR role protections

## Security
- Public web app only contains a Supabase **publishable** API key, never service_role or private passwords.
- Staff accounts are created and reset by a privileged **prime-staff-admin** Edge Function, which validates a currently verified Supabase Auth user and checks `public.profiles.role='admin'` + `is_active=true` server-side.
- Employee data stored in Supabase tables protected by RLS, not in the public GitHub repo.
- Passwords are generated with crypto secure randomness; only the hashed Supabase Auth password is stored on the server. Temporary passwords displayed to Admin are not saved to the database.
- GPS acquired through browser geolocation on check-in and check-out only, with browser consent. No continuous location monitoring.
- The staff master stores phone number only as contact information. Not used for login or public contact discovery.
- Disable public Auth signups in the Supabase dashboard for fully closed registration; the web UI does not offer public registration.
- Do an independent security/privacy review before actual personnel data, NIC, bank account or salary data is uploaded. GPS retention, legal staff notices and internal data access policy require employer approval.

## Limitations / company rollout requirements
This is a working code release, but NOT yet independently end-to-end tested with real Admin+Employee credentials. Check Edge Function execution, Auth delivery settings, Excel mapping, role isolation, actual Android/iOS GPS and Netlify deploy first. Employee password cannot be recovered; Admin resets it. Supabase email confirmation for new employee synthetic emails is bypassed by verified server-side account creation, not by public registration.

**Not finished:** compliant payroll EPF/ETF/APIT/OT calculations, monthly payslips, bank files, approved appointment-letter generation, bulk appointment print templates, automatic GPS deletion/retention and manual attendance exceptions. The letter register is currently metadata, not legal-document generation.

You can configure a company-owned domain for the Netlify site. Existing WON MART site and domain DNS were not changed.

Project: Supabase ref `qkhcojaouueypkgrzlov`, India Mumbai region. Public sources are in this repository; service-role secrets are injected by Supabase Edge environment only.


## October 27, 2026: employee session, native location and Admin UI improvements
- Admin sidebar independently scrolls vertically, including at 100% browser zoom and on short laptop screens.
- When an approved staff member logs in, the browser's **native** geolocation permission request is attempted once per employee/device. There is no custom onboarding alert. Browsers may restrict a permission prompt if it lacks user activation or if the device denied it; the **Enable Location** button remains as a browser-approved fallback. Location is recorded **only** during Check In or Check Out, never during login or in the background.
- Mobile Employee Portal removes Sign Out buttons and persists the Supabase Auth session using localStorage with automatic token refresh. Closing and reopening the app normally remains signed in; server-side token expiration, revoked access, manually cleared app/browser data, OS eviction, reinstallations or changing browsers may still require a new login. Admin can disable access. This is not a guarantee of permanent login.
- Admin can click **View Password** to reveal/copy the most recently created or reset employee password **in the current Admin browser session**. The employee's existing password **cannot** be recovered from Supabase Auth hashes. If Admin reloads or has not provisioned/reset the account this session, use **Reset Password** to issue a new one. Passwords must never be saved in plaintext in the HR database.
- Employee sessions are not continuous tracking or employee-location telemetry.


## Staff Team Attendance + Field Work Reports (27 October 2026)
The Admin staff master has a \`staff_group\` value: \`office\`, \`sales\`, \`plantation\`.
- \`office\`: normal mobile Check In / Check Out only.
- \`sales\`: mobile Check In / Check Out + separate, staff-initiated Customer Visit, Prospecting, Follow-up, Collection, Other Sales Work reports.
- \`plantation\`: mobile Check In / Check Out + separate, staff-initiated Site Visit, Field Inspection, Planting, Maintenance, Other Plantation Work reports.
- The active employee account's group is defined by Admin, not selected by the employee on the phone. Excel \`staff_group\` (alias: Team) and Admin Add/Edit screens support all three groups. When group is omitted from a NEW record, it defaults to \`office\`; when missing during re-import it does not overwrite an existing group.
- A work update captures work type, client/site name, optional notes, its server timestamp, and a single location snapshot upon explicit submission. No background location collection. HR/Admin can filter by team/date and export CSV.
- A work update requires an approved active Sales or Plantation account and an open check-in for today, enforced by RLS against the current user and attendance. The field reports table is append-only for employees; no employee edits/deletes. Admin view is read-only.
- Existing employees default to Office until an Admin assigns them to another Team.
- CSV formula injection protection applies to exported reports. Do not treat a web GPS coordinate as proof of location; phones can be spoofed.
- New DB schema applied as \`prime_hr_staff_groups_field_activity_reports\` and \`prime_hr_field_activity_requires_active_check_in\`.
- New live Admin provisioning Edge Function v5 accepts \`staff_group\` via manual creation or Excel import.


## Employee Notifications — October 27, 2026
- HR approving or rejecting a pending leave request automatically creates one private inbox alert for the employee.
- HR publishing a new Notice sends one alert to each active employee with a linked login. A notice can still be acknowledged separately from marking its inbox alert as read.
- Employee Mobile App has Notifications/Alerts, unread counts, and navigation to the affected Leave or HR Notices screen.
- Supabase database triggers create notifications; RLS restricts staff to their own alerts and permits only read-status changes.
- Supabase Realtime is configured for this table. While the app remains connected, new notifications appear automatically. A 60-second foreground poll and refresh-on-focus provide fallback.
- Phone/browser system popups can be requested by tapping **Enable Phone Alerts** in the Alerts page. Supported browsers can show these only when the app is active/running; iPhone requires a suitable installed PWA environment for system notifications.
- **App-closed push delivery is NOT implemented**: background push requires Push API subscriptions, a server-side Web Push/VAPID or FCM sender, and delivery/auth monitoring. Do not market this as working closed-app push notifications.
- Staff do not self-register. No private data is stored in the service-worker asset cache.
- The database migration `prime_hr_employee_notifications_leave_and_notices` has been applied. The notification table was added to `supabase_realtime` publication.
- Because rollout uses existing data, new alerts apply to actions taken after migration. Previously approved leave/notices remain accessible in their original screens.


## Employee Attendance UI change (27 Oct 2026)
Mobile Employee App uses a single Attendance screen with **Check In**, **Field Duty** (Sales / Plantation), and **Check Out**. Field Duty is a GPS-backed check-in with `mode=field` on the existing `hr_mark_attendance` RPC, not a separate report or page. Office Check In uses `mode=office`, and Check Out completes either attendance record. The removed separate Field Work mobile form and Work tab no longer submit `field_activity_reports`; historical reports remain in the database and HR archive. Employees can only check in once per local day; Field Duty and Check In are alternative ways to start that attendance. The GPS permission requirement and no-background-tracking disclosure stay in place. Employee notification/push features are unchanged.


## Remote employee logout after admin session revocation (28 October 2026)

- No employee-facing Logout button is added.
- The Admin can revoke a specific user's server sessions without changing/deleting the employee account.
- Public authenticated-only RPC \`prime_is_current_employee_session_active()\` tests whether the calling JWT's own \`session_id\` is still registered in \`auth.sessions\`. It exposes no other employee or session information.
- The Employee Mobile App checks this RPC on app startup, login, every 15 seconds while in the foreground, and when resumed. A revoked session is locally cleared and the login screen is displayed. A temporary network outage does not sign out valid users.
- An already-open older version of the app **cannot be remotely forced to clear its rendered screen** without loading the updated app JavaScript: reload or completely close/reopen it while online. JWTs may remain valid until their normal expiry, even after server revocation.
- Migration applied: \`prime_hr_verify_server_session_for_remote_employee_logout\`.


## Original Word Appointment Generator (Admin / HR, 29 October 2026)

The Admin workspace has an Appointment Generator screen, separate from the existing Letter Register and bulk draft workflow. The user-supplied standalone generator contains six original position-specific embedded Word templates: AGM Sales & Distribution, Zonal Sales Manager, Regional Sales Manager, Branch Sales Manager, Team Manager, Marketing Executive. The original code preserves its position-specific clauses, letterhead, annexures, salary fields, targets and DOCX downloads.

**Privacy:** The original 2.6 MB HTML includes personal source employee information and sensitive appointment terms. It is NOT included in this public GitHub repo. Instead, Admin must import the original uploaded HTML once from the new Appointment Generator page using Upload / Replace Original Generator. File is stored in the private Supabase Storage bucket prime-appointment-templates at generator/PRIME_Appointment_Letter_System.html. Storage RLS allows download only by active Admin/HR and upload/replacement only by Admin. No public Storage URL.

The saved HTML is loaded into a sandboxed iframe using allow-scripts and allow-downloads, without allow-same-origin. Additional CSP prohibits network access. DOCX files are downloaded directly to the user's device. Downloads are not automatically registered, issued or approved. HR must review documents and separately track approval and issue in Letter Register.

**Deployment notes:** One-time original HTML import is required because embedding confidential original templates in a public repository would expose private employee details. The repository code does not include those template bytes. Real-browser private upload, iframe DOCX download, and live Cloudflare deployment still need confirmation.
