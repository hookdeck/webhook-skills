# Hugging Face Webhooks - FastAPI Example

Minimal example of receiving Hugging Face webhooks with `X-Webhook-Secret` verification in FastAPI.

## Prerequisites

- Python 3.9+
- A Hugging Face account with permission to add webhooks
- A secret value to authenticate incoming requests

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

4. Generate a secret:
   ```bash
   openssl rand -hex 32
   ```

5. Use the same value in both:
   - Your `.env` file as `HUGGINGFACE_WEBHOOK_SECRET`
   - The **Secret** field in [Hugging Face Webhook Settings](https://huggingface.co/settings/webhooks)

## Run

### Development
```bash
python main.py
```

### Production
```bash
uvicorn main:app --host 0.0.0.0 --port 3000
```

Server runs on `http://localhost:3000`.

Webhook endpoint: `POST http://localhost:3000/webhooks/huggingface`

The handler also accepts the secret as a `?secret=...` query parameter:

```
POST http://localhost:3000/webhooks/huggingface?secret=...
```

## Test

Run the test suite:
```bash
pytest test_webhook.py -v
```

To deliver real Hugging Face webhooks to your local server:

1. Use [Hookdeck CLI](https://hookdeck.com/docs/cli) (no account needed):
   ```bash
   npx hookdeck-cli listen 3000 huggingface --path /webhooks/huggingface
   ```

2. Paste the printed public URL into the **Target URL** field in Hugging Face webhook settings.

3. Use **Activity → Replay** in the Hugging Face webhook settings to re-deliver past events.

## Events Handled

This example handles all current Hugging Face webhook scopes:

- `repo` (create / update / delete / move)
- `repo.content` (update — new commits / branches / tags)
- `repo.config` (update — settings, privacy)
- `discussion` (create / update / delete — including Pull Requests)
- `discussion.comment` (create / update)

Unknown narrowed scopes are treated as an `update` on the broader scope for forward-compatibility.

## Security

- `X-Webhook-Secret` (or `?secret=` query param) verified with `secrets.compare_digest`
- Returns 401 on missing / invalid secret
- HTTPS recommended in production (the secret travels in cleartext)
