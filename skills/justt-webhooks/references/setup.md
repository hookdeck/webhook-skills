# Setting Up Justt Webhooks

## Prerequisites

- A Justt account with webhooks enabled (the feature is not available to every customer yet; ask Justt if the tab is missing)
- Your application's public HTTPS webhook URL (use the Hookdeck CLI for local development)

## How Do I Register a Webhook Endpoint?

1. In the Justt app, switch to the **Account level** view and open the **Webhooks** tab (`https://app.justt.ai/aggregated/webhooks`).
2. Click to add an endpoint and enter your URL. It must be publicly reachable, HTTPS, accept `POST` and respond within 15 seconds.
3. Choose event types. **If you select none, the endpoint receives every event type**, which is handy for testing. For production select only what you handle, for example `chargeback.created` and `chargeback.updated`.
4. Save the endpoint.

You normally use one endpoint per service, listening to all event types. No challenge or validation request is sent when you add the endpoint.

## Where Is My Signing Secret?

Each endpoint has its own signing secret in the endpoint's settings in the webhook dashboard: open the endpoint and copy the **Signing Secret**. Justt's docs never print its prefix, but its sample code base64-decodes the part after `_`, which matches the `whsec_<base64>` format. Store the full value, prefix included, in `JUSTT_WEBHOOK_SECRET`. Keep it out of client-side code and version control.

## How Do I Test an Endpoint?

**Dashboard (signed):** open the endpoint, go to the **Testing** tab, select an event type (for example `chargeback.created`) and click **Send Example**. Click into the message to see the payload, each delivery attempt, response codes and timing.

**Local tunnel without an account:**

```bash
# Express / Next.js (use 8000 for FastAPI)
npx hookdeck-cli listen 3000 justt --path /webhooks/justt
```

Use the printed URL as the endpoint URL in the dashboard. A hand-written `curl` with a made-up `webhook-signature` will fail verification; the signature has to be computed from the endpoint's secret (see [verification.md](verification.md)).

## Retries and Recovery

Failed deliveries are retried on an 8-attempt schedule (about 27.6 hours; see [overview.md](overview.md)). An endpoint that fails for 5 consecutive days is disabled and must be re-enabled from the dashboard (open the endpoint, then **Enable Endpoint**). The dashboard can resend a single message or recover failed ones since a date. Resent messages keep their original `webhook-timestamp` when they pass through Hookdeck, see [verification.md](verification.md).

## Webhook Transformations

Justt offers [webhook transformations](https://developers.justt.ai/docs/justt-webhook-transformations) to modify payloads or routing before delivery. A transformation that edits the body changes what you receive; verify against what arrives.

## Other Setup Notes

- **CSRF:** disable CSRF protection on the webhook route if your framework enables it by default.
- **IP allowlists:** none are documented. Verify `webhook-signature` instead of allowlisting.
