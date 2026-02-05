# Deepgram Webhooks - FastAPI Example

Minimal example of receiving Deepgram webhooks with authentication verification using FastAPI.

## Prerequisites

- Python 3.9+
- Deepgram account with API access

## Setup

1. Create and activate a virtual environment:
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

4. Add your Deepgram API Key ID to `.env`:
   - Log into [Deepgram Console](https://console.deepgram.com/)
   - Navigate to API Keys
   - Copy the API Key ID (not the key itself)

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000

API documentation available at http://localhost:8000/docs

## Test Webhook Locally

1. Start the server:
   ```bash
   uvicorn main:app --reload
   ```

2. In another terminal, use Hookdeck CLI to create a tunnel:
   ```bash
   hookdeck listen 8000 --path /webhooks/deepgram
   ```

3. Use the provided URL when making Deepgram requests:
   ```bash
   curl -X POST \
     --header "Authorization: Token YOUR_DEEPGRAM_API_KEY" \
     --header "Content-Type: audio/wav" \
     --data-binary @audio.wav \
     "https://api.deepgram.com/v1/listen?callback=YOUR_HOOKDECK_URL"
   ```

## Run Tests

```bash
pytest test_webhook.py -v
```

## Implementation Notes

- Uses FastAPI dependency injection for webhook verification
- Verifies webhooks using the `dg-token` header
- Returns appropriate HTTP status codes
- Handles JSON payloads with transcription results
- Includes comprehensive test coverage with pytest