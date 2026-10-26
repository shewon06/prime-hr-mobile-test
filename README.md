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

## Important: Backend activation is NOT finished
The connected Supabase account currently has ZERO projects. The Supabase Project URL and public publishable key in config.js are placeholders. This site will show a configuration screen, NOT a fake or local test dashboard, until the database is created and securely configured.

Deployment checklist:
1. Select the Supabase organisation, review project cost, and create a company-approved project.
2. Verify privacy notice, location consent, HR access scope, data retention/deletion period and applicable employment obligations.
3. In a fresh project, review/apply schema.sql with SQL Editor/migration. Check Supabase security advisors and RLS with at least two staff users and separate HR/Admin users.
4. Put only the Supabase PROJECT URL and PUBLISHABLE key in config.js. NEVER upload secret/service_role keys, DB passwords or employee files to a public repository.
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
