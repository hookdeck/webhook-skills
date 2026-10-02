# Polytomic Webhooks - FastAPI Example

Minimal example of receiving **Polytomic sync record batches** in FastAPI.

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

- `POST /webhooks/polytomic` — authenticating by comparing the `Authorization`
  bearer token against `POLYTOMIC_WEBHOOK_SECRET` in **constant time** via
  `hmac.compare_digest`, stripping exactly one `Bearer ` prefix
  (case-insensitively on the scheme, per RFC 7235).
- **Fail closed:** if `POLYTOMIC_WEBHOOK_SECRET` is unset the route returns `500`
  and processes nothing. On a provider with no signature, the bearer token is the
  *entire* security boundary — "unconfigured" must never mean "accept everything".
- **No HMAC is computed.** `hmac.new()` is never called and `hashlib` is never
  imported — a test walks the module's AST to prove it. `hmac.compare_digest` is
  used purely as Python's constant-time **byte comparison**, which is a different
  thing from computing a digest.
- **There is no SDK fallback to write.** Polytomic publishes no webhook verifier
  helper in any language, because there is no signature scheme to wrap. Manual
  comparison is *the* implementation, not a workaround for a Node-only SDK.
- **Bytes, not `str`.** `hmac.compare_digest()` raises `TypeError` on `str` values
  containing non-ASCII characters, and the header is attacker-supplied — so the
  token is encoded to UTF-8 bytes first. A test sends a Unicode token.
- **The bearer token is treated as an opaque secret.** The documented sample value
  happens to decode as an HS256 JWT, but it is signed with a key you don't hold,
  has no `exp`, and the docs call it "a static value" — so no `jwt.decode`, no
  `aud`/`iss`/`exp` checks. A test proves a non-JWT secret works.
- **Optional timestamp freshness** (`POLYTOMIC_TIMESTAMP_TOLERANCE_SECONDS`,
  default 300, `0` disables) parsed with `datetime.fromisoformat()` — **never
  `int()`**. The trailing `Z` is normalised to `+00:00`, because
  `fromisoformat()` only accepts a literal `Z` natively on **Python 3.11+**.
- **Batch handling.** `object.records` is a list (default size 100,
  user-configurable), so the handler **always loops**. Tested with a 250-record
  batch and an empty one.
- **`records[].fields` is a plain `Dict[str, Any]`** — deliberately *not* a
  Pydantic model. The keys are defined by the sync configuration, so a model over
  `email` / `last_login` would be wrong for every other customer.
- **`object.metadata` may be a dict, `None`, or absent** — all three tested.
- **Event dispatch on the single documented event, `sync.records`**, with the
  else-branch **ignoring unknown events with a 200** (the docs anticipate future
  types, and a 4xx would mark the customer's sync run as failed).

Because there is no signature, there is **no raw-body requirement** — the handler
uses `await request.json()` rather than capturing `await request.body()`.
(Polytomic may gzip the body; your ASGI server and reverse proxy decompress that
transparently.) Malformed JSON becomes a `400`.

## Prerequisites

- Python 3.9+
- A Polytomic account with a **Webhook connection** and a **Model Sync** pointed
  at it. A connection alone delivers nothing — the sync is what sends.

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
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
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, with the webhook at
`POST /webhooks/polytomic`.

## Test

```bash
pytest test_webhook.py -v
```

Replay the documented payload by hand:

```bash
curl -X POST http://localhost:8000/webhooks/polytomic \
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
npx hookdeck-cli listen 8000 polytomic --path /webhooks/polytomic
```

No account required — the CLI creates a guest account on first run and gives you
a public HTTPS URL plus a web UI for inspecting requests. Paste that URL into the
Webhook connection, then run your sync.

Because Polytomic sends no signature, there is nothing for a gateway to verify on
the **Polytomic → gateway** hop. What a gateway adds here is retries and replay
that Polytomic itself does not document — which matters, because a single 5xx
marks the entire sync run failed.

## Processing the batch asynchronously

This example processes inline to keep it readable. In production, acknowledge
first and process after — *"Any 4xx or 5xx error will cause the sync to appear as a
failure"*, so a slow downstream fails your customer's sync run. Either hand the
batch to a real queue, or use FastAPI's `BackgroundTasks`:

```python
from fastapi import BackgroundTasks

@app.post("/webhooks/polytomic")
async def polytomic_webhook(request: Request, background_tasks: BackgroundTasks):
    ...  # authenticate, check freshness, parse
    background_tasks.add_task(handle_sync_records, envelope)
    return JSONResponse({"received": True}, status_code=200)
```

Note that `BackgroundTasks` runs in the same process — it is not durable across a
restart or a crash. For at-least-once handling of a large batch, enqueue to
something persistent and dedupe on `f"{sync_id}:{hash}"`.

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
backfill on first sync** in the sync's Advanced settings, or make sure you enqueue
rather than process inline.
