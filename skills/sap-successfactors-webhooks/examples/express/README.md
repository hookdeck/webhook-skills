# SAP SuccessFactors Webhooks - Express Example

Minimal example of receiving SAP SuccessFactors Integration Center REST outbound calls and
authenticating them with HTTP Basic auth.

SAP SuccessFactors does not sign requests, so there is no HMAC. The handler parses
`Authorization: Basic base64(username:password)` and compares the username and password, each in
constant time. The route reads the body with `express.raw({ type: '*/*' })`, so JSON, XML or any
other content type works, and accepts `GET` and `POST` because the sender chooses the method.

## Prerequisites

- Node.js 18+
- An Integration Center REST outbound integration (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `SAP_SUCCESSFACTORS_WEBHOOK_USERNAME` and `SAP_SUCCESSFACTORS_WEBHOOK_PASSWORD` to the
   User Name and Password on the REST connection.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts `GET` and `POST` at `/webhooks/sap-successfactors`.

## Test

```bash
npm test
```

The tests cover correct, wrong, missing and malformed credentials, GET and POST, and JSON, XML and
empty bodies. No SAP account is needed.

To try it by hand (the payload is illustrative; your integration maps its own fields):

```bash
curl -X POST http://localhost:3000/webhooks/sap-successfactors \
  -u "$SAP_SUCCESSFACTORS_WEBHOOK_USERNAME:$SAP_SUCCESSFACTORS_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"userId":"example-1001","firstName":"Ada","department":"Engineering"}'
```

## Receive Webhooks Locally

SAP SuccessFactors can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no
account, no install):

```bash
npx hookdeck-cli listen 3000 sap-successfactors --path /webhooks/sap-successfactors
```

Use the printed URL as the REST API URL in Integration Center. Credentials must arrive with every
request: Hookdeck never answers with a 401 challenge.

## How It Works

- `src/index.js`: `parseBasicAuth()`, `verifySapSuccessFactorsRequest()` and the route

1. The `Authorization` header is checked before the body is parsed. Failure returns `401`.
2. JSON is parsed only when the content type says so; XML and other types are kept as text; an
   empty body is fine.
3. The handler logs the delivery; replace the TODOs with your own processing.
4. It returns `200 {"received": true, "format": ...}`.

A static shared credential authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the credential if it leaks.
