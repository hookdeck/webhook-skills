# Socotra Webhooks - FastAPI Example

Minimal example of receiving [Socotra](https://www.socotra.com) webhooks with
`socotra-signature` verification (HMAC-SHA256 over `{t}.{raw body}`).

## Prerequisites

- Python 3.9+
- A Socotra webhook endpoint with `hmacEnabled` on, a `secret` set, and **no tag**

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

3. Put the endpoint `secret` in `SOCOTRA_WEBHOOK_SECRET`.

> Turn on HMAC (hmacEnabled) for the Socotra endpoint and leave its tag unset. With a tag, Socotra signs a different string and deliveries fail verification.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000. The route `/webhooks/socotra` accepts GET,
POST, PUT, PATCH and DELETE and verifies the signature first for each.

## Test

```bash
pytest test_webhook.py
```

The tests sign requests with the same algorithm Socotra uses. To receive real
deliveries locally:

```bash
npx hookdeck-cli listen 8000 socotra --path /webhooks/socotra
```

Use the printed Hookdeck URL as the webhook `url`. Hookdeck's Socotra source
pre-selects POST without managing the method; allow any other method Socotra uses.
