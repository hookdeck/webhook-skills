# Ordinal Webhooks - FastAPI Example

Receives [Ordinal](https://www.tryordinal.com/) (tryordinal.com) webhooks in FastAPI and
verifies each delivery's Standard Webhooks signature with the `standardwebhooks` library,
as Ordinal's docs recommend. Verification runs in a FastAPI dependency.

## Prerequisites

- Python 3.9+
- An Ordinal webhook and its `whsec_` signing secret (from the Create webhook response or
  the webhook's configure page)

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Copy environment variables and set `ORDINAL_WEBHOOK_SECRET`:
   ```bash
   cp .env.example .env
   ```

3. Create the webhook in **Settings > Integrations > Webhooks** with the URL
   `https://<your-public-url>/webhooks/ordinal`, or with `POST /api/v1/webhooks`. Save
   `signingSecret` from the API response: later reads omit it.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000, endpoint `POST /webhooks/ordinal`.

## Test

```bash
pytest
```

## Notes

- The dependency reads `await request.body()` and verifies before parsing. A Pydantic body
  model in front of it loses the exact bytes the signature covers.
- `webhook-id` is the same on a retry, so the example deduplicates on it.
- Route on `type` from the verified body: `webhook-topic` isn't signed.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 ordinal --path /webhooks/ordinal
```
