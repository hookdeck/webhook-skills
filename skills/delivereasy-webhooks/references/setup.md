# Setting Up Delivereasy Webhooks

> Only Lastmile webhooks are supported: paste your Delivereasy API key. Marketplace webhooks (X-Delivereasy-Signature) aren't covered.

## Prerequisites

- A Delivereasy Lastmile API account
- A public HTTPS endpoint (or the Hookdeck CLI tunnel for local work)

## Get Your Signing Key

There is no separate webhook secret. Delivereasy uses your account's **API key**, the same one you send
in the `X-DELIVEREASY-API-KEY` header on API requests, as the HMAC key. Store it as
`DELIVEREASY_WEBHOOK_SECRET`.

## Register Your Endpoint

Webhook URLs are configured by a Delivereasy representative, not self-service. Send them the URL for
each environment (one for staging, one for production). The handler route in the examples is
`/webhooks/delivereasy`.

## Local Development

```bash
npx hookdeck-cli listen 3000 delivereasy --path /webhooks/delivereasy
```

## Staging vs Production

Staging and production have separate URLs. Check that the API key you verify with matches the
environment sending the webhook.
