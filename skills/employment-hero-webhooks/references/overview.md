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
| Payload format and event names | Not published on the webhook pages |
| Timestamp tolerance | None |
| Test vector | None |

## Handling Unknown Payloads

Because the payload isn't documented, the examples:

1. Verify the signature over the raw bytes.
2. Parse the JSON and log its top-level keys.
3. Use a SHA-256 hash of the raw body as a dedupe key, so a retried delivery is recognised without relying on a field name.

Once you've seen a real delivery, add dispatch on the field that names the event and switch the dedupe key to the event's ID if it has one.

## Idempotency

Retries (up to 3) can deliver the same body more than once. Store the dedupe key and ignore repeats.
