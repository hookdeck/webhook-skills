# Tripletex Webhooks - FastAPI Example

Minimal example of receiving Tripletex event subscription webhooks with FastAPI and authenticating
them with the custom header you configure on the subscription.

Tripletex does not sign payloads, so there is no HMAC to verify. If you set `authHeaderName` and
`authHeaderValue` on the subscription, Tripletex sends that header as-is on every callback. A
FastAPI dependency compares the whole header value with `TRIPLETEX_WEBHOOK_SECRET` in constant time
(`hmac.compare_digest` on bytes) before the body is read.

A static shared credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Tripletex account and API access (see [../../references/setup.md](../../references/setup.md))

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

3. Set `TRIPLETEX_WEBHOOK_HEADER` to the `authHeaderName` you chose (default `Authorization`) and
   `TRIPLETEX_WEBHOOK_SECRET` to the exact `authHeaderValue`, including any `Bearer ` prefix.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/tripletex`.

## Test

```bash
pytest test_webhook.py
```

The tests send every documented event with correct, wrong and missing header values. No Tripletex
account is needed.

## Receive Webhooks Locally

Tripletex can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 tripletex --path /webhooks/tripletex
```

Use the printed URL as the `targetUrl` of the event subscription.

## How It Works

- `main.py`: `verify_tripletex_request()`, the `require_tripletex_header` dependency and the route

1. The configured header is checked before the body is read. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `event` (`object.verb`): `invoice.charged`, `notification.sent`,
   `voucherstatus.ready`, `closegroup.create`, `closegroup.delete`, and
   `create`/`update`/`delete` for supplier, employee, order, product, account, project, customer,
   contact, archiverelation and voucher.
4. It returns `200 {"received": true}`.
