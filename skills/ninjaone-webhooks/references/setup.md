# Setting Up NinjaOne Webhooks

## Prerequisites

- A NinjaOne tenant
- An API client (application) whose token can call `PUT /v2/webhook`. NinjaOne answers
  `403 Only system administrators can configure webhooks` otherwise.
- Your endpoint URL (`https://your-host/webhooks/ninjaone`)

## How Do I Get a Secret?

NinjaOne doesn't issue one. Generate it yourself and keep it in `NINJAONE_WEBHOOK_SECRET`:

```bash
openssl rand -hex 32
```

Prefer hex or base64url characters. Avoid spaces and non-ASCII characters in a header value.

## How Do I Register the Webhook?

Call `PUT /v2/webhook` (creates or updates the configuration for the current
application/client; responds `204 No Content`). The secret goes in the `headers` array:

```bash
curl -X PUT https://app.ninjarmm.com/v2/webhook \
  -H "Authorization: Bearer $NINJA_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-host/webhooks/ninjaone",
    "activities": { "CONDITION": ["TRIGGERED", "RESET"] },
    "headers": [{ "name": "X-Webhook-Secret", "value": "<your secret>" }]
  }'
```

Use your own region's host (`app.ninjarmm.com`, `eu.ninjarmm.com`, `oc.ninjarmm.com`, ...).

| Field | Purpose |
|-------|---------|
| `url` | Callback URL for activity notifications |
| `headers` | Custom HTTP headers (`name`, `value`), sent with every delivery. This is where the secret goes |
| `activities` | Activity filter: an object whose keys are activity types and whose values are arrays of status codes |
| `organizationIds` | Only send activities for these organizations |
| `expand` | Which references to expand in payloads |

The spec types `activities` as an object of string arrays; the `{ "CONDITION": [...] }`
shape above is the natural reading of that. If NinjaOne rejects it, check the current
webhook article for the exact filter syntax.

`PUT` replaces the configuration for the client, so include `headers` every time you update it.

## How Do I Remove It?

`DELETE /v2/webhook` disables the webhook configuration for the current client.

## Why Can't I Authenticate a Console Webhook?

Webhooks added as a notification channel in the NinjaOne console take a URL only. There's
no header field, so nothing in the request proves where it came from. Either move to the
API configuration, or accept those deliveries only through a gateway that authenticates
them (for example a Hookdeck source with its own verification).

## Test Your Endpoint

1. Run a handler from `examples/` and expose it: `npx hookdeck-cli listen 3000 ninjaone --path /webhooks/ninjaone` (port `8000` for FastAPI).
2. Register the printed URL with `PUT /v2/webhook`.
3. Trigger a condition on a test device (or reset one) and watch the request arrive.
4. Send a request without the header to confirm you get `401`:
   ```bash
   curl -i -X POST http://localhost:3000/webhooks/ninjaone -H 'Content-Type: application/json' -d '{"activityType":"CONDITION"}'
   ```

## Retries and Delivery Guarantees

The API spec says nothing about retries, timeouts or delivery order. Respond with `2xx`
quickly, deduplicate on `id` + `statusCode`, and don't assume ordering between
`TRIGGERED` and `RESET`.
