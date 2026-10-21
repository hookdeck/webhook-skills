# Taskrabbit Webhooks - FastAPI Example

Minimal example of receiving Taskrabbit webhooks with signature verification.
Taskrabbit delivers webhooks via Svix, so verification uses the official
[`svix`](https://pypi.org/project/svix/) SDK.

## Prerequisites

- Python 3.9+
- Taskrabbit Partner API access (partner onboarding) and an endpoint signing secret (`whsec_...`) from the Svix Partner Dashboard

## Setup

1. Create a virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Add your endpoint signing secret to `.env` (`TASKRABBIT_WEBHOOK_SECRET`)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

The tests sign the documented example payloads (`project.completed`,
`project.canceled`, `project.rescheduled`) with the Svix algorithm and check
valid, tampered, stale, rotated-secret and missing-header cases.

## Webhook Endpoint

```
POST http://localhost:8000/webhooks/taskrabbit
```

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 8000 taskrabbit --path /webhooks/taskrabbit
```

Add the printed URL as an endpoint in the Svix Partner Dashboard, subscribe it
to the project events, then copy that endpoint's signing secret into `.env`.
Use the dashboard's testing tab (or replay a past message) to send an event.
