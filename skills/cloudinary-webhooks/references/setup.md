# Setting Up Cloudinary Webhooks

## Prerequisites

- A Cloudinary account.
- A publicly reachable **HTTPS** endpoint that accepts `POST` requests.
- Your account **API Secret** (see below).

## Get Your Signing Secret (the account API Secret)

Cloudinary signs every notification with your **account API Secret** — there is
**no separate per-webhook signing secret**. It is the `api_secret` portion of your
account's environment variable:

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

> **Signature algorithm:** Cloudinary signs with **sha1** by default. Some
> accounts enable **sha256** (a Console setting). If your account uses sha256, set
> `CLOUDINARY_SIGNATURE_ALGORITHM=sha256` so verification matches.

## Register Your Notification URL

You can receive notifications two ways:

- **Global Notification URL** — Console → **Settings → Webhook Notifications**
  (or **Upload → Notification URL**). Cloudinary POSTs eligible events here.
- **Per-request `notification_url`** — pass `notification_url` when calling the
  Upload API (or set `eager_notification_url` for eager transformations) to
  receive the notification for that specific operation.

Provide the public URL where Cloudinary should POST (e.g.
`https://api.example.com/webhooks/cloudinary`) and select the notification types
you want.

## Acknowledge Correctly (Retries)

Return **HTTP 2xx** as soon as you have accepted the notification. If your
endpoint fails or is unreachable, Cloudinary retries delivery. Acknowledge fast
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
