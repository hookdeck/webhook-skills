# BaseLinker Webhooks - Express Example

Minimal example of receiving BaseLinker (Base.com) webhooks in Express.

> **This is not a normal webhook handler.** BaseLinker only ever sends HTTP
> **HEAD** requests, so there is **no body** — the entire payload is in the
> **query string** — and there is **no signature to verify** (no HMAC, no
> signature header, no secret, no handshake). The response must be a bare,
> bodyless `200`. See the skill's `references/verification.md`.

## What this example shows

- `app.head('/webhooks/baselinker', ...)` — registered **explicitly**. Express's
  `app.get()` also answers HEAD, but being explicit keeps the intent visible.
- **No JSON body parser** on the route. There is no body to parse.
- Reading the payload from `req.query`, with `order_id` coerced via `Number()`
  (query values are always strings) and every param guarded for absence.
- Replying with `res.sendStatus(200)` — never `res.json(...)`
  ([RFC 9110 §9.3.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2)
  forbids a body on a HEAD response).
- Acknowledging first, then fetching the authoritative order from
  `api.baselinker.com` with the `X-BLToken` **request** header.
- An **optional** URL-token check — a token *you* append to the endpoint URL,
  which is the closest thing to authentication available. It is **not** a
  BaseLinker signature.

Observed query params are `order_id` (e.g. `42`) and `state` (e.g. `packed`).
These are **observed examples, not a documented or exhaustive list**, and `state`
is **not** an event-type discriminator.

## Prerequisites

- Node.js 18+ (the API fetch-back uses the global `fetch`)
- A BaseLinker / Base.com account. A `BASELINKER_API_TOKEN` is optional — it is
  only used to fetch order detail after a callback.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Optionally set `BASELINKER_API_TOKEN` (for the `getOrders` fetch-back) and
   `BASELINKER_URL_TOKEN` (the token you append to the registered URL). There is
   **no webhook signing secret to configure** — BaseLinker does not have one.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

Send a delivery by hand — `curl -I` issues a HEAD request:

```bash
curl -I 'http://localhost:3000/webhooks/baselinker?order_id=42&state=packed&token=YOUR_URL_TOKEN'
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 baselinker --path /webhooks/baselinker
```

Allow HEAD on the Hookdeck Baselinker Source ([custom methods](https://hookdeck.com/docs/sources#custom-methods)). Since a HEAD
response cannot carry a body, Hookdeck returns the request id in the
`x-hookdeck-request-id` **response header**; use it to correlate a delivery with
its dashboard entry.

## Endpoint

- `HEAD /webhooks/baselinker` — reads `order_id` / `state` from `req.query`,
  optionally checks the URL token, and replies with a bodyless `200` (`400` if
  `order_id` is absent or invalid, `401` if the URL token is configured and does
  not match).
- `GET /health` — health check.
