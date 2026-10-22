# Gitea Webhooks - FastAPI Example

Minimal example of receiving Gitea webhooks with signature verification (`X-Gitea-Signature`, HMAC-SHA256).

## Prerequisites

- Python 3.10+
- A Gitea repository, organization, or instance where you can add webhooks, and the webhook **Secret**

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

3. Add your Gitea webhook Secret to `.env` as `GITEA_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and receives webhooks at `POST /webhooks/gitea`.

## Test

Run the unit tests (they generate real signatures):

```bash
pytest test_webhook.py -v
```

To receive real deliveries locally:

```bash
npx hookdeck-cli listen 8000 gitea --path /webhooks/gitea
```

Then add the Hookdeck URL as the Target URL under **Settings → Webhooks → Add Webhook → Gitea** and use **Test Delivery** to send a `push` event.
