# Azure DevOps Webhooks - Express Example

Minimal example of receiving Azure DevOps Web Hooks service hooks and authenticating them with
the subscription's basic authentication credentials.

Azure DevOps does not sign payloads, so there is no HMAC to verify. Every request carries
`Authorization: Basic base64(username:password)`. The handler parses it (scheme case-insensitive,
split on the first colon) and compares the username and the password in constant time, evaluating
both before deciding. The route reads the body with `express.raw({ type: '*/*' })`, so any
content type works, and parses JSON only after the credentials check.

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
   cp .env.example .env
   ```

3. Set `AZURE_DEVOPS_WEBHOOK_USERNAME` and `AZURE_DEVOPS_WEBHOOK_PASSWORD` to the basic
   authentication credentials you enter on the subscription's **Action** screen.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/azure-devops`.

## Test

```bash
npm test
```

The tests send every handled event with correct, wrong, malformed and missing credentials. No
Azure DevOps account is needed.

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

- `src/index.js`: `verifyAzureDevOpsRequest()` plus the `POST /webhooks/azure-devops` route

1. The `Authorization` header is parsed and checked before the body is parsed. Missing,
   malformed or mismatched credentials return `401`.
2. The body must be a single JSON object (`400` otherwise).
3. The handler dispatches on `eventType`: `git.push`, `git.pullrequest.created`,
   `git.pullrequest.updated`, `git.pullrequest.merged`, `workitem.created`, `workitem.updated`,
   `workitem.commented`, `build.complete`, `ms.vss-pipelines.run-state-changed-event`.
4. It returns `200 {"received": true}`.
