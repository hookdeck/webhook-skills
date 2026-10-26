# Setting Up OpnForm Webhooks

## Prerequisites

- An OpnForm account with a form you can edit
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint

1. Open the form, go to its **Integrations**, and add a **Webhook** integration.
2. Enter your endpoint URL (the Hookdeck source URL, or your own `/webhooks/opnform` route).
3. Optionally add custom headers (up to 10).
4. Save. You can also create the integration with `POST /open/forms/{form}/integrations`.

See [OpnForm's webhook documentation](https://docs.opnform.com/api-reference/integrations/webhook-security) for the current UI wording.

## Set a Webhook Secret

Set a webhook secret on the OpnForm webhook integration. Without one, deliveries are unsigned and fail verification.

The secret must be at least 12 characters. You choose it yourself; OpnForm does not generate one. Set the same value as `OPNFORM_WEBHOOK_SECRET`. It is the HMAC key as UTF-8 bytes, exactly as typed (no decoding, no trailing whitespace).

## Authentication

Authentication is the signature alone (`X-Webhook-Signature`). If you need an API key too, add it as one of the custom headers and check it in your handler.

## Local Development

```bash
npx hookdeck-cli listen 3000 opnform --path /webhooks/opnform
```

Use the Hookdeck URL as the integration's URL, then submit the form.
