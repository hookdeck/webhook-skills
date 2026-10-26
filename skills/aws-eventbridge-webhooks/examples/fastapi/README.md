# Amazon EventBridge Webhooks - FastAPI Example

Minimal example of receiving Amazon EventBridge API destination calls and authenticating them
with the Connection's Basic credentials.

EventBridge does not sign requests, so there is no HMAC to verify. The handler decodes
`Authorization: Basic base64(username:password)` and compares the username and password each in
constant time. The route reads the body with `await request.body()`, so any content type works. The route accepts POST, PUT, PATCH, GET and DELETE and handles an empty
body.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Python 3.9+
- An EventBridge Connection with **Basic** authorization (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AWS_EVENTBRIDGE_WEBHOOK_USERNAME` and `AWS_EVENTBRIDGE_WEBHOOK_PASSWORD` to the username and
   password of the Connection.

## Run

```bash
uvicorn main:app --reload
```

Server runs on http://localhost:8000 and serves `/webhooks/aws-eventbridge`.

## Test

```bash
pytest test_webhook.py
```

The tests cover correct, wrong and missing credentials, every allowed method, empty bodies, and
the documented events. No AWS account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/aws-eventbridge \
  -u "$AWS_EVENTBRIDGE_WEBHOOK_USERNAME:$AWS_EVENTBRIDGE_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"version":"0","id":"1","detail-type":"OrderCreated","source":"com.example.orders","detail":{"orderId":"1234"}}'
```

## Receive Webhooks Locally

EventBridge can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 aws-eventbridge --path /webhooks/aws-eventbridge
```

Use the printed URL as the API destination endpoint.

## How It Works

- `main.py`

1. The `Authorization` header is checked before the body is read. Missing, malformed or wrong credentials return `401`.
2. An empty body (GET, DELETE) is acknowledged with `200`.
3. A JSON envelope is dispatched on `source` + `detail-type`: `aws.ec2` / `EC2 Instance State-change Notification`, `aws.s3` / `Object Created`, `com.example.orders` / `OrderCreated`.
4. Any other body (an input transformer's output) is acknowledged without dispatch.
5. It returns `200 {"received": true}`.
