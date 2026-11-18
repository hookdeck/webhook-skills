# Employment Hero Webhooks Overview

## What Employment Hero Sends

Employment Hero is an HR, payroll and employee-management platform. Its webhooks notify your endpoint when something you subscribed to changes in the organisation. You register them in the Developer Portal under **My Webhooks**.

**Plan:** "Webhooks access is currently available on a Platinum subscription and above."

## What's Documented

| Topic | Documented? |
|---|---|
| Signature scheme | Yes: `X-EmploymentHero-Signature`, base64 HMAC-SHA256 of `<timestamp>.<body>`, base64-decoded secret key |
| Timestamp header | `X-EmploymentHero-Timestamp`; its format isn't stated |
| Success response | HTTP `200` |
| Retries | "it will be retried for a maximum of 3 times" |
| HTTP method | Not stated ("trigger an HTTP request to the URL") |
| Event names | Yes: [Webhook Events](https://developer.employmenthero.com/api-references/webhook/webhook-events.md) lists about 40, such as Employee Created and Leave Request Approved |
| Payload samples | Not published (the per-event data pages aren't available) |
| Timestamp tolerance | None |
| Test vector | None |

## Events

From Employment Hero's [Webhook Events](https://developer.employmenthero.com/api-references/webhook/webhook-events.md) page:

| Area | Events |
|---|---|
| Employees | Employee Created, Employee Onboarded, Employee Updated, Employee Offboarding |
| Leave | Leave Request Created, Updated, Approved, Declined, Deleted |
| Bank accounts | Employee Bank Account Created, Updated, Deleted |
| Employment history | Employment History Created, Updated, Deleted |
| Timesheets | Timesheet Entry Created, Updated, Deleted |
| Certifications | Certification Created, Updated, Deleted, Archived; Member Certification Created, Updated, Approved, Declined, Expired, Archived, Deleted |
| Custom forms | Custom Form Response Submitted, Partially Approved, Approved, Declined |
| Goals | Goal Created, Updated, Deleted; Key Result Created, Updated, Deleted |

The page gives title-case names only, not the identifiers that appear in a payload.

## Handling Unknown Payloads

Because no payload sample is published, the examples:

1. Verify the signature over the raw bytes.
2. Parse the JSON and log its top-level keys.
3. Use a SHA-256 hash of the raw body as a dedupe key, so a retried delivery is recognised without relying on a field name.

Once you've seen a real delivery, add dispatch on the field that names the event and switch the dedupe key to the event's ID if it has one.

## Idempotency

Retries (up to 3) can deliver the same body more than once. Store the dedupe key and ignore repeats.
