# Palmetto Finance Webhooks - FastAPI Example

Minimal example of receiving Palmetto Finance webhooks and authenticating them with the server
API key header.

Palmetto Finance does not sign payloads, so there is no HMAC to verify. A static shared
credential authenticates the sender, not the body, and gives no replay protection, so use HTTPS
and rotate the key if it leaks. The handler compares the whole header value with your key using a
constant-time comparison, for every HTTP method (GET, POST, PUT, PATCH, DELETE). The route reads the body with `await request.body()`, so any content type works.

## Prerequisites

- Python 3.9+
- A Palmetto Finance webhook registration (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PALMETTO_FINANCE_WEBHOOK_SECRET` to the server API key Palmetto returned when you
   registered the webhook (it is shown only once). Leave `PALMETTO_FINANCE_WEBHOOK_HEADER` as
   `apiKey` unless your requests show `api_key`.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts requests at `/webhooks/palmetto-finance`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send every documented event with correct, wrong and missing keys, on every method,
including empty bodies. No Palmetto Finance account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/palmetto-finance \
  -H "Content-Type: application/json" \
  -H "apiKey: $PALMETTO_FINANCE_WEBHOOK_SECRET" \
  -d '{"event":"accountCreated","accountId":"acct_1","programType":"solar"}'
```

## Receive Webhooks Locally

Palmetto Finance can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no
account, no install):

```bash
npx hookdeck-cli listen 8000 palmetto-finance --path /webhooks/palmetto-finance
```

Put the printed URL in your webhook registration (`hostUrl` plus the subscription's
`endpointUrl`). If the subscription's `httpMethod` is not POST, allow that method on the
Hookdeck source too.

## How It Works

- `main.py`: `verify_palmetto_finance_request()`, the `require_palmetto_finance_key` dependency and an `api_route` for all five methods

1. The API key header is checked first, before the body is read, for every method. Failure
   returns `401`.
2. An empty body (typical for GET and DELETE) returns `200`.
3. Otherwise the body must be a JSON object (`400` if not).
4. The handler dispatches on the `event` field: `accountCreated`, `accountUpdated`, `sendInvite`,
   `applicationStatus`, `contractApproved`, `contractSending`, `contractSent`, `contractSigned`,
   `contractVoided`, `contractReinstated`, `documentStatus`, `documentUploaded`,
   `milestonePackage`, `milestoneAchieved`, `milestoneStatusChanged`, `quoteCreated`,
   `quoteVoided`, `requirementStatusChanged`, `requirementCompleted`,
   `termsAndConditionsAccepted`, `allConsumerTaskEvents`.
5. It returns `200 {"received": true}`.

Palmetto retries 5xx, 429 and network errors up to 9 times and does not retry other 4xx, so a
`401` is final. 10 failures disable the subscription.

The client headers and client basic authorization options are not covered by Hookdeck's
Palmetto Finance source or by this example.
