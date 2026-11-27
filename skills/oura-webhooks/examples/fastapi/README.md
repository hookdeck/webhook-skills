# Oura Webhooks - FastAPI Example

Minimal example of receiving Oura webhooks with the subscription handshake and
`x-oura-signature` verification using FastAPI.

## Prerequisites

- Python 3.9+
- An Oura application (Client ID + Client Secret) from the
  [Oura Developer portal](https://cloud.ouraring.com/oauth/applications)

## Setup

1. Create a virtual environment:
   ```bash
   python -m venv venv
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

4. Fill in `.env`:
   - `OURA_CLIENT_SECRET` — HMAC key for the signature
   - `OURA_VERIFICATION_TOKEN` — the token you pass when creating the subscription

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000

- `GET  /webhooks/oura` — subscription handshake (echoes the `challenge`)
- `POST /webhooks/oura` — receives and verifies webhook events

## Test

```bash
pytest test_webhook.py
```

### Receive real webhooks locally

In your Hookdeck project, create an **Oura** source named `oura` and enter your Oura client secret. Use that source's URL as the subscription's `callback_url`: a Hookdeck Oura source answers Oura's GET check itself. Sign the CLI into the same project, then forward the source to your local server.

```bash
npx hookdeck-cli listen 8000 oura --path /webhooks/oura
```

Create the subscription with the source's URL as `callback_url` (see
`../../references/setup.md`).
