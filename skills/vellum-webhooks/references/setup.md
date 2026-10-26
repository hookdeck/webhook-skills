# Setting Up Vellum Webhooks

## Prerequisites

- A Vellum organization where you can edit organization settings
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 vellum --path /webhooks/vellum` locally)

## Choose a Credential

Hookdeck shows this setup note for the Vellum source, and it applies to your own endpoint too:

> Turn on authentication and choose API Key Header (or Bearer Token, with header name Authorization and value "Bearer <token>"). The HMAC signature option is not supported.

- **API Key Header**: pick a header name (for example `X-Webhook-Secret`) and a secret value.
- **Bearer Token**: header name `Authorization`, value `Bearer <token>`.

Store the header name as `VELLUM_WEBHOOK_HEADER` (default `Authorization`) and the **exact, whole
header value** as `VELLUM_WEBHOOK_SECRET`, including any `Bearer ` prefix you typed.

## Register Your Endpoint

1. In Vellum, open your **organization settings** page.
2. Scroll to **Monitoring Integration** and click **Webhook Integration** (or **Edit**).
3. Enter your endpoint URL (for example `https://example.com/webhooks/vellum`).
4. Turn on authentication and enter the header name and value from above.
5. Select the events to send (start with `workflow.execution.rejected`).
6. Save.

## Hookdeck Source

Create a Hookdeck source of type **Vellum** (`VELLUM`) and give it the same header name and exact
header value. The source pre-selects POST without managing the method. Vellum's docs don't say
which HTTP method it uses, so if your sender uses another method, allow it on the source too.

## Test

Replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/vellum \
  -H "Content-Type: application/json" \
  -H "Authorization: $VELLUM_WEBHOOK_SECRET" \
  -d '{"id":"1","name":"workflow.execution.fulfilled","body":{}}'
```

## Network Notes

The credential is static: it authenticates the sender, not the body, and gives no replay
protection. Always use HTTPS and rotate the credential in both Vellum and your environment if it
leaks.
