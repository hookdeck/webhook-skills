# NMI Webhooks - FastAPI Example

Minimal example of receiving NMI (Network Merchants) webhooks with
`Webhook-Signature` verification in FastAPI.

## Prerequisites

- Python 3.9+
- An NMI gateway account with a **webhooks signing key** (Merchant Portal
  → Settings → Webhooks)

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

3. Add your NMI **webhooks signing key** to `.env` as `NMI_SIGNING_KEY`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook route is served at `POST http://localhost:8000/webhooks/nmi`.

## Test

Run the unit tests (they generate real signatures):

```bash
pytest test_webhook.py -v
```

## Receive real webhooks locally

Start a tunnel (no account required) and point it at your local handler:

```bash
npx hookdeck-cli listen 8000 nmi --path /webhooks/nmi
```

Register the printed public URL as your endpoint under **Settings → Webhooks** in
the Merchant Portal, then run a test transaction and watch the delivery
arrive.

## How It Works

- NMI does **not** use Standard Webhooks. There is no SDK, so verification is
  manual: read the **raw body**, parse `t` (nonce) and `s` (signature) from the
  `Webhook-Signature` header, and compare an HMAC-SHA256 you compute.
- **NMI calls `t` a nonce** and documents no replay window to enforce.
- The signed content is `"<nonce>.<raw_body>"`, keyed with `NMI_SIGNING_KEY`,
  hex-encoded (lowercase). Mismatch returns 401.
- On success the handler dispatches on the `transaction.<action>.<result>` event
  type and returns **200** quickly so NMI does not retry.

See [../../references/verification.md](../../references/verification.md) for details.
