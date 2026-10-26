# Iterable Webhooks - FastAPI Example

Minimal example of receiving Iterable system webhooks and authenticating them with the
`Authorization` header.

Iterable does not sign payloads. The only authentication is the `Authorization` header that
Iterable sends when you choose **Basic** or **OAuth 2.0** on the webhook:

- OAuth 2.0: `Authorization: Bearer <token>` (you enter only the token in Iterable)
- Basic: exactly what you typed in Authentication Token, e.g. `Authorization: Basic abc123`

The handler compares the **whole header value**, scheme prefix included, in constant time.
It never decodes a Basic value. A static credential authenticates the sender, not the body,
and gives no replay protection; use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- An Iterable project with permission to manage system webhooks
  (see [../../references/setup.md](../../references/setup.md))

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

3. Set `ITERABLE_AUTHORIZATION` to the full header value, e.g. `Bearer <token>`.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/iterable`.

## Test

```bash
pytest test_webhook.py
```

The tests send documented payload shapes with correct, wrong and missing `Authorization`
headers. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/iterable \
  -H "Content-Type: application/json" \
  -H "Authorization: $ITERABLE_AUTHORIZATION" \
  -d '{"email":"user@example.com","eventName":"emailSend","dataFields":{"campaignId":59667}}'
```

## Receive Iterable Webhooks Locally

```bash
npx hookdeck-cli listen 8000 iterable --path /webhooks/iterable
```

Use the printed URL as the system webhook's Endpoint URL (Iterable requires `https://`).

## How It Works

- `main.py`: `verify_iterable_request()`, the `require_iterable_auth` dependency and the `POST /webhooks/iterable` route

1. The `require_iterable_auth` dependency compares `Authorization` with
   `ITERABLE_AUTHORIZATION` before the body is read. Failure returns `401`.
2. The raw body is parsed as JSON, so any content type works. It must be an object (`400` otherwise).
3. The handler dispatches on `eventName` (`emailSend`, `emailOpen`, `emailClick`, `emailBounce`,
   `emailComplaint`, `emailUnSubscribe`, `smsSend`, `pushSend`, `inAppOpen`, ...).
4. It returns `200 {"received": true}` quickly: Iterable times out after 2 seconds.
