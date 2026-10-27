# Setting Up Upload-Post Webhooks

## Prerequisites

- An Upload-Post account
- Your application's public webhook endpoint URL (use the Hookdeck CLI for local development)

## Get Your Webhook Secret

Upload-Post creates the account's `webhook_secret` automatically the first time you save a `webhook_url` (or a profile webhook); you can't choose it. Read it in the dashboard under Notifications → Signing secret, or with `GET https://api.upload-post.com/api/uploadposts/users/notifications`. Rotate it with `POST https://api.upload-post.com/api/uploadposts/users/webhook-secret`; rotation takes effect immediately, so deploy the new secret on your receiver first and accept both during the switch (see the [webhook docs](https://docs.upload-post.com/api/webhooks)). Per-profile webhooks are signed with the same account secret. Upload-Post only sends `X-Upload-Post-Signature` when the account has a secret, and deliveries made before a secret existed carry no signature and fail verification.

> Paste the whole secret, including the whsec_ prefix. Upload-Post uses it as a plain HMAC key.

Store it unchanged in `UPLOAD_POST_WEBHOOK_SECRET`. Do not strip the `whsec_` prefix and do not base64-decode it.

## Register Your Endpoint

1. Configure the webhook URL in Upload-Post, pointing at `https://your-host/webhooks/upload-post`.
2. Enable the events you want. Instagram DMs (`dm_received`) and comments (`comment_received`) are opt-in.
3. Hookdeck source type: `UPLOAD_POST` ("Upload-Post"). It verifies the same signature, so paste the same whole secret there.

## Local Development

```bash
npx hookdeck-cli listen 3000 upload-post --path /webhooks/upload-post
```

## Testing

Trigger an upload or connect and disconnect a test social account, then check the request in the Hookdeck CLI web UI. Upload-Post makes one attempt per event, so use Hookdeck replay to resend a delivery while debugging.
