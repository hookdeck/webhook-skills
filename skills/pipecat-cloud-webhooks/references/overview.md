# Pipecat Cloud Webhooks Overview

## What Are Pipecat Cloud Webhooks?

[Pipecat Cloud](https://pipecat.daily.co/) is Daily's hosted platform for Pipecat voice and
multimodal agents. It sends an HTTPS `POST` with a signed JSON payload to each endpoint an
organization registers when something happens: a build finishes, a deployment replaces pods,
spend crosses a threshold, a session starts. Deliveries go through Svix and follow Standard
Webhooks with the `svix-*` header names.

| Aspect | Value |
|--------|-------|
| Method | `POST`, JSON body |
| Signature headers | `svix-id`, `svix-timestamp`, `svix-signature` (Standard Webhooks) |
| Success | Any `2xx`; anything else is retried (no schedule is documented) |
| Delivery | At-least-once; `svix-id` is stable across retries |
| Test deliveries | Carry a `webhook-test: true` header; real events do not |

## Event Payload Structure

Every event arrives in the same envelope. Only `data` differs between event types.

```json
{
  "event_type": "build.succeeded",
  "org": "acme-co",
  "created_at": "2026-08-25T11:40:32.000Z",
  "data": {
    "build_id": "9f1c3a52-6b0e-4c11-9a76-2d5f8b41e0c7",
    "region": "us-west-2",
    "status": "success",
    "triggered_by": "github",
    "image_uri": "123456789012.dkr.ecr.us-west-2.amazonaws.com/acme-co/voice-agent:e3b0c44",
    "build_duration_seconds": 94
  }
}
```

- `org` is the organization name and `created_at` is ISO 8601 UTC.
- There is no event id in the body: use the `svix-id` header to deduplicate.
- No header carries the event type: read `event_type` from the body.
- Entities use `_id` / `_name` pairs (`service_id`, `service_name`), field names are `snake_case`,
  and money is always `*_cents` as a JSON number.
- Nullable fields are always present and may be `null`. Optional fields are omitted when they
  don't apply, so read them defensively.
- **Exception:** `session.started` sends the service name as `service`, not `service_name`.

## Common Event Types

| Event | Triggered When | `data` fields |
|-------|----------------|---------------|
| `build.started` | The build enters `building` (best-effort, not guaranteed) | `build_id`, `region`, `status`, `triggered_by`, `commit_sha`, `ref`, `repo_full_name` |
| `build.succeeded` | CodeBuild reports `SUCCEEDED` | the above plus `image_uri`, `build_duration_seconds` |
| `build.failed` | Build `FAILED` or `STOPPED`, or the trigger call failed | the above plus `error_message`, `build_duration_seconds` |
| `build.timeout` | Build `TIMED_OUT` | the above plus `error_message`, `build_duration_seconds` |
| `deployment.created` | A service's first deployment | `deployment_id`, `service_id`, `service_name`, `region`, `build_id` (null for image deploys) |
| `deployment.updated` | A redeploy replaced the running pods | same as `deployment.created` |
| `service.suspended` | Service torn down: org suspended or trial credits ran out | `service_id`, `service_name`, `region`, `reason` (`trial_exhausted` or `account_suspended`) |
| `service.resumed` | A suspension was lifted | `service_id`, `service_name`, `region` |
| `spend.threshold_reached` | Spend crosses 80% or 90% of the limit | `percent`, `current_spend_cents`, `limit_cents` |
| `spend.limit_reached` | Spend reaches 100% of the limit | `current_spend_cents`, `limit_cents` |
| `spend.limit_cleared` | The spend limit was removed (a limit of `0` is a kill switch, not a clear) | `previous_limit_cents` |
| `session.started` | An agent session starts | `session_id`, `service`, `region`, `transport` (optional) |
| `org.trial_started` | A trial code is redeemed for the first time | `org_name`, `trial_credits_cents` (nullable) |
| `org.trial_ended` | Trial credits run out and usage is blocked | `org_name`, `amount_due_cents` |
| `api_key.created` | An API key was created | `key_id`, `name`, `type` (`public`/`private`), `actor_user_id` |
| `api_key.rotated` | An API key was rotated (id and name unchanged) | same as `api_key.created` |
| `api_key.deleted` | An API key was revoked | same as `api_key.created` |
| `secret.created` | A secret set was created | `set_name`, `region`, `type` (`secret`/`imagePullSecret`), `scope` (`set`/`field`), `actor_user_id` |
| `secret.updated` | A secret value changed | same, plus `field_names` when `scope` is `field` |
| `secret.deleted` | A secret set, or one key in it, was removed | same as `secret.updated` |

20 events are documented; the list may not be exhaustive. The examples handle exactly these
events and acknowledge anything else with `200`. Key values and secret values are never included
in `api_key.*` and `secret.*` payloads.

## Delivery Notes

- **Deduplicate on `svix-id`.** Delivery is at-least-once, and a retry after a timeout can arrive
  even though your handler already processed the message.
- Events from periodic jobs (`org.trial_ended` and the `spend.*` events) carry an idempotency key,
  so overlapping job runs deliver once.
- Deployment events are sent after the deploy commits. A process restart in that window can drop
  the event; the deploy itself is unaffected. A deploy that changes nothing emits no event.
- Don't pair `build.started` with a terminal build event as an open/close bracket. Treat the
  terminal events as authoritative.
- There is no `session.ended` event, and `deployment.deleted` is retired.
- Delivery history covers 90 days and any delivery can be re-dispatched from the dashboard.
- Acknowledge quickly, then do the work on a queue, so a slow dependency doesn't become a retry
  storm.

## Full Event Reference

For the complete catalog and payload shapes, see Pipecat Cloud's
[webhook event reference](https://docs.pipecat.ai/pipecat-cloud/guides/webhook-events) and
[webhook guide](https://docs.pipecat.ai/pipecat-cloud/guides/webhooks).
