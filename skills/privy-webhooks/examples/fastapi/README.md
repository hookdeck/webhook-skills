# Privy Webhooks - FastAPI Example

Minimal example of receiving Privy webhooks with signature verification using the
official [`svix`](https://pypi.org/project/svix/) library (Privy delivers webhooks through Svix).

## Prerequisites

- Python 3.9+
- Privy app with a webhook endpoint and its signing secret (`whsec_...`). Webhooks work in
  development environments; production needs the Enterprise plan.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Privy webhook signing secret to `.env` as `PRIVY_WEBHOOK_SECRET`. You'll find it on
   the endpoint's page under Configuration > Webhooks in the Privy Dashboard.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint:

```
POST http://localhost:8000/webhooks/privy
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
npx hookdeck-cli listen 8000 privy --path /webhooks/privy
```

1. Register the tunnel URL under Configuration > Webhooks in the Privy Dashboard (HTTPS only).
2. Copy the endpoint's signing secret into `.env`.
3. Click "Test webhook" to send `privy.test`, or trigger a real event such as creating a user.

## Event Handling

The handler reads the event name from the body's top-level `type` field, routes these
events, and acknowledges anything else with `200`:

- `privy.test`
- `user.created`, `user.authenticated`, `user.linked_account`, `user.unlinked_account`, `user.wallet_created`, `user.deleted`
- `mfa.enabled`, `mfa.disabled`
- `wallet.funds_deposited`, `wallet.funds_withdrawn`, `wallet.private_key_export`
- `transaction.broadcasted`, `transaction.confirmed`, `transaction.failed`, `transaction.execution_reverted`
- `wallet_action.swap.created`, `wallet_action.swap.succeeded`, `wallet_action.swap.failed`
- `intent.created`, `intent.executed`
- `user_operation.completed`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
