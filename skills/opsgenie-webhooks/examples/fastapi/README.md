# Opsgenie Webhooks - FastAPI Example

Minimal example of receiving Opsgenie Webhook integration calls and authenticating them with a
secret custom header.

Opsgenie does not sign webhooks, so there is no HMAC to verify. You add a custom header to the
Webhook integration (name and value are yours to choose) and this handler compares the header's
whole value with `OPSGENIE_WEBHOOK_SECRET` in constant time. The route reads the body with
`await request.body()`, so any content type works.

A static shared credential authenticates the sender, not the body, and gives no replay
protection: use HTTPS and rotate the credential if it leaks.

> Opsgenie is end-of-sale and support ends in April 2027. Atlassian is moving customers to
> Jira Service Management and Compass.

## Prerequisites

- Python 3.9+
- An Opsgenie Webhook integration with a custom header (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `OPSGENIE_WEBHOOK_HEADER` to the custom header name you added (default `Authorization`)
   and `OPSGENIE_WEBHOOK_SECRET` to its exact value, including any `Bearer ` prefix you typed.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `POST /webhooks/opsgenie`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every alert action with correct, wrong and missing credentials. No Opsgenie
account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/opsgenie \
  -H "Content-Type: application/json" \
  -H "$OPSGENIE_WEBHOOK_HEADER: $OPSGENIE_WEBHOOK_SECRET" \
  -d '{"action":"Create","alert":{"alertId":"052652ac","message":"test alert"},"source":{"name":"web","type":"API"}}'
```

## Receive Webhooks Locally

Opsgenie can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 8000 opsgenie --path /webhooks/opsgenie
```

Put the printed URL in the Opsgenie Webhook integration.

## How It Works

- `main.py`: `verify_opsgenie_request()` plus the `POST /webhooks/opsgenie` route

1. The configured header is looked up case-insensitively and its whole value is compared with the
   secret before the body is parsed. Missing or mismatched returns `401`. A `Bearer ` prefix is
   not stripped.
2. The body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `action` field: `Create`, `Acknowledge`, `UnAcknowledge`,
   `AddNote`, `AddTags`, `RemoveTags`, `Close`, `AssignOwnership`, `TakeOwnership`, `Delete`,
   `Escalate`, `UpdatePriority`, `UpdateDescription`, `UpdateMessage`, `AddTeam`, `AddRecipient`.
   Custom alert actions send their own name.
4. It returns `200 {"received": true}`.
