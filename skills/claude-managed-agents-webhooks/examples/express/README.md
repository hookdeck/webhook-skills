# Claude Managed Agents Webhooks - Express Example

Minimal Express server that receives Anthropic Claude Managed Agents (CMA) webhooks and verifies the Standard Webhooks signature.

## Prerequisites

- Node.js 18+
- An Anthropic workspace with CMA access and a webhook endpoint configured in [Console](https://platform.claude.com/settings/workspaces/default/webhooks)
- The `whsec_`-prefixed signing key generated at endpoint creation

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your signing key to `.env`:
   ```
   ANTHROPIC_WEBHOOK_SIGNING_KEY=whsec_...
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000.

## Test with Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 claude-managed-agents --path /webhooks/claude-managed-agents
```

Paste the public URL Hookdeck prints into Console as the webhook endpoint URL.

## Test

```bash
npm test
```

The test suite generates real Standard Webhooks signatures against the configured `whsec_` secret and exercises every supported CMA event type.

## Endpoints

- `POST /webhooks/claude-managed-agents` — webhook receiver
- `GET /health` — health check

## Events Handled

Session events:

- `session.status_run_started`
- `session.status_idled`
- `session.status_rescheduled`
- `session.status_terminated`
- `session.thread_created`
- `session.thread_idled`
- `session.thread_terminated`
- `session.outcome_evaluation_ended`

Vault events:

- `vault.created`, `vault.archived`, `vault.deleted`
- `vault_credential.created`, `vault_credential.archived`, `vault_credential.deleted`
- `vault_credential.refresh_failed`
