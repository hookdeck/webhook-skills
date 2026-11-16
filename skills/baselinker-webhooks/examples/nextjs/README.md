# BaseLinker Webhooks - Next.js Example

Receiving BaseLinker (Base.com) webhooks in a Next.js App Router route handler.

> **This is not a normal webhook handler.** BaseLinker only ever sends HTTP
> **HEAD** requests, so there is **no body** — the entire payload is in the
> **query string** — and there is **no signature to verify** (no HMAC, no
> signature header, no secret, no handshake). The response must be a bare,
> bodyless `200`. See the skill's `references/verification.md`.

## What this example shows

- An exported **`HEAD`** route handler (`app/webhooks/baselinker/route.ts`).
  Exporting `POST` here would mean never receiving a delivery.
- Reading the payload from `request.nextUrl.searchParams` — never
  `await request.json()`, which has nothing to parse on a HEAD request.
- Coercing `order_id` with `Number()` (query values are always strings) and
  guarding every param for absence.
- Returning `new Response(null, { status: 200 })` — never
  `NextResponse.json(...)`
  ([RFC 9110 §9.3.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2)
  forbids a body on a HEAD response). Error responses are bodyless too.
- Fetching the authoritative order from `api.baselinker.com` with the
  `X-BLToken` **request** header.
- An **optional** URL-token check — a token *you* append to the endpoint URL.
  It is **not** a BaseLinker signature.

Observed query params are `order_id` (e.g. `42`) and `state` (e.g. `packed`).
These are **observed examples, not a documented or exhaustive list**, and `state`
is **not** an event-type discriminator.

## Prerequisites

- Node.js 18+
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

3. Optionally set `BASELINKER_API_TOKEN` and `BASELINKER_URL_TOKEN`. There is
   **no webhook signing secret to configure** — BaseLinker does not have one.

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

- `HEAD /webhooks/baselinker` (`app/webhooks/baselinker/route.ts`) — reads
  `order_id` / `state` from `request.nextUrl.searchParams`, optionally checks the
  URL token, and returns a bodyless `200` (`400` if `order_id` is absent or
  invalid, `401` if the URL token is configured and does not match).
