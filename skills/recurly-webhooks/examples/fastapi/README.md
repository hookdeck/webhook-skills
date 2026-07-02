# Recurly Webhooks - FastAPI Example

Minimal example of receiving Recurly webhooks in FastAPI with `recurly-signature`
HMAC-SHA256 verification and optional HTTP Basic Auth.

Recurly's official SDK is an API client and has no webhook-verification helper, so
this example verifies the signature manually with `hmac`/`hashlib`.

## Prerequisites

- Python 3.10+
- A Recurly site with a **JSON** webhook endpoint and its secret key

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

3. Add your endpoint's secret key to `.env` as `RECURLY_WEBHOOK_SECRET`. If you
   configured HTTP Basic Auth on the endpoint, also set `RECURLY_WEBHOOK_USER`
   and `RECURLY_WEBHOOK_PASSWORD`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

The webhook endpoint is `POST /webhooks/recurly` at http://localhost:8000/webhooks/recurly.

## Test

```bash
pytest test_webhook.py
```

The tests generate real signatures with Recurly's algorithm.

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Recurly webhooks to your local server — no account
or install required:

```bash
npx hookdeck-cli listen 8000 recurly --path /webhooks/recurly
```

Point your Recurly endpoint URL at the tunnel URL the CLI prints.

## How It Works

1. `await request.body()` reads the **raw** bytes — required because the signature
   is computed over the exact bytes Recurly sent.
2. Optional HTTP Basic Auth is checked when credentials are configured.
3. The `recurly-signature` header is verified with HMAC-SHA256 over
   `f"{timestamp}." + raw_body` (accepting any of multiple signatures during a
   24h key rotation).
4. Only after verification is the JSON parsed and dispatched by notification type
   (the single top-level key).

## Optional: confirm state via the Recurly API

Webhooks can arrive out of order. For critical flows, install the SDK and fetch
the referenced object to confirm its current state:

```bash
pip install recurly
```

```python
import recurly
client = recurly.Client(os.environ["RECURLY_API_KEY"])
sub = client.get_subscription("uuid-" + subscription["uuid"])
```
