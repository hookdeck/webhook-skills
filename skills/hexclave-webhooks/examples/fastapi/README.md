# Hexclave Webhooks - FastAPI Example

Minimal example of receiving Hexclave webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Hexclave delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- Hexclave account with a webhook URL configured and its webhook secret (`whsec_...`)

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

3. Add your Hexclave webhook secret to `.env` as `HEXCLAVE_WEBHOOK_SECRET`
   (the full `whsec_...` value from the endpoint details in the dashboard's Webhooks section).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/hexclave
```

## Test

```bash
pytest test_webhook.py
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), and check that the `webhook-*` header names are
accepted too.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 8000 hexclave --path /webhooks/hexclave
```

1. Set the tunnel URL as the endpoint URL in the Hexclave dashboard's Webhooks section.
2. Copy the webhook secret into `.env`.
3. Create or update a user or team in your project to trigger `user.created`, `team.created` and friends.

## Event Handling

The body is `{ type, data }`. The handler reads the event name from `type`, routes these events, and logs anything else:

- `user.created`
- `user.updated`
- `user.deleted`
- `team.created`
- `team.updated`
- `team.deleted`
- `team_membership.created`
- `team_membership.deleted`
- `team_permission.created`
- `team_permission.deleted`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
