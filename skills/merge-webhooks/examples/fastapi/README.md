# Merge Webhooks - FastAPI Example

Minimal FastAPI example of receiving [Merge](https://www.merge.dev) webhooks and verifying the `X-Merge-Webhook-Signature` HMAC.

## Prerequisites

- Python 3.9+
- A Merge account with access to the Webhooks configuration page (see [setup](../../references/setup.md))

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

3. Set `MERGE_WEBHOOK_SIGNATURE_KEY` in `.env` to the signature key from the Security section of the Webhooks page.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `POST /webhooks/merge` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover a vector computed with Merge's samples, the unpadded form, standard base64 (rejected), a valid padded signature, an event without a linked account, another key, a tampered body, a missing header, a trailing newline in the key, invalid JSON, and a missing key.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 merge --path /webhooks/merge
```

Add the printed URL with **+Webhook** on the Merge Webhooks page, then click **Send test POST request**.

## Notes

- The handler reads `await request.body()` before parsing. The HMAC covers the exact raw body, so don't parse and re-serialise it first.
- `base64.urlsafe_b64encode` keeps the padding. The example strips it on both sides, so the padded and unpadded forms both verify.
