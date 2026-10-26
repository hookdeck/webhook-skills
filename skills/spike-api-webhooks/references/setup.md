# Setting Up Spike API Webhooks

## Prerequisites

- A Spike API application with access to the Spike API admin console
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Get Your Shared Key

Spike API signs every delivery with a shared secret key. Retrieve it from the
admin console and store it as `SPIKE_API_WEBHOOK_SECRET`. Use it exactly as shown
(UTF-8 string); do not hex- or base64-decode it.

## Register Your Endpoint

1. Open the Spike API admin console.
2. Configure the webhook endpoint URL for your application (one endpoint per application).
3. For local development, run `npx hookdeck-cli listen 3000 spike-api --path /webhooks/spike-api` and use the printed URL.

Spike API sends `record_change`, `provider_integration_created` and
`provider_integration_deleted` events to that single endpoint. There is no
per-event subscription to choose.

## Testing

Trigger a real data update or provider connection for a test user and inspect the
delivery. Because every request is signed, send test requests with a locally
computed `X-Body-Signature` (see [verification.md](verification.md)).

## Hookdeck

Hookdeck's Spike API source verifies the signature (`x-body-signature`, HMAC-SHA256,
hex) before forwarding to your handler. The source accepts POST requests.
