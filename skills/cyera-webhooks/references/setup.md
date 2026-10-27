# Setting Up Cyera Privacy Webhooks

## Prerequisites

- A Cyera Privacy account (privacy.cyera.io) with permission to manage integrations
- A public HTTPS endpoint (or a Hookdeck URL) that accepts `POST`

## Hookdeck Source

Hookdeck's source type is `CYERA` (labelled "Cyera"); it manages the method as `POST`. Hookdeck
shows this note for the source:

For Cyera Privacy's privacy-request webhooks. Paste the Webhook Secret from the webhook integration.

## Get Your Webhook Secret

1. In Cyera Privacy, set up the webhook integration described in the
   [webhook integration docs](https://integrations.privacy.cyera.io/docs/integrations/webhooks)
   (exact menu names may differ; follow those docs).
2. Copy the **Webhook Secret**. In Cyera's examples it looks like `dgwebhook...`.
3. Store it as `CYERA_WEBHOOK_SECRET`. Use the whole string as the HMAC key (UTF-8 bytes); do not
   decode it.

## Register Your Endpoint

1. In the same integration, set the webhook URL to your endpoint, for example
   `https://example.com/webhooks/cyera`, or the Hookdeck source URL.
2. When Cyera sends a `health_check`, confirm your endpoint answers `200` (it verifies the signature first).
3. When an access, deletion or opt-out request arrives, confirm your endpoint answers `201`.

## Local Development

```bash
npx hookdeck-cli listen 3000 cyera --path /webhooks/cyera
```

Use port `8000` for the FastAPI example. No account is required; paste the printed URL into the
integration's webhook URL field.

## Answering Requests

| Delivery | Respond |
|----------|---------|
| `health_check` | `200` |
| `access`, `deletion`, `opt_out` | `201` once the request is created, then report completion with a `PUT` to `webhook_callback_url` (API key) |
| `readiness_check` | `200` (the docs name `200` for health checks and reminders and give no code for readiness checks); send the answer with a `PUT` to `webhook_callback_url` |
| Request not created | `4xx` / `5xx` |

## Rotating the Secret

Update `CYERA_WEBHOOK_SECRET` (and the secret pasted into the Hookdeck source) whenever the Webhook
Secret changes. Cyera's webhook docs do not describe rotation or an overlap period, so deploy the new
secret as soon as you change it in Cyera.
