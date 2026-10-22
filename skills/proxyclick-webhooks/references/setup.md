# Setting Up Proxyclick (Eptura Visitor) Webhooks

## Prerequisites

- An Eptura Visitor (Proxyclick) account with access to Settings
- Your application's webhook endpoint URL (HTTPS recommended; HTTP is also accepted)

## Add the Webhook

1. In the Eptura Visitor dashboard, click the **Settings** gear in the left menu.
2. Open the **Integrations** menu and find **API and Webhooks**.
3. Click **Settings**, then **Add webhook**.
4. Name the webhook and enter the destination URL, for example
   `https://example.com/webhooks/proxyclick`.
5. Select at least one trigger: Visitor on-site, Visitor check-in, Visitor check-out, Visit
   created, Visit updated or Visit deleted.
6. If your URL needs authentication, enter the **username and password**. This is the only
   security option, and it is HTTP Basic auth.

Store the same values as `PROXYCLICK_WEBHOOK_USERNAME` and `PROXYCLICK_WEBHOOK_PASSWORD`. Use a
long random password: it is the only thing authenticating the sender.

## Credentials Must Arrive on the First Request

The docs don't say whether Basic credentials are sent preemptively. Your endpoint should expect
`Authorization: Basic ...` on the very first request and return a plain `401` otherwise. A
`401` + `WWW-Authenticate` challenge flow won't work, including through Hookdeck, which verifies
the request as received.

## Local Testing

```bash
npx hookdeck-cli listen 3000 proxyclick --path /webhooks/proxyclick
```

Use the printed URL as the destination URL and enter the same Basic credentials on the
webhook. For FastAPI, use port `8000`. Proxyclick also suggests testing with a dummy URL such as
Beeceptor to see a real payload before you write a handler.

## Sending a Manual Test

The body below is **illustrative**, not Proxyclick's documented schema:

```bash
curl -X POST http://localhost:3000/webhooks/proxyclick \
  -u "$PROXYCLICK_WEBHOOK_USERNAME:$PROXYCLICK_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"visitor":{"firstName":"Ada"},"visit":{"id":"illustrative-1"}}'
```
