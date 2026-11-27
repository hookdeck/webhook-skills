# MailerSend Webhooks - FastAPI Example

Receives MailerSend webhooks at `POST /webhooks/mailersend` and verifies the
`Signature` header: lowercase hex HMAC-SHA256 of the **raw request body**, keyed
with the webhook's signing secret.

The official Python SDK (`mailersend`) ships **no webhook verification helper**,
so verification here is manual — the same algorithm as MailerSend's own Node, Go
and PHP samples.

## Prerequisites

- Python 3.9+
- A MailerSend account with a verified sending domain
- The webhook's **signing secret** (Email → Domains → View domain → Webhooks → your
  webhook). This is not your API token.

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

3. Add your MailerSend webhook signing secret to `.env` as
   `MAILERSEND_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint at `/webhooks/mailersend`.

## Test

```bash
pytest test_webhook.py -v
```

The tests generate real signatures with MailerSend's exact algorithm —
`hex(HMAC_SHA256(signing_secret, raw_body))`, no timestamp, no prefix — and
cover the traps that break real integrations:

- a re-serialised body is rejected, even though it's semantically identical
- a non-ASCII `Signature` header returns 401 instead of raising `TypeError`
  from `hmac.compare_digest`
- the `webhook.test` ping verifies against the **fixed public test secret**
- a *real* event signed with that public test secret is **rejected**

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 mailersend --path /webhooks/mailersend
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

curl -i http://localhost:8000/webhooks/mailersend \
  -H 'Content-Type: application/json' \
  -H "Signature: $SIG" \
  -d "$BODY"
```

## Notes

- The handler takes `Request` and calls `await request.body()`. A Pydantic model
  parameter would parse the body first, leaving you only a re-serialised copy —
  which produces a different digest and fails verification.
- **`webhook.test` is signed with `test_Am3L1GuOIc4blLUuHqAPxxwkZaJyEk8G`**, a
  fixed secret published in MailerSend's docs. The handler accepts it so the
  webhook can save, but rejects any *non*-ping event signed with it — because a
  public secret means anyone can forge that signature.
- **Respond within 3 seconds.** Push slow work to `BackgroundTasks`, Celery, or a
  queue rather than awaiting it in the handler.
- **4xx other than 429 is never retried**, so the 401 on a bad signature gets
  exactly one attempt. 5xx *is* retried, which is why a handler exception returns
  500 rather than swallowing the event.
- `hmac.compare_digest` returns `False` on a length mismatch (unlike Node's
  `crypto.timingSafeEqual`, which throws), but it **raises `TypeError` on
  non-ASCII `str`** — so the comparison is done on `bytes`.
- **No delivery id, timestamp or nonce is sent**, so transport-level replay
  protection is impossible. The example dedupes on `data["id"]`; use Redis or
  your database in production rather than the in-process `set`.
- `data["meta"]` is an empty **list** `[]` when there's nothing to report, and a
  dict otherwise. `normalize_meta()` handles it.
- `created_at` arrives in two formats — ISO-8601 with microseconds and `Z`, and
  space-separated with no timezone (`sender_identity.verified`, `maintenance.*`).
  `parse_created_at()` handles both, including on Python 3.9/3.10 where
  `datetime.fromisoformat` rejects the `Z` suffix.
- MailerSend documents **no source-IP allowlist and no `X-MailerSend-*` headers**.
  Don't build either into your receiver.
