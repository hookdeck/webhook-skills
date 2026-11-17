# Chatbase Webhooks - FastAPI Example

Minimal example of receiving Chatbase Action webhooks with signature verification:

- `POST /webhooks/chatbase` - `leads.submit`, `phone_call.summary`, `{action name}_custom_form.submit` and `{action name}_collect_data.submit`, verified with `x-chatbase-signature` (hex HMAC-SHA1 of the raw body)

The check uses `hmac` from the standard library.

## Prerequisites

- Python 3.9+
- A Chatbase AI agent on a paid plan (webhooks need one), and your webhook secret

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

3. Set `CHATBASE_WEBHOOK_SECRET` in `.env`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 chatbase --path /webhooks/chatbase
```

Paste the printed URL into your Collect Leads Action's **Destinations** section (or **Settings > Webhooks** for custom forms, **Phone > Connections** for call summaries) and click **Create webhook**. Submit a lead in the chat to trigger `leads.submit`.

### Send a signed request by hand

```bash
BODY='{"eventType":"leads.submit","chatbotId":"xxxxxxxx","payload":{"conversationId":"xxxxxxxx","customerEmail":"example@chatbase.co","customerName":"Example","customerPhone":"123"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$CHATBASE_WEBHOOK_SECRET" | sed 's/^.* //')
curl -X POST http://localhost:8000/webhooks/chatbase \
  -H 'Content-Type: application/json' -H "x-chatbase-signature: $SIG" -d "$BODY"
```

### Run tests

```bash
pytest test_webhook.py -v
```

## Files

- `main.py` - FastAPI app; reads `await request.body()` before parsing
- `test_webhook.py` - pytest tests that sign requests the way Chatbase does
