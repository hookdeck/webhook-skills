# Setting Up Cover Genius Offers Webhooks

There is no self-service webhook dashboard for Offers. Your Cover Genius Client Solution
Engineer (CSE) configures the webhook on the Offers API for you.

## Prerequisites

- A Cover Genius Offers integration and an assigned CSE
- A public HTTPS URL for your listener. During development, tunnel to localhost:

```bash
npx hookdeck-cli listen 3000 cover-genius --path /webhooks/cover-genius
```

(Use port `8000` for the FastAPI example.)

## 1. Choose an Authentication Key

Generate a long random key and keep it in your app's environment:

```bash
openssl rand -hex 32
```

```bash
COVER_GENIUS_API_KEY=<the key>
```

## 2. Send Your CSE the Webhook Details

Provide your CSE with:

1. **Listener URL**: e.g. `https://your-app.example.com/webhooks/cover-genius`
2. **Authentication Key & Secret**: the key above (Cover Genius sends it in `X-Api-Key`) and a
   secret. The secret is only used for the optional `Authorization` signature, see
   [verification.md](verification.md).
3. **Support URL**
4. **Requested events**: pick from `BOOKING_CREATED`, `BOOKING_UPDATED`, `BOOKING_CANCELLED`,
   `RENEWAL_CREATED`, `RENEWAL_NOTIFICATION`, `RENEWAL_DUE`, `RENEWAL_EXPIRED`. Your CSE may
   propose events during solutioning.

## 3. Respond Correctly

Return `200 OK` once the event is handled. Anything else is treated as a failure and the webhook
is retried up to 3 times.

## Testing

Trigger a booking through the Offers API (confirm, update or cancel an Offer) and watch the
request arrive, or replay a captured request:

```bash
curl -X POST http://localhost:3000/webhooks/cover-genius \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: $COVER_GENIUS_API_KEY" \
  -d '{"event":"BOOKING_CANCELLED","payload":{"id":"HMZZ8-3YYHZ-INS","status":"CANCELLED","quotes":[]}}'
```
