# Azure DevOps Webhooks - FastAPI Example

Minimal example of receiving Azure DevOps Web Hooks service hooks and authenticating them with
the subscription's basic authentication credentials.

Azure DevOps does not sign payloads, so there is no HMAC to verify. Every request carries
`Authorization: Basic base64(username:password)`. A FastAPI dependency parses it (scheme
case-insensitive, split on the first colon) and compares the username and the password with
`hmac.compare_digest` on bytes, evaluating both before deciding. The route reads the body with
`await request.body()` (any content type) and parses JSON only after the credentials check.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- An Azure DevOps project with a Web Hooks service hook subscription (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AZURE_DEVOPS_WEBHOOK_USERNAME` and `AZURE_DEVOPS_WEBHOOK_PASSWORD` to the basic
   authentication credentials you enter on the subscription's **Action** screen.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/azure-devops`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every handled event with correct, wrong, malformed and missing credentials. No
Azure DevOps account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/azure-devops \
  -H "Content-Type: application/json" \
  -u "$AZURE_DEVOPS_WEBHOOK_USERNAME:$AZURE_DEVOPS_WEBHOOK_PASSWORD" \
  -d '{"eventType":"git.push","publisherId":"tfs","message":{"text":"pushed"},"resource":{"pushId":1}}'
```

## Receive Webhooks Locally

Azure DevOps can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 azure-devops --path /webhooks/azure-devops
```

Put the printed URL in the Web Hooks subscription (Azure DevOps requires HTTPS for basic auth).

## How It Works

- `main.py`: `verify_azure_devops_request()`, the `require_basic_auth` dependency and the `POST /webhooks/azure-devops` route

Missing, malformed or mismatched credentials return `401`; a body that isn't a single JSON object
returns `400`; handled events return `200 {"received": true}`.
