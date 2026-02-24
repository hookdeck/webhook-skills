# OpenClaw Webhooks - FastAPI Example

Minimal example of receiving OpenClaw Gateway webhooks with Python FastAPI.

## Prerequisites

- Python 3.10+
- An OpenClaw Gateway with webhooks enabled

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your OpenClaw hook token to `.env`

## Run

```bash
python main.py
```

Server runs on http://localhost:3000

## Test

### Run Tests

```bash
pytest test_webhook.py -v
```

### Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/openclaw \
  -H 'Authorization: Bearer your_hook_token_here' \
  -H 'Content-Type: application/json' \
  -d '{"message": "Hello from test", "name": "Test"}'
```

## Endpoints

- `POST /webhooks/openclaw` - Receives agent hook events
- `POST /webhooks/openclaw/wake` - Receives wake events
- `GET /health` - Health check
