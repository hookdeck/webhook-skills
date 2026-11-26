# Samsara Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Samsara](https://developers.samsara.com/docs/webhooks) webhooks and verifying the `X-Samsara-Signature: v1=<hex>` header (HMAC-SHA256 of `v1:<X-Samsara-Timestamp>:<raw body>`, keyed with the base64-decoded secret key).

## Prerequisites

- Python 3.9+
- A Samsara organization where you can add webhooks (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `SAMSARA_WEBHOOK_SECRET` to the secret key listed with the webhook under Settings > Webhooks, exactly as shown (base64).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/samsara` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests the way Samsara does. They check a vector built from Samsara's sample secret, a 1.0 `Ping` and `Alert` and a 2.0 `DvirSubmitted` payload, a signature keyed with the secret as UTF-8 text instead of its decoded bytes, another secret, a tampered body, a missing header, a missing `v1=` prefix or another version, a changed or missing timestamp, a secret with a trailing newline, invalid JSON, and the `500` paths for a missing or malformed secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 samsara --path /webhooks/samsara
```

Use the printed HTTPS URL as the webhook URL in Samsara, then click **Test** on the webhook to send a `Ping`.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- The secret key is base64. The handler decodes it before using it as the HMAC key; the key string itself never matches.
- Samsara documents no timestamp tolerance, so the handler doesn't apply one. The timestamp is still covered by the signature.
- Samsara retries non-2xx responses (5 attempts in total, with exponential backoff) and doesn't follow redirects. Return `2xx` quickly and skip duplicates by `eventId`.
- Samsara sends two payload shapes: Webhooks 1.0 (alerts and `Ping`: `eventMs`, `event`) and Webhooks 2.0 Event Subscriptions (`eventTime`, `orgId`, `webhookId`, `data`). The handler reads either.
