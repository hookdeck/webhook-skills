# Paperform Webhooks - FastAPI Example

Minimal example of receiving Paperform submission webhooks and authenticating them with a secret
custom header.

Paperform does not sign payloads, so there is no HMAC to verify. You add a secret header to the
webhook (the **Custom headers** toggle), and the handler compares that header's whole value with
`PAPERFORM_WEBHOOK_SECRET` in constant time. A static credential authenticates the sender, not
the body, and gives no replay protection: use HTTPS and rotate it if it leaks.

## Prerequisites

- Python 3.9+
- A Paperform form on a plan with webhooks (see [../../references/setup.md](../../references/setup.md))

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

3. Set `PAPERFORM_WEBHOOK_HEADER` to the header name you added in Paperform (default
   `Authorization`) and `PAPERFORM_WEBHOOK_SECRET` to its exact, whole value (including any
   `Bearer ` prefix you typed).

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/paperform`.

## Test

```bash
pytest test_webhook.py -v
```

The tests cover correct, wrong, differently-sized and missing header values, both triggers and
bad bodies. No Paperform account is needed.

To try it by hand:

```bash
curl -X POST "http://localhost:8000/webhooks/paperform" \
  -H "Content-Type: application/json" \
  -H "$PAPERFORM_WEBHOOK_HEADER: $PAPERFORM_WEBHOOK_SECRET" \
  -d '{"data":[{"title":"Name","description":null,"type":"text","key":"tgp8","custom_key":null,"value":"Test 123"}],"submission_id":"abc123","created_at":"2017-06-09 09:51:23","ip_address":"192.168.10.1","charge":null}'
```

## Receive Webhooks Locally

Paperform can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 8000 paperform --path /webhooks/paperform
```

Put the printed URL in the Paperform webhook, then add the custom header.

## How It Works

- `main.py`: `verify_paperform_request()`, a dependency, and the `POST /webhooks/paperform` route`

1. The secret header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object with a `data` array (`400` otherwise).
3. Paperform has no event types; the trigger (New Submission or Partial Submission) is a
   per-webhook setting. The handler reads an optional `?trigger=partial` query parameter that
   you add to the webhook URL (a convention of this example) and treats everything else as a new
   submission.
4. It returns `200 {"received": true}`.
