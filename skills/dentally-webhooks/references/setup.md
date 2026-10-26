# Setting Up Dentally Webhooks

## Prerequisites

- A Dentally account with access to Developer Settings (or an OAuth access token with the scopes needed to manage webhooks via the API)
- An HTTPS endpoint (plain HTTP is only accepted in the sandbox environment)

## Get Your Signing Secret

Dentally has no generated signing secret: **you choose the `secret` string** when you create the webhook endpoint. Use a long random value and store it as `DENTALLY_WEBHOOK_SECRET`.

## Register Your Endpoint

### Option 1: Developer Settings

1. Open your Dentally Developer Settings.
2. Create a webhook with your endpoint URL, a name, a secret, and the events to receive.

### Option 2: API

```bash
curl --include \
  --request POST \
  --header "Content-Type: application/json" \
  --header "Authorization: Bearer ACCESS_TOKEN" \
  --header "User-Agent: my-integration" \
  --data-binary '{
    "webhook": {
      "active": true,
      "events": ["appointment.created", "patient.updated"],
      "name": "My example webhook",
      "secret": "pLjUpNQu8a4YjeCrf2KseA",
      "url": "https://example.com/webhooks/dentally"
    }
  }' \
  https://api.dentally.co/v1/webhooks
```

Parameters are wrapped in a `webhook` object. Available events: `appointment.created`, `appointment.updated`, `appointment.deleted`, `patient.created`, `patient.updated`, `patient.deleted`, `payment.created`, `payment.updated`, `payment.deleted`.

## Sandbox vs Production

- Production API: `https://api.dentally.co`
- Sandbox: see the Dentally API overview for the sandbox host. Unsecured (HTTP) webhook URLs are allowed only in the sandbox.

## Re-enabling a Disabled Webhook

If more than 50 deliveries fail, Dentally disables the webhook automatically. Fix the handler, then re-enable it in Developer Settings. The webhook object's `failed_deliveries` counter shows non-2xx responses so far.

## Local Development

```bash
npx hookdeck-cli listen 3000 dentally --path /webhooks/dentally
```
