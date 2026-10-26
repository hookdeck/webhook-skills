# Setting Up Argyle Webhooks

## Prerequisites

- An Argyle account with API access
- Your application's public webhook endpoint URL (HTTPS)

## Get Your Signing Secret

Argyle does not generate a secret. You choose it:

> Set a secret on the Argyle webhook subscription. Without one, deliveries are unsigned and fail verification.

1. Generate a long random string (for example `openssl rand -hex 32`).
2. Set it as the subscription's `secret` in the Console, or in the `POST /v2/webhooks` body.
3. Store the same value as `ARGYLE_WEBHOOK_SECRET` in your app. It is used as-is, as UTF-8 bytes.

A subscription without a `secret` gets no `X-Argyle-Signature` header at all.

## Register Your Endpoint

1. Create a subscription in the Console or with `POST /v2/webhooks`, with your `url`, a `name`, the
   `secret`, and the events you want (for example `accounts.connected`, `accounts.failed`,
   `gigs.fully_synced`).
2. Argyle sends the event name in the body's `event` field.

See [Argyle's webhook guide](https://docs.argyle.com/api-guide/webhooks).

## HTTP Method

Argyle's docs don't name the HTTP method. Accept GET, POST, PUT, PATCH and DELETE on your route, as the
examples do, and verify the signature first for every method.

Hookdeck's Argyle source pre-selects POST without managing the method, so any other method the sender
uses must also be allowed on the source.

## Local Development

```bash
npx hookdeck-cli listen 3000 argyle --path /webhooks/argyle   # Express, Next.js
npx hookdeck-cli listen 8000 argyle --path /webhooks/argyle   # FastAPI
```

Use the URL it prints as the subscription `url`.

## Rotating the Secret

Update the subscription's `secret` and `ARGYLE_WEBHOOK_SECRET` together. Deliveries signed with the old
value fail with 401 in between, so do it at a quiet time.
