# Setting Up Paysafe Webhooks

## Prerequisites

- Paysafe merchant account with Business Portal access
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Get Your Signing Secret

Webhook notifications are signed with an HMAC key associated with your webhook configuration in the Business Portal. Store it as `PAYSAFE_WEBHOOK_SECRET`. Paysafe's documentation does not describe the exact portal menu path, so follow the current Business Portal UI or ask your Paysafe account contact.

## Register Your Endpoint

1. Open the Paysafe Business Portal and go to the webhook configuration for your account.
2. Enter your endpoint URL (for example `https://example.com/webhooks/paysafe`).
3. Select the event categories to receive: payment handle, payment, settlement (add refunds, void authorizations, and others as needed).
4. Save and copy the HMAC key.

## Local Development

```bash
npx hookdeck-cli listen 3000 paysafe --path /webhooks/paysafe
```

Use the Hookdeck URL as the webhook URL.

## Authentication

Paysafe does not document basic auth, API keys, or OAuth for inbound webhooks: the `Signature` header is the only authentication, so always verify it.

## Test vs Live

Configure webhooks separately for your test and production accounts, each with its own HMAC key.
