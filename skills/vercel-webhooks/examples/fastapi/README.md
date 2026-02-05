# Vercel Webhooks - FastAPI Example

Minimal example of receiving Vercel webhooks with signature verification using FastAPI.

## Prerequisites

- Python 3.9+
- Vercel account with Pro or Enterprise plan
- Webhook secret from Vercel dashboard

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

4. Add your Vercel webhook secret to `.env`:
   ```
   VERCEL_WEBHOOK_SECRET=your_secret_from_vercel_dashboard
   ```

## Run

Start the server:
```bash
python main.py
```

Or with auto-reload for development:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Server runs on http://localhost:8000

The webhook endpoint is available at:
```
POST http://localhost:8000/webhooks/vercel
```

API documentation is available at:
```
http://localhost:8000/docs
```

## Test

Run the test suite:
```bash
pytest test_webhook.py -v
```

## Production Deployment

For production, use a production ASGI server:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --workers 4
```

Or with Gunicorn:
```bash
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker
```

## Local Testing with Hookdeck

For local webhook development, use the Hookdeck CLI:

```bash
# Install Hookdeck CLI
npm install -g hookdeck-cli

# Start local tunnel
hookdeck listen 8000 --path /webhooks/vercel

# Copy the webhook URL and add it to your Vercel dashboard
```

## Project Structure

```
.
├── main.py           # FastAPI application with webhook handler
├── test_webhook.py   # Tests with signature verification
├── requirements.txt
├── .env.example
└── README.md
```

## API Endpoints

- `GET /health` - Health check endpoint
- `POST /webhooks/vercel` - Vercel webhook handler
- `GET /docs` - Swagger UI documentation
- `GET /redoc` - ReDoc documentation

## Triggering Test Events

To trigger a test webhook from Vercel:

1. Make a small change to your project
2. Deploy with: `vercel --force`
3. This will trigger a `deployment.created` event

## Common Issues

### Signature Verification Failing

- Ensure you're using the raw request body (bytes)
- Check that the secret in `.env` matches exactly
- Verify the header name: `x-vercel-signature`

### Module Import Errors

- Make sure you've activated the virtual environment
- Install all dependencies: `pip install -r requirements.txt`

### Port Already in Use

- Check if another process is using port 8000
- Use a different port: `uvicorn main:app --port 8001`