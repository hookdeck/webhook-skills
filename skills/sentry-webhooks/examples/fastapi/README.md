# Sentry Webhooks - FastAPI Example

Minimal FastAPI example of receiving Sentry Integration Platform webhooks with
`Sentry-Hook-Signature` / `Sentry-App-Signature` verification (HMAC-SHA256 over
the raw body, lowercase hex, keyed with the integration's Client Secret).

## Prerequisites

- Python 3.9+
- A Sentry **internal integration** (or public integration) with a Webhook URL
  and at least one resource subscribed
  (Settings → Developer Settings → *Create New Integration*)

## Setup

1. Create a virtual environment and install dependencies:

   ```bash
   python3 -m venv venv
   source venv/bin/activate     # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Add your integration's **Client Secret** to `.env` as
   `SENTRY_CLIENT_SECRET`. It is used **as-is** as a UTF-8 HMAC key — do not
   decode it. It is **not** the Client ID, an auth token or a DSN.

## Run

```bash
python main.py
# or: uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/sentry`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads the way Sentry does — compact, ASCII-escaped JSON,
HMAC-SHA256 of the raw bytes, hex — and cover tampering, wrong secrets, both
signature header names, base64 digests, Stripe-style `timestamp.body` signing,
a hex-decoded secret, the empty-body delivery, the re-serialization bug, the
optional timestamp dampener and fail-closed behaviour when the secret is unset.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 sentry --path /webhooks/sentry
```

No account required — the CLI creates a guest account on first run and prints a
public HTTPS URL plus a web UI for inspecting each request. Paste the printed URL
into your integration's **Webhook URL**, then resolve or comment on an issue in
Sentry to get a real, signed delivery.

Sentry sends **no handshake, challenge or validation request**.

## What this example demonstrates

- **The event name is `Sentry-Hook-Resource` + `.` + `body["action"]`.** The
  body has no `type` or `event` field. `event_token()` rebuilds `issue.created`.
- **`await request.body()` before anything else** — no Pydantic body model, no
  `await request.json()`. Sentry signs the exact bytes it sent, and some
  requests arrive with an **empty body** that a JSON parser would reject.
- **Raw-body verification, not Sentry's published snippet.** The documented
  `json.dumps(request.body)` re-serializes a parsed body. With Python's default
  `", "` separators it doesn't even match ASCII payloads, and with
  `ensure_ascii=False` it breaks on any accent or emoji. There is a test for it.
- **Both signature headers** — `Sentry-Hook-Signature`, falling back to
  `Sentry-App-Signature` (UI-component external requests).
- **`hmac.compare_digest`** for constant-time comparison; unlike Node's
  `timingSafeEqual` it handles unequal lengths without raising.
- **Fail closed** — unset `SENTRY_CLIENT_SECRET` returns 500; a bad signature
  returns 401.
- **The timestamp check is opt-in, and only a dampener** —
  `Sentry-Hook-Timestamp` is not signed. Dedupe on **`Request-ID`**.
- **`BackgroundTasks`** to acknowledge inside Sentry's **1-second** budget. For
  real workloads, push to a proper queue.
- **Resource-name traps** — `event_alert` (not `issue_alert`), `issue.ignored`
  and its `issue.archived` alias, the undocumented `metric_alert.open`, and
  `preprod_artifact.*` branching on `state` rather than the action name.

## Notes

- **No SDK does this.** `sentry-sdk` is an error-reporting SDK and ships no
  webhook verification helper. Don't add it for this.
- **Sentry does not retry.** A dropped delivery is lost — backfill via Sentry's
  API. Repeated failures can **disable** the webhook.
- For the signature scheme in detail, see
  [../../references/verification.md](../../references/verification.md).
