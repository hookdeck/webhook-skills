# Workspace ONE Webhooks - Express Example

Minimal example of receiving Workspace ONE UEM event notifications and authenticating them with
HTTP Basic credentials.

Workspace ONE does not sign payloads, so there is no HMAC to verify. The handler parses
`Authorization: Basic base64(username:password)`, splits on the first colon and compares the
username and the password each in constant time. The route reads the body with
`express.raw({ type: '*/*' })`, so any content type works, and parses JSON (or XML) only after
the credentials check out.

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

The tests send every documented event with correct, wrong and missing credentials. No Workspace
ONE account is needed.

To try it by hand (the body is illustrative; Omnissa doesn't document a payload):

```bash
curl -X POST http://localhost:3000/webhooks/workspace-one \
  -u "$WORKSPACE_ONE_WEBHOOK_USERNAME:$WORKSPACE_ONE_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"EventType":"Device Enrollment","DeviceId":4821,"EnrollmentUserName":"jdoe"}'
```

## Receive Webhooks Locally

Workspace ONE can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 workspace-one --path /webhooks/workspace-one
```

Put the printed URL in the rule's Target URL. The credentials must arrive on the first request:
a `401` + `WWW-Authenticate` challenge flow won't work through Hookdeck.

## How It Works

- `src/index.js`: `verifyWorkspaceOneRequest()` plus the `POST /webhooks/workspace-one` route

1. The `Authorization` header is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object or XML (`400` otherwise).
3. The handler dispatches on `EventType`: `Check-in/Check-out`, `Device Attribute Change`,
   `Device Compliance Status Change`, `Device Compromised Status Change`, `Device Delete`,
   `Device Enrollment`, `Device Unenrolled Enterprise Wipe`, `Device Wipe`.
4. It returns `200 {"received": true}`.
