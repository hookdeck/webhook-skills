# Setting Up SMTP2GO Webhooks

## Prerequisites

- An SMTP2GO account
- A public HTTPS endpoint for your webhook receiver (use the Hookdeck CLI locally)

## Add the Webhook in the App

1. Go to **Settings > Webhooks > Manage Webhooks** and click **Add Webhook**.
2. **URL**: your endpoint, for example `https://example.com/webhooks/smtp2go`.
3. **Authorization header**: optionally include a bearer or basic authorization header.
4. **Users**: the SMTP users, API keys or authenticated IPs the webhook fires for.
5. **Output type**: `JSON` or `Form encoded` (the examples handle both).
6. **Email events** and **SMS events**: the events to receive.
7. **Email headers**: custom headers to include in the event data (optional).
8. Click **Save changes**, then optionally **Test this webhook**.

## The Authorization Header

Set an Authorization header on the SMTP2GO webhook and paste the full value, including the "Bearer " or "Basic " prefix.

Through the API (`/v3/webhook/add`), the same setting is `auth_header_type` (`bearer` or `basic`) and `auth_header_value` ("either base64(user:pass) or a custom token").

SMTP2GO's docs don't print the exact outgoing header, so capture one delivery (the test button, or a request inspector) and store exactly what arrives in `Authorization` as `SMTP2GO_AUTHORIZATION`. Expect `Bearer <token>` or `Basic <base64>`. The handler compares the whole value, so include the prefix and nothing else.

```bash
SMTP2GO_AUTHORIZATION=Bearer your-token
```

## Add the Webhook with the API

```bash
curl --request POST \
  --url https://api.smtp2go.com/v3/webhook/add \
  --header 'Content-Type: application/json' \
  --header 'X-Smtp2go-Api-Key: api-XXXXXXXX' \
  --data '{
    "events": ["delivered", "bounce", "open"],
    "usernames": ["api-XXXXXXXX"],
    "url": "https://example.com/webhooks/smtp2go"
  }'
```

Use the API reference for the exact authorization and output-type parameters.

## Other Ways to Restrict Access

SMTP2GO's overview also suggests a URL with userinfo or a secret query value, a hard-to-guess path, and allowing the delivery IPs from the A record for `webhooks.smtp2go.com`. These complement, but don't replace, the Authorization header check.

## Local Testing

```bash
npx hookdeck-cli listen 3000 smtp2go --path /webhooks/smtp2go
```

Use the printed URL as the webhook URL. For FastAPI, use port `8000`.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/smtp2go \
  -H "Content-Type: application/json" \
  -H "Authorization: $SMTP2GO_AUTHORIZATION" \
  -d '{"event":"delivered","rcpt":"user@example.com","email_id":"1abcDE-ABC123-xy","id":"wh-1"}'
```

Form-encoded works too: `-H "Content-Type: application/x-www-form-urlencoded" -d 'event=bounce&bounce=hard&rcpt=user@example.com'`.
