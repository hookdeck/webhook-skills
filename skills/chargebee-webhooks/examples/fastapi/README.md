# Chargebee Webhooks - FastAPI Example

Minimal example of receiving Chargebee webhooks with Basic Auth verification in FastAPI.

## Prerequisites

- Python 3.9+
- Chargebee account with webhook Basic Auth credentials

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

4. Add your Chargebee webhook credentials to `.env`:
   - `CHARGEBEE_WEBHOOK_USERNAME`: Your chosen username from Chargebee webhook settings
   - `CHARGEBEE_WEBHOOK_PASSWORD`: Your chosen password from Chargebee webhook settings

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000

API documentation available at http://localhost:8000/docs

## Test Locally

Use Hookdeck CLI to receive webhooks locally:

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Forward webhooks to your local server
hookdeck listen 8000 --path /webhooks/chargebee
```

Then configure your Chargebee webhook to point to the Hookdeck URL.

## Test

Run the test suite:
```bash
pytest test_webhook.py -v
```

## Webhook Endpoint

- **URL**: `POST /webhooks/chargebee`
- **Authentication**: HTTP Basic Auth
- **Response**: 200 OK on success, 401 on auth failure

## Example Webhook Payload

```json
{
  "id": "ev_16BHbhF4s42tO2lK",
  "occurred_at": 1704067200,
  "source": "admin_console",
  "object": "event",
  "api_version": "v2",
  "event_type": "subscription_created",
  "content": {
    "subscription": {
      "id": "16BHbhF4s42tO2lJ",
      "customer_id": "16BHbhF4s42tO2lI",
      "plan_id": "basic-monthly",
      "status": "active"
    }
  }
}