# Azure Logic Apps Webhooks - FastAPI Example

Minimal receiver for calls from an **Azure Logic Apps** (or Power Automate) **HTTP
action**. Logic Apps doesn't sign requests, so this example authenticates them with
**Basic authentication** or a **shared secret in a header** (which also covers
**Raw authentication**), compared in constant time.

## Prerequisites

- Python 3.10+
- A Logic Apps workflow (Consumption or Standard) with an **HTTP** action pointed at
  this endpoint

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Configure at least one method in `.env` to match the HTTP action:

   | HTTP action setting | `.env` |
   |---------------------|--------|
   | **Authentication** = Basic, **Username** / **Password** | `AZURE_LOGIC_APPS_USERNAME`, `AZURE_LOGIC_APPS_PASSWORD` |
   | **Headers** → `x-logic-apps-secret: <secret>` | `AZURE_LOGIC_APPS_SHARED_SECRET=<secret>` |
   | **Authentication** = Raw, **Value** = `Bearer <token>` | `AZURE_LOGIC_APPS_SECRET_HEADER=Authorization`, `AZURE_LOGIC_APPS_SHARED_SECRET=Bearer <token>` |

   Every method you configure must pass. With nothing configured, the endpoint
   returns `500` (fails closed).

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000. Endpoint: `POST /webhooks/azure-logic-apps`.

## Test

```bash
pytest test_webhook.py -v
```

Send a request by hand (Basic auth, username `logicapps`, password `secret`):

```bash
curl -i -X POST http://localhost:8000/webhooks/azure-logic-apps \
  -u logicapps:secret \
  -H 'Content-Type: application/json' \
  -d '{"orderId":"ORD-1001","status":"approved"}'
```

### Receive real calls locally

```bash
npx hookdeck-cli listen 8000 azure-logic-apps --path /webhooks/azure-logic-apps
```

Put the URL the CLI prints in the HTTP action's **URI**, set **Method** to `POST`,
add a **Body**, configure the authentication above, save, and run the workflow.

## What the handler does

1. Checks the credentials before reading the body: Basic (decode, split on the first
   `:`, constant-time compare of username and password) and/or the shared-secret
   header (constant-time compare).
2. Reads the raw body. If `Content-Type` contains `json` it parses it (`400` if
   invalid); otherwise it keeps the text. The payload is whatever the action's
   **Body** contains, so there are no event types.
3. Returns `200` with `{"received": true}`. Don't return `202`: a stateful
   workflow's HTTP action treats `202` as the start of the async polling pattern.

Status codes: `200` accepted, `401` bad or missing credentials (Basic adds
`WWW-Authenticate`), `400` invalid JSON, `500` no credentials configured.
Logic Apps retries `408`, `429` and `5xx` (default: up to 4 exponential
retries), not `401`.
