# Better Stack Webhooks - FastAPI Example

Minimal example of receiving Better Stack (Uptime / incident management) outgoing webhooks and
authenticating them with Basic auth or a custom header.

Better Stack does not sign webhooks, so there is no HMAC to verify. A webhook can send either
`Authorization: Basic base64(username:password)` (`auth_username` / `auth_password`) or a static
header you add to `headers_template` (default name `X-Better-Stack-Secret`). The handler accepts a
request that passes **either configured** method and compares in constant time. A method left
unset is never used, so **with neither configured every request is rejected** (fail closed).

Better Stack's docs don't say whether Basic credentials are sent on the first request or only after
a `401` challenge, and this handler never challenges. If Basic auth deliveries are rejected, use
the custom header.

A static credential authenticates the sender, not the body, and gives no replay protection. Use
HTTPS, a long random value, and rotate it if it leaks.

The route accepts `GET`, `HEAD`, `POST`, `PUT`, `PATCH` and `OPTIONS` (the webhook's `http_method`
can be any of them), checks the credential first for every method, reads the raw body, and
acknowledges an authenticated request with no body or a non-JSON body (a custom `body_template`).

## Prerequisites

- Python 3.9+
- A Better Stack account with an outgoing webhook (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set the variables for the method(s) your webhook uses. A method left unset is rejected.
   - Custom header: `BETTER_STACK_WEBHOOK_HEADER` (the header name, default `X-Better-Stack-Secret`)
     and `BETTER_STACK_WEBHOOK_SECRET` (its exact value).
   - Basic auth: `BETTER_STACK_WEBHOOK_USERNAME` and `BETTER_STACK_WEBHOOK_PASSWORD`.

## Run

```bash
python main.py
```

Server runs on http://localhost:8000 and accepts requests at `/webhooks/better-stack`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send the incident comment example from Better Stack's API reference and the default incident, monitor and on-call bodies with correct, wrong, missing and mis-schemed credentials over every method.

To try it by hand:

```bash
curl -X POST http://localhost:8000/webhooks/better-stack \
  -H "Content-Type: application/json" \
  -H "X-Better-Stack-Secret: $BETTER_STACK_WEBHOOK_SECRET" \
  -d '{"data":{"id":"1","type":"incident","attributes":{"name":"Tesla.com homepage","cause":"Error 500","started_at":"2026-10-26T10:51:28.151Z","acknowledged_at":"","resolved_at":""}}}'
```

## Receive Webhooks Locally

Better Stack can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 8000 better-stack --path /webhooks/better-stack
```

Put the printed URL in the webhook's URL.

## How It Works

- `main.py`: `verify_better_stack_request()`, `classify_better_stack_payload()`, a `require_better_stack_auth` dependency and one `api_route` for all six methods, reading the body with `await request.body()`

1. The credential is checked first, for every method. Missing header, wrong scheme, malformed
   value, mismatch or nothing configured returns `401`.
2. An authenticated request with no body is acknowledged with `200`. The body is read raw and parsed
   as JSON only after the check; a non-JSON body is logged and acknowledged.
3. The handler dispatches on the **shape** of the body, because only `event: "comment"` is a
   documented wire value: `data.type` `incident` (comment, or started / acknowledged / resolved
   inferred from `acknowledged_at` and `resolved_at`), `data.type` `monitor` (`paused_at` set means
   paused) and `data.change` `on_call` / `holiday`. Anything else is logged.
4. Every field of the body is untrusted: wrong-typed values are ignored, never a 500.
5. It returns `200 {"received": true}`.
