// Developer guide for a partner lab's LIMS. The portal fills in the endpoint and the partner's name when it's downloaded
// (Partner labs > Download developer guide); docs/partner-api.md is the same text with placeholders.
export function partnerGuide({ url = "https://<project>.supabase.co/functions/v1/partner-api", partner = "<Partner lab>", lab = "First Bio Genetics", phone = "", email = "" } = {}) {
  return `# ${lab} order and results interface

Developer guide for **${partner}**. Your LIMS sends test orders to ${lab} (FBG) and collects the released reports, with
nothing retyped on either side. Everything is JSON over HTTPS.

## Connection

- **Endpoint:** \`POST ${url}\`
- **Headers:** \`Content-Type: application/json\` and \`Authorization: Bearer <your key>\` (or \`x-api-key: <your key>\`)
- **Body:** either a message in your integration package format (with \`message_type\`, next section), or a JSON object
  with an \`action\` field (sections 1-6). Both work on the same address; use whichever suits your LIMS.
- **Your key** is created by FBG and given to you once. Store it like a password (for example in AWS Secrets Manager).
  If it's ever exposed, tell FBG; they deactivate it and issue a new one.
- Every response is JSON. Errors have an \`error\` message (or an \`errors\` list for a rejected order) and an HTTP status:
  400 bad request, 401 missing/unknown key, 403 interface turned off, 404 not found, 409 conflict, 422 order failed
  validation, 500 FBG-side problem (safe to retry).

## Using your LIMS-to-LIMS integration package

FBG accepts the messages in your integration package as written, so your LIMS can use its own format.

**Orders: \`lab_order\`.** POST your \`lab_order\` message to the endpoint above (appending \`/api/lab-orders\` to the address
also works). Send \`X-Message-Id\` if you like; \`message_id\` in the body is used first. FBG answers with your
\`order_ack\`:

\`\`\`json
{ "message_type": "order_ack", "message_id": "MSG-20261029-000001", "external_order_id": "M1-ORD-100001",
  "accession_number": "M1TOX-20261029-0001", "their_accession_number": "FBG261029-1042",
  "status": "accepted", "received_datetime": "2026-10-29T17:31:00.000Z", "errors": [] }
\`\`\`

- \`status\` is \`accepted\`, \`duplicate\` (same \`external_order_id\` sent before: nothing new is created, and the original
  FBG accession is returned) or \`validation_error\` (HTTP 422; nothing is created; \`errors\` lists \`field\`, \`code\` and
  \`message\`, with codes such as \`UNKNOWN_TEST_CODE\`, \`INVALID_NPI\`, \`INVALID_DATE\`, \`REQUIRED\`).
- Your \`accession_number\` and \`external_order_id\` are stored on the FBG order and returned on every acknowledgment and
  result. \`their_accession_number\` is FBG's accession (it appears on the report).
- \`specimen.specimen_id\` is treated as the tube barcode, so FBG scans your label at receiving.
- \`billing.billing_type\`: \`client_bill\` bills ${partner}; \`insurance\` needs \`billing.insurance\` with \`type\`,
  \`payer\`, \`member_id\` (and \`group\`), plus at least one diagnosis code; \`self_pay\` bills the patient.
- \`patient.sex\` accepts M, F or U. \`priority\` \`stat\` is flagged STAT. \`chain_of_custody\` and \`ordering_facility\` are
  recorded on the order.
- **Test codes:** send your own \`test_code\` values. FBG maps each one, once, to FBG tests or toxicology profiles: a urine
  screen, a screen with reflex to LC-MS/MS, and/or specific definitive drugs (urine or oral fluid). A code can stand for a
  panel. Send FBG your test code list and what each should include before testing starts. An unmapped code is answered
  with \`UNKNOWN_TEST_CODE\`.

**Cancellations: \`cancel_order\`.** POST your \`cancel_order\` message. FBG answers \`cancel_ack\` with \`status\`
\`received\` (FBG staff cancel it if testing hasn't started), \`too_late\` (HTTP 409, already resulted or rejected) or
\`not_found\` (HTTP 404).

**Results: \`lab_result\`, sent to your webhook.** Give FBG your results address (\`POST /api/lab-results\`) and the bearer
token for it (through a secure channel, not email). FBG sends each report the moment it's released:

- Headers \`Authorization: Bearer <your token>\`, \`X-Source-System: fbg-lims\`, \`X-Message-Id: FBG-<FBG accession>-v<version>\`.
- Body: your \`lab_result\` with \`external_order_id\`, \`accession_number\` (yours), \`their_accession_number\` (FBG's),
  \`status\` (\`final\`, \`corrected\` or \`rejected\`), \`result_datetime\`, \`patient\`, \`performing_lab\` (FBG's name and
  CLIA), and \`tests\`: one entry per test code you ordered, each with discrete \`results\`.
- Each result has \`analyte_code\`, \`analyte_name\`, \`value\` (Positive / Negative for drug tests, or the measured value),
  \`measured_value\` (LC-MS/MS concentration), \`units\`, \`cutoff\`, \`flag\` (\`N\` normal, \`A\` abnormal/positive, \`H\`/\`L\`
  high/low, \`C\` critical), \`method\` (\`Immunoassay\`, \`LC-MS/MS\` or \`Specimen validity\`), \`reference_range\`, and for
  confirmations \`interpretation\` (medication consistency) and \`illicit\`.
- \`report_pdf_base64\` is the signed FBG report (identical to what FBG's clients receive), with \`report_pdf_filename\`.
- A corrected report is sent as a new message with \`status\` \`corrected\` and a higher \`report_version\`; it replaces the
  earlier result. A rejected specimen is sent with \`status\` \`rejected\`, \`rejection_reason\` and \`recollect\`.
- Answer with any 2xx status (your \`result_ack\` is fine). Anything else, or no answer, is retried every 5 minutes. An
  answer with \`status: "rejected"\` or a non-empty \`errors\` list is treated as not received and shown to FBG staff.
  Use \`X-Message-Id\` to ignore a result you have already stored.

If you'd rather collect results than receive them, use \`results.pull\` and \`results.ack\` below instead.

Recommended setup on AWS: a Lambda (or any scheduled job) that sends new orders as they're created; for collecting
results, run \`results.pull\` every 5 minutes.

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

## Answers to your open questions

1. **JSON orders over HTTPS?** Yes, in your format (\`lab_order\`) or FBG's (\`order.create\`).
2. **Your accession as the placer/master accession?** Yes. It's stored on the order and returned on every ack and result.
3. **Will FBG generate its own accession?** Yes (format \`FBGYYMMDD-NNNN\`), returned as \`their_accession_number\`.
4. **Where is your accession stored?** On the FBG order as the partner accession, next to your \`external_order_id\` and
   \`message_id\`; FBG staff see your order number on the order and can search by it.
5. **Order endpoint?** \`POST ${url}\` (optionally with \`/api/lab-orders\` appended). FBG gives you a sandbox key first.
6. **Authentication?** \`Authorization: Bearer <API key>\`; one key per system, created by FBG, revocable at any time.
7. **Response to an order?** Your \`order_ack\`, synchronously (see above).
8. **How are results sent back?** Pushed to your \`/api/lab-results\` webhook as \`lab_result\`, with retries; or pulled by you.
9. **Discrete analyte results?** Yes, every analyte on the report, with flags, units, cutoffs and method.
10. **PDF reports?** Yes, base64 in \`report_pdf_base64\`.
11. **Statuses?** Order status: Ordered, Received, In Process, Released, Corrected, Rejected, Cancelled. Results are sent
    when final: \`final\`, \`corrected\`, \`rejected\`. Preliminary and partial results are not sent.
12. **Corrected/amended results?** A new message with \`status\` \`corrected\`, a new \`message_id\` and a higher
    \`report_version\`, replacing the earlier result.
13. **Tox test and analyte codes?** You keep your test codes; FBG maps them (see "Test codes"). Analyte codes are FBG's
    analyte names in upper case with underscores (for example \`FENTANYL\`, \`NORFENTANYL\`, \`AMPHETAMINES_SCREEN\`). FBG's
    toxicology menu lists every drug, analyte, cutoff and ULOQ.
14. **Validation errors?** \`validation_error\` with \`field\`, \`code\` and \`message\` for each problem (see above).
15. **Sandbox?** Yes: a test account and key at FBG, used with synthetic patients only, until both sides sign off.
16. **Technical contact?** See below.

Toxicology details: urine presumptive screen on the Yumizen C560 (14 drugs, immunoassay) with specimen validity
(creatinine, specific gravity, pH); definitive testing by LC-MS/MS (SCIEX 4500) for urine and oral fluid. With reflex
ordered, positive screens are confirmed automatically; screen and confirmation results are reported together on one
report and as separate analytes in \`lab_result\`. Specimen requirements, containers, storage and stability: ask FBG for the
current specimen collection guide.

## Questions

${[phone && `Phone ${phone}`, email && `email ${email}`].filter(Boolean).join(", ") || "Contact First Bio Genetics."}
`;
}
