# Veriff Webhooks Overview

## What Are Veriff Webhooks?

Veriff is an identity verification service. When an end-user goes through a verification session, Veriff posts JSON to URLs you configure in the Veriff Customer Portal: the outcome of the session (decision webhook) and, optionally, progress through the flow (event webhook).

There is no single webhook you always need. Which ones you configure depends on the Veriff products you use. The decision webhook is required for document + selfie IDV, document-only IDV, biometric authentication, biometric liveness, age estimation, proof of address extraction, AML screening via IDV, UK DIATF, and the Mexican INE / Indian Aadhaar database checks.

## Webhook Types

| Type | Customer Portal URL field | Purpose |
|------|---------------------------|---------|
| Decision | Webhook decisions URL | Result of the session plus verified data |
| Event | Webhook events URL | Progress of the end-user flow (optional) |
| Watchlist screening, INE, CURP, INE+CURP, user-defined statuses, full auto | per type | Product-specific. Not covered by this skill's examples; same `X-HMAC-SIGNATURE` scheme |

## Common Event Types

### Decision webhook: `verification.status`

| Status | Triggered When | Common Use Cases |
|--------|----------------|------------------|
| `approved` | Veriff verified the end-user | Unlock the account, mark KYC passed |
| `declined` | Verification failed (see `reason` / `reasonCode`) | Reject, flag for support |
| `resubmission_requested` | End-user must resubmit data in the same session | Prompt the user to retry |
| `expired` | Session expired without a conclusive decision | Offer a new session |
| `abandoned` | End-user abandoned the session | Offer a new session |
| `review` | Only if previously agreed with Veriff | Hold for manual review |

For SDK sessions where the end-user is asked to resubmit on the final screen, `resubmission_requested` webhooks are delayed by 5 minutes.

### Event webhook: `action`

| Action | Code | Triggered When |
|--------|------|----------------|
| `started` | 7001 | End-user arrives at the flow and starts |
| `submitted` | 7002 | End-user submits the attempt (sent before redirect to the callback URL) |
| `waiting_complete` | 7007 | End-user gets the decision on the "waiting for decision" page (web only, needs configuration) |
| `waiting_continued` | 7008 | End-user clicks Continue before the decision is available (web only, needs configuration) |
| `flow_finished` | 7009 | End-user clicks Continue on the final screen (web only, needs configuration) |
| `flow_cancelled` | 7010 | End-user abandons the flow (web only, needs configuration) |
| `document_type_other_selected` | 7011 | End-user wants to use another document type (web only, needs configuration) |

The event webhook does not carry the decision. Contact your Veriff solutions engineer to enable the web-only events.

## Event Payload Structure

Decision webhook (abridged):

```json
{
  "status": "success",
  "verification": {
    "id": "12df6045-3846-3e45-946a-14fa6136d78b",
    "attemptId": "00bca969-b53a-4fad-b065-874d41a7b2b8",
    "vendorData": "12345678",
    "endUserId": "a1b2c35d-e8f7-6d5e-3cd2-a1b2c35db3d4",
    "status": "approved",
    "code": 9001,
    "reason": null,
    "reasonCode": null,
    "decisionTime": "2024-11-06T07:17:36.916Z",
    "acceptanceTime": "2024-11-06T07:15:27.000Z",
    "person": { "firstName": "SARAH", "lastName": "MORGAN" },
    "document": { "type": "DRIVERS_LICENSE", "country": "GB" }
  },
  "technicalData": { "ip": "186.153.67.122" }
}
```

`verification` is `null` if the decision is not available yet. Decision `code` is one of `9001`, `9102`, `9103`, `9104`, `9121`. `vendorData` and `endUserId` are the identifiers you passed when creating the session (`null` if not set).

Event webhook:

```json
{
  "id": "f04bdb47-d3be-4b28-b028-a652feb060b5",
  "attemptId": "e30122d1-740b-4764-853f-470374a7abf4",
  "feature": "selfid",
  "code": 7002,
  "action": "submitted",
  "vendorData": "12345678",
  "endUserId": "a1b2c35d-e8f7-6d5e-3cd2-a1b2c35db3d4"
}
```

Tell the two apart by shape: decision webhooks have a `verification` key, event webhooks have a top-level `action`. Both identify the session by `id` (event) or `verification.id` (decision).

## Delivery Guarantees

- At-least-once, not ordered. Make handlers idempotent and tolerate a decision arriving before an event.
- Expects `200` within 5,000 ms. Failed deliveries are retried for up to a week.
- Payloads contain PII (names, addresses, document numbers). Handle accordingly.

## Full Event Reference

See the [Veriff webhooks guide](https://devdocs.veriff.com/docs/webhooks-guide), [Decision webhook](https://devdocs.veriff.com/docs/decision-webhook) and [Event webhook](https://devdocs.veriff.com/docs/event-webhook).
