# MailerSend Webhooks - Next.js Example

Receives MailerSend webhooks at `POST /webhooks/mailersend` (App Router) and
verifies the `Signature` header: lowercase hex HMAC-SHA256 of the **raw request
body**, keyed with the webhook's signing secret.

## Prerequisites

- Node.js 18+
- A MailerSend account with a verified sending domain
- The webhook's **signing secret** (Email → Domains → View domain → Webhooks → your
  webhook). This is not your API token.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your MailerSend webhook signing secret to `.env.local` as
   `MAILERSEND_WEBHOOK_SECRET`. Do **not** prefix it with `NEXT_PUBLIC_` — that
   would ship the secret to the browser.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000, endpoint at `/webhooks/mailersend`.

## Test

```bash
npm test
```

The tests generate real signatures with MailerSend's exact algorithm —
`hex(HMAC_SHA256(signing_secret, raw_body))`, no timestamp, no prefix — and
cover the traps that break real integrations:

- a re-serialised body is rejected, even though it's semantically identical
- a malformed/short `Signature` returns 401 instead of throwing `RangeError`
  from `crypto.timingSafeEqual`
- the `webhook.test` ping verifies against the **fixed public test secret**
- a *real* event signed with that public test secret is **rejected**

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 mailersend --path /webhooks/mailersend
```

No account required — the CLI creates a guest account on first run and gives you
a web UI for inspecting requests. Paste the printed URL into the webhook's URL
field in MailerSend.

MailerSend fires its `webhook.test` ping the moment you click Save, so you'll see
a request immediately. If your endpoint doesn't return 2xx to that ping, **the
webhook is not saved at all**.

## Send a test event

From the MailerSend dashboard, open the webhook, and under **Events** click
**Test webhook**, then pick an event from the dropdown.

Or replay the URL-validation ping yourself:

```bash
BODY='{"type":"webhook.test","message":"This is a ping test message","created_at":"2026-03-27T07:24:20.577080Z"}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac 'test_Am3L1GuOIc4blLUuHqAPxxwkZaJyEk8G' -hex | sed 's/^.* //')

curl -i http://localhost:3000/webhooks/mailersend \
  -H 'Content-Type: application/json' \
  -H "Signature: $SIG" \
  -d "$BODY"
```

## Notes

- The route calls `await req.text()` and verifies **before** parsing. Never call
  `req.json()` first — the signature covers the exact bytes received, and
  re-serialising the parsed object produces a different digest.
- `export const runtime = 'nodejs'` is required: verification uses the Node
  `crypto` module. `export const dynamic = 'force-dynamic'` keeps the route from
  being statically optimised.
- **`webhook.test` is signed with `test_Am3L1GuOIc4blLUuHqAPxxwkZaJyEk8G`**, a
  fixed secret published in MailerSend's docs. The handler accepts it so the
  webhook can save, but rejects any *non*-ping event signed with it — because a
  public secret means anyone can forge that signature.
- **Respond within 3 seconds.** On Vercel and similar platforms, push slow work
  into a queue or `waitUntil` rather than awaiting it in the handler.
- **4xx other than 429 is never retried**, so the 401 on a bad signature gets
  exactly one attempt. 5xx *is* retried, which is why a handler exception returns
  500 rather than swallowing the event.
- **No delivery id, timestamp or nonce is sent**, so transport-level replay
  protection is impossible. The example dedupes on `type` plus `data.id` (`data.id` alone repeats across the unique and non-unique open and click events); the in-memory `Set`
  is per-instance and lost on every cold start — use Redis or your database in
  production.
- `data.meta` is an empty **array** `[]` when there's nothing to report, and an
  object otherwise. `normalizeMeta()` handles it.
- `created_at` arrives in two formats — ISO-8601 with microseconds and `Z`, and
  space-separated with no timezone (`sender_identity.verified`, `maintenance.*`).
  `parseCreatedAt()` handles both.
- MailerSend documents **no source-IP allowlist and no `X-MailerSend-*` headers**.
  Don't build either into your receiver.
