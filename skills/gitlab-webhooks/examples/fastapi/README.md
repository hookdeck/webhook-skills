# GitLab Webhooks - FastAPI Example

Minimal example of receiving GitLab webhooks with signature verification in FastAPI.

## Prerequisites

- Python 3.9+
- GitLab project with webhook access
- A GitLab signing token (GitLab 19.0+), or a legacy secret token

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

4. In GitLab (Settings > Webhooks), select **Generate signing token** and copy it
   (it is shown once and starts with `whsec_`). Add it to your `.env` file as
   `GITLAB_WEBHOOK_SIGNING_TOKEN`. GitLab then signs each request with a Standard
   Webhooks HMAC-SHA256 signature in the `webhook-signature` header.

5. Optional, legacy: if the webhook also uses a **Secret token** (sent as plain
   text in `X-Gitlab-Token`), add the same value as `GITLAB_WEBHOOK_TOKEN`. The
   example checks the signature when `webhook-signature` is present and falls back
   to the secret token otherwise, as GitLab recommends while migrating.

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
   npx hookdeck-cli listen 3000 gitlab --path /webhooks/gitlab
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

- Verifies the `webhook-signature` HMAC-SHA256 over the raw body, with a
  timing-safe comparison and a 5-minute `webhook-timestamp` window
- Legacy `X-Gitlab-Token` comparison is also timing-safe
- Returns 401 for invalid signatures or tokens
- Logs all received events
- No sensitive data logged
- Uses Pydantic for data validation