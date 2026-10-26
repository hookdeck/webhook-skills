# Setting Up BlindPay Webhooks

## Prerequisites

- A BlindPay account with an instance, and the `owner`, `admin` or `developer` role on it
  (needed to create, list or delete endpoints and to fetch their signing secrets)
- A BlindPay API key for the API route (see [API keys](https://blindpay.com/docs/learn/api-keys))
- A publicly reachable **HTTPS** endpoint (local and private addresses are rejected; use the
  Hookdeck CLI tunnel for local work)

## How Do I Register a BlindPay Webhook Endpoint?

Webhooks are configured per instance, and an instance can have up to 25 endpoints.

**With the API:**

```bash
curl --request POST \
  --url https://api.blindpay.com/v1/instances/in_000000000000/webhook-endpoints \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{ "url": "https://example.com/webhooks/blindpay", "events": [] }'
```

An empty `events` array subscribes to every event; list event names (for example
`["payin.complete", "payout.complete"]`) to receive only those. The response returns the
endpoint id (`we_...`). Registering endpoints is rate-limited to 5 requests per 60 seconds per
user (`429` with `webhook_creation_rate_limit_exceeded`).

**From the dashboard:** open [app.blindpay.com](https://app.blindpay.com), pick the instance and
use its **Webhooks** tab.

No challenge or validation request is documented, so the endpoint simply starts receiving events.

## Where Do I Find the Signing Secret?

Each endpoint has its own secret of the form `whsec_<base64>`:

```bash
curl --request GET \
  --url https://api.blindpay.com/v1/instances/in_000000000000/webhook-endpoints/we_000000000000/secret \
  --header 'Authorization: Bearer YOUR_API_KEY'
# { "key": "whsec_..." }
```

In the dashboard: instance > **Webhooks** > the ellipsis next to the endpoint > **Get secret**.
Store the full value, prefix included:

```bash
BLINDPAY_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key.

## Testing Locally

```bash
npx hookdeck-cli listen 3000 blindpay --path /webhooks/blindpay
```

Register the tunnel URL as the endpoint. For FastAPI use port `8000`. Events arrive as resources
change, so create a customer or payin in your sandbox instance to generate deliveries. To
inspect a payload before you have a handler, point the endpoint at a request logger such as
[webhook.cool](https://webhook.cool/).

## Inspecting and Replaying Events

Open the endpoint's **Events dashboard** in the dashboard's Webhooks tab to see every delivery
attempt and response code, and to replay an event. A hosted Svix portal link for teammates comes
from `GET /v1/instances/{instance}/webhook-endpoints/portal-access`; the link is scoped to the
whole instance, so share it carefully.

## Verification Behind Hookdeck

If the endpoint URL points at a Hookdeck source (type `BLINDPAY`), Hookdeck verifies the
signature and forwards to your handler. Retries and replays resend the original `svix-timestamp`;
see [verification.md](verification.md) for how that interacts with the library's 5-minute window.
