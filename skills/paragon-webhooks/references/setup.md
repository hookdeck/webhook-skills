# Setting Up a Paragon Webhook Destination

## Prerequisites

- A Paragon project on a paid plan (Webhook Destinations aren't available on free plans)
- An Admin user (Event Destinations are Admin-only)
- Your endpoint's public HTTPS URL (use `npx hookdeck-cli listen 3000 paragon --path /webhooks/paragon` for local work)

## Choose Your Shared Secret

Paragon does not generate a signing secret. Pick a long random value, for example:

```bash
openssl rand -hex 32
```

Decide the header it travels in. `Authorization` with a `Bearer <value>` is common, but any header
name works, such as `X-Paragon-Secret`.

## Register Your Endpoint

1. In the Paragon dashboard, go to **Settings** and select **Monitoring** under Project Settings.
2. Click **Add Destination**.
3. Set **Type** to **Webhook (HTTP Request)**.
4. Enter your endpoint as the **URL**.
5. Leave **Request Payload** at its default (the full event object, `$.event`) so `type` is present.
6. Expand **Show more request options** and add your header, e.g. name `Authorization`, value
   `Bearer <your-secret>`.
7. Click **Test Webhook** to send a test request, then **Save**.

## Configure Your App

```bash
PARAGON_WEBHOOK_HEADER=Authorization
PARAGON_WEBHOOK_SECRET="Bearer <your-secret>"   # exactly what you typed as the header value
```

`PARAGON_WEBHOOK_SECRET` must equal the whole header value, including the `Bearer ` prefix if
you typed one. Your server does not parse or strip it.

## Events

Webhook Destinations send `workflow_failure` and `credentials_failure`. There is no per-event
subscription in the setup steps above.

## Test Mode vs Live Mode

Use **Test Webhook** in the destination form. Run your handler locally through the Hookdeck CLI
tunnel to inspect requests.

## Notes

- A destination may be disabled automatically after many consecutive non-2xx responses.
- You can disable a destination temporarily from the Monitoring page.
- To rotate the secret, change the header value in the destination and your env var together.
