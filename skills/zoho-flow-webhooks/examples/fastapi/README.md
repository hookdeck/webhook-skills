# Zoho Flow Webhooks - FastAPI Example

Minimal FastAPI example of receiving requests from Zoho Flow's [Send Webhook action](https://help.zoho.com/portal/en/kb/flow/user-guide/create-a-flow/webhook/articles/outgoing-webhooks) and authenticating them with a secret header.

Zoho Flow doesn't sign these requests. The action sends a secret header (an API Key auth profile with header placement, or a header on the action), and the handler compares that header's whole value with `ZOHO_FLOW_WEBHOOK_SECRET` using `hmac.compare_digest`. The action's method is yours to choose, so the route accepts GET, POST, PUT, PATCH and DELETE.

## Prerequisites

- Python 3.9+
- A Zoho Flow account (see [setup](../../references/setup.md))

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

3. Set `ZOHO_FLOW_WEBHOOK_HEADER` to the header name (the auth profile's Parameter Name, default `X-Webhook-Secret`) and `ZOHO_FLOW_WEBHOOK_SECRET` to the exact key.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Webhook endpoint: `/webhooks/zoho-flow` in [main.py](main.py).

## Test

```bash
pytest test_webhook.py -v
```

The tests cover the right, wrong, missing and prefixed header values, a key sent in the query string instead of a header, non-ASCII secrets, a custom header name, case-insensitive lookup, every method, JSON and form-encoded bodies, a GET whose query string is the payload, malformed JSON, and the fail-closed path when no secret is configured.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 8000 zoho-flow --path /webhooks/zoho-flow
```

Use the printed HTTPS URL as the Send Webhook action's HTTP URL, click **Save**, then **Test**.

## Notes

- The handler reads `await request.body()` so any Content-Type works. The header is checked before the body is read.
- Payloads are illustrative: Flow sends whatever you configure, with no event name of its own. The handler expects an `event` field.
- If `ZOHO_FLOW_WEBHOOK_SECRET` is unset the handler returns `500`. It never accepts unauthenticated requests.
- The response is JSON. With the action's Response Type set to JSON or Auto, its keys become variables for later steps.
