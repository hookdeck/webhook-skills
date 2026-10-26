# Setting Up Meeting BaaS Webhooks

## Prerequisites

- A Meeting BaaS account on API v2
- A publicly reachable **HTTPS** endpoint (use the Hookdeck CLI tunnel for local work)

## Which Webhooks Can I Verify?

> Only Meeting BaaS v2 account-level webhooks are supported. Per-bot callbacks and v1 API webhooks aren't signed this way and fail verification.

Account-level webhooks are signed by Svix. Per-bot callbacks (`callback_config` on bot creation)
are direct requests that carry at most an `x-mb-secret` header with a secret you chose, and v1
webhooks predate Svix. Neither has `svix-*` headers, so the examples reject them with a 400.

## How Do I Register a Meeting BaaS Webhook Endpoint?

Webhook endpoints are configured in your Meeting BaaS **account settings, not via the API**.

1. Open your account settings and add a webhook endpoint with your HTTPS URL
   (e.g. `https://example.com/webhooks/meeting-baas`).
2. Every endpoint receives all bot and calendar events for all bots. There is no per-event
   subscription, so return `200` for events you don't handle.
3. Copy the endpoint's signing secret.
4. Return a `2xx` within 30 seconds, and process on a queue. Only `2xx` is a success: redirects,
   4xx and 5xx are all retried.

No challenge or handshake is documented.

## Where Do I Find the Signing Secret?

Per endpoint, in your account settings. Meeting BaaS's docs print no secret, and say only that v2
webhooks are sent via Svix and should be verified with Svix's libraries. Svix endpoint secrets are
`whsec_<base64>`, so that is what the examples expect. Store the full value, prefix included:

```bash
MEETING_BAAS_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
```

If the value doesn't start with `whsec_`, the examples reject it with a 500 instead of verifying
with the wrong key. If your secret has a different shape, the manual verifier in
[verification.md](verification.md) shows the key derivation to adapt.

## Resending and Failure Handling

| You want to | Use |
|-------------|-----|
| Resend a bot's webhook | `POST /v2/bots/:bot_id/resend-webhook` |
| Know when retries are exhausted | Configure a "Webhook Delivery Exhausted" alert rule (`webhook_delivery_exhausted`) |
| Re-enable a disabled endpoint | Dashboard. Endpoints failing every delivery for 5 days are disabled and later messages are silently dropped |

## Testing

Send a real event by creating a test bot, or use the Svix CLI or a request inspector such as
webhook.site. For local work run the Hookdeck CLI tunnel:

```bash
npx hookdeck-cli listen 3000 meeting-baas --path /webhooks/meeting-baas
```

## Verification Behind Hookdeck

If the endpoint URL points at a Hookdeck source, Hookdeck verifies the signature on ingest and
forwards to your handler. Retries and replays resend the original `svix-timestamp`; see
[verification.md](verification.md) for how that interacts with the library's 5-minute window.
