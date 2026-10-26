# Setting Up Plain Webhooks

## Prerequisites

- A Plain workspace; workspace admins manage request signing
- A public HTTPS endpoint (or a Hookdeck source URL)

## How Do I Get the Signing Secret?

1. In Plain, open **Settings → Request signing** (workspace admins only).
2. View or (re)generate the workspace HMAC secret. It is one global secret for the workspace, shared by webhooks and customer cards.
3. Save it as `PLAIN_WEBHOOK_SECRET`.

Until a secret exists, Plain sends unsigned requests (no `Plain-Request-Signature` header), and a verifying endpoint rejects them. Regenerating the secret takes effect for all targets.

## How Do I Register an Endpoint?

1. Go to **Settings → Webhooks → Add webhook target**.
2. Enter a name, your endpoint URL, the events to receive, and whether to enable it.
3. Subscribe to events such as `thread.thread_created`, `thread.email_received`, `thread.thread_status_transitioned`, `customer.customer_created`.

Alternatives not covered here: basic auth credentials in the target URL (`https://user:pass@example.com`, sent as `Authorization: Basic ...`) and mTLS.

## Using Hookdeck

Turn on request signing in Plain (Settings → Request signing) and paste its HMAC secret into the Hookdeck source's verification settings. Without it, requests are unsigned and fail verification. Use the Hookdeck source URL as the webhook target URL. Locally:

```bash
npx hookdeck-cli listen 3000 plain --path /webhooks/plain
```

## Testing

Plain has no sandbox mode. Use a non-production workspace if possible, since payloads can contain PII, and inspect deliveries in Settings → Webhooks.
