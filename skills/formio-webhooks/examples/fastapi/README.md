# Form.io Webhooks - FastAPI Example

Minimal example of receiving Form.io Webhook actions and authenticating them with HTTP Basic
credentials.

Form.io does not sign payloads, so there is no HMAC to verify. The handler parses
`Authorization: Basic base64(username:password)` and compares the username and password each in
constant time. A static credential authenticates the sender, not the body, and gives no replay
protection: use HTTPS and rotate the credential if it leaks. The route reads the raw body, so any content type works.

The route accepts POST, PUT, PATCH, GET and DELETE and handles an empty body: with the default
**Match** request method Form.io sends POST for creates, PUT for updates and DELETE for deletes.

## Prerequisites

- Python 3.9+
- A Form.io form with a Webhook action (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `FORMIO_WEBHOOK_USERNAME` and `FORMIO_WEBHOOK_PASSWORD` to the **Authorize User** and
   **Authorize Password** values on the Webhook action.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `/webhooks/formio`.

## Test

```bash
pytest test_webhook.py -v
```

The tests cover correct, wrong and missing credentials, every allowed method, empty bodies and
non-JSON content types. No Form.io account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/formio \
  -u "$FORMIO_WEBHOOK_USERNAME:$FORMIO_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"submission":{"_id":"62e052a316f1ad4f786d4038","data":{"textField":"Test value"}}}'

curl -X DELETE "http://localhost:8000/webhooks/formio?submissionId=62e052a316f1ad4f786d4038" \
  -u "$FORMIO_WEBHOOK_USERNAME:$FORMIO_WEBHOOK_PASSWORD"
```

## Receive Webhooks Locally

Form.io must be able to reach your machine. Tunnel with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 8000 formio --path /webhooks/formio
```

Put the printed URL in the Webhook action's **Request URL**. Hookdeck's Form.io source pre-selects
POST only: allow PUT and DELETE on the source too.

## How It Works

- `main.py`: `verify_formio_request()` plus the `/webhooks/formio` route

1. The method must be POST, PUT, PATCH, GET or DELETE (`405` otherwise).
2. The `Authorization` header is checked before the body is parsed. Failure returns `401`.
3. An empty body is treated as `{}`; otherwise it must be a JSON object (`400` otherwise).
4. The HTTP method picks the operation: POST = create, PUT/PATCH = update, DELETE = delete,
   GET = read. The payload is `{ request, response, submission, params }`.
5. It returns `200 {"received": true, "operation": ...}`.
