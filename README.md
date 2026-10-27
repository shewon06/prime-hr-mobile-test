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
