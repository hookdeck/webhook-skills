# Lob Webhooks - FastAPI Example

Minimal example of receiving Lob webhooks with signature verification using FastAPI. Lob has no
webhook SDK, so the `Lob-Signature` header is verified **manually**.

## Prerequisites

- Python 3.10+
- A Lob account with a webhook (the secret is on its details page in the Lob dashboard)

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

3. Add your Lob webhook secret to `.env`:
   ```bash
   LOB_WEBHOOK_SECRET=your_lob_webhook_secret
   ```

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 with the webhook endpoint at `POST /webhooks/lob`.

## Test

Run the automated tests (they generate real HMAC-SHA256 signatures over `{Lob-Signature-Timestamp}.{raw body}`):

```bash
pytest test_webhook.py
```

### Receive real webhooks locally

Use the Hookdeck CLI to tunnel Lob webhooks to your local server (no account required):

```bash
npx hookdeck-cli listen 8000 lob --path /webhooks/lob
```

Use the URL the CLI prints as the webhook URL in the Lob dashboard.

> Events sent from Lob's webhook debugger are signed with a fixed test secret, so they fail verification. Real deliveries are signed with the webhook's secret.

To check your setup against debugger events, temporarily set `LOB_WEBHOOK_SECRET=secret` (the literal string Lob uses for the debugger).

## How It Works

- A FastAPI dependency (`verified_lob_event`) reads `await request.body()` (the **raw body**), verifies the signature, then parses the JSON.
- The signature is the bare lowercase hex HMAC-SHA256 of the bytes `Lob-Signature-Timestamp` + `.` + raw body, keyed with the webhook secret. The signature format is validated (exactly 64 hex characters) before the constant-time compare.
- Missing/empty headers, a malformed value, or a mismatch return `401`. A validly signed body that is not JSON returns `400`.
- The event type is `event_type.id` in the body (for example `postcard.delivered`, `letter.mailed`, `check.in_transit`, `self_mailer.rendered_thumbnails`).
- Old timestamps are **not** rejected by default, because Hookdeck retries and replays re-send the original timestamp. Set `LOB_WEBHOOK_TOLERANCE_SECONDS` (for example `300`) to opt in.
