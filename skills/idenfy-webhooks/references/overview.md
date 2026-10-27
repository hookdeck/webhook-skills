# iDenfy Webhooks Overview

## What Are iDenfy Webhooks?

iDenfy sends an HTTP `POST` to the URL you configure when a verification completes or
changes status. In the dashboard they are called **system notifications** and are configured
per event type. They cover KYC identity verification, company (KYB) reviews, AML monitoring,
bank, bank-card, facial-authentication and age-estimation results.

Your endpoint must answer with a `2xx` within 10 seconds. Anything else is retried the
configured number of times at a fixed interval; after that iDenfy sends a failure email (if
configured) and you can use **Resend** in the dashboard. The URL must be HTTPS with a
certificate from a trusted CA.

## Request Headers

| Header | Value |
|--------|-------|
| `Idenfy-Event-Type` | Event name, e.g. `IDENTIFICATION_AUTO_FINISHED` |
| `Idenfy-Signature` | Hex HMAC-SHA256 of the raw body (sent when the webhook has a signing key) |
| `Content-Type` | `application/json; charset=utf-8` |

## Common Event Types

| `Idenfy-Event-Type` | Triggered When | Common Use Cases |
|---------------------|----------------|------------------|
| `IDENTIFICATION_AUTO_FINISHED` | Automated KYC review completed (seconds after the user finishes) | Act on an instant result; wait for `final: true` for a definitive one |
| `IDENTIFICATION_MANUAL_FINISHED` | A human reviewer finalized the verification (always `final: true`) | Final approve/deny after a preliminary result |
| `IDENTIFICATION_EXPIRED` | The verification token or session expired | Prompt the user to restart |
| `IDENTIFICATION_CANCELLED` | The verification was cancelled by the user, system or API | Clean up pending state |
| `COMPANY_REVIEW` | A KYB company verification completed | Onboard or reject a business |
| `AML_MONITORING` | An AML monitoring user was checked, accepted or declined | Sanctions/PEP/adverse-media alerts |

Other documented events include `IDENTIFICATION`, `IDENTIFICATION_RESUBMITTED`,
`DOCUMENT_EXPIRATION`, `VIDEO_CALL_FINISHED`, `COMPANY_DELETE`, `COMPANY_AML_REVIEW`,
`COMPANY_INFO_REQUEST`, `COMPANY_EXPIRATION`, `COMPANY_SUBMIT`, `GOV_ORDERED_DOCUMENT`,
`SOS_REPORT`, `AML_MONITORING_EXPIRATION`, `BANK_VERIFICATION`, `ACCOUNT_CHECK` and
`FACIAL_AUTHENTICATION`. The handlers in `examples/` handle the six above and log the rest.

The dashboard lists the same events under display names (`ID VERIFICATION AUTO FINISHED`,
`COMPANY REVIEW`, ...). The legacy `IDENTIFICATION` page calls the newer events
`ID_VERIFICATION_*`, but the `Idenfy-Event-Type` header uses `IDENTIFICATION_*`.

## Event Payload Structure

KYC payloads include `scanRef` (the verification's unique ID, use it to deduplicate),
`clientId`, a `status` object with the overall result (`APPROVED`, `DENIED`, `SUSPECTED`,
`EXPIRED`), document and face-match data, and a boolean `final`. When `final` is `true`,
iDenfy sends no further webhooks for that verification. Bank-card results deduplicate on `id`.
The body does **not** name the event: read the `Idenfy-Event-Type` header.

## Full Event Reference

See iDenfy's [webhooks overview](https://documentation.idenfy.com/guides/webhooks-overview)
and the [KYC webhooks](https://documentation.idenfy.com/kyc/webhooks) page.
