# Workspace ONE Webhooks - Express Example

Minimal example of receiving Workspace ONE UEM event notifications and authenticating them with
HTTP Basic credentials.

Workspace ONE does not sign payloads, so there is no HMAC to verify. The handler parses
`Authorization: Basic base64(username:password)`, splits on the first colon and compares the
username and the password each in constant time. The route reads the body with
`express.raw({ type: '*/*' })`, so any content type works, and reads it only after the
credentials check out.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- A Workspace ONE UEM Event Notifications rule (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `WORKSPACE_ONE_WEBHOOK_USERNAME` and `WORKSPACE_ONE_WEBHOOK_PASSWORD` to the User Name and
   Password on the rule.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/workspace-one`.

## Test

```bash
npm test
```

The tests send placeholder bodies with correct, wrong and missing credentials. No Workspace
ONE account is needed.

To try it by hand (the body is a placeholder; Omnissa doesn't document a payload):

```bash
curl -X POST http://localhost:3000/webhooks/workspace-one \
  -u "$WORKSPACE_ONE_WEBHOOK_USERNAME:$WORKSPACE_ONE_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"placeholder":"not a Workspace ONE payload"}'
```

## Receive Webhooks Locally

Workspace ONE can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 workspace-one --path /webhooks/workspace-one
```

Put the printed URL in the rule's Target URL. Omnissa's page doesn't say whether the credentials
arrive on the first request, so check the headers of a test notification.

## How It Works

- `src/index.js`: `verifyWorkspaceOneRequest()` plus the `POST /webhooks/workspace-one` route

1. The `Authorization` header is checked before the body is read. Failure returns `401`.
2. The raw body and `Content-Type` are stored. Nothing is parsed, because Omnissa documents no
   payload. Write your parser from real notifications.
3. It returns `200 {"received": true}`.
