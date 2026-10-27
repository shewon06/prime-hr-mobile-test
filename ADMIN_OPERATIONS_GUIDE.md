# PRIME HR NEXT LEVEL — Admin Operations Release
**Implementation date:** 27 October 2026
**Product:** Prime Agri Business & Plantations (Pvt) Ltd
**Repository:** shewon06/prime-hr-mobile-test, main
**Deployment:** Cloudflare Pages production deployment is NOT independently confirmed.

## Implemented and connected to Supabase

| Module | Admin capability | Status |
| --- | --- | --- |
| Admin dashboard | Live employee, attendance, leave and recruitment counts; Office/Sales/Plantation distribution; pending payroll and letters | Available |
| Staff directory | Employee editing, assigned group, branch, bulk Excel upload, account provisioning and one-time passwords | Existing + expanded |
| Staff master | Admin-only export of full imported HR master data to CSV (includes salaries, NIC and bank information); HR summary CSV remains separately available | Available |
| Attendance | Check In/Out from employee app, server timestamps, location only when attendance is marked, Admin location report, date/team filters, CSV | Available |
| Field operations | Sales/customer and Plantation/site work reports, manager map view, CSV export | Available |
| Leave | Request/approve/reject, employee notifications, HR-configured annual/casual/medical entitlements, carry-forward and approved calendar-day balance view | Available |
| Payroll | Draft salary snapshot from staff master, editable manual EPF/APIT/etc amounts, computed gross/net, Admin approval, Admin mark-paid after actual external payment, print preview, CSV | **Manual pilot only** |
| Recruitment | Candidate add/edit, stage tracking, stage counts and CSV export | Available |
| KPI | Monthly staff target and achievement, edits via upsert, current-month summary and CSV | Available |
| Assets | Add, assign, edit/reassign, repair/return status, status summary and CSV | Available |
| HR Notices | HR publication and employee notification inbox | Available |
| Appointment letters | Admin exact-text template editing, language/designation match, versioning and approved status; bulk unsigned drafts by employee code; Admin approve and mark issued; print preview; atomic legacy register sync | **Requires verified original templates** |
| Employee mobile app | Login, attendance with location consent, leave, HR notices, alerts/background push enrollment | Existing (not modified by Admin module work) |

## Admin workflows

### 1. Employee onboarding
Open **Staff Accounts & Excel**. Download the Excel template, enter staff_code, full_name, designation, branch and staff_group (office / sales / plantation). Import and securely distribute each employee's credentials. HR can edit an existing employee in **Employees**. Only Admin may download **Full Staff Master CSV**, which contains confidential HR fields and must be stored securely.

### 2. Payroll
Open **Payroll**, select a staff member and month. Basic pay and vehicle allowance are loaded from the employee master as editable starting values. Fill all other amounts manually and **Save Draft**. Admin reviews and **Approves**; approved financial components are locked in the database. Only Admin can then **Mark Paid**, and only after a real payment takes place outside PRIME HR. Nothing in this system initiates salary disbursement or applies rates automatically. **Payslip Preview** shows a clear draft/approved warning.

### 3. Leave balances
HR enters approved entitlement per employee, type and year. The system calculates used days from APPROVED leave requests counting all calendar dates inclusively, including any overlap across the selected year. It does not automatically exclude weekends/public holidays, calculate first-year pro-rata benefits, or apply any Sri Lankan statutory minimum. These rules and source dates must be approved before production use.

### 4. Letters
In **Appointment / HR Letters**, Admin pastes the EXACT official, company-approved wording for each position; do not paraphrase or drop any common clauses. Supported placeholders are:
- \`{{employee_name}}\`, \`{{staff_code}}\`, \`{{designation}}\`, \`{{branch}}\`
- \`{{date}}\`, \`{{joined_on}}\`, \`{{company_name}}\`, \`{{document_no}}\`

Admin must explicitly mark wording approved. HR chooses the approved template, a unique document-number prefix and 1–100 employee staff codes. The system creates UNSIGNED draft snapshots, not issued letters. Admin approves each draft; once actually issued, Admin marks it issued and a database trigger writes the existing letter register in the same transaction. Print Preview is an HTML/PDF-by-browser layout, **not** a full-fidelity replacement for the original Word appointment templates or an electronic signature system.

Original appointment letters previously supplied by the user (Zonal, Regional and other position-specific files) have NOT yet been imported as approved wording into the online database. Do not send generated letters to staff until exact clauses, line breaks, joining dates, benefits, signatures and letterhead have been checked against those originals and cleared by HR/legal.

### 5. Reports
Attendance, all staff master, payroll, leave balances, recruitment, KPI, assets and field work screens offer CSV downloads. Excel can open these files. CSV escaping includes formula-injection guards. Respect authorized access to personal salary, banking and location data.

## Security
- Employee role cannot query HR payroll, templates or generated draft records.
- HR can create salary drafts and prepare letter drafts.
- Admin-only backend transition guards approve salary runs, confirm payment, approve or issue letters.
- Issued letter drafts and approved salary amounts are locked.
- Database Row Level Security protects the new data tables.
- The Admin full-master export requires explicit confirmation of the sensitivity of NIC, bank and salary information.
- Supabase security advisor (27 Oct) flagged leaked-password protection as disabled: enable when supported at https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- Supabase advisor's no-policy INFO entries for push_server_config and push_delivery_queue are intentional: these are server-only tables with zero public/authenticated grants.

## Production acceptance still required
1. Apply exact, verified original position-specific appointment clauses/templates and branding/print layout. No automatic signatures.
2. Obtain written Payroll/HR approval of EPF, ETF, APIT, overtime, payroll leave calculation and first-year entitlements; implement the compliant calculators, holidays, bank export and reconciliation.
3. Review asset handover receipt, payroll audit logs, two-person approval requirements, retention, MFA and employee document acknowledgments.
4. Conduct real Admin/HR mobile-desktop tests for create/update/approve/issue, attendance, leave balance, KPI and CSV. No live test employee was added by this release.
5. Verify Cloudflare Pages is connected to GitHub main and has deployed at least service-worker cache \`prime-hr-shell-v15-20261027\`. GitHub updates alone do not guarantee live deployment.

## Actual database changes applied
- \`prime_hr_payroll_draft_approval_controls\`
- \`prime_hr_leave_entitlements_and_approved_letter_templates\`
- \`prime_hr_atomic_letter_issuance_register\`

Schema reference: \`supabase/sql/ADMIN_OPERATIONS_SCHEMA.sql\`. 
