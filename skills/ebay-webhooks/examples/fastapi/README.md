# eBay Webhooks - FastAPI Example

Minimal example of receiving eBay Notification API webhooks with FastAPI,
covering both required checks:

- **Endpoint challenge** — `GET /webhooks/ebay?challenge_code=...` returns the
  SHA-256 `challengeResponse`.
- **Signature verification** — `POST /webhooks/ebay` verifies the ECDSA
  `x-ebay-signature` over the raw body, using the public key from `getPublicKey`
  (cached ~1 hour by `kid`).

eBay only ships a Node.js SDK, so this Python example uses **manual** ECDSA
verification with the `cryptography` library.

## Prerequisites

- Python 3.10+
- An eBay Developers Program keyset (App ID / Cert ID)
- A verification token you generate (32–80 chars, `[A-Za-z0-9_-]`)

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

3. Fill in `.env` (`EBAY_VERIFICATION_TOKEN`, `EBAY_ENDPOINT`,
   `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_ENV`).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

- `GET  /webhooks/ebay` — endpoint challenge validation
- `POST /webhooks/ebay` — notifications

## Test

```bash
pytest test_webhook.py -v
```

The pytest suite generates **real ECDSA signatures** with a P-256 key pair,
preloads the public-key cache (no network call), and asserts the challenge
response and that valid signatures → `204`, invalid/tampered/missing → `412`.

## Receive real webhooks locally

In Hookdeck Event Gateway, create an **eBay** source with your keyset's Client
ID and Client Secret and the same verification token you give eBay, then
forward that source to your machine (`ebay` is the source's name):

```bash
hookdeck listen 8000 ebay --path /webhooks/ebay
```

Register the source URL as your eBay destination endpoint. The eBay source
answers eBay's challenge itself, so the challenge route in this code isn't
called in that setup; the tests cover it.

## Notes

- **Raw body is required.** The handler reads `await request.body()` so the
  signature is verified against the exact bytes eBay signed.
- Returns **204** on success and **412** on signature failure, matching eBay's
  SDK conventions.
- For the official Node SDK path, see
  [../../references/verification.md](../../references/verification.md).
