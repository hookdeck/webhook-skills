# Setting Up KOMOJU Webhooks

## Prerequisites

- A KOMOJU account (a Test mode account is available straight after sign-up)
- A public HTTPS endpoint URL that accepts `POST`

## Register Your Endpoint

1. Log in to the KOMOJU dashboard and go to Manage > Webhooks.
2. Add a webhook with your endpoint URL (for example `https://example.com/webhooks/komoju`).
3. Select the events to receive, for example `payment.captured`, `payment.refunded`,
   `payment.failed` and `subscription.created`. The `ping` event lets you test the endpoint.
4. Set a secret token (see below) and save.

Payments API callers can also attach a webhook to a single payment. These per-payment webhooks are
sent in addition to the central ones; the secret goes in `secret_key` on the per-payment webhook.

## Get Your Signing Secret

Set a secret token on the KOMOJU webhook. Without one, deliveries are unsigned and fail verification.

The secret token is the one you provide when creating or updating the webhook in KOMOJU. KOMOJU does
not generate it for you. Store it as `KOMOJU_WEBHOOK_SECRET` and use it as-is (UTF-8 bytes); it is
not a hex- or base64-encoded key. If you use separate KOMOJU environments, keep their
secrets apart.

## Setup with Hookdeck

Create a Hookdeck source with the **KOMOJU** type and paste the secret token into the source's
webhook verification settings. Then register the Hookdeck source URL as the webhook URL in KOMOJU.

## If Deliveries Fail

A non-success status or a connection failure is retried 25 times with growing intervals. Fix the
endpoint, then resend any missed delivery from the dashboard (from the payment's page).

## Local Development

```bash
npx hookdeck-cli listen 3000 komoju --path /webhooks/komoju
```

Use the Hookdeck URL as the webhook URL while developing.
