# Freshsales Webhooks - FastAPI Example

Minimal example of receiving Freshsales workflow webhooks and authenticating them with a secret
custom header.

Freshsales does not sign webhooks, so there is no HMAC to verify. You add a secret header on the
workflow's **Trigger webhook** action, and the handler compares the whole header value with
`FRESHSALES_WEBHOOK_SECRET` in constant time. A static shared credential authenticates the sender,
not the body, and gives no replay protection: use HTTPS and rotate the secret if it leaks.

The request method is chosen in the workflow, so the route accepts `POST`, `PUT`, `PATCH`, `GET`
and `DELETE`, and an empty body (for `GET`/`DELETE`) is fine. The route reads the raw body with
`await request.body()`, and a dependency rejects bad credentials before the body is read, so any
content type works.

## Prerequisites

- Python 3.9+
- A Freshsales account with Workflows (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `FRESHSALES_WEBHOOK_SECRET` to the exact header value you will enter in Freshsales, and
   `FRESHSALES_WEBHOOK_HEADER` if you use a header name other than `X-Webhook-Secret`.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts requests at `/webhooks/freshsales`.

## Test

```bash
pytest test_webhook.py -v
```

The tests cover correct, wrong, missing and differently-sized secrets, every request method, empty
bodies and illustrative deal and contact bodies. No Freshsales account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/freshsales \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $FRESHSALES_WEBHOOK_SECRET" \
  -d '{"deal":{"id":"12345","name":"Acme renewal","amount":"5000"}}'
```

## Receive Webhooks Locally

Freshsales can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 freshsales --path /webhooks/freshsales
```

Put the printed URL in the workflow's Callback URL, and add the secret header to the action.

## How It Works

- `main.py`: `verify_freshsales_request()`, the `require_freshsales_secret` dependency and the `/webhooks/freshsales` route

1. The secret header is checked by a FastAPI dependency before the body is read. Failure returns `401`.
2. An empty body is accepted; a non-empty body must be JSON (`400` otherwise, so set Encoding to JSON).
3. Freshsales sends no event type. The handler tells payloads apart by shape: an illustrative
   Advanced body with a top-level `deal` or `contact` object. Adapt it to the body you write.
4. It returns `200 {"received": true}`.
