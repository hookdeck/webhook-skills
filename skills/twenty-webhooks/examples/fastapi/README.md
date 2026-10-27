# Twenty Webhooks - FastAPI Example

Minimal example of receiving Twenty CRM webhooks with signature verification. Twenty has no webhook verification SDK, so the HMAC check is manual.

## Prerequisites

- Python 3.10+
- A Twenty workspace (cloud or self-hosted) with a webhook secret

> Set a secret on the Twenty webhook (Settings > Developers > Webhooks). Twenty signs deliveries only when the webhook has a secret.

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook secret from Twenty (Settings > Developers > Webhooks) to `.env` as `TWENTY_WEBHOOK_SECRET`

## Run

```bash
python main.py
```

Server runs on http://localhost:8000

## Test

### Run the tests

```bash
pytest test_webhook.py -v
```

The tests sign payloads with the real Twenty algorithm (hex HMAC-SHA256 of `"<timestamp>:<raw body>"`) and cover valid, invalid, tampered, replayed and opt-in-tolerance requests.

### Send a signed test event

```bash
node -e '
const c = require("crypto");
const body = JSON.stringify({ eventName: "person.created", record: { id: "abc12345" } });
const t = String(Date.now());
const sig = c.createHmac("sha256", process.env.TWENTY_WEBHOOK_SECRET).update(t + ":" + body).digest("hex");
fetch("http://localhost:8000/webhooks/twenty", { method: "POST", headers: { "Content-Type": "application/json", "X-Twenty-Webhook-Timestamp": t, "X-Twenty-Webhook-Signature": sig }, body }).then((r) => console.log(r.status));
'
```

A valid event returns `200`; a wrong secret or signature returns `401`.

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 twenty --path /webhooks/twenty
```

Use the public URL the CLI prints as the webhook URL in Twenty, then create or edit a record.

## Endpoint

- `POST /webhooks/twenty` - Receives and verifies Twenty webhooks (200 / 401)
- `GET /health` - Health check
