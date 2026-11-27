# Setting Up Lithic Webhooks

## Prerequisites

- A Lithic API key (sandbox or production)
- Your application's public HTTPS endpoint URL (e.g. `https://api.example.com/webhooks/lithic`)

## Create an Event Subscription

Lithic delivers events to **event subscriptions**, which you manage with the
[Events API](https://docs.lithic.com/docs/events-api):

```bash
curl https://api.lithic.com/v1/event_subscriptions \
  -X POST \
  -H "Authorization: $LITHIC_API_KEY" \
  -H 'content-type: application/json' \
  -d '{
    "url": "https://api.example.com/webhooks/lithic",
    "description": "Card and transaction events",
    "event_types": ["card.created", "card_transaction.updated"]
  }'
```

- `url` must be a valid HTTPS address.
- Leave `event_types` out to receive every type, including new ones Lithic adds
  later. Subscribe only to what you handle to reduce noise.
- List, update and delete subscriptions with `GET`, `PATCH` and `DELETE` on
  `/v1/event_subscriptions[/{event_subscription_token}]`.

## Get Your Signing Secret

```bash
curl https://api.lithic.com/v1/event_subscriptions/{event_subscription_token}/secret \
  -H "Authorization: $LITHIC_API_KEY"
# {"key": "whsec_..."}
```

1. Copy the `whsec_...` value.
2. Store it as `LITHIC_WEBHOOK_SECRET` in your environment (never commit it).

The part after the `whsec_` prefix is base64-decoded to form the HMAC key (the
official SDK does this for you). Lithic's verification docs also say secrets are
configured per program, so if you run several programs, use each program's
secret.

## Environment Variables

```bash
LITHIC_WEBHOOK_SECRET=whsec_xxxxx   # From GET /v1/event_subscriptions/{token}/secret
LITHIC_API_KEY=your_api_key         # Only needed to call the Lithic API
```

The API key is **not** required to verify webhooks; verification only needs the
signing secret. It is included because the official SDK client reads it and you
often call the API to fetch related resources.

## Sandbox vs Production

Sandbox (`https://sandbox.lithic.com`) and production (`https://api.lithic.com`)
use different API keys. Create a subscription through each host you use, and
test end to end in sandbox first.

Send a sample event to a sandbox subscription:

```bash
curl https://sandbox.lithic.com/v1/simulate/event_subscriptions/{event_subscription_token}/send_example \
  -X POST \
  -H "Authorization: $LITHIC_SANDBOX_API_KEY" \
  -H 'content-type: application/json' \
  -d '{"event_type": "dispute_transaction.created"}'
```

Not every event type can be simulated; the response says when one isn't supported.

## Rotating Secrets

```bash
curl -X POST https://api.lithic.com/v1/event_subscriptions/{event_subscription_token}/secret/rotate \
  -H "Authorization: $LITHIC_API_KEY"
```

The previous secret stays valid for 24 hours, and during that time the
`webhook-signature` header can carry a signature for each secret. Read the new
secret, deploy it, and check that your verifier accepts a match on any entry in
the header (the SDK does).

## Delivery Failures

Lithic retries a failed delivery up to 8 times over about 27 hours (immediately,
then +5s, +5m, +30m, +2h, +5h, +10h, +10h). A subscription that fails for
**5 days** in a row is disabled; re-enable it by updating it with
`"disabled": false`. After an outage, recover failed messages with
`POST /v1/event_subscriptions/{token}/recover?begin=...`.

## Receiving Webhooks Locally

Use the Hookdeck CLI to tunnel events to your machine, no account required:

```bash
npx hookdeck-cli listen 3000 lithic --path /webhooks/lithic
```

The CLI prints a public URL to register as your subscription URL, plus a web UI
to inspect and replay requests.
