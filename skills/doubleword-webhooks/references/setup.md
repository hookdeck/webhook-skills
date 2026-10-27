# Setting Up Doubleword Webhooks

## Prerequisites

- A Doubleword account
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Get Your Signing Key

1. Open your [profile](https://app.doubleword.ai/profile).
2. Enter your webhook URL.
3. Copy the signing key. It starts with `whsec_`; there is one key per user.

Store the full value (with the `whsec_` prefix) in `DOUBLEWORD_WEBHOOK_SECRET`.

## Register Your Endpoint

There is one webhook URL per user profile, and both `batch.completed` and `batch.failed` are
always sent. No challenge or handshake is documented, so there is nothing to answer when saving the URL.

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
