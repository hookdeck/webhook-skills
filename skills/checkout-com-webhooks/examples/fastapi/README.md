# Checkout.com Webhooks - FastAPI Example

Minimal FastAPI example of receiving Checkout.com webhooks with `Cko-Signature`
verification (HMAC-SHA256 over the raw body, hex-encoded) plus the optional
static `Authorization` key.

## Prerequisites

- Python 3.9+
- A Checkout.com account with a webhook configuration and a **signature key**
  (Dashboard → Developers → Webhooks → Create configuration → *Generate key*)

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

3. Add your Checkout.com **signature key** to `.env` as
   `CHECKOUT_WEBHOOK_SIGNATURE_KEY`. If you also generated an authorization
   header key, set `CHECKOUT_WEBHOOK_AUTHORIZATION_KEY`; otherwise leave it
   empty and that check is skipped.

   The signature key is used **as-is** as a UTF-8 HMAC key — do not decode it.
   On the current platform it is **not** your `sk_...` secret API key.

## Run

```bash
python main.py
# or: uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000, endpoint
`POST /webhooks/checkout-com`.

## Test

```bash
pytest test_webhook.py
```

The tests generate real `Cko-Signature` values with the same algorithm
Checkout.com uses — HMAC-SHA256 of the raw body, hex — and cover tampering,
wrong keys, the missing header, uppercase hex, base64 digests, `sha256=`
prefixes, special characters (©, ®, ™), the optional `Authorization` key and
fail-closed behaviour when the secret is unset.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 checkout-com --path /webhooks/checkout-com
```

No account required — the CLI creates a guest account on first run and prints a
public HTTPS URL plus a web UI for inspecting each request (raw body and
`Cko-Signature` header included, which is what you want when debugging). Paste
the printed URL into the webhook's **Endpoint URL** in the Checkout.com
Dashboard, then create a sandbox payment to trigger `payment_approved` and
`payment_captured`.

Checkout.com sends **no handshake, challenge or special test envelope** — every
delivery is an ordinary signed event.

## What this example demonstrates

- **`await request.body()` before anything else** — Checkout.com signs the exact
  bytes it sent. Do not declare a Pydantic model or call `await request.json()`
  before verifying: a parsed object cannot be re-serialized byte for byte, and
  the digest will not match.
- **Verify, then parse.** `json.loads` only runs after the signature checks out.
- **`hmac.compare_digest`** for constant-time comparison. Unlike Node's
  `crypto.timingSafeEqual`, it handles unequal lengths without raising — no
  length guard needed in Python.
- **Fail closed** — an unset `CHECKOUT_WEBHOOK_SIGNATURE_KEY` returns 500 (your
  server is misconfigured), a bad signature returns 401 (the request is wrong).
  Verification is never silently skipped.
- **No timestamp check.** There is no `Cko-Timestamp` header and no signed
  timestamp, so there is no replay window to enforce. Replay protection is
  deduplication on the event `id` (`evt_…`).
- **`BackgroundTasks`** to acknowledge inside Checkout.com's 10-second budget
  and process afterwards. For real workloads, push to a proper queue.
- **`created_on` or `timestamp`** — the field name genuinely varies by event
  (`payment_approved` has `created_on`; `payment_captured` has `timestamp`).
- **`amount` is the minor currency unit** — `{"amount": 20, "currency": "USD"}`
  is $0.20.

## Notes

- Checkout.com's Python SDK manages workflows but ships **no
  webhook-signature verify helper**, so verification here is a manual HMAC with
  `hmac` + `hashlib`. Nothing extra to install.
- **Ordering is not guaranteed** — `payment_captured` can arrive before
  `payment_approved`. Make each handler independently correct.
- For the signature scheme in detail, the optional `Authorization` key and
  previous-platform accounts, see
  [../../references/verification.md](../../references/verification.md).
