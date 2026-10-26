# Kibana Webhooks - FastAPI Example

Minimal example of receiving Kibana Webhook connector requests and authenticating them with
HTTP Basic auth. Kibana does not sign payloads, so there is no signature to verify. The handler
accepts GET, POST, PUT, PATCH and DELETE, checks the credential first for every method, handles
an empty body, and compares the username and password in constant time.

A static shared credential authenticates the sender, not the body, and gives no replay
protection. Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- A Kibana Webhook connector with Basic authentication (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `KIBANA_WEBHOOK_USERNAME` and `KIBANA_WEBHOOK_PASSWORD` to the user name and password on
   the connector.

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000 and accepts requests at `/webhooks/kibana`.

## Test

```bash
pytest test_webhook.py
```

No Kibana instance is needed. To try it by hand (illustrative payload):

```bash
curl -X POST http://localhost:8000/webhooks/kibana \
  -u "$KIBANA_WEBHOOK_USERNAME:$KIBANA_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"rule":"High CPU","status":"query matched","context":"CPU above 90%"}'
```

## Receive Webhooks Locally

Kibana can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 8000 kibana --path /webhooks/kibana
```

Choose Basic authentication on the Kibana Webhook connector. Hookdeck's Kibana source pre-selects
POST without managing the method, so allow any other method the connector uses on the source too.
Hookdeck never sends a 401 challenge, so the credentials must arrive with each request.

## How It Works

- main.py: verify_basic_auth() plus the api_route('/webhooks/kibana') handler

1. The `Authorization: Basic` header is checked first, for every method. Missing, malformed or
   mismatched credentials return `401`.
2. The body may be empty. JSON is parsed when it parses; otherwise the raw text is kept.
3. The handler logs the rule action (illustrative payload: `rule`, `status`, `context`).
4. It returns `200 {"received": true}`.
