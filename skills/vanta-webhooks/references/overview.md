# Vanta Webhooks Overview

## What Are Vanta Webhooks?

Vanta sends real-time HTTP `POST` notifications when things change in your Vanta
account (questionnaires, vendor reviews, Trust Center access requests) or, for Audit
Partner accounts, during an active audit (information requests, evidence, controls).
They replace polling the Manage Vanta API.

Delivery runs on [Svix](https://www.svix.com/), so every request carries `svix-id`,
`svix-timestamp`, and `svix-signature` headers (see [verification.md](verification.md)).

## What Event Types Does Vanta Send?

Every event type has the form `v1.<domain>.<entity>.<action>`.

### Questionnaire

| Event | Triggered When |
|-------|----------------|
| `v1.questionnaire.created` | A questionnaire is created |
| `v1.questionnaire.deleted` | A questionnaire is deleted |
| `v1.questionnaire.status-changed` | A questionnaire's status changes |
| `v1.questionnaire.export-completed` | A questionnaire export finished |
| `v1.questionnaire.export-failed` | A questionnaire export failed |

### Trust Center

| Event | Triggered When |
|-------|----------------|
| `v1.trust-center.access-request.received` | An access request is received |
| `v1.trust-center.access-request.approved` | An access request is approved |
| `v1.trust-center.access-request.denied` | An access request is denied |

### Vendor

| Event | Triggered When |
|-------|----------------|
| `v1.vendor.decision.created` | A vendor risk decision is created |

### Audit Partner only (Information Request, Evidence, Control)

These are delivered only to Audit Partner accounts during an active audit engagement.

| Event | Triggered When |
|-------|----------------|
| `v1.information-request.status-changed` | An IRL item's status changes |
| `v1.information-request.comment.created` / `.updated` / `.deleted` | An IRL comment changes |
| `v1.information-request.evidence.created` / `.deleted` | Evidence is attached to / removed from an IRL item |
| `v1.evidence.created` / `v1.evidence.deleted` | Audit evidence is created / deleted |
| `v1.evidence.status-changed` | Audit evidence status changes |
| `v1.evidence.comment.created` / `.updated` / `.deleted` | An evidence comment changes |
| `v1.control.comment.created` / `.updated` / `.deleted` | An audit control comment changes |

## What Does a Vanta Webhook Payload Look Like?

Vanta's event reference documents the payload for each event. Payloads are small and
carry IDs; fetch full objects from the Manage Vanta API. Treat IDs as opaque strings.

```json
// v1.questionnaire.status-changed
{ "questionnaire": { "id": "123", "status": "COMPLETE" } }

// v1.vendor.decision.created
{
  "vendor": {
    "id": "123",
    "decision": {
      "status": "APPROVED",
      "lastUpdatedAt": "2025-10-10T00:00:00.000Z",
      "comments": "No weaknesses or flagged findings identified in the review."
    }
  }
}

// v1.trust-center.access-request.approved
{ "trustCenter": { "slugId": "123" }, "accessRequest": { "id": "123" }, "viewer": { "id": "123" } }

// v1.evidence.status-changed
{
  "evidence": {
    "id": "8f9e0d1c2b3a4f5e6d7c8b9a",
    "auditId": "5f8d0f3b9d3f2a1b4c5d6e7f",
    "oldStatus": "NOT_READY_FOR_AUDIT",
    "newStatus": "READY_FOR_AUDIT"
  }
}
```

### How Do I Tell Which Event I Received?

Vanta's docs are not explicit here. The overview says the event payload is the JSON
body, and the payloads above have no `type` field. The OpenAPI description also says
deliveries are "wrapped in a delivery envelope" but doesn't document its fields. The
examples in this skill handle both cases:

1. If the body has a string `type`, treat it as the event type and read the payload
   from `payload` (or `data`).
2. Otherwise treat the whole body as the payload and route on its top-level key
   (`questionnaire`, `vendor`, `trustCenter`, `informationRequest`, `evidence`, `control`).

If you need exact routing without depending on the body shape, register one endpoint
per event type (Vanta lets you pick event types per endpoint). Use **Send Example**
in the dashboard to confirm the real shape before going to production.

## How Does Vanta Retry Failed Deliveries?

A delivery fails if your endpoint doesn't return `2xx` within **15 seconds**. Vanta
retries with backoff: immediately, 5s, 5m, 30m, 2h, 8h, 1d, 2d (about 5 days total).
After that the message is marked failed. You can retry individual messages or
**Bulk Retry** a time range from **Settings → Webhooks**.

Delivery is at least once. Deduplicate on the `svix-id` header.

## Full Event Reference

- [Webhook event reference](https://developer.vanta.com/reference/webhooks/overview)
- [Subscribe to webhook events (guide)](https://developer.vanta.com/docs/webhooks)
