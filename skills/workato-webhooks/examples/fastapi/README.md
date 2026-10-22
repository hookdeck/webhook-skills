# Workato Webhooks - FastAPI Example

Minimal example of receiving requests from a Workato recipe's **HTTP connector action**,
authenticated with the HTTP connection's Basic auth username and password.

Workato does not sign requests, so there is no HMAC signature to verify. The handler parses
`Authorization: Basic base64(username:password)` and compares the username and password each
in constant time. A static shared credential authenticates the sender, not the body, and
gives no replay protection (no signature, no timestamp): use HTTPS and rotate the password if
it leaks.

## Prerequisites

- Python 3.10+
- A Workato recipe with an HTTP action (see [../../references/setup.md](../../references/setup.md))

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

3. Set `WORKATO_WEBHOOK_USERNAME` and `WORKATO_WEBHOOK_PASSWORD` (`openssl rand -hex 32`
   for the password) and enter the same values as **Basic auth user** and **Basic auth
   password** on the Workato HTTP connection.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts `POST`, `PUT`, `PATCH`, `GET` and `DELETE`
at `/webhooks/workato`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send requests with correct, wrong and missing credentials, every HTTP method, empty
bodies and any content type, and check the event dispatch. No Workato account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/workato \
  -u "$WORKATO_WEBHOOK_USERNAME:$WORKATO_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"event":"order.created","data":{"order_id":"ord_123"}}'
```

## Receive Requests from Workato Locally

Workato can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 workato --path /webhooks/workato
```

Put the printed URL in the HTTP action's **Request URL** field and run the recipe.

## How It Works

1. The request is authenticated before the body is parsed: `Authorization: Basic` (scheme
   case-insensitive), split on the first colon, username and password each compared in
   constant time with both evaluated before deciding. Failure returns `401`.
2. An empty body (for example on `GET`) is fine; a non-empty body must be a JSON object
   (`400` otherwise).
3. The handler dispatches on the `event` field your recipe includes in the body
   (`order.created`, `record.updated`, `recipe.failed`). These names are a convention for
   this example: Workato has no built-in event types.
4. It returns `200 {"received": true}`. A non-2xx response fails the HTTP action.
