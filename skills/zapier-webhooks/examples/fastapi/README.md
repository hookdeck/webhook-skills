# Zapier Webhooks - FastAPI Example

Minimal example of receiving requests from the **Webhooks by Zapier** action (POST, PUT or Custom Request) in FastAPI.

> **There is no signature to verify.** Zapier does not sign these requests. You authenticate them with a secret you add to the Zap: an `X-Webhook-Secret` header (Headers section) or HTTP Basic Auth (the action's Basic Auth field, `username|password`). This example accepts either and compares in constant time. See [references/verification.md](../../references/verification.md).

## What this example shows

- `@app.api_route("/webhooks/zapier", methods=["POST", "PUT", "PATCH", "DELETE"])` with a `require_zapier_auth` dependency authenticating **before** the body is parsed
- Constant-time comparison of `X-Webhook-Secret` against `ZAPIER_WEBHOOK_SECRET`, or of the decoded `Authorization: Basic` credentials against `ZAPIER_BASIC_AUTH_USERNAME` / `ZAPIER_BASIC_AUTH_PASSWORD`
- **Fail closed:** `500` when neither method is configured, so a missing env var never leaves the endpoint open
- Parsing whichever **Payload Type** the Zap uses: JSON, Form (URL-encoded), or XML / Raw / Custom Request text passed through as-is
- Optional dispatch on an `event` field **you** add in the Zap's Data section (Zapier has no event types; without the field it is logged as `zap action`)

## Prerequisites

- Python 3.9+
- A Zapier account and a Zap with a **Webhooks by Zapier** action step

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

3. Set `ZAPIER_WEBHOOK_SECRET` (e.g. `openssl rand -hex 32`), and/or `ZAPIER_BASIC_AUTH_USERNAME` + `ZAPIER_BASIC_AUTH_PASSWORD`.

4. In the Zap's Webhooks by Zapier action, set **URL** to your endpoint and either add a header `X-Webhook-Secret` with the same value under **Headers**, or enter `username|password` in **Basic Auth**.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

Send a request by hand:

```bash
curl -X POST http://localhost:8000/webhooks/zapier \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $ZAPIER_WEBHOOK_SECRET" \
  -d '{"event": "lead.created", "first_name": "Bryan", "email": "bryan@example.com"}'
```

Or with Basic Auth: `curl -u "$ZAPIER_BASIC_AUTH_USERNAME:$ZAPIER_BASIC_AUTH_PASSWORD" ...`

### Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 zapier --path /webhooks/zapier
```

No account required. Paste the public URL into the action's **URL** field, then use **Test step** in the Zap editor to send a real request.

## Endpoint

- `POST` / `PUT` / `PATCH` / `DELETE /webhooks/zapier`: `500` if no credentials are configured, `401` on a missing or wrong secret, `400` on a malformed JSON body, `200` otherwise. Zapier marks the action step as errored on any non-2xx response.
- `GET /health`: health check.

The route also accepts PATCH and DELETE, which a Custom Request step can send.
