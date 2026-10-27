# Setting Up Dodo Payments Webhooks

## Prerequisites

- Dodo Payments account (test mode or live mode)
- Your application's public HTTPS webhook URL (use the Hookdeck CLI for local development)

## How Do I Register a Webhook Endpoint?

1. In the Dodo Payments dashboard go to **Developer > Webhooks**.
2. Click **Add endpoint**.
3. Enter the HTTPS URL where events should be sent, or choose an integration connector (Slack, Discord, Zapier, Resend and others) to route events without writing code.
4. Select events. They are grouped by resource (payment, subscription, dispute, ...); pick individual events or a whole resource. **If you deselect everything, the endpoint receives every event type**, so select only what you handle.
5. Click **Create endpoint**.

To change subscribed events later, open the endpoint, click **Edit**, adjust the event tree and **Save**.

## Where Is My Signing Secret?

Each endpoint has its own secret on the endpoint's **Overview** tab. It starts with `whsec_`. Store the full value, prefix included, in `DODO_PAYMENTS_WEBHOOK_SECRET`. (Dodo's SDK docs call the same value `DODO_PAYMENTS_WEBHOOK_KEY`.) Keep it out of client-side code and version control.

To rotate it, open the endpoint and click **Rotate secret** next to the secret on the Overview tab. The old secret stays valid for 24 hours, so deploy the new one inside that window.

## How Do I Test an Endpoint?

**Dashboard (signed):** open the endpoint, go to the **Testing** tab, pick an event type and click **Send example**. The sample is delivered like a real event and signed the same way. Failed test messages are retried on the normal schedule.

**Dodo CLI:**

- `dodo wh listen` forwards real test-mode events to a local URL with all headers preserved (test mode API keys only).
- `dodo wh trigger` sends mock events that are **not signed**. A handler that verifies signatures will reject them; Dodo's SDKs offer an unverified parse method for this (`unsafeUnwrap` in TypeScript, `unsafe_unwrap` in Python), for testing only.

**Local tunnel without an account:**

```bash
# Express / Next.js (use 8000 for FastAPI)
npx hookdeck-cli listen 3000 dodo-payments --path /webhooks/dodo-payments
```

Use the printed URL as the endpoint URL in the dashboard.

## Advanced Endpoint Settings

The endpoint's **Advanced** tab offers throttling (maximum messages per second; deliveries over the limit are queued, not dropped), custom headers added to every request, and JavaScript transformations that can change the payload or redirect it. Single messages are replayed from the **Logs** tab; the endpoint's **More actions** menu offers bulk recover, replay-missing and bulk replay. Replayed messages keep their original `webhook-timestamp` when they pass through Hookdeck, see [verification.md](verification.md).

## Test Mode vs Live Mode

Test and live mode have separate endpoints and therefore separate secrets. Configure the matching `DODO_PAYMENTS_WEBHOOK_SECRET` per environment.

## IP Allowlists

Dodo does not publish a fixed IP list: delivery addresses change over time, and the docs say not to rely on allowlists for authentication. Always verify `webhook-signature`. If a firewall needs an allowlist, request the current ranges from Dodo support and watch for change notices; a blocked delivery counts as a failure and is retried.
