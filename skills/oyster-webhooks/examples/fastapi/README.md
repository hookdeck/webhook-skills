# Oyster Webhooks - FastAPI Example

Minimal example of receiving Oyster (global HR / EOR) webhooks with FastAPI and authenticating
them with the `Authorization` bearer shared secret.

Oyster does not sign payloads. The only authentication is the `sharedSecret` you register,
which Oyster sends as `Authorization: Bearer <sharedSecret>`. The handler compares the **whole
header value**, including the `Bearer ` prefix, with `hmac.compare_digest` on bytes. That
authenticates the sender, not the body, and gives no replay protection: use HTTPS, dedupe on
the event `id` and rotate the secret if it leaks.

## Prerequisites

- Python 3.9+
- An Oyster Developer Application and access token to register the endpoint (see
  [../../references/setup.md](../../references/setup.md))

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

3. Set `OYSTER_AUTHORIZATION` to `Bearer ` plus the `sharedSecret` you register.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/oyster`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send the documented envelope for `hiring.employment_engaged`,
`expenses.expense_approved`, `contract.change_applied` and `benefits.enrollment_enrolled` with
correct, wrong and missing `Authorization` headers.

## Receive Oyster Webhooks Locally

```bash
npx hookdeck-cli listen 8000 oyster --path /webhooks/oyster
```

Register the printed URL as the `url` in `POST /v1/webhooks`.

## How It Works

- `main.py`: `verify_oyster_request()`, the `require_oyster_auth` dependency and the route

1. The dependency compares `Authorization` with `OYSTER_AUTHORIZATION` before the body is
   read. Failure returns `401`.
2. The body is read raw (`await request.body()`), so any content type works, then parsed.
3. It must be a JSON object with a string `eventName` (`400` otherwise).
4. The handler branches on `eventName`; unknown events are logged and still get `200`.
