# WebinarJam Webhooks - FastAPI Example

Minimal example of receiving WebinarJam / EverWebinar Custom Webhook deliveries and
authenticating them with the Bearer token or custom header you configured.

WebinarJam does not sign requests. The handler reads the header named in
`WEBINARJAM_WEBHOOK_HEADER` (default `Authorization`) and compares the **whole value**,
including any `Bearer ` prefix, with `WEBINARJAM_WEBHOOK_SECRET` in constant time. A static
credential authenticates the sender, not the body, and gives no replay protection: use HTTPS
and rotate it if it leaks.

For the Bearer token option, enter Authorization as the header name and "Bearer <token>" as the value.

## Prerequisites

- Python 3.9+
- A WebinarJam or EverWebinar account with the Custom Webhook integration
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

3. Set `WEBINARJAM_WEBHOOK_SECRET` to the exact header value WebinarJam sends (for example
   `Bearer <token>`) and `WEBINARJAM_WEBHOOK_HEADER` to its name.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/webinarjam`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send an illustrative lead payload with correct, wrong, prefix-less and missing
credentials. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/webinarjam \
  -H "Content-Type: application/json" \
  -H "Authorization: $WEBINARJAM_WEBHOOK_SECRET" \
  -d '{"event":"registered","email":"ada@example.com","first_name":"Ada"}'
```

## Receive WebinarJam Webhooks Locally

```bash
npx hookdeck-cli listen 8000 webinarjam --path /webhooks/webinarjam
```

Use the printed URL as the base webhook URL on the Custom Webhook integration.

## How It Works

- `main.py`: `verify_webinarjam_request()`, the `require_webinarjam_auth` dependency and the `POST /webhooks/webinarjam` route

1. The `require_webinarjam_auth` dependency compares the configured header with `WEBINARJAM_WEBHOOK_SECRET` before the body is read. Missing or wrong returns `401`; an unset secret returns `500`.
2. The raw body is parsed as JSON, so any content type works. It must be an object (`400` otherwise).
3. WebinarJam documents no event field and no payload field names. The handler dispatches on an
`event` value you add as a custom body key-value pair: `registered`, `attended_live`,
`missed_live`, `left_early` or `purchased` (a convention of this skill). The payload fields
(`email`, `first_name`, ...) are illustrative.
4. It returns `200 {"received": true}`.
