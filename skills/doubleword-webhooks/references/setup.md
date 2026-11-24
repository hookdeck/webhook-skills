# Setting Up Doubleword Webhooks

## Prerequisites

- A Doubleword account
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Create a Webhook and Get Its Signing Key

1. Open your [profile](https://app.doubleword.ai/profile) and add your webhook URL, or run
   `dw webhooks create --url https://example.com/webhook --events "batch.completed,batch.failed"`
   with the [Doubleword CLI](https://docs.doubleword.ai/dw-cli/keys-webhooks).
2. Copy the signing key. It starts with `whsec_` and is shown once, at creation time.

Store the full value (with the `whsec_` prefix) in `DOUBLEWORD_WEBHOOK_SECRET`.

## Register Your Endpoint

An account can have several webhooks, each with its own URL, event types and signing key, so a
receiver needs the key of the webhook that points at it. `dw webhooks list` shows them. No challenge
or handshake is documented, so there is nothing to answer when saving the URL.

## Rotating the Key

`dw webhooks rotate-secret <webhook-id>` issues a new key, and the old one stops working
immediately. Update `DOUBLEWORD_WEBHOOK_SECRET` (and any Hookdeck source) at the same time.

For local development:

```bash
npx hookdeck-cli listen 3000 doubleword --path /webhooks/doubleword
```

Use the Hookdeck URL as the webhook URL on your profile (FastAPI examples listen on port 8000).

## Testing

Submit a small batch and wait for it to finish. [Webhook.site](https://webhook.site) shows the
payload and headers but cannot verify the signature, so use your own server for that.

## If Deliveries Stop

After 10 consecutive failed deliveries the webhook is disabled. Fix the endpoint, then re-enable
it from your profile.
