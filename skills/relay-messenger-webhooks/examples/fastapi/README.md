# Relay Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Relay](https://docs.relayapp.im/) (a messenger for chatting with AI agents) webhooks with signature verification. Relay signs deliveries with [Standard Webhooks](https://github.com/standard-webhooks/standard-webhooks), so the dependency verifies the `webhook-id`, `webhook-timestamp` and `webhook-signature` headers with the [`standardwebhooks`](https://pypi.org/project/standardwebhooks/) package. If `webhook-id` is absent it falls back to the `svix-*` headers, as Hookdeck does.

## Prerequisites

- Python 3.9+
- A Relay Agent Token and a webhook subscription
- The subscription's signing secret (`whsec_...`)

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

3. Put the subscription's `signing_secret` in `RELAY_MESSENGER_WEBHOOK_SECRET`, including the `whsec_` prefix. Relay returns it once, as `signing_secret` when you create the subscription (see [setup](../../references/setup.md)). 

## Run

```bash
python main.py
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/relay-messenger` ([main.py](main.py)).

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests the way Relay does and cover tampered bodies, stale timestamps, multiple signatures, the `svix-*` header fallback, another subscription's secret, duplicate `event_id`s, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 relay-messenger --path /webhooks/relay-messenger
```

Create a subscription whose `target_url` is the URL the CLI prints, with `subscribed_events` such as `message.received` and `message.sent`, then message your agent in Relay.

## Notes

- The dependency reads `await request.body()`. The signature covers the exact raw body, so calling `request.json()` before verification breaks it.
- If `RELAY_MESSENGER_WEBHOOK_SECRET` is unset the handler returns `500` and rejects the delivery. It never accepts unverified requests.
- The `standardwebhooks` library always enforces a 5-minute timestamp window. Hookdeck retries and replays resend the original timestamp, so late ones fail. Use the manual verifier in [references/verification.md](../../references/verification.md) to drop or widen the window.
- Delivery is at-least-once. The handler dedupes on the body's `event_id`, which is the same on every retry.
- Relay waits **10 seconds** per attempt. Enqueue the event and process it asynchronously in production.
