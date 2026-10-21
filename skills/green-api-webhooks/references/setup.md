# Setting Up GREEN-API Webhooks

## Prerequisites

- A GREEN-API account with an **authorized** instance (WhatsApp linked by QR
  code or phone number). You need its `idInstance` and `apiTokenInstance`.
- A public HTTPS URL for your webhook endpoint (use the Hookdeck CLI below for
  local development).

## Choose a Webhook URL Token

GREEN-API doesn't sign webhooks, so `webhookUrlToken` is the only way to
authenticate them. Generate a long random secret:

```bash
openssl rand -hex 32
```

The value you enter as `webhookUrlToken` becomes the full `Authorization` header
of every webhook. The docs say to include the scheme:

| You enter `webhookUrlToken` | GREEN-API sends `Authorization` |
|-----------------------------|----------------------------------|
| `Bearer <token>` | `Bearer <token>` |
| `Basic <token>` | `Basic <token>` |
| `<token>` (no scheme) | `Bearer <token>` (default scheme) |

Store the same value in `GREEN_API_WEBHOOK_URL_TOKEN`. The examples accept any
of the three forms and build the expected header the same way.

## Register Your Endpoint

### Option A: Console

1. Open the [GREEN-API console](https://console.green-api.com/) and select the
   instance. (Webhook settings only show for authorized instances.)
2. Set **Webhook URL** to your endpoint, e.g.
   `https://your-domain.com/webhooks/green-api`.
3. Set **Webhook URL Token** to the value you chose above.
4. Turn on the notification types you need, e.g. *Receive notifications about
   incoming messages and files*, *outgoing message statuses*, *messages sent
   from API*, and *instance authorization state change*.
5. Save.

### Option B: SetSettings API

```bash
curl -X POST "${API_URL}/waInstance${ID_INSTANCE}/setSettings/${API_TOKEN_INSTANCE}" \
  -H "Content-Type: application/json" \
  -d '{
    "webhookUrl": "https://your-domain.com/webhooks/green-api",
    "webhookUrlToken": "Bearer your-long-random-secret",
    "incomingWebhook": "yes",
    "outgoingWebhook": "yes",
    "outgoingMessageWebhook": "yes",
    "outgoingAPIMessageWebhook": "yes",
    "stateWebhook": "yes"
  }'
```

`API_URL` is your instance's `apiUrl`, shown in the console next to
`idInstance` and `apiTokenInstance`.

| Setting | Enables |
|---------|---------|
| `incomingWebhook` | `incomingMessageReceived` |
| `outgoingWebhook` | `outgoingMessageStatus` |
| `outgoingMessageWebhook` | `outgoingMessageReceived` |
| `outgoingAPIMessageWebhook` | `outgoingAPIMessageReceived` |
| `stateWebhook` | `stateInstanceChanged` |
| `incomingCallWebhook` + `incomingWebhook` | `incomingCall` |

To stop receiving webhooks, set `webhookUrl` to an empty string.

## Local Development

```bash
npx hookdeck-cli listen 3000 green-api --path /webhooks/green-api
```

Use the printed URL as `webhookUrl`, then send a WhatsApp message to the linked
number. (Use port `8000` for the FastAPI example.)

## Optional: IP Allowlist

GREEN-API publishes the IPs it sends webhooks from. See
[verification.md](verification.md#can-i-restrict-by-ip-address). Use the list
alongside the token, not instead of it.

## Test Mode

GREEN-API has no sandbox mode. Developer-plan instances are free with
limits. To debug, point `webhookUrl` at the Hookdeck CLI (or a request bin)
and inspect the requests.
