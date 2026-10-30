// Developer guide for a partner lab's LIMS. The portal fills in the endpoint and the partner's name when it's downloaded
// (Partner labs > Download developer guide); docs/partner-api.md is the same text with placeholders.
export function partnerGuide({ url = "https://<project>.supabase.co/functions/v1/partner-api", partner = "<Partner lab>", lab = "First Bio Genetics", phone = "", email = "" } = {}) {
  return `# ${lab} order and results interface

Developer guide for **${partner}**. Your LIMS sends test orders to ${lab} (FBG) and collects the released reports, with
nothing retyped on either side. Everything is JSON over HTTPS.

## Connection

- **Endpoint:** \`POST ${url}\`
- **Headers:** \`Content-Type: application/json\` and \`x-api-key: <your key>\`
- **Body:** a JSON object with an \`action\` field, described below.
- **Your key** is created by FBG and given to you once. Store it like a password (for example in AWS Secrets Manager).
  If it's ever exposed, tell FBG; they deactivate it and issue a new one.
- Every response is JSON. Errors have an \`error\` message (or an \`errors\` list for a rejected order) and an HTTP status:
  400 bad request, 401 missing/unknown key, 403 interface turned off, 404 not found, 409 conflict, 422 order failed
  validation, 500 FBG-side problem (safe to retry).

Recommended setup on AWS: a Lambda (or any scheduled job) that sends new orders as they're created, and runs
\`results.pull\` every 5 minutes.

## 1. Check the connection: \`ping\`

\`\`\`json
{ "action": "ping" }
\`\`\`
\`\`\`json
{ "ok": true, "partner": "${partner}", "lab": "${lab}" }
\`\`\`

## 2. What you can order: \`catalog\`

\`\`\`json
{ "action": "catalog" }
\`\`\`
Returns the test codes you may send (\`tests\`), any mapping from your own codes to FBG's (\`code_map\`), and the
toxicology drug names accepted for definitive testing per specimen type (\`toxicology.definitive.Urine\` and
\`toxicology.definitive["Oral fluid"]\`). Fetch it when you set up the interface and whenever FBG tells you the menu changed.

## 3. Send an order: \`order.create\`

\`\`\`json
{
  "action": "order.create",
  "order": {
    "id": "PP-1001",
    "barcode": "PP1001U",
    "collected_at": "2026-10-30T09:15:00-07:00",
    "collector": "J. Smith",
    "bill_to": "insurance",
    "stat": false,
    "notes": "",
    "patient": {
      "id": "MRN-77",
      "first_name": "Ana", "last_name": "Ruiz", "dob": "1985-04-12", "sex": "F",
      "phone": "602-555-0101", "email": "", "address": "1 Main St", "city": "Mesa", "state": "AZ", "zip": "85210",
      "insurance": { "type": "Commercial", "payer": "Mercy Care", "member_id": "A123456", "group": "" }
    },
    "provider": { "name": "Lee Park", "credentials": "NP", "npi": "1234567893" },
    "icd10": ["Z79.891"],
    "tests": ["UTIABR"],
    "toxicology": {
      "specimen": "Urine",
      "screen": "reflex",
      "definitive": ["Fentanyl", "Oxycodone"],
      "prescribed": ["Oxycodone"],
      "medications_text": "Percocet 10/325 BID"
    }
  }
}
\`\`\`

| Field | Required | Notes |
|---|---|---|
| \`id\` | yes | Your order number (max 64 characters). Sending the same \`id\` again returns the existing order instead of creating a second one, so retries are safe. |
| \`barcode\` | no | The barcode on the tube you send. FBG scans it at receiving, so tubes don't need relabeling. |
| \`collected_at\` | yes | ISO 8601 date and time, with a time zone. |
| \`bill_to\` | no | \`insurance\` (default), \`client\` (bill ${partner}) or \`patient\`. |
| \`patient.id\` | recommended | Your patient ID. FBG uses it, then name and date of birth, to find the same patient on later orders. |
| \`patient.first_name\`, \`last_name\`, \`dob\` (YYYY-MM-DD), \`sex\` (M, F or X) | yes | |
| \`patient.insurance\` | when billing insurance | \`type\` is Medicare, Medicaid, Commercial, Native Health or Self-pay (other payer types are accepted as text). \`payer\` and \`member_id\` are required when \`bill_to\` is insurance, except \`payer\` for Medicare and Medicaid. |
| \`provider.name\`, \`provider.npi\` | yes | The ordering provider. A provider FBG hasn't seen before is added to your account automatically. |
| \`icd10\` | yes | One or more diagnosis codes, e.g. \`Z79.891\`. |
| \`tests\` | see note | FBG test codes from \`catalog\` (or your own codes, if FBG has mapped them). |
| \`toxicology\` | see note | For drug testing. An order needs \`tests\`, \`toxicology\`, or both. |
| \`toxicology.specimen\` | yes | \`Urine\` or \`Oral fluid\`. |
| \`toxicology.screen\` | urine only | \`none\`, \`only\` (14-drug immunoassay screen) or \`reflex\` (screen, with positives confirmed by LC-MS/MS). |
| \`toxicology.definitive\` | no | Drugs to confirm by LC-MS/MS, using the names from \`catalog\`. |
| \`toxicology.prescribed\` | no | The patient's prescribed medications. Names on the drug list drive the medication-compliance section of the report; anything else (brand names) is kept as reported. |

Accepted:
\`\`\`json
{ "ok": true, "accession": "FBG261030-1042", "status": "Ordered", "warnings": [] }
\`\`\`
Refused (nothing is created; fix and send again):
\`\`\`json
{ "ok": false, "errors": ["provider.npi must be the 10-digit NPI."] }
\`\`\`
Keep the \`accession\`: it's FBG's number for the specimen and appears on the report.

Sending an order confirms that the ordering provider's order and the patient's consent for testing (and for billing,
when \`bill_to\` is insurance) are on file at ${partner}. FBG records this on the order.

## 4. Order status: \`order.status\`

\`\`\`json
{ "action": "order.status", "id": "PP-1001" }
\`\`\`
\`\`\`json
{ "id": "PP-1001", "accession": "FBG261030-1042", "status": "Received", "received_at": "2026-10-30T18:02:11.000Z", "released_at": null, "rejected_reason": null }
\`\`\`
\`status\` is one of Ordered, Received, In Process, Released, Amended, Corrected, Rejected or Cancelled.

## 5. Cancel an order: \`order.cancel\`

\`\`\`json
{ "action": "order.cancel", "id": "PP-1002", "reason": "Duplicate order" }
\`\`\`
FBG staff are notified and cancel it if testing hasn't started. Check \`order.status\` for the outcome.

## 6. Collect results: \`results.pull\`, then \`results.ack\`

\`\`\`json
{ "action": "results.pull", "limit": 10 }
\`\`\`
Returns up to \`limit\` (max 25) reports that are ready and that you haven't acknowledged yet, oldest first. If \`more\` is
true, call again.

\`\`\`json
{
  "results": [
    {
      "id": "PP-1001",
      "accession": "FBG261030-1042",
      "version": 1,
      "status": "final",
      "patient_id": "MRN-77",
      "tests": ["UDS", "CONF"],
      "released_at": "2026-10-31T16:40:00.000Z",
      "performing_lab": { "name": "${lab}", "clia": "...", "director": "...", "address": "...", "phone": "..." },
      "report_status": "FINAL",
      "flags": { "ab": 1, "crit": 0, "inc": 1 },
      "sections": [
        {
          "title": "Urine Drug Confirmation, LC-MS/MS",
          "columns": ["Test Name", "Outcome", "Measured Result", "Cutoff", "Units", "Illicit?", "Status"],
          "rows": [
            { "group": "Opioids Confirmation, Urine" },
            { "cells": ["Fentanyl", "POSITIVE", "12.4", "<5", "ng/mL", "Yes", "Inconsistent Result"] }
          ]
        }
      ],
      "notes": ["..."],
      "signed": "Electronically signed by ...",
      "pdf": { "filename": "FBG261030-1042.pdf", "content_type": "application/pdf", "base64": "JVBERi0..." }
    }
  ],
  "more": false
}
\`\`\`

- \`pdf\` is the official report, identical to the one FBG's clients receive. Store it and show it to your users.
- \`sections\` carries the same results as data (each report table with its columns and rows) if you want to display or
  search them. \`flags\`: \`ab\` abnormal results, \`crit\` critical results, \`inc\` medication-compliance inconsistencies.
- \`status\` is \`final\`, \`corrected\` (a corrected report replaces the earlier version; it comes with a higher \`version\`)
  or \`rejected\` (no testing was done: see \`rejected_reason\`, and \`recollect\` says whether a new specimen is needed;
  \`version\` is 0).
- \`pending_report: true\` means the report file is still being finalized; it will come again on a later pull.

After saving each report, confirm it:
\`\`\`json
{ "action": "results.ack", "accession": "FBG261030-1042", "version": 1 }
\`\`\`
A report that isn't acknowledged is sent again on the next pull, so a crash between pull and save never loses a result.

## Testing

FBG can give you a key for a test account before go-live. Send a few orders with made-up patients, check they appear at
FBG, and ask FBG to release test reports so you can practice \`results.pull\` and \`results.ack\`.

## Questions

${[phone && `Phone ${phone}`, email && `email ${email}`].filter(Boolean).join(", ") || "Contact First Bio Genetics."}
`;
}
