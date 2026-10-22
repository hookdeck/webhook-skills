# SignNow Webhooks - FastAPI Example

Minimal example of receiving SignNow webhooks (event subscriptions) with signature verification.

## Prerequisites

- Python 3.9+
- A SignNow API account (API Dashboard access)
- An event subscription created **with a `secret_key`**. Without one, SignNow sends unsigned callbacks and verification can't work.

## Setup

1. Create a virtualenv and install dependencies:

   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Set `SIGNNOW_WEBHOOK_SECRET` in `.env` to the same `secret_key` you set on the subscription.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/signnow`.

## Test

```bash
pytest test_webhook.py
```

The tests sign payloads with `base64(HMAC-SHA256(secret, rawBody))`, the same way SignNow does, and cover bad/missing/hex signatures, tampered bodies, non-JSON content types and event dispatch.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 signnow --path /webhooks/signnow
```

No account required. Use the printed HTTPS URL as the `callback` when you create the event subscription (`POST /v2/event-subscriptions`, or API Dashboard → Webhooks), then complete a document to trigger `document.complete`.

## Notes

- The handler is in `main.py`; verification is a FastAPI dependency that reads `await request.body()` (raw bytes) before any parsing.
- The signature is **base64**, not hex, and there is no timestamp in the signed content.
- See [../../references/verification.md](../../references/verification.md) for details and debugging.
