# Sentry Webhooks - Next.js Example

Minimal Next.js App Router example of receiving Sentry Integration Platform
webhooks with `Sentry-Hook-Signature` / `Sentry-App-Signature` verification
(HMAC-SHA256 over the raw body, lowercase hex, keyed with the integration's
Client Secret).

## Prerequisites

- Node.js 18+
- A Sentry **internal integration** (or public integration) with a Webhook URL
  and at least one resource subscribed
  (Settings → Developer Settings → *Create New Integration*)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env.local
   ```

3. Add your integration's **Client Secret** to `.env.local` as
   `SENTRY_CLIENT_SECRET`. It is used **as-is** as a UTF-8 HMAC key — do not
   decode it. It is **not** the Client ID, an auth token or a DSN.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, endpoint
`POST /webhooks/sentry` (`app/webhooks/sentry/route.ts`).

## Test

```bash
npm test
```

The tests generate real signatures with the same algorithm Sentry uses —
HMAC-SHA256 of the raw body, hex — and cover tampering, wrong secrets, both
signature header names, base64 digests, Stripe-style `timestamp.body` signing,
a hex-decoded secret, the empty-body delivery, non-ASCII payloads, the optional
timestamp dampener and fail-closed behaviour when the secret is unset.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 sentry --path /webhooks/sentry
```

No account required — the CLI creates a guest account on first run and prints a
public HTTPS URL plus a web UI for inspecting each request. Paste the printed URL
into your integration's **Webhook URL**, then resolve or comment on an issue in
Sentry to get a real, signed delivery.

Sentry sends **no handshake, challenge or validation request**.

## What this example demonstrates

- **The event name is `Sentry-Hook-Resource` + `.` + `body.action`.** The body
  has no `type` or `event` field. `eventToken()` rebuilds `issue.created`.
- **`await request.text()` before anything else** — Sentry signs the exact bytes
  it sent. `request.json()` first would consume the body, and it throws on
  Sentry's legitimate **empty body**. App Router Route Handlers give you the raw
  body directly; there is no `bodyParser: false` to set.
- **Raw-body verification, not Sentry's published snippet.** The documented
  `JSON.stringify(request.body)` approach only matches ASCII-only payloads —
  Sentry emits `\uXXXX` escapes (`ensure_ascii=True`). There is a test for it.
- **Both signature headers** — `Sentry-Hook-Signature`, falling back to
  `Sentry-App-Signature` (UI-component external requests).
- **Length guard before `crypto.timingSafeEqual`**, so a garbage signature is a
  401, not a 500.
- **Fail closed** — unset `SENTRY_CLIENT_SECRET` returns 500; a bad signature
  returns 401.
- **The timestamp check is opt-in, and only a dampener** —
  `Sentry-Hook-Timestamp` is not signed. Dedupe on **`Request-ID`**.
- **Resource-name traps** — `event_alert` (not `issue_alert`), `issue.ignored`
  and its `issue.archived` alias, the undocumented `metric_alert.open`, and
  `preprod_artifact.*` branching on `state` rather than the action name.

## Notes

- **No SDK does this.** `@sentry/nextjs` is an error-reporting SDK and ships no
  webhook verification helper. Don't add it for this.
- The route runs on the **Node.js runtime** (the default). `node:crypto` is
  unavailable on the Edge runtime — rewrite the HMAC with Web Crypto if you set
  `export const runtime = 'edge'`.
- **Respond within 1 second.** This example handles the event inline because
  the work is trivial logging; for real work, enqueue it (or use `after()` from
  `next/server`) and return immediately. Sentry does **not** retry, and repeated
  failures can **disable** the webhook.
- For the signature scheme in detail, see
  [../../references/verification.md](../../references/verification.md).
