# Setting Up Bridge (bridge.xyz) Webhooks

Unlike dashboard-configured providers, Bridge webhooks are managed entirely via
the **Bridge API**. The critical output is the **`public_key`** returned when you
create or update the webhook — that PEM key is what you use to verify signatures.

## Prerequisites

- A Bridge account and an **API key** (`Api-Key`).
- Your application's HTTPS webhook endpoint URL (e.g. `https://your-domain.com/webhooks/bridge-xyz`).

## Authentication

All webhook-management API calls authenticate with your API key in the `Api-Key`
header (not Basic Auth, not Bearer):

```
Api-Key: <your-api-key>
```

Mutating requests should also send an `Idempotency-Key` header.

## 1. Create the Webhook Endpoint

`POST https://api.bridge.xyz/v0/webhooks`

Subscribe by **category** using `event_categories`. Set `event_epoch` to
`"webhook_creation"` so you only receive events from creation onward.

```bash
curl --request POST \
  --url https://api.bridge.xyz/v0/webhooks \
  --header 'Api-Key: <your-api-key>' \
  --header 'Content-Type: application/json' \
  --header 'Idempotency-Key: <unique-key>' \
  --data '{
    "url": "https://your-domain.com/webhooks/bridge-xyz",
    "event_epoch": "webhook_creation",
    "event_categories": ["customer", "kyc_link", "transfer", "virtual_account.activity"]
  }'
```

The response includes:

- `id` (the `webhookID`, needed to enable/test/manage it)
- **`public_key`** — the PEM RSA public key for **this** endpoint. Copy it into
  your `BRIDGE_WEBHOOK_PUBLIC_KEY` environment variable.

> The public key is **per-webhook**, not a single global key. Each endpoint you
> create gets its own key. If you re-create or rotate an endpoint, update the env var.

## 2. Enable the Webhook

New webhooks are created in a **`disabled`** state — no events are delivered until
you enable them. Set `status` to `active` with a `PUT`:

```bash
curl --request PUT \
  --url https://api.bridge.xyz/v0/webhooks/<webhookID> \
  --header 'Api-Key: <your-api-key>' \
  --header 'Content-Type: application/json' \
  --data '{
    "url": "https://your-domain.com/webhooks/bridge-xyz",
    "status": "active",
    "event_categories": ["customer", "kyc_link", "transfer", "virtual_account.activity"]
  }'
```

The update response also returns the `public_key`.

## 3. Store the Public Key

Put the returned PEM into your environment. Because PEM is multiline, store the
single-line form with literal `\n` escapes (the examples convert `\n` back to
newlines at load time):

```bash
BRIDGE_WEBHOOK_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIB...\n-----END PUBLIC KEY-----"
```

## 4. Test the Webhook

Bridge provides endpoints to send test events and inspect delivery:

```bash
# Send a specific event to your endpoint (works while the webhook is disabled)
curl --request POST \
  --url https://api.bridge.xyz/v0/webhooks/<webhookID>/send \
  --header 'Api-Key: <your-api-key>' \
  --header 'Content-Type: application/json' \
  --header 'Idempotency-Key: <unique-key>' \
  --data '{"event_id": "<event-id>"}'

# Delivery logs, and the next 10 events queued for this webhook
curl --url https://api.bridge.xyz/v0/webhooks/<webhookID>/logs   --header 'Api-Key: <your-api-key>'
curl --url https://api.bridge.xyz/v0/webhooks/<webhookID>/events --header 'Api-Key: <your-api-key>'
```

## Local Development

Use the Hookdeck CLI to receive events on your machine without deploying (no
account required — a guest account is created on first run):

```bash
npx hookdeck-cli listen 3000 bridge-xyz --path /webhooks/bridge-xyz
```

Point your Bridge webhook `url` at the tunnel URL the CLI prints, then use the
`/send` endpoint above to deliver an event. Bridge's API reference says webhook
endpoints can be created in Sandbox but no webhook events are sent there.

## Responding to Events

- Return a **200** as quickly as possible to acknowledge receipt.
- Bridge retries an unavailable endpoint with exponential backoff for up to two days.
- Return a **non-2xx (400)** on verification/processing failure so Bridge retries.
- Reject events older than ~10 minutes (replay protection).

## References

- [Setting up webhooks](https://apidocs.bridge.xyz/get-started/introduction/quick-start/setting-up-webhooks)
- [Webhook signature verification](https://apidocs.bridge.xyz/platform/additional-information/webhooks/signature)
