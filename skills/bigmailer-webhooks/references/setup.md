# Setting Up BigMailer Webhooks

## Prerequisites

- A BigMailer account with access to the API settings in the console
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Register Your Endpoint

Webhook endpoints are configured per account in the BigMailer console under the API settings, in the **Webhooks** section. Add your endpoint URL there; it then receives engagement events for the account's brands.

Follow BigMailer's [getting started guide](https://docs.bigmailer.io/docs/webhooks-getting-started) for the current screens and options. The events delivered are `bounce`, `click`, `complaint`, `open`, and `unsubscribe`.

## Get Your Signing Secret

Each endpoint has its own signing secret. In the Webhooks settings, reveal it with **show**, and set it as `BIGMAILER_WEBHOOK_SECRET`. Use the value exactly as shown (UTF-8 bytes); don't hex- or base64-decode it, and don't add whitespace or quotes.

## Testing

BigMailer's documentation doesn't describe a test or ping event. Use the Hookdeck CLI to capture real deliveries, inspect them, and replay them to your handler:

```bash
npx hookdeck-cli listen 3000 bigmailer --path /webhooks/bigmailer
```

Use the Hookdeck URL as the endpoint URL in BigMailer. Replays resend the original headers, including the original `t`, which is why the examples don't enforce a timestamp window by default.

## Local Development

- Express and Next.js examples listen on port `3000`; the FastAPI example uses `8000` (`npx hookdeck-cli listen 8000 bigmailer --path /webhooks/bigmailer`).
- The route is `/webhooks/bigmailer` and accepts `POST`.
