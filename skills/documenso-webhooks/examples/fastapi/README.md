# Documenso Webhooks - FastAPI Example

Minimal example of receiving Documenso webhooks and authenticating them with the
`X-Documenso-Secret` header.

Documenso does not sign the payload. It sends the secret you configured as plain text in
`X-Documenso-Secret` (an empty string when the webhook has no secret). The endpoint requires a
non-empty `DOCUMENSO_WEBHOOK_SECRET` and compares the header against it in constant time.

## Prerequisites

- Python 3.9+
- A Documenso team account (webhooks are team-only) with a webhook that has a secret
  (see [../../references/setup.md](../../references/setup.md))

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

3. Set `DOCUMENSO_WEBHOOK_SECRET` to the same value you entered in the webhook's **Secret**
   field (`openssl rand -hex 32` makes a good one).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/documenso`.

## Test

```bash
pytest test_webhook.py -v
```

The tests cover a correct, wrong, short, missing and empty secret, any content type, and
every documented event. No Documenso account is needed.

## Receive Documenso Webhooks Locally

Documenso rejects webhook URLs that resolve to private or loopback addresses, so tunnel to your
machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 documenso --path /webhooks/documenso
```

Put the printed URL in the webhook's **Webhook URL** field, then use **Test** on the webhook
details page.

## How It Works

- `main.py`: `verify_documenso_secret()`, the `require_documenso_secret` dependency and the route

1. The dependency checks the secret before the body is parsed; failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on `event` (`DOCUMENT_CREATED`, `DOCUMENT_SENT`, `DOCUMENT_OPENED`,
   `DOCUMENT_SIGNED`, `DOCUMENT_RECIPIENT_COMPLETED`, `DOCUMENT_COMPLETED`, `DOCUMENT_REJECTED`,
   `DOCUMENT_CANCELLED`, `DOCUMENT_REMINDER_SENT`, `RECIPIENT_EXPIRED`, `TEMPLATE_*`).
4. It returns `200 {"received": true}`. Documenso needs a 2xx within 10 seconds and retries
   failed deliveries.
