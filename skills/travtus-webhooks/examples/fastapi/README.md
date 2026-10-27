# Travtus Webhooks - FastAPI Example

Minimal example of receiving Travtus webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Travtus delivers through Svix: Standard Webhooks with `svix-*` headers).

## Prerequisites

- Python 3.9+
- A Travtus webhook endpoint set up by Travtus support (email support@travtus.com), and its signing secret (`whsec_...`)

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

3. Add the `whsec_...` signing secret Travtus support sent you to `.env` as `TRAVTUS_WEBHOOK_SECRET`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/travtus
```

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), including deliveries that carry the `webhook-*`
header names instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 travtus --path /webhooks/travtus
```

1. Email support@travtus.com with the tunnel URL (or add it yourself in the Svix portal opened from the short-lived URL).
2. Copy the `whsec_...` secret Travtus gives you into `.env`.
3. Use the portal's **Testing** tab to send a sample event such as `task.update`.

## Event Handling

The handler reads the event name from the body's top-level `event_type` field (the envelope is `{ event_type, message_id, body }`), routes these
events, and acknowledges anything else with `200`:

- `lease.update`
- `task.create`, `task.update`, `task.delete`
- `sms.respond`, `email.respond`, `web_chat.respond`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
