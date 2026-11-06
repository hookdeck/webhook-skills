# Setting Up Paysafe Webhooks

## Prerequisites

- Paysafe merchant account with Business Portal access
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Get Your Signing Secret

Webhook notifications are signed with an `hmacKey`. Paysafe's current webhook pages do not say where it is issued; its older Alternate Payments API docs say Paysafe generates a key when you register an endpoint in the merchant back office. Start in the Business Portal or ask your Paysafe account contact, and store it as `PAYSAFE_WEBHOOK_SECRET`.

## Register Your Endpoint

Configure webhooks through the Paysafe Business Portal. The Payments API docs say you can do this from the portal, while the Paysafe Checkout docs say to open a service request there. Paysafe does not document the steps. Give it your endpoint URL (for example `https://example.com/webhooks/paysafe`) and the categories you want: payment handle, payment, settlement, void authorization, registration, refunds, original credits, standalone credits and payment scheduler.

## Local Development

```bash
npx hookdeck-cli listen 3000 paysafe --path /webhooks/paysafe
```

Use the Hookdeck URL as the webhook URL.

## Authentication

Paysafe does not document basic auth, API keys, or OAuth for inbound webhooks: the `Signature` header is the only authentication, so always verify it.

## Test vs Live

A Paysafe test account has its own test version of the Business Portal. Whether test and live share a key is not documented, so check when you set up each one.
