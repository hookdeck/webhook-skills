# Monerium Webhooks - FastAPI Example

Minimal example of receiving Monerium webhooks with signature verification using the
[`standardwebhooks`](https://pypi.org/project/standardwebhooks/) library (Monerium follows the
Standard Webhooks specification).

## Prerequisites

- Python 3.9+
- Monerium application (sandbox or production) with an access token for `POST /webhooks`
- A `whsec_` secret that you generate yourself (see Setup)

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Generate the secret yourself and set it in `.env` as `MONERIUM_WEBHOOK_SECRET` (the full `whsec_...` value).
   Monerium doesn't issue one: you create it and send the same value when you register the webhook.
   ```bash
   node -e "console.log('whsec_' + require('crypto').randomBytes(32).toString('base64'))"
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/monerium
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the Standard Webhooks algorithm
(`{webhook-id}.{webhook-timestamp}.{raw body}`, HMAC-SHA256, base64), and check that the
`svix-*` header names are accepted too.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 monerium --path /webhooks/monerium
```

Monerium has no dashboard form for this: you register the endpoint through the API with the tunnel URL, your own secret and the event types. Use the same value as `MONERIUM_WEBHOOK_SECRET`:

```javascript
const secret = process.env.MONERIUM_WEBHOOK_SECRET; // 'whsec_' + crypto.randomBytes(32).toString('base64')
await fetch('https://api.monerium.dev/webhooks', {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ url: '<tunnel URL>', secret, types: ['order.created', 'order.updated'] }),
});
```

Monerium immediately sends a `subscription.created` event; the handler answers `200`, which activates the subscription.

## Event Handling

Every body is `{ type, data }`. The handler reads the event name from the top-level `type` field, routes these events, and logs anything else:

- `order.created` (`data.kind`, `amount`, `currency`, `chain`, `counterpart`)
- `order.updated` (`data.id`, `state`, `meta`: `processed` carries `meta.txHashes`, `rejected` carries `meta.rejectedReason`)
- `subscription.created`

The body has no event id: use the `webhook-id` header to deduplicate.

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
