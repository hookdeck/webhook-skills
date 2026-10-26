# Setting Up Runa Webhooks

## Prerequisites

- A Runa account with access to the API section
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## How Do I Register a Runa Webhook Endpoint?

Endpoints are managed in a webhook portal powered by Svix:

1. In your Runa account, open the [API section](https://app.runa.io/api-keys) and click **View webhook**.
   This opens the portal.
2. Click **Add new endpoint** and enter the endpoint URL. A description is optional.
3. Select a **single event type**: `order.completion` or `product.update`.
4. Create the endpoint, then copy its signing secret and store it in your server's secret manager.

To receive both event types, add two endpoints (they can share a URL; the examples identify the
event from the payload). No challenge or validation request is documented, so nothing needs to
be echoed back when you create an endpoint.

No URL yet? The form has a **Use Svix Play** button that generates a unique testing URL so you
can inspect real deliveries before your service is ready.

## Where Do I Find the Webhook Secret?

In the portal, on the endpoint's page. Each endpoint has its own secret, and it starts with
`whsec_`. Store the full value, prefix included:

```bash
RUNA_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key. If you serve both event types from one handler, the two endpoints have
different secrets; see [verification.md](verification.md) for handling more than one.

Runa's docs show `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw` in their code sample. That is Svix's
documentation sample, not a secret to use.

## How Do I Test My Endpoint?

Webhooks are **not available in the playground environment**. Use the portal instead:

1. Open the endpoint and select the **Testing** tab.
2. Choose the event type and click **Send Example**.
3. Check the **Message Attempts** table and click into a record to see the request and your response.

For local development:

```bash
npx hookdeck-cli listen 3000 runa --path /webhooks/runa
```

Add the tunnel URL as the endpoint in the portal. For FastAPI use port `8000`.

## Do I Need to Allowlist IP Addresses?

Only if your endpoint is behind a firewall or NAT. Runa lists the addresses Svix deliveries
originate from:

```
52.215.16.239
54.216.8.72
63.33.109.123
```

Signature verification is the primary protection; an allowlist is an extra layer.

## What Happens When Deliveries Fail?

A delivery succeeds on any `2xx` within 15 seconds. Otherwise Svix retries on its schedule
(immediately, 5 s, 5 min, 30 min, 2 h, 5 h, 10 h, 10 h). If every attempt to an endpoint fails for 5
days, the endpoint is disabled; re-enable it from the portal with **Enable Endpoint**.

## Verification Behind Hookdeck

If the endpoint URL points at a Hookdeck source, Hookdeck verifies the signature and
forwards to your handler. Retries and replays resend the original `svix-timestamp`; see
[verification.md](verification.md) for how that interacts with the library's 5-minute window.
