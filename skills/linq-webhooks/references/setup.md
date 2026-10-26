# Setting Up Linq Webhooks

Linq has no dashboard form for webhooks. You create webhook subscriptions through the Partner API.

## Prerequisites

- A Linq Partner API key (sent as `Authorization: Bearer $LINQ_API_KEY`)
- A public `https://` URL for your endpoint. For local development, use the Hookdeck CLI (see below).

## Create a Subscription and Get Your Signing Secret

```bash
curl -X POST https://api.linqapp.com/api/partner/v3/webhook-subscriptions \
  -H "Authorization: Bearer $LINQ_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "target_url": "https://webhooks.example.com/webhooks/linq?version=2026-02-03",
    "subscribed_events": ["message.received", "message.sent", "message.delivered", "message.read", "message.failed"]
  }'
```

The response includes `signing_secret`, a `whsec_` prefix followed by base64-encoded random bytes (for
example `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw7Jxx2Oll+OE=`). **Store it immediately: it cannot be retrieved
later.** Put the full value, prefix included, in `LINQ_WEBHOOK_SECRET`.

Notes on the request:

- `target_url` must be unique per account. To route different lines to different endpoints, give each
  subscription its own URL, for example `?line=support`.
- Pin the payload version with `?version=2026-02-03` (or `2025-01-01`) on the URL. Without it you get the
  latest version at creation time.
- `subscribed_events` is the exact list of `event_type` strings to receive. Account events (for example
  `api_token.created`) are subscribed to the same way.
- Optional `phone_numbers` (E.164 array) limits message-style events to specific lines. It does not apply to
  account events. Routing headers can also be set on a subscription.
- No challenge or validation request is sent when you create a subscription, so the endpoint doesn't need a
  handshake.

## Manage Subscriptions

| Action | Endpoint |
|--------|----------|
| List | `GET /webhook-subscriptions` |
| Retrieve | `GET /webhook-subscriptions/{id}` |
| Update | `PUT /webhook-subscriptions/{id}`: change `target_url`, `subscribed_events`, `phone_numbers`, `is_active`, routing headers. Omitted fields keep their values |
| Delete | `DELETE /webhook-subscriptions/{id}` |
| List event types | The Webhook Events endpoint in the API reference |

Pause a subscription with `is_active: false`. The signing secret **cannot be changed** by an update. To
rotate it, delete the subscription and create a new one, then update `LINQ_WEBHOOK_SECRET`. See the
[API reference](https://docs.linqapp.com/channel/imessage/api/resources/webhook_subscriptions/) for the
exact methods and request shapes.

## Register Your Endpoint (Local Development)

```bash
# Express and Next.js
npx hookdeck-cli listen 3000 linq --path /webhooks/linq

# FastAPI
npx hookdeck-cli listen 8000 linq --path /webhooks/linq
```

No account is needed. Use the URL the CLI prints as `target_url`, then send or receive a message on one of
your lines to see the event arrive.

## Test Mode vs Live Mode

The webhook docs describe no separate test mode. Deliveries go to the subscriptions of the environment where the
change happened, and account-wide events (environment lifecycle, team members) go to Production
subscriptions. Each subscription has its own signing secret, so use the secret of the subscription that is
actually delivering to the URL.

## Troubleshooting Delivery

- Linq retries 5xx, 429, timeouts and refused connections for up to 30 minutes, then gives up. Other 4xx
  responses are not retried, so a `400` for a bad signature loses the event.
- If deliveries never arrive, check `is_active`, the `subscribed_events` list, the `phone_numbers` filter,
  and that the URL doesn't redirect. Error code `4003` is "Webhook delivery failed".
- A subscription that receives `webhook_subscription.*` events gets them about itself too, which is a handy
  way to see a change land.
