# Setting Up Supertab Webhooks

## Prerequisites

- A Supertab merchant account with access to the Business Portal
- A publicly reachable HTTPS endpoint that accepts `POST` requests (use the Hookdeck CLI tunnel for
  local work)

## How Do I Register a Supertab Webhook Endpoint?

Supertab uses Svix to manage its webhook infrastructure, and endpoints are added in the Business
Portal.

1. Open the Supertab Business Portal and go to **Webhooks**.
2. Click **Add Endpoint** and enter your endpoint URL, e.g. `https://example.com/webhooks/supertab`.
3. Select the events to subscribe to. Event names show their version suffix in this list.
   A useful start is `purchase.completed` and `onetime_offering.purchasing_completed`, at the
   current latest version (`2025-04-01`).
4. Return a `2xx` as soon as the signature checks out.

## Where Do I Find the Signing Secret?

The signing key is in the Business Portal under the specific endpoint you created, in the
**Webhooks** section. Each endpoint has its own secret. Supertab's documentation doesn't print the
secret's format, but Svix issues `whsec_`-prefixed secrets. Store the full value, prefix included:

```bash
SUPERTAB_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## How Do I Browse Event Schemas?

The event catalog is listed under the **Event Catalog** tab of the Webhooks section in the
Business Portal, and publicly at
[svix.com](https://www.svix.com/event-types/eu/org_2m1kyxXSEnLSeEprUkWs7ksPdgf/). It has JSON
Schemas and examples for each event type and version.

## How Do I Test My Endpoint?

Make a test purchase to trigger `purchase.completed`, or, for One-Time Offerings, buy one created
through the [create one-time offering](https://docs.supertab.co/merchant-api/endpoints/create-onetime-offering.md)
API call. With the Hookdeck CLI tunnel running you can inspect each delivery and replay it.

## Troubleshooting

| Symptom | Likely cause |
|---------|--------------|
| Every delivery fails verification | The handler verifies a re-serialized body instead of the raw bytes, or the secret belongs to a different endpoint |
| No deliveries arrive | The endpoint isn't subscribed to the event type (and version) you expect |
| A handler ignores `purchase.completed` events | The handler compares against the exact versioned name; strip the `_2025-04-01` suffix or match both forms |
| Retries or replays are rejected as "Timestamp too old" | The SDK's fixed 5-minute window; use the manual verifier in `verification.md` |
