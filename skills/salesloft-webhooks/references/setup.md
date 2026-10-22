# Setting Up Salesloft Webhooks

## Prerequisites

- A Salesloft account and either an OAuth token or an API key
- The scopes needed for the events you subscribe to (e.g. `people:read` for `person_created`)
- A public HTTPS endpoint, e.g. `https://your-app.com/webhooks/salesloft`

## How Do I Get a Signing Secret?

Salesloft doesn't generate one. You choose the `callback_token` when you create the subscription, and Salesloft uses it as the HMAC key:

```bash
openssl rand -hex 32
```

Store the same value in your app as `SALESLOFT_CALLBACK_TOKEN`. Use one token per subscription (or reuse one across subscriptions pointing at the same endpoint).

## How Do I Register My Endpoint?

Subscriptions are API-only. Create one per event type with `POST https://api.salesloft.com/v2/webhook_subscriptions`:

```bash
curl -X POST https://api.salesloft.com/v2/webhook_subscriptions \
  -H "Authorization: Bearer $SALESLOFT_API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "callback_url": "https://your-app.com/webhooks/salesloft",
    "callback_token": "'"$SALESLOFT_CALLBACK_TOKEN"'",
    "event_type": "person_created"
  }'
```

Repeat for each event (`person_updated`, `call_created`, `email_updated`, `meeting_booked`, `cadence_membership_created`, ...). `callback_url`, `callback_token` and `event_type` are all required by the [Create a webhook subscription](https://developers.salesloft.com/docs/api/webhook-subscriptions-create/) endpoint; the same API lists, fetches, updates, and deletes subscriptions.

## How Do I Test It?

- Run a local tunnel:

  ```bash
  npx hookdeck-cli listen 3000 salesloft --path /webhooks/salesloft
  ```

  Use the printed URL as the `callback_url`.
- Trigger the event in Salesloft (create a person, log a call) and watch the request arrive.
- Delete test subscriptions when finished.
