# Setting Up Guesty Webhooks

## Prerequisites

- A Guesty account with Open API access (OAuth client ID and secret)
- An Open API access token (`Authorization: Bearer <token>`)
- A public HTTPS endpoint on port 443 (for local development, a Hookdeck tunnel URL)

## How Do I Create a Guesty Webhook Subscription?

Subscriptions are created through the Open API, not a dashboard form. Each
subscription has a `url` and a list of `events`:

```bash
curl -X POST https://open-api.guesty.com/v1/webhooks \
  -H "Authorization: Bearer $GUESTY_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.example.com/webhooks/guesty",
    "events": [
      "reservation.created.v2",
      "reservation.updated.v2",
      "listing.updated"
    ]
  }'
```

Rules from Guesty's API reference:

- At least one event is required; unknown event names are rejected with `400`.
- The URL must be HTTPS on port 443 with a publicly resolvable hostname.
- An account can hold up to 100 webhooks.
- Don't create two subscriptions with the same URL; it can cause missed or duplicate notifications.
- The URL is fixed after creation. `PUT /v1/webhooks/{id}` replaces the event list; to change the URL, delete and recreate.
- Legacy reservation events (`reservation.new`, `reservation.updated`, `reservation_update_shortlist`) are deprecated and may require temporary allowlist approval. Prefer `reservation.created.v2` / `reservation.updated.v2`.

Other endpoints: `GET /v1/webhooks` (list), `GET /v1/webhooks/{id}`,
`DELETE /v1/webhooks/{id}`.

## Where Do I Get the Signing Secret?

Each subscribed endpoint has its own signing secret. Retrieve it either way:

1. **API:** `GET https://open-api.guesty.com/v1/webhooks-v2/secret?url=<url-encoded endpoint URL>`
   ```bash
   curl -G https://open-api.guesty.com/v1/webhooks-v2/secret \
     --data-urlencode "url=https://your-app.example.com/webhooks/guesty" \
     -H "Authorization: Bearer $GUESTY_ACCESS_TOKEN"
   ```
2. **Dashboard:** Guesty → Developer tools → Webhooks (`https://app.guesty.com/integrations/oauth-apps/webhooks`), select the endpoint.

Guesty doesn't document the secret's format. Since delivery is via Svix, expect
the Svix default: `whsec_` followed by a base64 key. Store it as
`GUESTY_WEBHOOK_SECRET`.

**Deleting and recreating a subscription for the same URL can generate a new
secret.** Re-fetch the secret and update your environment whenever you recreate
a subscription.

## Local Development

```bash
npx hookdeck-cli listen 3000 guesty --path /webhooks/guesty
```

Use the HTTPS URL the CLI prints as the `url` when creating the subscription,
then fetch the secret for that exact URL.

## Testing and Replay

Guesty has no "send test event" API. Trigger real events in a test account
(create a manual reservation, edit a listing) and watch them arrive. Failed
deliveries can be replayed from the webhooks dashboard: select the URL, find the
failed attempt, and click **Replay** (single message or all failed messages from
that time).
