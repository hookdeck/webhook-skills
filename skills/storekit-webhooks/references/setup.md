# Setting Up Storekit Webhooks

## Prerequisites

- A Storekit account on a plan that includes webhooks (otherwise **Settings > Webhooks** shows
  an **Upgrade to enable webhooks** button)
- A publicly reachable **HTTPS** endpoint that accepts `POST` (use the Hookdeck CLI tunnel for
  local work)
- CSRF protection disabled on the webhook route

## How Do I Register a Storekit Webhook Endpoint?

1. In the dashboard sidebar, go to **Settings** > **Webhooks**.
2. Click **Enable Webhooks** if you haven't yet.
3. In the embedded webhooks portal on that page, add an endpoint.
4. Enter your URL, for example `https://example.com/webhooks/storekit`.
5. Choose the event types to receive (or all of them). Subscribe only to what you need.
6. Save the endpoint.

Endpoint management happens inside the embedded portal (it is a Svix portal), not in Storekit's
own screens.

## Where Do I Find the Signing Secret?

Open the endpoint in the embedded portal. Each endpoint has its own secret, starting with
`whsec_`. Store the full value, prefix included:

```bash
STOREKIT_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key. Never share one endpoint's secret with another.

## How Do I Test an Endpoint?

1. Open the endpoint in the embedded portal.
2. Select an event type, review the sample payload and send it.
3. Check that your handler logs the event and returns `2xx`.

The portal also shows a delivery log (status, response time, response code and the exact
payload). For local development, run `npx hookdeck-cli listen 3000 storekit --path /webhooks/storekit`
and use the tunnel URL as the endpoint. Use a separate endpoint (and secret) for testing.

## What Happens When Delivery Fails?

A delivery fails on a non-2xx response, no response within 15 seconds, or a connection failure.
Storekit retries with exponential backoff over about 3 days:

| Attempt | Delay after previous |
|---------|----------------------|
| 1 | Immediate |
| 2 | 5 seconds |
| 3 | 5 minutes |
| 4 | 30 minutes |
| 5 | 2 hours |
| 6 | 5 hours |
| 7 | 10 hours |
| 8 | 24 hours |

After the last attempt the message is marked failed. If every attempt to an endpoint fails for
**5 consecutive days**, the endpoint is disabled automatically; re-enable it in the portal.

To recover:

- **Retry one message:** open the endpoint, find the failed message in the logs, click **Retry**.
- **Recover an outage:** endpoint **Options > Recover Failed Messages**, then pick a time window.

## Verification Behind Hookdeck

If the endpoint URL points at a Hookdeck source, Hookdeck verifies the signature on ingest and
forwards to your handler. Retries and replays resend the original `svix-timestamp`; see
[verification.md](verification.md) for how that interacts with the library's 5-minute window.
