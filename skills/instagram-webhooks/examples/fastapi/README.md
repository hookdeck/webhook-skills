# Instagram Webhooks - FastAPI Example

Minimal example of receiving Instagram (Meta) webhooks with the GET verification
handshake and `X-Hub-Signature-256` signature verification.

## Prerequisites

- Python 3.9+
- A [Meta for Developers](https://developers.facebook.com/) Business app with the Instagram product, published (Live)

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add `INSTAGRAM_APP_SECRET` and `INSTAGRAM_VERIFY_TOKEN` to `.env`. Meta's docs say
   webhooks are signed with the App Secret (App settings > Basic). If your app uses
   Instagram API with Instagram Login and verification fails, try the Instagram app
   secret instead; the docs don't say which one Instagram Login webhooks use.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 8000 instagram --path /webhooks/instagram
```

Use the tunnel URL as the **Callback URL** in the App Dashboard. Meta sends a `GET`
handshake to verify the URL, then `POST`s events. Use **Test** next to a field in the
Dashboard to send a sample notification.

### Run the tests

```bash
pytest test_webhook.py -v
```

## Endpoints

- `GET /webhooks/instagram` - Verification handshake (echoes `hub.challenge`)
- `POST /webhooks/instagram` - Verifies the signature, then dispatches `changes[]` (`comments`, `live_comments`, `mentions`, `story_insights`) and `messaging[]` / `standby[]` events (`message`, `reaction`, `postback`, `referral`, `read`, `message_edit`)
