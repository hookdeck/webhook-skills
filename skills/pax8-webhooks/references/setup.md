# Setting Up Pax8 Webhooks

Covers partner Webhooks API webhooks only. Paste the Authorization value exactly as set in Pax8, including any "Bearer " or "Basic " prefix.

## Prerequisites

- A Pax8 partner account and a Pax8 OAuth2 token (JWT) with the `webhook_*` scopes
- The token owner must have permission to the Pax8 account and its Events object, otherwise no
  notifications are emitted
- A public **HTTPS** endpoint (Pax8 rejects URLs that are missing a scheme or not `https`)

## Create the Webhook and Set the Authorization Value

Webhooks are managed through the API (there is no dashboard step in the docs). Call
`POST https://api.pax8.com/api/v2/webhooks` with `Authorization: Bearer <your Pax8 token>`:

```json
{
  "displayName": "Pax8 listener",
  "url": "https://example.com/webhooks/pax8",
  "contactEmail": "ops@example.com",
  "authorization": "Bearer my_super_secret",
  "active": true,
  "errorThreshold": 10,
  "webhookTopics": [{ "topic": "SUBSCRIPTION", "filters": [{ "action": "CREATE" }] }]
}
```

1. Pick a long random `authorization` value. It is optional, but Pax8 encourages it and it
   is the only protection you get. It is stored encrypted and sent back **exactly as entered**.
2. Store the **full value** (including any `Bearer ` or `Basic ` prefix you typed) as
   `PAX8_AUTHORIZATION`. Do not strip, parse or base64-decode it.
3. Look up valid topics and actions with `GET /webhooks/topic-definitions` first.
4. `active` is forced to `false` if no topics are supplied. Activate later with
   `POST /webhooks/{id}/status` (fails if the url is null).

Change the url or credential later with `POST /webhooks/{id}/configuration`; add a topic with
`POST /webhooks/{id}/topics`.

## Local Testing

```bash
npx hookdeck-cli listen 3000 pax8 --path /webhooks/pax8
```

Use the printed URL as the webhook `url`. For FastAPI, use port `8000`. Then trigger a
synthetic event:

```bash
POST /webhooks/{id}/topics/SUBSCRIPTION/test
```

The webhook does not need to be active or subscribed to that topic, but its url must be set.
Delivery attempts, status codes and errors appear in `GET /webhooks/{webhookId}/logs`.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/pax8 \
  -H "Content-Type: application/json" \
  -H "Authorization: $PAX8_AUTHORIZATION" \
  -d '{"topic":"SUBSCRIPTION","action":"CREATE","id":"00000000-0000-0000-0000-000000000000"}'
```

(The body above is illustrative.)
