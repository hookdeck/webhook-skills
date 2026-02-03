# OpenAI Webhooks - FastAPI Example

FastAPI example for receiving OpenAI webhooks with signature verification.

## Prerequisites

- Python 3.9+
- OpenAI account with webhook signing secret

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

4. Add your OpenAI webhook signing secret to `.env`:
   - Get your secret from [OpenAI Platform](https://platform.openai.com) → Settings → Webhooks
   - It should start with `whsec_`

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000

API documentation available at http://localhost:8000/docs

## Test with Hookdeck CLI

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Create tunnel to your local server
hookdeck listen 8000 --path /webhooks/openai

# Use the provided URL in OpenAI webhook settings
```

## Test

Run the test suite:

```bash
pytest test_webhook.py -v
```

## Endpoints

- `POST /webhooks/openai` - Webhook receiver endpoint
- `GET /health` - Health check endpoint
- `GET /docs` - Interactive API documentation

## Example Events

The webhook handler processes these OpenAI events:
- `fine_tuning.job.completed` - Fine-tuning job finished
- `fine_tuning.job.failed` - Fine-tuning job failed
- `batch.completed` - Batch processing completed
- `batch.failed` - Batch processing failed
- `realtime.session.created` - Realtime session created