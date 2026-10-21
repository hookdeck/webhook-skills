# WeTravel Webhooks - FastAPI Example

FastAPI example of receiving WeTravel webhooks with signature verification using
the official [`svix`](https://pypi.org/project/svix/) Python library (WeTravel
delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- WeTravel main account with an API key and webhooks enabled
- The endpoint's Signing Secret (`whsec_...`) from Manage Webhooks

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

4. Add your WeTravel signing secret to `.env` (`WETRAVEL_WEBHOOK_SECRET`)

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Webhook Endpoint

```
POST http://localhost:8000/webhooks/wetravel
```

## Local Testing with Hookdeck

Receive real WeTravel webhooks locally (no account required):

```bash
npx hookdeck-cli listen 8000 wetravel --path /webhooks/wetravel
```

Add the printed URL in WeTravel under **Profile → Edit Profile → Webhooks →
Manage Webhooks → + Add Endpoint**.

## Test

```bash
pytest test_webhook.py -v
```
