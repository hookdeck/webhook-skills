# Setting Up Rebilly Webhooks

## Prerequisites

- A Rebilly account (live or sandbox) with permission to create webhooks
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 rebilly --path /webhooks/rebilly` locally)

## Hookdeck Source Note

Hookdeck shows this note for the Rebilly source, and it is the whole verification story:

"Set HTTP basic access authentication on the Rebilly webhook. Its JWT and Ed25519 signatures are not checked."

Hookdeck never sends a 401 challenge (there is no `WWW-Authenticate` round trip), so the
credentials must arrive with each request. A webhook without basic auth credentials is not
authenticated at all.

## Create the Webhook

1. In the Rebilly dashboard (or through the API), create a new webhook.
2. Enter your URL, including the protocol (e.g. `https://example.com/webhooks/rebilly`).
3. Choose the **method**: GET, POST, PUT, PATCH or DELETE. POST is the usual choice for JSON events.
4. Set HTTP basic access authentication: a username and a password. Store them as
   `REBILLY_WEBHOOK_USERNAME` and `REBILLY_WEBHOOK_PASSWORD`. Rebilly then sends
   `Authorization: Basic base64(username:password)` with each request.
5. Pick the events to receive in the events filter (empty means all events), for example
   `transaction-processed`, `customer-created`, `subscription-activated` and `invoice-issued`.
6. Optionally add a body template, which replaces the default payload.
7. Save.

## Hookdeck Source and Methods

Hookdeck's Rebilly source pre-selects POST without managing the method. If the webhook uses
GET, PUT, PATCH or DELETE, also allow that method on the source. The example handlers accept all
five methods and check the credentials first for each.

## Test

Trigger an event in the sandbox (for example create a customer) and check that your endpoint logs
`customer-created`. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/rebilly \
  -u "$REBILLY_WEBHOOK_USERNAME:$REBILLY_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"eventType":"customer-created","customerId":"cus_123"}'
```

## Sandbox vs Live

Sandbox and live organizations are separate and sign with different keys
(`api-sandbox.rebilly.com` vs `api.rebilly.com`). Create the webhook, and its credentials, in each.

## Rotating the Credential

Basic auth credentials are a static shared secret. If they leak, change the password on the webhook
and `REBILLY_WEBHOOK_PASSWORD` together.
