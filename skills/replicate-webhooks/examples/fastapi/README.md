# Replicate Webhooks - FastAPI Example

Minimal example of receiving Replicate webhooks with signature verification in FastAPI.

## Prerequisites

- Python 3.9+
- Replicate account with webhook signing secret

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
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

4. Add your Replicate webhook signing secret to `.env`

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000

- Webhook endpoint: `http://localhost:8000/webhooks/replicate`
- API docs: `http://localhost:8000/docs`

## Test with Hookdeck CLI

1. Install Hookdeck CLI:
   ```bash
   npm install -g hookdeck-cli
   ```

2. Forward webhooks to your local server:
   ```bash
   hookdeck listen 8000 --path /webhooks/replicate
   ```

3. Use the provided Hookdeck URL when creating Replicate predictions:
   ```python
   import replicate

   prediction = replicate.run(
       "model/version",
       input={"prompt": "test"},
       webhook="https://your-url.hookdeck.com",
       webhook_events_filter=["start", "completed"]
   )
   ```

## Test Suite

Run the test suite:
```bash
pytest test_webhook.py -v
```

The tests verify:
- Signature verification with valid and invalid signatures
- Proper handling of all event types
- Error cases (missing headers, expired timestamps)
- FastAPI async handling