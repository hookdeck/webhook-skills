# GitLab Webhooks - FastAPI Example

Minimal example of receiving GitLab webhooks with token verification in FastAPI.

## Prerequisites

- Python 3.9+
- GitLab project with webhook access
- Secret token for webhook verification

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

4. Generate a secret token:
   ```bash
   openssl rand -hex 32
   ```

5. Add the token to both:
   - Your `.env` file as `GITLAB_WEBHOOK_TOKEN`
   - GitLab webhook settings as the "Secret token"

## Run

### Development
```bash
python main.py
```

### Production
```bash
uvicorn main:app --host 0.0.0.0 --port 3000
```

Server runs on http://localhost:3000

Webhook endpoint: `POST http://localhost:3000/webhooks/gitlab`

## Test

Run the test suite:
```bash
pytest test_webhook.py -v
```

To test with real GitLab webhooks:

1. Use [Hookdeck CLI](https://hookdeck.com/docs/cli) for local testing:
   ```bash
   hookdeck listen 3000 --path /webhooks/gitlab
   ```

2. Or use GitLab's test feature:
   - Go to your GitLab project → Settings → Webhooks
   - Find your webhook and click "Test"
   - Select an event type to send

## Events Handled

This example handles:
- Push events
- Merge request events
- Issue events
- Pipeline events
- Tag push events
- Release events

Add more event handlers as needed in `main.py`.

## Security

- Token verification uses timing-safe comparison
- Returns 401 for invalid tokens
- Logs all received events
- No sensitive data logged
- Uses Pydantic for data validation