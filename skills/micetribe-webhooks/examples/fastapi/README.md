# MICEtribe Webhooks - FastAPI Example

Minimal example of receiving MICEtribe webhooks with signature verification.

## Prerequisites

- Python 3.9+
- A MICEtribe webhook with a signing secret

> MICEtribe signs webhooks only when the webhook has a signing secret. Set one on the webhook and paste it here.

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

3. Add the webhook's signing secret to `.env` as `MICETRIBE_WEBHOOK_SECRET`

## Run

```bash
python main.py
```

Server runs on http://localhost:8000. The webhook route is `POST /webhooks/micetribe`.

## Test

```bash
pytest test_webhook.py
```

The tests generate real signatures (`HMAC-SHA256(secret, X-Timestamp + "." + body)`, hex). To receive real webhooks locally:

```bash
npx hookdeck-cli listen 8000 micetribe --path /webhooks/micetribe
```

Use the printed Hookdeck URL as the MICEtribe webhook URL.

## Notes

- The signature check is a FastAPI dependency that reads `await request.body()`, so the exact bytes are verified; JSON is parsed after the check.
- Old timestamps are not rejected by default (retries and replays keep the original `X-Timestamp`). Set `MICETRIBE_WEBHOOK_TOLERANCE_SECONDS` to opt in.
- Deliveries are deduped on `registration_id` + `meta.trigger` + `X-Request-Id` (in memory here; use a durable store in production).
