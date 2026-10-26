# SonarQube Webhooks - FastAPI Example

Minimal example of receiving SonarQube webhooks with signature verification (`X-Sonar-Webhook-HMAC-SHA256`).

## Prerequisites

- Python 3.9+
- A SonarQube Server webhook with a **Secret** (without one, deliveries are unsigned and fail verification)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add the webhook Secret to `.env` as `SONARQUBE_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000

## Test

```bash
pytest test_webhook.py -v
```

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 sonarqube --path /webhooks/sonarqube
```

Then use the Hookdeck URL as the webhook URL in SonarQube (Project Settings > Webhooks) and run an analysis.

## Endpoint

- `POST /webhooks/sonarqube` - Receives and verifies SonarQube analysis results. Branches on `qualityGate.status` (`OK` / `ERROR`).
