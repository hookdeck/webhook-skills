# Setting Up Oura Webhooks

Oura's docs manage subscriptions through the REST API. This guide covers getting credentials, subscribing, completing the handshake, and
renewing.

## Prerequisites

- An Oura application at the [Oura Developer portal](https://cloud.ouraring.com/oauth/applications)
- Your app's **Client ID** and **Client Secret**
- A publicly reachable HTTPS `callback_url` that handles both `GET` and `POST`
- A **verification token** — a secret string *you* choose (any hard-to-guess value)

## Credentials

| Value | Where it comes from | Used for |
|-------|---------------------|----------|
| `x-client-id` | App settings (Client ID) | Authenticating subscription-management calls |
| `x-client-secret` | App settings (Client Secret) | Auth **and** the HMAC key for `x-oura-signature` |
| `verification_token` | You choose it | Proving the handshake `GET` is for your subscription |

> The **Client Secret is the HMAC key** used to sign event payloads. Keep it server-side.

## Step 1 — Create a Subscription

Managed at `POST /v2/webhook/subscription`, authenticated with `x-client-id` and
`x-client-secret` headers. One subscription per `data_type` + `event_type` pair.

```bash
curl -X POST https://api.ouraring.com/v2/webhook/subscription \
  -H "x-client-id: $OURA_CLIENT_ID" \
  -H "x-client-secret: $OURA_CLIENT_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "callback_url": "https://your-server.com/webhooks/oura",
    "verification_token": "your-secret-verification-token",
    "event_type": "update",
    "data_type": "sleep"
  }'
```

All four body fields are **required**: `callback_url`, `verification_token`, `event_type`,
`data_type`.

## Step 2 — The Verification Handshake

Immediately after you call create, Oura verifies your endpoint owns the URL:

1. Oura sends a `GET` to your `callback_url`:
   ```
   GET https://your-server.com/webhooks/oura?verification_token=your-token&challenge=random-string
   ```
2. Your endpoint checks `verification_token` matches the one you configured, then responds
   `200` with the challenge echoed back as JSON:
   ```json
   { "challenge": "random-string" }
   ```
3. On success the subscription becomes active and the create call returns the subscription
   (including its `id` and `expiration_time`).

If the token doesn't match, respond `401`. Oura activates the subscription only if verification succeeds.

## Step 3 — Manage Subscriptions

All routes use the `x-client-id` + `x-client-secret` headers.

| Action | Route |
|--------|-------|
| List all | `GET /v2/webhook/subscription` |
| Get one | `GET /v2/webhook/subscription/{id}` |
| Create | `POST /v2/webhook/subscription` |
| Update | `PUT /v2/webhook/subscription/{id}` |
| Delete | `DELETE /v2/webhook/subscription/{id}` |
| Renew | `PUT /v2/webhook/subscription/renew/{id}` |

The update request also requires `verification_token`. Oura's docs don't say whether update or
renew repeats the GET check, so keep your `GET` handler live.

## Step 4 — Renew Before Expiry

Subscriptions carry an `expiration_time`. Before it passes, call:

```bash
curl -X PUT https://api.ouraring.com/v2/webhook/subscription/renew/$SUBSCRIPTION_ID \
  -H "x-client-id: $OURA_CLIENT_ID" \
  -H "x-client-secret: $OURA_CLIENT_SECRET"
```

Automate renewal (e.g. a scheduled job) so subscriptions never lapse. Oura's docs give no
lifetime and don't say what happens at expiry, so schedule renewal from the returned
`expiration_time` and list subscriptions (`GET /v2/webhook/subscription`) to check them.

## Testing Locally

In your Hookdeck project, create an **Oura** source named `oura` and enter your Oura client secret. Use that source's URL as the subscription's `callback_url`: a Hookdeck Oura source answers Oura's GET check itself. Sign the CLI into the same project, then forward the source to your local server.

```bash
npx hookdeck-cli listen 3000 oura --path /webhooks/oura
```

Because the handshake is a plain `GET`, you can test your own handler's answer directly:

```bash
curl "http://localhost:3000/webhooks/oura?verification_token=your-token&challenge=hello"
# → {"challenge":"hello"}
```
