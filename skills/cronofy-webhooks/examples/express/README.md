# Cronofy Webhooks - Express Example

Minimal example of receiving Cronofy **push notifications** in Express.js, verifying the
`Cronofy-HMAC-SHA256` header.

> **Cronofy is not Calendly.** Different company, different signing scheme. Nothing here
> applies to `Calendly-Webhook-Signature`.

## Prerequisites

- Node.js 18+
- A Cronofy application (gives you the client secret used as the HMAC key)
- An OAuth access token for the account you want notifications for
- A public HTTPS URL for the channel's `callback_url`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Cronofy application's **client secret** to `.env` as `CRONOFY_CLIENT_SECRET`.
   It starts with `CRN_` and is found in the developer dashboard for your data centre,
   under your application's settings. Cronofy issues no separate webhook signing secret —
   this is the same secret you use for the OAuth token exchange.

4. Set `CRONOFY_DATA_CENTER_URL` to the host your account lives on (`https://api.cronofy.com`,
   `https://api-uk.cronofy.com`, `https://api-de.cronofy.com`, `https://api-au.cronofy.com`,
   `https://api-ca.cronofy.com`, or `https://api-sg.cronofy.com`).

## Run

```bash
npm start
```

Server runs on `http://localhost:3000`.

Webhook endpoint: `POST http://localhost:3000/webhooks/cronofy`

## Test

Run the test suite:

```bash
npm test
```

The tests assert against Cronofy's own published HMAC test vectors and cover the
comma-separated multi-secret header used during rotation.

### Send a signed request by hand

The signature covers the raw body only, so you can sign locally:

```bash
BODY='{"notification":{"type":"change","changes_since":"2026-08-26T09:24:16Z"},"channel":{"channel_id":"chn_54cf7c7cb4ad4c1027000001","callback_url":"https://example.com/webhooks/cronofy"}}'
SECRET='CRN_NggYusqPGLxwjw5FHOJYOqSrTPNXy8WQf14OID'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -binary | base64)

curl -X POST http://localhost:3000/webhooks/cronofy \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "Cronofy-HMAC-SHA256: $SIG" \
  -d "$BODY"
```

### Receive real notifications locally

```bash
npx hookdeck-cli listen 3000 cronofy --path /webhooks/cronofy
```

No account, no install required — the CLI creates a guest account and gives you a public
HTTPS URL plus a web UI for inspecting requests. Use the printed URL as your channel's
`callback_url`:

```bash
curl -X POST "$CRONOFY_DATA_CENTER_URL/v1/channels" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"callback_url":"https://<printed-url>/webhooks/cronofy"}'
```

Cronofy sends a `verification` notification immediately, so you'll see a request land as
soon as the channel is created. To trigger a `change`, edit an event in the connected
calendar — note that changes made through your *own* Cronofy API calls do **not** produce
notifications.

## Notifications Handled

Dispatch is on `notification.type`, a **body field** — Cronofy sends no event-type header.

| Type | Handling |
|------|----------|
| `verification` | Return 2xx. No token to echo, no challenge to reflect |
| `change` | Read `changes_since` and fetch the delta via Read Events (`last_modified`) |
| `profile_disconnected` | Prompt reauthorization; state in UserInfo `["cronofy.data"]["profiles"]` |
| `conferencing_profile_disconnected` | Prompt reconnect; state in `["cronofy.data"]["conferencing_profiles"]` |
| `profile_initial_sync_completed` | Run a follow-up sync |
| `gdpr_requested` | Delete the account's data |
| anything else | Logged and ignored, still 200 — Cronofy asks integrations to tolerate new types |

## `change` Is a Ping

The `change` payload does **not** contain the changed events. `handleChange()` shows the
follow-up read:

```
GET {data_center_url}/v1/events?tzid=Etc/UTC&last_modified={changes_since}
```

## Security

- HMAC-SHA256 over the **raw body** (`express.raw()`), base64-encoded, keyed with the
  client secret
- `Cronofy-HMAC-SHA256` is split on `,` and each candidate compared with
  `crypto.timingSafeEqual` after a length guard — a rotation-time delivery carries one
  digest per active secret and any match is valid
- Verification runs **before** `JSON.parse`; a re-serialized body would not match
- Returns `400` on a missing header, an invalid signature, invalid JSON, or a missing
  `notification.type`
- **No replay protection exists.** Nothing but the body is signed — no timestamp, no
  nonce, no id — so a captured delivery replays cleanly. Make handling idempotent (upsert the
  Read Events sync on `event_uid`) rather than attempting a timestamp tolerance check,
  which is impossible here
- No source IP allowlist is published by Cronofy

## Cronofy Delivery Behaviour This Example Accounts For

- **Responds 200 immediately**, then processes in `setImmediate` — Cronofy requires a 2xx
  within **5 seconds**
- **Never returns non-2xx for an unknown type** — failed deliveries are retried for **24
  hours**, after which the **channel is closed automatically** and no further notifications
  are sent. A slow or fussy handler doesn't lose one event, it kills the channel
