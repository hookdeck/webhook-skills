# Employment Hero Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Employment Hero](https://developer.employmenthero.com/api-references/webhook/verify-webhook-request.md) webhooks and verifying the `X-EmploymentHero-Signature` header (base64 HMAC-SHA256 of `<X-EmploymentHero-Timestamp>.<raw body>`, keyed with the base64-decoded secret key).

## Prerequisites

- Python 3.9+
- An Employment Hero organisation on a Platinum subscription or above, with Developer Portal access (see [setup](../../references/setup.md))

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

3. Set `EMPLOYMENT_HERO_WEBHOOK_SECRET` to the secret key on the webhook's page in the Developer Portal (My Webhooks), exactly as shown (base64).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/employment-hero` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests sign requests the way Employment Hero's sample does. They check a fixed vector, a signature keyed with the secret as UTF-8 text instead of its decoded bytes, another secret, a tampered body, a missing header, a changed or missing timestamp, a hex digest in place of base64, a secret with a trailing newline, invalid JSON, and the `500` paths for a missing or malformed secret.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 employment-hero --path /webhooks/employment-hero
```

Use the printed HTTPS URL as the webhook URL in the Developer Portal, then make a change that the webhook subscribes to (for example, update an employee).

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- The secret key is base64. The handler decodes it before using it as the HMAC key, as Employment Hero's Ruby sample does with `Base64.decode64`.
- Employment Hero [lists its events](https://developer.employmenthero.com/api-references/webhook/webhook-events.md) (Employee Created, Leave Request Approved and others) but doesn't publish a payload sample or the HTTP method. The route accepts `POST` and assumes no payload field: log the first real delivery and add your dispatch.
- Employment Hero treats HTTP `200` as success and retries a failed delivery up to 3 times. Return `200` quickly.
- No timestamp tolerance is documented, so the handler doesn't apply one. The timestamp is still covered by the signature.
