# Expo (EAS) Webhooks - FastAPI Example

Minimal example of receiving Expo EAS Build and EAS Submit webhooks with `expo-signature` verification.

## Prerequisites

- Python 3.9+
- An Expo account with EAS CLI installed
- A webhook secret of at least 16 characters, passed to `eas webhook:create --secret`

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook secret to `.env` as `EXPO_WEBHOOK_SECRET`

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 8000 expo --path /webhooks/expo
```

Register the printed URL, then run a build or submission:

```bash
eas webhook:create --event BUILD --url <hookdeck-url> --secret "$EXPO_WEBHOOK_SECRET"
eas build --platform android
```

### Send a signed request by hand

```bash
BODY='{"id":"147a3212","platform":"android","status":"finished","buildDetailsPageUrl":"https://expo.dev/builds/147a3212","artifacts":{"buildUrl":"https://expo.dev/artifacts/eas/x.aab"}}'
SIG="sha1=$(printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$EXPO_WEBHOOK_SECRET" | sed 's/^.* //')"
curl -X POST http://localhost:8000/webhooks/expo \
  -H 'Content-Type: application/json' -H "expo-signature: $SIG" -d "$BODY"
```

### Run tests

```bash
pytest test_webhook.py -v
```

## Endpoint

- `POST /webhooks/expo` - Receives and verifies EAS Build and Submit payloads (`finished`, `errored`, `canceled`). The raw body is verified whatever the content type.
