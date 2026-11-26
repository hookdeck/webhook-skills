# Setting Up Cloudinary Webhooks

## Prerequisites

- A Cloudinary account.
- A publicly reachable **HTTPS** endpoint that accepts `POST` requests.
- The **API Secret** that signs notifications (see below).

## Get Your Signing Secret (the account API Secret)

Cloudinary signs every notification with the API secret of the API key selected
for webhook notifications (**Select API Key** on the Console's Webhook
Notifications page), or of the oldest active key if none is selected. There is
**no separate per-webhook signing secret**. For a single-key environment it is the
`api_secret` portion of:

```
CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@<cloud_name>
```

1. Sign in to the [Cloudinary Console](https://console.cloudinary.com).
2. Go to **Settings → API Keys** (or the Console dashboard) and copy the
   **API Secret**.
3. Store it in your environment as `CLOUDINARY_API_SECRET`:

   ```bash
   CLOUDINARY_API_SECRET=your_account_api_secret
   ```

Your handler verifies the incoming `x-cld-signature` / `x-cld-timestamp` headers
against this secret — see [verification.md](verification.md).

> **Signature algorithm:** Cloudinary accepts SHA-1 and SHA-256 digests, and the
> SDKs use SHA-1 unless `signature_algorithm` is `sha256`. If support has limited
> your account to SHA-256, set `CLOUDINARY_SIGNATURE_ALGORITHM=sha256`.

## Register Your Notification URL

You can receive notifications two ways:

- **Global Notification URL** — Console → **Settings → Webhook Notifications**,
  or the Admin API `triggers` method. Cloudinary POSTs eligible events here.
- **Per-request `notification_url`** — pass `notification_url` when calling the
  Upload API (or set `eager_notification_url` for eager transformations) to
  receive the notification for that specific operation.

Provide the public URL where Cloudinary should POST (e.g.
`https://api.example.com/webhooks/cloudinary`) and select the notification types
you want.

## Acknowledge Correctly (Retries)

Return **HTTP 200** within 20 seconds of receiving the notification. For any
other response Cloudinary makes three more attempts (after 3, 6 and 9 minutes,
as its docs list them). Acknowledge fast
and do heavy work asynchronously; return `401` only for a failed signature check
and `400` for missing headers or invalid JSON.

## Testing

- Trigger real notifications by uploading an asset with a `notification_url`, or
  by performing an operation (rename, delete, moderation) covered by your global
  Notification URL.
- For local development, tunnel to your machine with the Hookdeck CLI:

  ```bash
  npx hookdeck-cli listen 3000 cloudinary --path /webhooks/cloudinary
  ```

  No account is required — the CLI creates a guest account and provides a local
  tunnel plus a web UI for inspecting requests. Use port `8000` for the FastAPI
  example.

## Full Documentation

- [Cloudinary notifications](https://cloudinary.com/documentation/notifications)
- [Notification signatures](https://cloudinary.com/documentation/notification_signatures)
