# Huntress Webhooks Overview

## What Are Huntress Webhooks?

Huntress webhooks are HTTP callbacks that deliver real-time event notifications from
the Huntress Portal to an endpoint you control, instead of polling the API. Each
delivery includes:

- An HTTP `POST` to your configured HTTPS URL
- A JSON payload describing the event
- Headers carrying a Svix signature, a timestamp, and a unique delivery ID. Huntress's
  article doesn't name them. Svix's guide uses `svix-signature`, `svix-timestamp` and
  `svix-id`; a live test delivery (2026-11-18) used `webhook-signature`,
  `webhook-timestamp` and `webhook-id`. Accept both.

## What Notification Categories and Event Types Exist?

Each endpoint subscribes to any of four categories, toggled in the Portal. Each
category sends event types named in the body's top-level `event_type`, as listed in
Huntress's [webhook payload reference](https://api.huntress.io/docs) (the "Webhooks"
source):

| Category | `event_type` values |
|----------|---------------------|
| Incident Reports | `incident_report.created`, `incident_report.comment_added`, `incident_report.closed` |
| Escalations | `escalation.created`, `escalation.updated` (an open Security Advisory's text changed), `escalation.overdue`, `escalation.closed` |
| Platform Actions | `platform_action.created`, `platform_action.overdue`, `platform_action.closed`, `platform_action.notification` |
| Account Notices | `account_notice.notification` |

## What Does the Payload Look Like?

Flat JSON with `event_type`, `id`, `account` and `created_at` on every event, in three
schemas:

- **Incident report events:** `subject`, `summary`, `body`, `severity`, `status`,
  `organization`, `agent_id`, `platform`, `indicator_counts`, `api_url`, `sent_at`,
  `closed_at`, `status_updated_at`, `updated_at`, plus `comment` on
  `incident_report.comment_added`. `account_id` and `organization_id` are still sent
  but deprecated: read `account` and `organization`.
- **Escalation and platform action events:** `subject`, `type` (not the event type),
  `severity`, `status`, `organizations`, `total_organizations_impacted`, `api_url`,
  `resolved_at`, `updated_at`, plus `message` on the `.overdue` and `.updated` events.
- **`.notification` events:** `subject` and `body`.

The reference has schemas only, no example bodies. The live **Send Test** body
(2026-11-18) was `{"event_type":"test.event","message":"Hello World"}`; `test.event`
isn't in the reference. The example handlers report `event_type` and log the body.

## How Are Deliveries Signed?

Huntress uses Svix to sign payloads. See
[verification.md](verification.md) for the algorithm, the SDK call, and a manual verifier.

## Delivery Tips From Huntress

- Verify against the **raw body**, not parsed JSON.
- Respond fast: verify, enqueue the work, return `200`. Don't process inline.
- Log delivery IDs (`webhook-id` or `svix-id`) so you can correlate with the Portal's **View Delivery
  Attempts** page when debugging missed events.

## Limits

- Up to **5 endpoints** per account.
- No timeout, retry schedule or ordering guarantee is published. Compare `updated_at`
  before applying an event, and deduplicate on the delivery ID.
- Destination URLs must be HTTPS.
- Configuring webhooks requires the **account admin** role.

## Full Reference

[How to use Webhooks Integration](https://support.huntress.io/hc/en-us/articles/51679111552147-How-to-use-Webhooks-Integration)
(Huntress support; the HTML page sits behind Cloudflare, but the same article is
served as JSON at `https://support.huntress.io/api/v2/help_center/articles/51679111552147.json`).
