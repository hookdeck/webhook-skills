# Render Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Render](https://render.com/docs/webhooks) webhooks with Standard Webhooks signature verification, using the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) library that Render's docs recommend.

## Prerequisites

- Python 3.9+
- A Render workspace on the **Pro plan or higher** (required for webhooks)
- Workspace **admin** access to create the webhook and copy its signing secret

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `RENDER_WEBHOOK_SECRET` to the signing secret from **Integrations > Webhooks > your webhook > Settings** in the Render Dashboard (see [setup](../../references/setup.md)). Paste it exactly as shown.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/render` in [main.py](main.py) (verification runs in the `verified_render_event` dependency).

## Test

```bash
pytest test_webhook.py -v
```

The tests use FastAPI's TestClient with real Standard Webhooks signatures. They cover `deploy_ended` with each `status`, tampered bodies, stale timestamps, multiple signatures, retried deliveries (same `data.id`, new timestamp), and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 render --path /webhooks/render
```

Use the printed URL as the webhook **URL** in the Render Dashboard, select events such as `deploy_ended` and `server_failed`, then trigger a manual deploy of any service to receive `build_started`, `deploy_started` and `deploy_ended`.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw bytes, so a Pydantic body model or `request.json()` before verification breaks it.
- If `RENDER_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- Render needs a `2xx` within **15 seconds**, retries up to 8 attempts over ~33 hours, and **disables the webhook** if every attempt fails. Enqueue the event and process it asynchronously in production.
- Payloads are thin (`type`, `timestamp`, `data.id`, `data.serviceId`, `data.serviceName`, optional `data.status`). Call `GET https://api.render.com/v1/events/{data.id}` with a Render API key for details such as the deploy ID.
