# Gemini Webhooks - FastAPI Example

FastAPI example for receiving Google Gemini API webhooks with Standard Webhooks
signature verification.

## Prerequisites

- Python 3.9+
- A Gemini API project with a registered webhook (you'll get a `whsec_…` signing secret)

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

4. Add your Gemini webhook signing secret to `.env`:
   - Register a webhook via the Gemini WebhookService API (see the skill's
     `references/setup.md`).
   - The API returns a `whsec_…` value only once — paste it here.

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000

API docs available at http://localhost:8000/docs

## Test with Hookdeck CLI

```bash
npx hookdeck-cli listen 8000 gemini --path /webhooks/gemini
```

Register the Hookdeck-generated public URL with Gemini as your webhook endpoint.

## Test

```bash
pytest test_webhook.py -v
```

## Endpoints

- `POST /webhooks/gemini` — Webhook receiver endpoint
- `GET /health` — Health check
- `GET /docs` — Interactive API docs

## Events Handled

- `batch.succeeded` / `batch.failed` / `batch.cancelled` / `batch.expired`
- `video.generated`
- `interaction.completed` / `interaction.requires_action` / `interaction.failed` / `interaction.cancelled`
