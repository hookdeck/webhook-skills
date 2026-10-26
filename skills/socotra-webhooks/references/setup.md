# Setting Up Socotra Webhooks

## Prerequisites

- A Socotra tenant and API access
- A public HTTPS endpoint, e.g. `https://example.com/webhooks/socotra`

## How Do I Create a Socotra Webhook?

Webhooks are created through the Webhook API, not a dashboard form.

1. `POST` to the Create Webhook endpoint with the `url` and the event types to receive.
2. In the endpoint's security settings, set a `secret` (8-64 alphanumerics or
   underscores) and turn on `hmacEnabled`.
3. **Leave `tag` unset.**
4. Keep `secureSSL` at its default (`true`) outside testing.

> Turn on HMAC (hmacEnabled) for the Socotra endpoint and leave its tag unset. With a tag, Socotra signs a different string and deliveries fail verification.

Without `hmacEnabled`, Socotra sends no `socotra-signature` header and nothing
can be verified.

## Which HTTP Method Does Socotra Use?

Socotra's docs don't name the HTTP method. Hookdeck's Socotra source pre-selects
POST without managing the method, so any other method the sender uses must also
be allowed on the source. The examples accept GET, POST, PUT, PATCH and DELETE.

## Optional: Failure Handling

Retries are opt-in. To retry failed deliveries, set `failureHandling` on the
webhook (triggers, attempts 1 to 10, linear or exponential interval, `suspend`,
`divert`, `alertEndpoint`). See [overview.md](overview.md).

## Local Testing with Hookdeck

```bash
npx hookdeck-cli listen 3000 socotra --path /webhooks/socotra
```

Use the Hookdeck URL it prints as the webhook `url`, and put the same `secret`
into `SOCOTRA_WEBHOOK_SECRET` where your handler runs.

## Environment Variables

```bash
SOCOTRA_WEBHOOK_SECRET=your_socotra_webhook_secret
# SOCOTRA_WEBHOOK_TOLERANCE_SECONDS=300   # optional; unset or 0 = off
```
