# Zuora Webhooks - Next.js Example

Minimal example of receiving Zuora callout notifications and authenticating them with HTTP Basic auth.

Zuora does not sign callouts, so there is no HMAC to verify. The handler parses
`Authorization: Basic base64(username:password)`, then compares the username and the password
each in constant time (both are evaluated before deciding). The route reads the body with `request.text()`, so any content type works, and parses JSON only after the credential check.

**Enable Preemptive Authentication on the callout template.** By default Zuora sends the first
request without an `Authorization` header and waits for a `401` challenge, which does not work
through Hookdeck. A static shared credential authenticates the sender, not the body, and gives no
replay protection: use HTTPS and rotate the credential if it leaks.

The route accepts `POST`, `PUT`, `PATCH`, `GET` and `DELETE` (the callout method is set on the
template) and handles an empty body. Zuora adds no event field, so the handler assumes an
illustrative JSON body like `{"event": "PaymentProcessed", "accountId": "..."}` that you write into
the template's request body.

## Prerequisites

- Node.js 20+
- A Zuora callout template using Username/Password authentication (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `ZUORA_WEBHOOK_USERNAME` and `ZUORA_WEBHOOK_PASSWORD` to the credentials on the callout template.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `/webhooks/zuora`.

## Test

```bash
npm test
```

The tests cover correct, wrong, missing and malformed credentials, all five methods, empty bodies,
any content type and the `PaymentProcessed` and `InvoicePosted` events. No Zuora account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/zuora \
  -u "$ZUORA_WEBHOOK_USERNAME:$ZUORA_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"event":"PaymentProcessed","accountId":"2c92c0f8"}'
```

## Receive Webhooks Locally

Zuora can't reach `localhost` and requires an `https://` URL. Tunnel to your machine with the
Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 zuora --path /webhooks/zuora
```

Put the printed URL in the callout template's Request URL.

## How It Works

- `lib/verify-zuora.ts`: `parseBasicAuth()` and `verifyZuoraRequest()`
- `app/webhooks/zuora/route.ts`: one handler exported as `POST`, `PUT`, `PATCH`, `GET` and `DELETE`

1. The `Authorization` header is checked before the body is read. Failure returns `401` (with a `WWW-Authenticate: Basic` header).
2. An empty body (e.g. `GET`) uses the query parameters as the payload; otherwise the body must be a JSON object (`400` otherwise).
3. The handler dispatches on `event`: `PaymentProcessed`, `InvoicePosted`.
4. It returns `200 {"received": true, "success": true}`. The `success` field satisfies the optional "Confirm success by parsing response content" setting.
