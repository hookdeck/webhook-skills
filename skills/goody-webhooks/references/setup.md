# Setting Up Goody Webhooks

## Prerequisites

- A Goody account with the **organization admin** role (webhooks fire on every order and order
  batch in the organization, so only admins can create and manage them)
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Goody Webhook Endpoint?

1. In Goody, click **Organization** (top right), then **Automation API** in the sub-menu. The
   Commerce API app has its own webhooks page under the same Organization menu. Direct links:
   - Production: `https://www.ongoody.com/plus/organization/api/automation`
   - Sandbox: `https://sandbox.ongoody.com/plus/organization/api/automation`
2. Add a webhook and enter your URL (for example `https://example.com/webhooks/goody`) in the
   **Endpoint URL** field.
3. Under **Message Filtering**, leave it blank to receive all events, or select specific events.
   A gifting integration usually starts with `order.created`, `order.gift_accepted`,
   `order.shipped`, `order.delivered`, and `order.canceled`.
4. Return a `2xx` quickly and process on a queue. Return `200` for events you don't handle.

Goody doesn't send a challenge or validation request when you add an endpoint, so there is no
handshake to answer.

## Where Do I Find the Signing Secret?

Open the webhook's configuration page and copy the **Signing Secret**. It starts with `whsec_`.
Store the full value, prefix included:

```bash
GOODY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## Sandbox vs Production

Sandbox and production are separate Goody environments (`sandbox.ongoody.com` and
`www.ongoody.com`), so register a webhook in each and keep each secret separate. A sandbox
secret won't verify production traffic.

## Watching and Re-sending Deliveries

Goody keeps delivery logs for each endpoint and lets you re-send failed webhooks from there.
A re-send is the same Svix message, so deduplicate on `svix-id`. Goody doesn't document a retry
schedule or a response timeout.
