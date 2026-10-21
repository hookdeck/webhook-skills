# Mailparser Webhooks - FastAPI Example

Minimal example of receiving Mailparser Advanced Webhooks and authenticating
them. Mailparser doesn't sign webhooks, so this example checks the
**Additional Header** you attach to the webhook (for example
`X-Webhook-Secret: <random>` or `Authorization: Basic ...`) with a
constant-time compare of the whole value.

## Prerequisites

- Python 3.10+
- A Mailparser inbox with an Advanced Webhook

## Setup

1. Install dependencies:

   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:

   ```bash
   cp .env.example .env
   ```

3. Set the header you added under **Additional Headers** in Mailparser:
   - `MAILPARSER_WEBHOOK_HEADER`: the header name (default `X-Webhook-Secret`)
   - `MAILPARSER_WEBHOOK_SECRET`: the exact value, including any `Basic ` prefix

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/mailparser`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send the exact header Mailparser would send (a secret header and
Basic Auth) and cover a wrong value, a value without its `Basic ` prefix, a
missing header, an unconfigured secret and invalid JSON.

Send a request by hand:

```bash
curl -X POST http://localhost:8000/webhooks/mailparser \
  -H "X-Webhook-Secret: $MAILPARSER_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"invoice_number":"INV-1042","total":"129.00","from":"billing@example.com"}'
```

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 mailparser --path /webhooks/mailparser
```

No account required. Paste the printed HTTPS URL into the **Target URL** of
your Advanced Webhook in Mailparser, add the same header under **Additional
Headers**, choose JSON as the Content-Type, then parse an email.

## Notes

- The handler is in `main.py`.
- Mailparser has no event types; the body is your HTTP Body Payload Template.
- There's no signature, timestamp or event ID; deduplicate on a unique parsed
  field or the body hash.
- See [../../references/verification.md](../../references/verification.md)
  for details and debugging.
