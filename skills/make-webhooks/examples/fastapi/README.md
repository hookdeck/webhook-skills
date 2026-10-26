# Make Webhooks - FastAPI Example

Minimal example of receiving requests from a Make **HTTP > Make a request** module,
authenticated with a secret header from an API key keychain.

Make does not sign requests, so there is no HMAC signature to verify. The handler compares the
whole header value against your configured secret with a constant-time comparison. A static
credential authenticates the sender, not the body, and gives no replay protection.

## Prerequisites

- Python 3.10+
- A Make scenario with an HTTP > Make a request module (see [../../references/setup.md](../../references/setup.md))

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

3. Set `MAKE_WEBHOOK_SECRET` to the exact **Key** you enter in Make's API key keychain,
   including any prefix (for example `Bearer <openssl rand -hex 32>`). Set
   `MAKE_WEBHOOK_HEADER` to the keychain's **API key parameter name** (default
   `Authorization`). Use **API key placement: In the header**.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts POST, PUT, PATCH, DELETE and GET requests at
`/webhooks/make`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send each method with correct, wrong and missing credentials and check the event
dispatch. No Make account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/make \
  -H "Content-Type: application/json" \
  -H "Authorization: $MAKE_WEBHOOK_SECRET" \
  -d '{"event":"order.created","id":"bundle_1042","data":{"order_id":"ord_123"}}'
```

## Receive Requests from Make Locally

Make's cloud can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 make --path /webhooks/make
```

Put the printed URL in the HTTP module's **URL** field and run the module.

## How It Works

- `main.py`: `verify_make_request()`, the `require_make_auth` dependency and the `/webhooks/make` route

1. The raw body is read with `await request.body()`, so any content type works. The auth
   dependency runs first, so the route never executes for unauthenticated requests.
2. The request is authenticated before the body is parsed: the header named by
   `MAKE_WEBHOOK_HEADER` must equal `MAKE_WEBHOOK_SECRET` exactly. Failure returns `401`.
3. An empty body (such as a GET) returns `200` with nothing to dispatch.
4. Otherwise the body must be a JSON object (`400` otherwise), and the handler dispatches on
   the `event` field your scenario includes (`order.created`, `lead.created`,
   `scenario.completed`, `scenario.failed`). These names are a convention for this example:
   Make has no built-in event types.
5. It returns `200 {"received": true}`. Any non-2xx response makes the HTTP module error.
