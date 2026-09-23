# Jira Webhooks - Next.js Example

Minimal example of receiving Jira Cloud webhooks with signature verification using the Next.js App Router.

## Prerequisites

- Node.js 18+
- A Jira Cloud site with a webhook configured (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Jira webhook secret to `.env.local` (the `secret` you set on the Jira admin webhook)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

### Run the tests

```bash
npm test
```

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost (no account required)
npx hookdeck-cli listen 3000 jira --path /webhooks/jira
```

## Endpoint

- `POST /webhooks/jira` - Receives and verifies Jira webhook events

> **Note:** Jira signs **admin webhooks** (created on the Jira admin WebHooks page
> or via `POST /rest/webhooks/1.0/webhook`) with `X-Hub-Signature` when they have a
> `secret`. Admin webhooks without a secret are unsigned. Connect and OAuth 2.0
> app webhooks use an `Authorization` JWT instead, which this example does not
> verify.
