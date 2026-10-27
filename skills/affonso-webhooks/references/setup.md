# Setting Up Affonso Webhooks

## Prerequisites

- An Affonso account with an affiliate program
- A publicly reachable **HTTPS** endpoint (HTTP is not supported). Use the Hookdeck CLI for local development

## Register Your Endpoint

1. In the Affonso dashboard, go to **Settings → Webhooks**.
2. Click **Add Endpoint** and enter your URL, for example `https://your-app.com/webhooks/affonso`.
3. Choose the events: **All events**, or specific ones such as `referral.converted`, `transaction.created`, `transaction.paid`, `payout.paid`.
4. Create the endpoint.

## Get Your Signing Secret

After the endpoint is created, copy its **Signing Secret**. It is a 64-character hex string, for example `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef`, and it is **only shown once**. Store it as `AFFONSO_WEBHOOK_SECRET`.

Use the secret as-is, as a plain string key. Do not hex-decode it.

## Send a Test Event

Use **Send Test Event** in the dashboard to deliver a sample webhook to your endpoint. The request carries `X-Affonso-Timestamp` and `X-Affonso-Signature` like any real delivery, so it exercises your verification.

## Local Development

```bash
# Express and Next.js
npx hookdeck-cli listen 3000 affonso --path /webhooks/affonso

# FastAPI
npx hookdeck-cli listen 8000 affonso --path /webhooks/affonso
```

Use the Hookdeck URL as the endpoint URL in Affonso. No account is required to start.

## Troubleshooting

- **No events arriving:** check the URL is public HTTPS, returns 2xx, and the endpoint subscribes to the events you expect.
- **Verification failing:** see [verification.md](verification.md).
