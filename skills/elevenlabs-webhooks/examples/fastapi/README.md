# ElevenLabs Webhooks - FastAPI Example

FastAPI example for receiving ElevenLabs webhooks with signature verification.

## Prerequisites

- Python 3.9+
- ElevenLabs account with webhook signing secret

## Setup

1. Create virtual environment:
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

4. Add your ElevenLabs webhook signing secret to `.env`

## Run

```bash
uvicorn main:app --reload --port 3000
```

Server runs on http://localhost:3000

## Test

```bash
pytest test_webhook.py
```

## Endpoints

- `POST /webhooks/elevenlabs` - Receives and verifies ElevenLabs webhooks
- `GET /health` - Health check endpoint

## Local Testing with Hookdeck

Use Hookdeck CLI to receive webhooks locally:

```bash
hookdeck listen 3000 --path /webhooks/elevenlabs
```

This creates a public URL that forwards to your local server.