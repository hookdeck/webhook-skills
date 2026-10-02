# Polytomic Webhooks - Express Example

Minimal example of receiving **Polytomic sync record batches** in Express.

> **There is no signature to verify.** Polytomic does not sign its webhook
> payloads — no HMAC, no digest, no signing secret, no signature header, no
> `X-Polytomic-*` header of any kind. The **only** authentication is a **static
> shared bearer token** matching the connection Secret. See the skill's
> [references/verification.md](../../references/verification.md).

> **`Polytomic-Signature-Timestamp` is not a signature.** Despite the name, it
> carries only an RFC 3339 UTC timestamp (`2021-06-01T22:55:36Z`). It is used here
> for an optional freshness check, which is **defence-in-depth only** — the
> timestamp is not covered by any signature, so it proves nothing about
> authenticity.

## What this example shows

- `app.post('/webhooks/polytomic', ...)` — authenticating by comparing the
  `Authorization` bearer token against `POLYTOMIC_WEBHOOK_SECRET` in **constant
  time**, stripping exactly one `Bearer ` prefix (case-insensitively on the
  scheme, per RFC 7235) and length-guarding so `crypto.timingSafeEqual` can't
  throw.
- **Fail closed:** if `POLYTOMIC_WEBHOOK_SECRET` is unset the route returns `500`
  and processes nothing. On a provider with no signature, the bearer token is the
  *entire* security boundary — "unconfigured" must never mean "accept everything".
- **No HMAC anywhere.** `crypto.createHmac` / `createHash` are not called, and a
  test asserts that. There is no signature to compute a digest against.
- **The bearer token is treated as an opaque secret.** The documented sample value
  happens to decode as an HS256 JWT, but it is signed with a key you don't hold,
  has no `exp`, and the docs call it "a static value" — so no `jwt.verify`, no
  `jwt.decode`, no `aud`/`iss`/`exp` checks. A test proves a non-JWT secret works.
- **Optional timestamp freshness** (`POLYTOMIC_TIMESTAMP_TOLERANCE_SECONDS`,
  default 300, `0` disables) parsed with `new Date()` — **never `parseInt`**, which
  would turn `2021-06-01T22:55:36Z` into `2021`. A test asserts an epoch-seconds
  value is *not* accepted.
- **Batch handling.** `object.records` is a list (default size 100,
  user-configurable), so the handler **always loops**. Tested with a 250-record
  batch and an empty one.
- **`records[].fields` keys are user-defined** by the sync configuration — not
  typed as a fixed shape, accessed defensively, `null` values tolerated.
- **`object.metadata` may be an object, `null`, or absent** — all three tested.
- **Event dispatch on the single documented event, `sync.records`**, with the
  default branch **ignoring unknown events with a 200** (the docs anticipate
  future types, and a 4xx would mark the customer's sync run as failed).
- **Acknowledge-then-process:** the `200` is sent before the batch is handled,
  because a 4xx/5xx makes the whole sync run appear as a failure.

Because there is no signature, there is **no raw-body requirement** here —
`express.json()` is fine. (Polytomic may gzip the body; Express and your reverse
proxy decompress that transparently.) Malformed JSON becomes a `400`.

## Prerequisites

- Node.js 18+
- A Polytomic account with a **Webhook connection** and a **Model Sync** pointed
  at it. A connection alone delivers nothing — the sync is what sends.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Polytomic connection Secret to `.env` as
   `POLYTOMIC_WEBHOOK_SECRET`. In Polytomic: **Connections** → your Webhook
   connection → **hover the secret key field to reveal its value**.

   There is **no signing secret** to configure — Polytomic has none. This value
   is the shared bearer token Polytomic sends back on every request.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

Replay the documented payload by hand:

```bash
curl -X POST http://localhost:3000/webhooks/polytomic \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $POLYTOMIC_WEBHOOK_SECRET" \
  -H "Polytomic-Signature-Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  -d '{
    "event": "sync.records",
    "object": {
      "id": "1ea8f90a-b22e-4218-86d5-c3c109e1fbb7",
      "name": "Webhook HTTP Endpoint sync",
      "records": [
        {
          "hash": "b7421c6c57bd49f7",
          "fields": { "email": "nathan@polytomic.com", "last_login": "2020-12-02T00:00:00Z" }
        }
      ],
      "metadata": {}
    }
  }'
```

Note the timestamp format: **RFC 3339 UTC**, not a Unix epoch integer.

Polytomic documents **no test event, no handshake and no "send test" button** — to
exercise the real path you must run the sync. Watch the delivery in Polytomic's
**sync history** view (Advanced settings → *Capture webhook requests and
responses*, default on).

### Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 polytomic --path /webhooks/polytomic
```

No account required — the CLI creates a guest account on first run and gives you
a public HTTPS URL plus a web UI for inspecting requests. Paste that URL into the
Webhook connection, then run your sync.

Because Polytomic sends no signature, there is nothing for a gateway to verify on
the **Polytomic → gateway** hop. What a gateway adds here is retries and replay
that Polytomic itself does not document — which matters, because a single 5xx
marks the entire sync run failed.

## Endpoint

- `POST /webhooks/polytomic` — `500` if `POLYTOMIC_WEBHOOK_SECRET` is unset (fail
  closed), `401` on a missing or mismatched bearer token, `400` on a stale or
  unparseable `Polytomic-Signature-Timestamp` (when the tolerance is > 0), `400`
  on invalid JSON or a malformed envelope, `200` otherwise — including for
  unknown event types, which are ignored.
- `GET /health` — health check.

## A note on the first delivery

If your first batch is enormous, that is not a bug: *"The first time a Polytomic
Model Sync runs, it will sync everything in the source."* Either enable **Skip
backfill on first sync** in the sync's Advanced settings, or rely on the
acknowledge-then-process pattern this example uses.
