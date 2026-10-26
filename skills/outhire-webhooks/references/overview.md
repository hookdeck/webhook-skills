# Outhire Webhooks Overview

## What Are Outhire Webhooks?

[Outhire](https://outhire.ai) is an AI recruiting platform. Its outbound webhooks push candidate lifecycle events to your own systems: when a candidate applies or moves between pipeline stages, Outhire sends an HTTP `POST` with a JSON body to the URL you configure.

Admins add endpoints in **Settings > Webhooks**. Each endpoint subscribes to one or both events, has its own `whsec_` signing secret and can carry up to 10 custom headers. Deliveries are signed with [Standard Webhooks](https://www.standardwebhooks.com/) (`webhook-id`, `webhook-timestamp`, `webhook-signature`).

## Which Outhire Webhook Events Are There?

| Event | Triggered when | Common use cases |
|-------|----------------|------------------|
| `candidate.applied` | A candidate submits a self-serve application (careers page or application form; not candidates created through the API or other intake) | Create an ATS record, notify the hiring team |
| `candidate.stage_changed` | A candidate moves between pipeline stages, from the UI, Joel (Outhire's AI agent) or the public API. Not sent if the stage is unchanged | Sync stage to your ATS or HRIS, trigger onboarding steps |
| `webhook.ping` | An admin clicks **Send test ping**. Not subscribable | Check connectivity and signature verification |

The docs document these three events. Treat unknown `event` values as acknowledged and ignored, since the list may grow.

## What Does an Outhire Webhook Payload Look Like?

Every payload has a top-level `event` and an ISO 8601 `occurred_at`. There is **no event ID** in the body: the `webhook-id` header identifies the delivery.

```json
{
  "event": "candidate.applied",
  "occurred_at": "2026-03-11T00:00:00.000Z",
  "candidate": {
    "id": 123,
    "name": "Jane Doe",
    "email": "jane@example.com",
    "phone": "+61400000000",
    "fit_score": 82,
    "applied_at": "2026-03-11T00:00:00.000Z",
    "resume_url": "https://...",
    "resume_data": {},
    "url": "https://app.outhire.ai/leads/123"
  },
  "job": { "id": 456, "title": "Account Executive" },
  "company": { "id": 789 }
}
```

- `candidate.fit_score` is `null` until scoring completes. `candidate.resume_url` is a signed URL that expires after 24 hours, so download the file promptly.

`candidate.stage_changed` carries a slimmer `candidate` (`id`, `public_id`, `name`, `email`, `url`), plus `job`, `company` and:

```json
"stage_change": {
  "previous_stage": "applied",
  "new_stage": "interview",
  "changed_by": "user",
  "changed_by_user_id": "uuid-or-null"
}
```

`changed_by` is `user`, `joel` or `api`. `changed_by_user_id` is `null` for non-user actors.

`webhook.ping` carries `event`, `occurred_at` and `webhook: { id, url }`. It is a normal signed delivery, not a challenge to answer.

## How Does Outhire Deliver Webhooks?

- Return a `2xx` within **10 seconds**.
- Each delivery has an internal event key (`candidate.applied:{webhookId}:{candidateId}`, `candidate.stage_changed:{webhookId}:{candidateId}:{occurredAtMillis}`). A delivery that already succeeded isn't sent again, but the docs still advise idempotent processing.
- The docs don't describe a retry schedule or ordering guarantees, so don't assume either. Use `occurred_at` if you need to order events for the same candidate.
- Every attempt is logged in the admin UI with status, headers, payload and your response (truncated to 4000 characters).

## Full Event Reference

See [Outhire's webhook overview](https://docs.outhire.ai/webhooks/overview), [event reference](https://docs.outhire.ai/webhooks/events) and [signature verification](https://docs.outhire.ai/webhooks/verifying-signatures).
