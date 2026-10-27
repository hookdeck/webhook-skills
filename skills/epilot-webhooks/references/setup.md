# Setting Up epilot Webhooks

## Prerequisites

- An epilot organization with access to webhooks (UI or the Webhooks API)
- A public HTTPS URL for your endpoint (for local development, use the Hookdeck CLI below)

## How Do I Create an epilot Webhook?

Create one webhook config per event, in the epilot UI or with the Webhooks API. A config has:

- **Event** (`eventName`): one of the values from `GET /v1/webhooks/events` for your organization, for example `customer_request_created`, the Automation Trigger Webhook, a portal activity, or an Event Catalog `event_*` event
- **URL** and **HTTP method** (the API examples use POST; if you pick another, allow it on the Hookdeck source too)
- **Authentication** (optional, see below)
- **Filter**, an optional **JSONata** expression to reshape the body, and a **retry policy**
- **Delivery mode** for file events (`json_base64` or `binary_multipart`)

There is no challenge or handshake. epilot starts sending as soon as the event fires.

## Where Do I Get the epilot Signing Secret?

Each webhook has its own `whsec_...` secret. It is returned **only once**, in the response that creates the webhook. Store the full value, including `whsec_`, as `EPILOT_WEBHOOK_SECRET`. If you lose it, recreate the webhook to get a new one.

## Which Secret and Authentication Do I Use?

Hookdeck's configuration alert for this source reads exactly:

> Use the webhook's whsec_ signing secret, not API key, Basic or OAuth authentication. File deliveries in binary_multipart mode sign per-file metadata and fail verification.

Endpoint authentication is separate from signing. epilot can send, in addition to the signature headers:

| Method | What epilot sends |
|--------|-------------------|
| API key | Your configured key in `X-API-Key` |
| Basic | `Authorization: Basic <base64 username:password>` (use HTTPS) |
| OAuth | `Authorization: Bearer <token>` from your authorization server, refreshed automatically |

Validate those if you configure them, but verify the `whsec_` signature either way. Don't put an API key, Basic or OAuth credential in `EPILOT_WEBHOOK_SECRET`.

If you receive `binary_multipart` file deliveries through Hookdeck, signature verification fails, because the signature covers per-file metadata rather than the body. Use `json_base64` or the default references-only mode when you need verification at the gateway.

## Which Header Names Does epilot Send?

`webhook-id`, `webhook-timestamp` and `webhook-signature`. The examples also accept the same values under `svix-id`, `svix-timestamp` and `svix-signature` when `webhook-id` is absent, which is how Hookdeck reads them.

## Local Development

```bash
npx hookdeck-cli listen 3000 epilot --path /webhooks/epilot   # Express / Next.js
npx hookdeck-cli listen 8000 epilot --path /webhooks/epilot   # FastAPI
```

No account required. Use the printed URL as the webhook URL, then trigger the event in epilot (for example by running the automation that contains the webhook action).

## Monitoring and Replay

Events are logged for 4 weeks and can be replayed. A replay sends the original `webhook-timestamp`, so the library's 5-minute window rejects it. See [verification.md](verification.md) for the manual verifier with a configurable window.
