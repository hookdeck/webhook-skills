# Setting Up camelAI Webhooks

## Prerequisites

- A camelAI account with access to camelRun
- A public HTTPS URL for your endpoint (use the Hookdeck CLI for local development)

## How Do I Get the Signing Secret?

Each endpoint has its own signing secret (`whsec_...`). It is shown only once, when the endpoint is created:

- Creating an endpoint with `POST /v1/webhooks` returns the `secret` in the response.
- `POST /v1/webhooks/{webhookId}/secret` replaces the secret. The old one keeps signing for 24 hours, so you can roll it out without dropping deliveries.

Store the full `whsec_` value in `CAMEL_AI_WEBHOOK_SECRET`. The key used for the HMAC is the base64-decoded part after `whsec_`.

## How Do I Register an Endpoint?

1. Create the endpoint with `POST /v1/webhooks`, passing your URL and the event types you want, or add it in the camelAI console. You can have at most 16 endpoints.
2. Save the returned `whsec_` secret straight away.
3. Choose events. Useful starting points: `run.completed`, `run.failed`, `input.requested`, `billing.balance.low`.

Manage endpoints with `GET`, `PATCH` and `DELETE` on `/v1/webhooks`. OAuth apps cannot create or change endpoints.

No challenge or validation request is documented, so the endpoint doesn't need a handshake. It only has to verify signatures and return a `2xx`.

## Local Development

```bash
npx hookdeck-cli listen 3000 camel-ai --path /webhooks/camel-ai
```

Use `8000` for FastAPI. Register the printed URL as the endpoint URL.

## Testing

An endpoint receives runs that begin after it is created, so start a new run once the endpoint exists and watch for `run.started` and `run.completed`. Check the delivery in Hookdeck's request view, and compare headers and body against the verification doc if a signature fails.
