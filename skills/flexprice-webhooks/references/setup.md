# Setting Up Flexprice Webhooks

## Prerequisites

- A Flexprice Cloud account (self-hosted instances only sign when Svix is enabled, see below)
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## Only Flexprice Cloud Signs Webhooks

Hookdeck's configuration alert for this source reads: "Only Flexprice Cloud signs webhooks.
Self-hosted Flexprice sends unsigned deliveries, which fail verification."

- **Flexprice Cloud** always delivers through Svix and signs every delivery.
- **Self-hosted Flexprice** signs only when Svix is enabled in its configuration. Its default
  native delivery sends the JSON body with the headers configured for the tenant and no
  signature, so signature verification fails. To authenticate native deliveries, configure a
  static secret header in the tenant's webhook settings and check it in your handler, or enable
  Svix. See Flexprice's [configuration docs](https://docs.flexprice.io/docs/getting-started/configuration#webhook-configuration).

The handlers in this skill reject unsigned requests with `400`. Don't add a fallback that
processes an unsigned body.

## How Do I Register a Flexprice Webhook Endpoint?

1. In the Flexprice dashboard, go to **Developers** and open **Webhooks** (or run
   `flexprice open webhooks` from the Flexprice CLI).
2. Click **Add Endpoint** and enter your URL, e.g. `https://example.com/webhooks/flexprice`.
   It must be HTTPS and reachable from the public internet.
3. Choose the events to receive. A billing integration usually starts with
   `invoice.update.finalized`, `invoice.update.payment`, `payment.success`, `payment.failed`,
   `subscription.created`, `subscription.updated`, `subscription.cancelled`, and
   `wallet.credit_balance.dropped`.
4. Return a `2xx` within 5 seconds from your handler. Acknowledge fast and process on a queue.
   Return `200` for events you don't handle, otherwise Flexprice keeps retrying them.

## Where Do I Find the Signing Secret?

Open the endpoint's page in the dashboard and copy its signing secret. It starts with `whsec_`.
Each endpoint has its own secret. Store the full value, prefix included:

```bash
FLEXPRICE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## Sandbox vs Production

Endpoints are per environment. Register one in sandbox and a separate one in production, each
with its own secret.

## Rotating the Secret

Rotate from the endpoint's page. For a grace period, deliveries are signed with both the old and
the new secret, so `svix-signature` carries two `v1,` entries. The examples accept any matching
entry, so deploy the new secret during that window.

## Watching and Replaying Deliveries

The endpoint's page has a **Logs** tab with every attempt and its response, and failed attempts
can be replayed from there. A replay reuses the original payload and `svix-id`, so your
deduplication treats it as the same message.
