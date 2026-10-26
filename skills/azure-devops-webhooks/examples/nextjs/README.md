# Azure DevOps Webhooks - Next.js Example

Minimal example of receiving Azure DevOps Web Hooks service hooks with the Next.js App Router and
authenticating them with the subscription's basic authentication credentials.

Azure DevOps does not sign payloads, so there is no HMAC to verify. Every request carries
`Authorization: Basic base64(username:password)`. `lib/verify-azure-devops.ts` parses it (scheme
case-insensitive, split on the first colon) and compares the username and the password in
constant time, evaluating both before deciding. The route reads the body with `request.text()`
(any content type) and parses JSON only after the credentials check.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Use HTTPS and rotate the credential if it leaks.

## Prerequisites

- Node.js 18+
- An Azure DevOps project with a Web Hooks service hook subscription (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `AZURE_DEVOPS_WEBHOOK_USERNAME` and `AZURE_DEVOPS_WEBHOOK_PASSWORD` to the basic
   authentication credentials you enter on the subscription's **Action** screen.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/azure-devops`.

## Test

```bash
npm test
```

The tests call the route handler directly with correct, wrong, malformed and missing credentials.
No Azure DevOps account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/azure-devops \
  -H "Content-Type: application/json" \
  -u "$AZURE_DEVOPS_WEBHOOK_USERNAME:$AZURE_DEVOPS_WEBHOOK_PASSWORD" \
  -d '{"eventType":"git.push","publisherId":"tfs","message":{"text":"pushed"},"resource":{"pushId":1}}'
```

## Receive Webhooks Locally

Azure DevOps can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 azure-devops --path /webhooks/azure-devops
```

Put the printed URL in the Web Hooks subscription (Azure DevOps requires HTTPS for basic auth).

## How It Works

- `app/webhooks/azure-devops/route.ts`: the `POST` handler and event dispatch
- `lib/verify-azure-devops.ts`: `verifyAzureDevOpsRequest()` and `parseBasicAuth()`

Missing, malformed or mismatched credentials return `401`; a body that isn't a single JSON object
returns `400`; handled events return `200 {"received": true}`.
