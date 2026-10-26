# Setting Up Apify Webhooks

## Prerequisites

- An Apify account with an Actor or task
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 apify --path /webhooks/apify` locally)
- A random secret value, e.g. `openssl rand -hex 32`

## Create the Webhook

1. In [Apify Console](https://console.apify.com/actors), open the Actor (or task) and go to the
   **Integrations** tab.
2. Add a **Webhook** integration.
3. Select the **event types** to send (for example `ACTOR.RUN.SUCCEEDED` and `ACTOR.RUN.FAILED`).
4. Set the **Request URL** to your endpoint, e.g. `https://example.com/webhooks/apify`. Do not
   put the secret in the URL.

## Add the Secret Header

Apify does not sign webhooks, so authenticate them with the **Headers template**. It is a JSON
object whose values must be strings:

```json
{"X-Webhook-Secret": "your-random-secret"}
```

Store the exact same value in your environment:

```bash
APIFY_WEBHOOK_HEADER=X-Webhook-Secret
APIFY_WEBHOOK_SECRET=your-random-secret
```

If you use a different header name, set `APIFY_WEBHOOK_HEADER` to match. If you type a prefix
into the template (e.g. `{"Authorization": "Bearer abc"}`), `APIFY_WEBHOOK_SECRET` must be the
whole value `Bearer abc`; the handler compares it as-is and never strips the prefix.

Apify overwrites these headers on every request, so don't use them: `Host`, `Content-Type`,
`X-Apify-Webhook`, `X-Apify-Webhook-Dispatch-Id`, `X-Apify-Request-Origin`. They are system
values, not secrets.

## Test

Use the **Test** button in the webhook settings, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/apify \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $APIFY_WEBHOOK_SECRET" \
  -d '{"userId":"abf6vtB2nvQZ4nJzo","createdAt":"2019-01-09T15:59:56.408Z","eventType":"ACTOR.RUN.SUCCEEDED","eventData":{"actorId":"fW4MyDhgwtMLrB987","actorRunId":"uPBN9qaKd2iLs5naZ"},"resource":{"id":"uPBN9qaKd2iLs5naZ","status":"SUCCEEDED"}}'
```

## Network Notes

Apify sends webhooks from static IPs, listed on the
[webhook actions page](https://docs.apify.com/platform/integrations/webhooks/actions). You can
allowlist them at a firewall as an extra layer, but the header check is still the authentication.
