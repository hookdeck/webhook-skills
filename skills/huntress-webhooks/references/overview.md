# Huntress Webhooks Overview

## What Are Huntress Webhooks?

Huntress webhooks are HTTP callbacks that deliver real-time event notifications from
the Huntress Portal to an endpoint you control, instead of polling the API. Each
delivery includes:

- An HTTP `POST` to your configured HTTPS URL
- A JSON payload describing the event
- Headers carrying a Svix signature, a timestamp, and a unique delivery ID
  (`svix-signature`, `svix-timestamp`, `svix-id`)

## What Notification Categories Exist?

Each endpoint subscribes to any of four categories. They are toggles in the Portal,
not event type strings in the payload.

| Category | Subscribe when you want |
|----------|-------------------------|
| Incident Reports | Incident report notifications |
| Escalations | Escalation notifications |
| Platform Actions | Platform action notifications |
| Account Notices | Account notice notifications |

## What Does the Payload Look Like?

Huntress's article says only that the body is "a JSON payload describing the event".
It does not document a `type` field, an envelope, or per-category schemas, and the
category names above are not documented as wire values. Inspect a real delivery
(**View Delivery Attempts → View → Request Body**, or **Send Test**) before writing
type-specific handling. The example handlers log the body and report `type` only if
the body has one.

## How Are Deliveries Signed?

Huntress uses Svix to sign payloads. See
[verification.md](verification.md) for the algorithm, the SDK call, and a manual verifier.

## Delivery Tips From Huntress

- Verify against the **raw body**, not parsed JSON.
- Respond fast: verify, enqueue the work, return `200`. Don't process inline.
- Log delivery IDs (`svix-id`) so you can correlate with the Portal's **View Delivery
  Attempts** page when debugging missed events.

## Limits

- Up to **5 endpoints** per account.
- Destination URLs must be HTTPS.
- Configuring webhooks requires the **account admin** role.

## Full Reference

[How to use Webhooks Integration](https://support.huntress.io/hc/en-us/articles/51679111552147-How-to-use-Webhooks-Integration)
(Huntress support; the HTML page sits behind Cloudflare, but the same article is
served as JSON at `https://support.huntress.io/api/v2/help_center/articles/51679111552147.json`).
