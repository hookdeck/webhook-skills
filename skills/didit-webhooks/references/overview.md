# Didit Webhooks Overview

## What Are Didit Webhooks?

Didit is an identity verification platform (KYC, KYB, transaction monitoring). Didit pushes a webhook to your backend whenever a verification session, business session, user or business entity, or transaction changes state. Webhooks are the recommended integration pattern; polling `GET /v3/session/{id}/decision/` is a slower fallback.

Each webhook goes to a **destination** (URL + subscribed events + its own `secret_shared_key`). One event can fan out to several destinations.

## Common Event Types

| Event (`webhook_type`) | Triggered When | Common Use Cases |
|------------------------|----------------|------------------|
| `status.updated` | A KYC or KYB session's status changes (Not Started, In Progress, Approved, Declined, In Review, Abandoned, Resubmitted) | Unlock an account on Approved, notify on Declined, queue manual review |
| `data.updated` | Verification data is edited after creation (manual reviewer corrections, ongoing AML monitoring) | Re-sync stored identity data |

Other subscribable events (use the exact value in the destination's `subscribed_events`; there is no wildcard):

`user.status.updated`, `user.data.updated`, `business.status.updated`, `business.data.updated`, `activity.created` (reserved, not delivered for live traffic), `transaction.created`, `transaction.status.updated`, `travel_rule.status.updated`, and the `investigator.*` family (for example `investigator.report.ready`, `investigator.decision.automated`, `investigator.rfi.answered`).

## Event Payload Structure

Every payload shares one envelope (keys sorted, compact JSON):

| Field | Notes |
|-------|-------|
| `event_id` | Stable across retries and destinations: use as the idempotency key |
| `webhook_type` | One of the events above |
| `timestamp` | Unix seconds when dispatched (refreshed on each retry) |
| `created_at` | Unix seconds when the underlying record last changed |
| `application_id` | The application that owns the destination |
| `environment` | `live` or `sandbox` |
| `status` | Session events use labels like `Approved`, `Declined`, `In Review`; entity events use `ACTIVE`/`FLAGGED`/`BLOCKED`; transactions use `APPROVED`/`IN_REVIEW`/`DECLINED`/`AWAITING_USER` |

Session events (`status.updated`, `data.updated`) add `session_id`, `workflow_id`, `workflow_version`, `vendor_data` (your own identifier), `metadata`, and optionally `trigger`, `decided_by`, `sandbox_scenario`. `decision` is present for Approved, Declined, In Review and Abandoned; `resubmit_info` for Resubmitted. KYB payloads add `session_kind: "business"` and `business_session_id`.

```json
{
  "application_id": "11111111-2222-3333-4444-555555555555",
  "created_at": 1774969994,
  "environment": "live",
  "event_id": "9c0c8b8a-1111-4222-9333-444444444444",
  "session_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "status": "Approved",
  "timestamp": 1774970000,
  "vendor_data": "user_42",
  "webhook_type": "status.updated"
}
```

## Delivery Behavior

- 2xx is success. 5xx, 404, timeouts and connection failures are retried twice (about 1 minute, then about 4 minutes later); 3xx and other 4xx are not retried
- 5 second request timeout; redirects are not followed; private/localhost URLs are blocked
- Deliveries come from `18.203.201.92` with `User-Agent: DiditWebhook/2.0 +https://didit.me`
- Test deliveries from **Try Webhook** carry `X-Didit-Test-Webhook: true`

## Full Event Reference

For the complete list of events and payloads, see [Didit's webhook documentation](https://docs.didit.me/integration/webhooks).
