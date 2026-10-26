# 360dialog Webhooks - FastAPI Example

Minimal example of receiving 360dialog (WhatsApp Business API) webhooks and authenticating
them with HTTP Basic auth.

360dialog does not sign webhooks. You set `Authorization: Basic base64(USER:PASS)` in the
`headers` object when you set the webhook URL, and 360dialog sends it with every request. The
handler decodes it, splits on the first colon and compares the username and the password each
in constant time, evaluating both before deciding. A static credential authenticates the
sender, not the body, and gives no replay protection, so use HTTPS and rotate it if it leaks.

## Prerequisites

- Python 3.9+
- A 360dialog WhatsApp number with an API key (see [../../references/setup.md](../../references/setup.md))

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

3. Set `THREE_SIXTY_DIALOG_WEBHOOK_USERNAME` and `THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD` to the
   USER and PASS you put in the webhook `Authorization` header.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/360dialog`.

## Test

```bash
pytest test_webhook.py
```

The tests send the documented inbound message, status, Coexistence echo and state sync shapes
with correct, wrong, missing and malformed `Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/360dialog \
  -H "Content-Type: application/json" \
  -u "$THREE_SIXTY_DIALOG_WEBHOOK_USERNAME:$THREE_SIXTY_DIALOG_WEBHOOK_PASSWORD" \
  -d '{"object":"whatsapp_business_account","entry":[{"id":"WABA_ID","changes":[{"field":"messages","value":{"messaging_product":"whatsapp","statuses":[{"id":"wamid.ID","status":"delivered","recipient_id":"16315551234"}]}}]}]}'
```

## Receive 360dialog Webhooks Locally

```bash
npx hookdeck-cli listen 8000 360dialog --path /webhooks/360dialog
```

Set the printed URL as your webhook URL with the API (see setup.md), including the
`Authorization` header.

## How It Works

- `main.py`: `verify_360dialog_request()`, the `require_360dialog_auth` dependency, `extract_events()` and the `POST /webhooks/360dialog` route

1. The `require_360dialog_auth` dependency runs before the body is read. It parses the
   `Authorization: Basic` header (scheme case-insensitive, first colon splits the username
   from the password).
2. Both parts are compared as bytes with `hmac.compare_digest` (never `str`, which raises on
   non-ASCII), each evaluated before deciding. A missing or malformed header, or a mismatch,
   returns `401`. Missing server config returns `500`.
3. The body must be a JSON object (`400` otherwise).
4. Events come from `entry[].changes[].field`: for `messages` the handler separates inbound
   `messages` from `statuses` (and `errors`); `smb_message_echoes`, `history` and
   `smb_app_state_sync` are the Coexistence events. History and state sync can also arrive in
   an `{id, event, data}` envelope, which is handled too.
5. It returns `200 {"received": true}` (360dialog needs a 200 within 5 seconds).
