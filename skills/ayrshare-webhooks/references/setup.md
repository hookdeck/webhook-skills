# Setting Up Ayrshare Webhooks

## Prerequisites

- An Ayrshare account and API key
- A public HTTPS endpoint (use the Hookdeck CLI tunnel for local development)
- A signing secret you generate yourself (e.g. `openssl rand -hex 32`)

## Set the Signing Secret

> Register a webhook secret with Ayrshare. Without one, deliveries are unsigned and fail verification.

There is **one secret per User Profile**, shared by all of that profile's webhook
actions. Setting it for one action changes it for all of them. Multi-profile
accounts manage a separate secret per profile (target it with the `Profile-Key`
header).

Set it any of these ways:

1. Pass `secret` when you register a webhook (below)
2. Set or rotate it on the **Webhooks** page of the Developer Dashboard
3. Call `POST /hook/webhook/secret`:

```bash
curl --request POST https://api.ayrshare.com/api/hook/webhook/secret \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --header 'Profile-Key: YOUR_PROFILE_KEY' \
  --data '{ "secret": "your-new-signing-secret" }'
```

Put the same text in `AYRSHARE_WEBHOOK_SECRET`. It is used as-is (UTF-8 bytes),
not hex- or base64-decoded.

## Register Your Endpoint

Register one webhook per action you want (`scheduled`, `social`, `messages`,
`comments`, `mentions`, `batch`, `feed`, `automations`, `demo`, `suspended`, `ads`):

```bash
curl --request POST https://api.ayrshare.com/api/hook/webhook \
  --header 'Authorization: Bearer YOUR_API_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "action": "scheduled",
    "url": "https://your-domain.com/webhooks/ayrshare",
    "secret": "your-signing-secret"
  }'
```

You can also register from the Developer Dashboard. Register the Primary Profile
only and User Profiles inherit it; register each User Profile to give it its own URL.

For local development, run `npx hookdeck-cli listen 3000 ayrshare --path /webhooks/ayrshare`
and register the Hookdeck URL.

## Test It

Schedule a post with `scheduleDate` in the future to trigger a `scheduled` event
(immediate posts do not send one). The dashboard's webhook logs show each
delivery, your response status, and let you resend it.

## Rotating the Secret

Rotating opens a 24-hour grace window where deliveries are signed with both the
new and previous secret, so you can update `AYRSHARE_WEBHOOK_SECRET` without
dropping deliveries. See [verification.md](verification.md).
