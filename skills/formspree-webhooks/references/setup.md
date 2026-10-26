# Setting Up Formspree Webhooks

## Prerequisites

- A Formspree account on a Professional or Business plan
- A form to attach the webhook to
- A public HTTPS endpoint (use the Hookdeck CLI while developing)

## Register Your Endpoint

1. In Formspree, open the form and go to its **Plugins** settings.
2. Enable the **Webhooks** plugin and enter your endpoint URL, for example `https://example.com/webhooks/formspree`.
3. Choose **Simple Webhook** for a JSON payload. A **Build Hook** sends an empty body; a **REST Hook** adds a handshake and is sunset.
4. Copy the webhook's **signing secret** shown in its settings. Use it exactly as shown, as UTF-8 bytes. It is not your API key.

Formspree's docs describe the secret as the "signing secret shown in Formspree"; check the webhook's settings in your dashboard, since the exact UI labels may differ.

## Handle the REST Hook Handshake (only if you chose REST Hook)

Before sending submissions, Formspree sends a confirmation request with an `X-Hook-Secret` header. Echo that header back on an empty `2xx` response. The examples in this skill target Simple Webhooks and don't implement the handshake.

## Test Locally

```bash
# Express and Next.js
npx hookdeck-cli listen 3000 formspree --path /webhooks/formspree

# FastAPI
npx hookdeck-cli listen 8000 formspree --path /webhooks/formspree
```

Use the printed URL as the webhook URL, then submit your form.

## Environment

```bash
FORMSPREE_WEBHOOK_SECRET=your_formspree_signing_secret
FORMSPREE_WEBHOOK_TOLERANCE_SECONDS=300   # optional; unset or 0 = no window
```

## Checklist

- Endpoint answers `2xx` within 3 seconds
- Raw body is read before any parsing
- Handler is idempotent (retries can duplicate a submission)
- Method is `POST`
