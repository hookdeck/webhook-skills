# People Data Labs Webhooks - FastAPI Example

Minimal example of receiving People Data Labs webhooks and authenticating them with the secret
header registered by the PDL team.

PDL does not sign payloads, so there is no HMAC to verify. A FastAPI dependency compares one
header with your shared secret using `hmac.compare_digest` on bytes. The header name comes from
`PEOPLE_DATA_LABS_WEBHOOK_HEADER` (default `Authorization`) and the whole header value from
`PEOPLE_DATA_LABS_WEBHOOK_SECRET`. A static credential authenticates the sender, not the body,
and gives no replay protection, so use HTTPS and rotate it if it leaks. The raw body is read
after the check, so any content type works.

## Prerequisites

- Python 3.9+
- A PDL Enterprise account; the People Data Labs team registers webhooks for Enterprise
  customers. Ask them to include a secret header (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PEOPLE_DATA_LABS_WEBHOOK_SECRET` to the exact header value you gave PDL (including any
   `Bearer ` prefix), and `PEOPLE_DATA_LABS_WEBHOOK_HEADER` to its name.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/people-data-labs`.

## Test

```bash
pytest test_webhook.py
```

No PDL account is needed. To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/people-data-labs \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-shared-key" \
  -d '["9adnit66-hdZ5lkBbq-AOQ_0000","YraxDoP16jzyjfxtn-1XJQ_0000"]'
```

## Receive Webhooks Locally

PDL can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 8000 people-data-labs --path /webhooks/people-data-labs
```

Give the printed URL to your PDL team as the target URL.

## How It Works

- `main.py`: `verify_pdl_request()`, the `require_pdl_header` dependency and the route

The header is checked first (`401` on failure), the body must be a JSON array of ID strings
(`400` otherwise), and the handler returns `200 {"received": true}`. PDL does not retry on
failure.
