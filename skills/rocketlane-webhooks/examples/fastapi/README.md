# Rocketlane Webhooks - FastAPI Example

Minimal example of receiving Rocketlane webhooks and authenticating them with HTTP Basic auth.

Rocketlane does not sign payloads. The only authentication is Basic auth (a username and
password set on the webhook), sent as `Authorization: Basic base64(username:password)`. The
handler parses it strictly, splits on the first colon, and compares the username and the
password each in constant time, evaluating both before deciding. A static credential
authenticates the sender, not the body, and gives no replay protection, so use HTTPS and
rotate it if it leaks.

## Prerequisites

- Python 3.9+
- A Rocketlane account with access to Settings > Webhooks

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

3. In Rocketlane, choose Basic authentication and set a username and password on the Rocketlane
   webhook (see [../../references/setup.md](../../references/setup.md)). Put them in `.env` as
   `ROCKETLANE_WEBHOOK_USERNAME` and `ROCKETLANE_WEBHOOK_PASSWORD`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/rocketlane`.

## Test

```bash
pytest test_webhook.py
```

The tests send documented `TASK_CREATED` and `TASK_UPDATED` shapes with correct, wrong,
malformed and missing credentials. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/rocketlane \
  -u "$ROCKETLANE_WEBHOOK_USERNAME:$ROCKETLANE_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"eventId":"b6c68150-86f3-4a26-9a5f-66db5ca24b87","resourceType":"TASK","eventType":"TASK_CREATED","version":"1.0","data":{"task":{"taskId":278,"taskName":"task2"}}}'
```

## Receive Rocketlane Webhooks Locally

```bash
npx hookdeck-cli listen 8000 rocketlane --path /webhooks/rocketlane
```

Paste the printed URL as the webhook URL in Rocketlane. The credentials must arrive on the
first request: Hookdeck never sends a 401 + WWW-Authenticate challenge, it verifies the
request as received.

## How It Works

- `main.py`: `parse_basic_auth()`, `verify_rocketlane_request()`, the `require_rocketlane_auth` dependency and the route

1. The `require_rocketlane_auth` dependency runs before the body is read. Failure returns `401`.
2. `base64.b64decode(..., validate=True)` rejects anything outside the base64 alphabet; comparison uses `hmac.compare_digest` on bytes.
3. The body is read raw, then parsed as a JSON object (`400` otherwise).
4. The handler branches on `eventType` (`TASK_CREATED`, `TASK_UPDATED`, `TASK_DELETED`, `PROJECT_*`, `PHASE_*`).
5. It returns `200 {"received": true}`. Rocketlane counts only 200 or 204 within 10 seconds as delivered.
