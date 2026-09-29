# First Bio Genetics LIMS

Order entry, consents, results, instrument imports, send-outs and billing export for First Bio Genetics.
Frontend: Vite (vanilla JS). Backend: Supabase (Postgres, Auth, Row Level Security).

**Do not put real patient data in this system until every item in "Before go-live" is done.**

## 1. Supabase (HIPAA)

1. Put the Supabase organization on the **Team plan** (or Enterprise).
2. Request the **HIPAA add-on** and sign the **BAA** from the dashboard.
3. Create a project for production (US region). Mark it **High Compliance**, and turn on
   **Point in Time Recovery**, **SSL enforcement** and **network restrictions** as Supabase's HIPAA guide requires.
4. Create a second, non-HIPAA project for testing with made-up data (optional but recommended).

## 2. Database

Open **SQL Editor** in the project, paste `supabase/migrations/0001_init.sql`, and run it once.
Then do the same with `supabase/migrations/0002_audit.sql` (complete audit trail) and `supabase/migrations/0003_roles.sql` (lab roles).
It creates the tables, security rules, audit log, accession numbering and the lab profile
(CLIA 03D2287865, Dr. Guihua Cao, Mesa address) shown on reports.

## 3. Authentication settings

In **Authentication → Settings / Providers**:

- Site URL: your portal address (for example `https://portal.firstbiogenetics.com`). Add it to Redirect URLs too.
- Email provider: on, with **Confirm email** on.
- Minimum password length: **12**. Turn on leaked-password protection if your plan has it.
- MFA: **TOTP enabled**. The app requires every user to set up an authenticator app, and the database
  refuses to return patient data to any session that hasn't passed two-step verification.
- Set up custom SMTP so emails come from your domain. Auth emails contain no patient information.

## 4. Lab staff accounts

Clinics register themselves from the sign-in page. Lab staff are added by an administrator:

1. **Authentication → Users → Add user** (email + temporary password; tick "Auto confirm").
2. In the SQL editor:

```sql
insert into public.profiles (user_id, role, name, email)
select id, 'lab', 'Full Name', email from auth.users where email = 'person@firstbiogenetics.com';
```

(Once `manage-users` is deployed, use the **Users** page instead of SQL.)

To add another user to an existing clinic, do the same with `role = 'clinic'` and the clinic's id
(find it with `select id, data->>'name', data->>'acct' from clinics;`):

```sql
insert into public.profiles (user_id, role, clinic_id, name, email)
select id, 'clinic', 'c1002', 'Full Name', email from auth.users where email = 'staff@clinic.com';
```

Each person sets up their authenticator app the first time they sign in.

## 5. Run locally

```powershell
cd C:\Users\sdaas\fbg-lims
copy .env.example .env.local   # then paste your project URL and anon key into .env.local
npm install
npm run dev
```

## 6. Deploy

The app is static files; the browser talks directly to Supabase, so patient data never passes
through the web host. Confirm with counsel whether your host needs a BAA; if in doubt, use a host that signs one.

Netlify: connect the GitHub repo, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
as environment variables, and deploy. `netlify.toml` sets the build and strict security headers.

## 7. Result alerts (email, text, fax)

When the lab releases results, the portal queues one alert per channel the clinic chose and calls the
`send-alerts` Edge Function, which sends them and records the outcome in **Notification log**.
Emails and texts contain no patient information. Faxes carry the full PDF report with a confidentiality notice.

**Deploy the function:** Supabase → **Edge Functions → Deploy a new function → Via editor**. Name it `send-alerts`,
paste `supabase/functions/send-alerts/index.ts`, and deploy. In the function's settings, turn **off**
"Enforce JWT verification"; the function checks the caller itself (signed in, two-step verified, lab staff).

**Add secrets:** Edge Functions → **Secrets**. Each channel works as soon as its secrets exist; until then its alerts
show "Failed: … isn't set up" and can be retried later.

| Secret | Value |
|---|---|
| `PORTAL_URL` | The portal address, e.g. `https://portal.firstbiogenetics.com` |
| `RESEND_API_KEY` | API key from resend.com (after verifying your sending domain) |
| `ALERT_FROM` | e.g. `First Bio Genetics <results@firstbiogenetics.com>` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | From the Twilio console |
| `TWILIO_FROM` | Your Twilio number, e.g. `+14805551234` |
| `FAX_EMAIL_TEMPLATE` | SmartFax's email-to-fax address with `{number}` for the 10-digit fax number (or `{number1}` for 1 + 10 digits), e.g. `{number}@fax.example.com` |
| `FAX_FROM` | The sender address authorized on your SmartFax account |
| `FAX_SUBJECT`, `FAX_BODY` | Optional; some fax services use the subject or body for the cover page |

Vendors: faxes contain PHI, so the email service that carries them (Resend) and SmartFax both need signed BAAs.
US business texting requires A2P 10DLC or toll-free number registration with Twilio before messages are delivered.

## 8. Audit log

Lab staff see **Audit log** in the menu. It lists every sign-in and sign-out, every view of a patient, order,
report or requisition, every create, change (with the fields that changed) and deletion, every print and file export,
every alert sent, and every change to a user's access. Filter by date, person, activity or record, and export to CSV.
Orders and patients have an **Access history** button that opens the log for that record.

The log can only grow: the database refuses edits, deletes and truncation, even from administrators using the SQL editor.
Changes made in the SQL editor are recorded as "System or administrator".
Failed sign-in attempts are recorded by Supabase itself under **Authentication → Logs**.
Keep audit records for at least six years; don't delete the Supabase project without exporting them first.

## 9. Roles and users

Lab staff can hold one or more roles:

| Role | Can do |
|---|---|
| Admin | Everything, including users, roles, settings and approving clinics |
| Scientist | Receive specimens, run instruments, enter, verify and release results, send-outs, alerts |
| Reporting | Enter requisitions, receive specimens, report out results a scientist has verified, alerts |
| Sales | View, add and edit clinics; enter requisitions. No result values |
| Billing | Claims and billing export; edit patient insurance. No result values |
| Read-only | View everything, including results, billing and the audit log |

The database enforces these rules, not just the screens. Results can only be entered or changed by a scientist or admin,
and reporting staff can only release results a scientist has verified.

**Deploy the user service:** Supabase → Edge Functions → Deploy a new function → Via editor. Name it `manage-users`,
paste `supabase/functions/manage-users/index.ts`, deploy, and turn off "Enforce JWT verification" (it checks that the caller is an admin).
Also redeploy `send-alerts` with the updated file.

**Manage people:** admins open **Users** to add lab staff or clinic users, change roles, reset a password or
two-step verification, and deactivate people who leave. New users get a temporary password, set up two-step
verification, and then must choose their own password. All of it is recorded in the audit log.

## Before go-live

- [ ] Supabase Team plan, HIPAA add-on, signed BAA, project marked High Compliance
- [ ] BAA or counsel sign-off for the web host
- [ ] Consent and agreement wording reviewed by counsel
- [ ] Definitive cutoffs (Instruments → Definitive cutoffs) replaced with validated values, urine and oral fluid
- [ ] Blood reference ranges matched to the reference lab's reports
- [ ] Molecular target lists matched to the reference lab's validated panels
- [ ] CPT codes, units and G-code drug-class mapping confirmed by the billing company
- [ ] Lab NPI and Tax ID entered in Lab settings
- [ ] BAAs signed with Resend and SmartFax; Twilio number registration approved
- [ ] Test email, text and fax received for a made-up patient
- [ ] Every person's roles reviewed; former staff deactivated
- [ ] Someone assigned to review the audit log on a regular schedule (for example, monthly)
- [ ] End-to-end test in the test project with made-up patients, signed off by the lab director
- [ ] Staff trained; paper requisitions kept as a fallback for the first weeks

## Not in this version yet

- Reading insurance cards automatically (photos are captured and stored). Needs a BAA-covered AI service.
- Direct instrument connections: C560 host query (ASTM/HL7) and a MultiQuant export folder watcher. Needs the C560 LIS spec from HORIBA.
- Automatic claim delivery to the billing company over SFTP.
- Inviting additional clinic users from inside the app (use section 4 for now).
- Warning when two people edit the same record at the same moment (last save wins today).
