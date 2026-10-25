# Setting Up Tremendous Webhooks

## Prerequisites

- Tremendous account (production or [sandbox](https://testflight.tremendous.com)) and an API key
- A public HTTPS endpoint (use `npx hookdeck-cli listen 3000 tremendous --path /webhooks/tremendous` during development)

## Create the Webhook and Get Your Private Key

Webhooks are configured through the API, not a dashboard form. Each organization has a single receiver endpoint.

```bash
curl -X POST https://testflight.tremendous.com/api/v2/webhooks \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{ "url": "https://your-domain.com/webhooks/tremendous" }'
```

The response includes a `private_key`. Store it as `TREMENDOUS_WEBHOOK_PRIVATE_KEY`. You can retrieve it again later with [List webhooks](https://developers.tremendous.com/reference/list-webhooks) or [Retrieve webhook](https://developers.tremendous.com/reference/get-webhook). See the [Create webhook reference](https://developers.tremendous.com/reference/create-webhook) for the schema. Production uses `https://api.tremendous.com/api/v2` instead of the sandbox host. Posting again with a new `url` changes the endpoint.

## Send a Test Event

Use the [Test webhook](https://developers.tremendous.com/reference/simulate-webhook) endpoint to make Tremendous fire an event at your receiver:

```bash
curl -X POST https://testflight.tremendous.com/api/v2/webhooks/WEBHOOK_ID/simulate \
  -H 'Authorization: Bearer YOUR_API_KEY' \
  -H 'Content-Type: application/json' \
  -d '{ "event": "INVOICES.PAID" }'
```

## Choose Events

You can't pick events: the receiver gets every event in the account. Filter on the `event` field in your handler and return `200` for events you ignore.

## Allow Tremendous IPs (optional)

All webhook requests originate from fixed IP addresses, listed in the [webhook docs](https://developers.tremendous.com/docs/webhooks-1#webhook-ips) (separate production and sandbox lists). Allowlist them if your network requires it, but still verify the signature.

## Test Mode vs Live Mode

Sandbox and production are separate organizations with separate webhooks and private keys, and the sandbox sends from different IPs. Create the webhook in each environment and use that environment's `private_key`.

## Using Hookdeck

In Hookdeck, create a source of type Tremendous and paste the webhook `private_key` as the signing secret, then register the Hookdeck source URL as the webhook `url`.
