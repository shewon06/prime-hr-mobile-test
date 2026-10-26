# PRIME HR NEXT LEVEL — PRIME Agri Business & Plantations

This repository supersedes the standalone installation test. It contains cloud-connected frontend source for an online HR employee and management application.

## Coded modules
- User registration/login with HR approval and role-based access
- Employee master, branch register, CSV export
- Foreground GPS attendance check-in/out with server-side time and Sri Lanka work dates
- Admin/HR GPS attendance map links and location CSV report
- Leave applications and HR approvals
- Recruitment register, company notices and employee acknowledgements
- Sales KPI, assets and HR letter issuance register
- Mobile-friendly Progressive Web App (PWA)

## GPS privacy behavior
The first time an ACTIVE, LINKED employee opens the app, it shows a clear description and **Allow Location Access** button. The browser/phone then asks for explicit consent; the website cannot grant itself permission. A fresh GPS position is collected ONLY when the employee taps Check In / Check Out. HR/Admin can view that snapshot, the server timestamp, and its reported accuracy. There is no continuous background tracking, no watchPosition, and no location history collection outside attendance actions. Without GPS permission or if reported accuracy exceeds 1 km, attendance submission is rejected; a controlled manual correction workflow remains to be developed. Phone/browser GPS coordinates can be spoofed, so this is not guaranteed proof of physical presence.

## Supabase project CREATED and core database activated (26 Oct 2026)
- Project name: Prime HR Next Level
- Project reference: qkhcojaouueypkgrzlov
- Region: ap-south-1
- Status: ACTIVE_HEALTHY at setup
- schema.sql applied as migration: prime_hr_next_level_initial_schema
- Extra foreign-key indexes applied as migration: prime_hr_foreign_key_indexes
- Frontend config.js now points to this project using a PUBLIC publishable key.
- RLS enabled on all 13 application tables and 31 policies added.
- Database starts with zero registered accounts and no private staff records.
- No FIRST ADMIN registered/approved yet; production readiness and company-wide rollout still pending.

## Important: Backend activation is not FULLY finished
The Supabase project and initial schema are now online, and config.js contains the correct public project URL and publishable key. The website can display a login/signup screen once Netlify deploys the GitHub changes. No administrator has been registered or approved. Real employee access and data collection must wait for testing, privacy/retention safeguards and company authorization.

Deployment checklist:
1. DONE: organisation project created ($0/month quoted for initial Free Plan), schema applied and public connection configured.
2. Verify privacy notice, location consent, HR access scope, data retention/deletion period and applicable employment obligations.
3. DONE: schema applied. NEXT: perform RLS integration checks with at least two separate staff users and separate HR/Admin accounts.
4. DONE: public Supabase project URL and publishable key configured in config.js. NEVER upload secret/service_role keys, DB passwords or employee files to a public repository.
5. Configure email verification, secure SMTP, proper site URLs, MFA for admins and backup/incident response.
6. Create/verify first administrator's account and authorize it in Supabase SQL Editor using a company-approved verified email:

    UPDATE public.profiles SET role='admin',is_active=true
    WHERE email=lower('FIRST_ADMIN@YOUR_COMPANY.COM');

7. Activate approved staff accounts, create matching employee records and test the app before any real company-wide rollout.

## Current limitations and remaining work
- Payroll (EPF, ETF, APIT, payslips and bank exports) is NOT implemented.
- Appointment letter templates/auto generation need the exact approved company clauses; only a metadata Letter Register exists.
- Bulk employee CSV import is not implemented, although CSV export exists.
- Formal GPS retention deletion automation, audit reports, device attestation, spoof detection, geofencing, and manual attendance adjustment need implementation.
- Native Play Store / App Store packages and push notifications are not implemented.
- The official PRIME gold logo is not included; the app currently uses a P placeholder.

## Hosting
Code is hosted in GitHub at shewon06/prime-hr-mobile-test. If a Netlify site already imports this repo, pushes to main can trigger automatic builds. The exact active Netlify/custom-domain URL must be checked in the user's Netlify dashboard. Existing WON MART hosting is not modified. The service worker caches ONLY public app files, never employee records or API data.

This is a development release. Do not collect actual GPS or HR personal records until the backend, permissions, data handling, backups, and security checks are finished.
