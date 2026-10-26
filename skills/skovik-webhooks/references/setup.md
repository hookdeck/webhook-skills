# Setting Up Skovik Webhooks

Skovik webhook endpoints are managed in the settings UI. The API documents the delivery format and a read
endpoint for webhook events, but no endpoint-management API is described in the webhook guides.

## Prerequisites

- A Skovik account that can manage webhook endpoints in the settings
- A public `https://` URL for your endpoint (Skovik only delivers over HTTPS). For local development, use
  the Hookdeck CLI (see below).

## Create an Endpoint and Get Your Signing Secret

1. Open the webhook settings in Skovik and add an endpoint with your HTTPS URL, for example
   `https://webhooks.example.com/webhooks/skovik`.
2. Copy the endpoint's signing secret. It is in the Standard Webhooks format: `whsec_` followed by a
   base64-encoded random value (for example `whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw7Jxx2Oll+OE=`). Put the
   full value, prefix included, in `SKOVIK_WEBHOOK_SECRET`.

The documented events are listed in [overview.md](overview.md). Each endpoint has its own secret. The secret is managed on the settings page, and regenerating it
invalidates the old one immediately, so update your environment variable first or accept failed deliveries
until you do.

## Send a Test Delivery

Use the settings UI to trigger a test. It sends a signed `misc.ping` event to the endpoint. It's a normal
signed delivery, not a handshake or challenge, so your handler only needs to verify it and return `2xx`.
`misc.ping` is never retried.

## Local Development

```bash
npx hookdeck-cli listen 3000 skovik --path /webhooks/skovik
```

Use the URL the CLI prints as the endpoint URL in Skovik's settings. For the FastAPI example use port
`8000`.

## Delivery Behavior

- A delivery succeeds on a `2xx` response within **5 seconds**. Anything else, including timeouts and
  connection errors, is retried with exponential backoff and jitter over roughly three days, then
  abandoned.
- Respond with `410 Gone` to tell Skovik to stop sending events to the endpoint.
- An endpoint that keeps failing for an extended period is disabled automatically. Re-enable it in the UI.
- Do the heavy work asynchronously: verify the signature, enqueue, and return `2xx`.
- No ordering guarantee is documented, and the same event can be delivered more than once, so make the
  handler idempotent.
