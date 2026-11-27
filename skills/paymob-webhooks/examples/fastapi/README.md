# Paymob Webhooks - FastAPI Example

Minimal example of receiving Paymob **Transaction Processed Callbacks** and card
token callbacks with
HMAC-SHA512 signature verification.

## Prerequisites

- Python 3.9+
- A Paymob account with an HMAC secret (Dashboard > Settings > Developers > API Keys, main account user only)

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

3. Add your Paymob HMAC secret to `.env`:
   ```bash
   PAYMOB_HMAC_SECRET=your_hmac_secret_here
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/paymob`.

## How Verification Works

Paymob does **not** sign the raw body — it computes
HMAC-SHA512 (hex) over a fixed, ordered concatenation of keys from `obj` (20 for
`TRANSACTION`, 8 for `TOKEN`) and sends the result as the **`hmac` query parameter** (`?hmac=<hex>`). The
handler reads it from `request.query_params`, parses the JSON, rebuilds the
string, and compares it with `hmac.compare_digest`. Note Python's
`str(True)` is `"True"`, so booleans are converted to lowercase explicitly. See
[../../references/verification.md](../../references/verification.md) for the full
field list and gotchas.

## Test

```bash
pytest test_webhook.py -v
```

The tests check the string builder against the concatenated string Paymob's
HMAC transaction page prints, verify Paymob's published card token example, and
assert valid, invalid, missing, and tampered signatures are handled correctly.

## Receive Real Webhooks Locally

Use the Hookdeck CLI to tunnel Paymob callbacks to your local server (no account
required):

```bash
npx hookdeck-cli listen 8000 paymob --path /webhooks/paymob
```

Set the printed URL as your callback URL in the Paymob dashboard.
