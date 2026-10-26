# Builder.io Webhooks - FastAPI Example

Minimal example of receiving Builder.io webhooks and authenticating them with a secret custom
header.

Builder.io does not sign payloads, so there is no HMAC to verify. You add a custom header to the
webhook; a FastAPI dependency compares that header's whole value with your stored secret using
`hmac.compare_digest` on bytes. The route reads the body with `await request.body()`, so any
content type works, and parses JSON only after the check.

A static shared credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Builder.io model with a webhook and a custom header (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `BUILDER_IO_WEBHOOK_HEADER` to the custom header name and `BUILDER_IO_WEBHOOK_SECRET` to its
   exact whole value (including any `Bearer ` prefix you typed).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/builder-io`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every documented operation with correct, wrong and missing header values. No
Builder.io account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/builder-io \
  -H "Content-Type: application/json" \
  -H "$BUILDER_IO_WEBHOOK_HEADER: $BUILDER_IO_WEBHOOK_SECRET" \
  -d '{"operation":"publish","modelName":"page","newValue":{"id":"cs3df","name":"My great page"},"previousValue":null}'
```

## Receive Webhooks Locally

Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 builder-io --path /webhooks/builder-io
```

Put the printed URL in the model's webhook, and add the custom header there.

## How It Works

- `main.py`: `verify_builder_request()`, the `require_builder_secret` dependency and the
  `POST /webhooks/builder-io` route

1. The configured header is looked up and its whole value compared before the body is parsed.
   Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `operation`: `publish`, `unpublish`, `archive`, `delete`,
   `scheduledStart`, `scheduledEnd`.
4. It returns `200 {"received": true}`.
