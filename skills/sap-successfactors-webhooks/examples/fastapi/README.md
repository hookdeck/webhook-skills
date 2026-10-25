# SAP SuccessFactors Webhooks - FastAPI Example

Minimal example of receiving SAP SuccessFactors Integration Center REST outbound calls with
FastAPI and authenticating them with HTTP Basic auth.

SAP SuccessFactors does not sign requests, so there is no HMAC. A dependency parses
`Authorization: Basic base64(username:password)` (strict base64, split on the first colon) and
compares the username and password with `hmac.compare_digest` on bytes. The route uses
`api_route` for `GET` and `POST` because the sender chooses the method, and reads the raw body so
any content type works.

## Prerequisites

- Python 3.9+
- An Integration Center REST outbound integration (see [../../references/setup.md](../../references/setup.md))

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

3. Set `SAP_SUCCESSFACTORS_WEBHOOK_USERNAME` and `SAP_SUCCESSFACTORS_WEBHOOK_PASSWORD` to the
   User Name and Password on the REST connection.

## Run

```bash
uvicorn main:app --reload --port 8000
```

Server runs on http://localhost:8000 and accepts `GET` and `POST` at `/webhooks/sap-successfactors`.

## Test

```bash
pytest test_webhook.py -v
```

The tests cover correct, wrong, missing and malformed credentials, GET and POST, and JSON, XML and
empty bodies. No SAP account is needed.

To try it by hand (the payload is illustrative; your integration maps its own fields):

```bash
curl -X POST http://localhost:8000/webhooks/sap-successfactors \
  -u "$SAP_SUCCESSFACTORS_WEBHOOK_USERNAME:$SAP_SUCCESSFACTORS_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"userId":"example-1001","firstName":"Ada","department":"Engineering"}'
```

## Receive Webhooks Locally

SAP SuccessFactors can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no
account, no install):

```bash
npx hookdeck-cli listen 8000 sap-successfactors --path /webhooks/sap-successfactors
```

Use the printed URL as the REST API URL in Integration Center. Credentials must arrive with every
request: Hookdeck never answers with a 401 challenge.

## How It Works

- `main.py`: `parse_basic_auth()`, `verify_sap_successfactors_request()`, the `require_basic_auth`
  dependency and the route

1. The dependency checks `Authorization` before the body is read. Failure returns `401`.
2. JSON is parsed only when the content type says so; XML and other types are kept as text; an
   empty body is fine.
3. The handler logs the delivery; replace the TODO with your own processing.
4. It returns `{"received": true, "format": ...}`.

A static shared credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the credential if it leaks.
