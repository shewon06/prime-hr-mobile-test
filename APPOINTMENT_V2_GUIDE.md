# PRIME HR NEXT LEVEL — Updated Appointment Builder V2

This uses **new updated appointment letter templates**, not the six original Word samples.

## Import the 15 updated position templates (Admin)
1. Open **Appointment Generator**.
2. Click **Download Template Sheet**; it provides 15 blank rows.
3. Fill one Excel row per position with columns: template_name, designation_match, language (en, si, or ta), subject, body.
4. Copy the complete updated HR-approved subject and body into the workbook. Preserve common clauses and position-specific annexures. Do not invent terms.
5. Upload the one Excel workbook with **Import Template Library**.
6. New templates stay as **draft**; review and approve each through **Letter Register** before generating letters. Existing templates are never overwritten by the import.

## Manual appointment
Choose an active employee, an approved role template, document number, letter date and verified effective appointment date. The system fills available Staff Master information but never assumes joining date is the appointment effective date. Create an unsigned draft, preview in Letter Register, and approve/issue separately.

## Bulk generation: 15 or more employees
1. Click **Download 15-Row Excel Template**.
2. Fill one row per employee. Required: staff_code, letter_date, effective_date. If template_name is blank, there must be exactly one approved matching designation template. document_no is optional, but must be unique; an ID is generated if omitted.
3. Optional row-specific information: nic, address, basic_salary, vehicle_allowance, fuel_allowance, monthly_target, notes.
4. Upload one Excel/CSV file and click **Validate / Preview**. Correct every error.
5. Select **Generate Validated Drafts** to write 1–100 unsigned appointment drafts in one batch. No silent partial import, auto-approval or auto-issuance.
6. View, print or Save as PDF, approve and record issuance in Letter Register.

## Placeholders in official template text
employee_name, staff_code, designation, branch, date, letter_date, effective_date, joined_on, company_name, document_no, nic, address, basic_salary, vehicle_allowance, fuel_allowance, monthly_target, notes.

Surround a placeholder with double curly braces, for example the employee_name field in the official template. Unknown or missing fields block generation rather than silently supplying guessed values.

## Safeguards and limitations
- No appointment wording, employee records, NICs or salaries are committed to public GitHub; data stays in existing private Supabase tables.
- This version generates document-text drafts and browser Print / Save as PDF previews. **Bespoke Word/DOCX formatting of the 15 updated source letters is not replicated** until the actual official source documents are supplied and verified.
- Admin checks the full unchanged approved wording and authorizes issuance; the system never signs documents automatically.
- Existing Supabase RLS restricts template editing and appointment approvals to Admin, and draft generation to HR/Admin.
