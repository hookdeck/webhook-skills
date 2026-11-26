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

4. Set your callback credentials in `.env`:
   - `DEEPGRAM_CALLBACK_USERNAME` / `DEEPGRAM_CALLBACK_PASSWORD`: the Basic Auth credentials you embed in the callback URL (`https://username:password@your-domain.com/webhooks/deepgram`)
   - Optional `DEEPGRAM_CALLBACK_SECRET`: a random hex secret (`openssl rand -hex 32`) you send as `extra=callback_secret:VALUE` on speech-to-text requests. When set, the handler also requires `metadata.extra.callback_secret` to match

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
   npx hookdeck-cli listen 8000 deepgram --path /webhooks/deepgram
   ```

3. Use the provided URL when making Deepgram requests:
   ```bash
   curl -X POST \
     --header "Authorization: Token YOUR_DEEPGRAM_API_KEY" \
     --header "Content-Type: audio/wav" \
     --data-binary @audio.wav \
     "https://api.deepgram.com/v1/listen?callback=YOUR_HOOKDECK_URL"
   ```
   Insert your callback credentials into the URL (`https://username:password@...`), percent-encoding any special characters, so the handler's Basic Auth check passes.

## Run Tests

```bash
pytest test_webhook.py -v
```

## Implementation Notes

- Uses FastAPI dependency injection for webhook verification
- Verifies webhooks with the Basic Auth credentials embedded in the callback URL
- Optionally checks the `extra` callback secret in `metadata.extra.callback_secret` (Deepgram no longer supports `dg-token` for verification)
- Reads `request_id` from `metadata.request_id` (the callback body is `{ metadata, results }`)
- Returns appropriate HTTP status codes
- Handles JSON payloads with transcription results
- Includes comprehensive test coverage with pytest