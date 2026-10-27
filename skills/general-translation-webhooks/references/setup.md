# Setting Up General Translation Webhooks

## Prerequisites

- A General Translation organization on the Starter or Enterprise plan
- A public HTTPS URL for your endpoint (for local development, use the Hookdeck CLI below)

## How Do I Get the Signing Secret?

1. Go to **Organization > Developer > Webhooks** in the General Translation dashboard.
2. Open your endpoint's detail page.
3. Copy the signing secret. It starts with `whsec_`.
4. Put the full value, including `whsec_`, in `GENERAL_TRANSLATION_WEBHOOK_SECRET`.

Each endpoint has its own secret. The HMAC key is the base64-decoded part after `whsec_`; the libraries do this for you.

## How Do I Register an Endpoint?

1. Go to **Organization > Developer > Webhooks** and click **Add endpoint**.
2. Enter the endpoint URL. It must use HTTPS.
3. Select the event types: `translated_file.completed`, `translated_file.edited`, `translation_job.completed`. You can change subscriptions later from the detail page.
4. Click **Create endpoint**, then copy the signing secret.

You can create up to 5 endpoints per organization, and endpoints can be disabled. No challenge or handshake is required.

## Local Development

```bash
# Express / Next.js (use 8000 for FastAPI). No install or account required.
npx hookdeck-cli listen 3000 general-translation --path /webhooks/general-translation
```

Register the printed HTTPS URL as an endpoint, then complete a translation (or edit a translated file) to produce an event.

## How Do I Test and Replay?

- **Webhook Events** (**Organization > Developer > Webhook Events**) lists every event and its delivery attempts.
- Select a failed attempt's **Retry** to resend it.
- Retries and manual replays reuse the event's `id` and the resource fields captured at creation. If verification fails on a late retry, see the timestamp window notes in [verification.md](verification.md).
