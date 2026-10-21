# Taskrabbit Webhooks - Next.js Example

Minimal example of receiving Taskrabbit webhooks with signature verification.
Taskrabbit delivers webhooks via Svix, so verification uses the official
[`svix`](https://www.npmjs.com/package/svix) SDK.

## Prerequisites

- Node.js 22+ (svix 2.x is ESM-only)
- Taskrabbit Partner API access (partner onboarding) and an endpoint signing secret (`whsec_...`) from the Svix Partner Dashboard

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your endpoint signing secret to `.env` (`TASKRABBIT_WEBHOOK_SECRET`)

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

The tests sign the documented example payloads (`project.completed`,
`project.canceled`, `project.rescheduled`) with the Svix algorithm and check
valid, tampered, stale, rotated-secret and missing-header cases.

## Webhook Endpoint

```
POST http://localhost:3000/webhooks/taskrabbit
```

## Local Testing with Hookdeck

Use the Hookdeck CLI to receive webhooks locally (no account required):

```bash
npx hookdeck-cli listen 3000 taskrabbit --path /webhooks/taskrabbit
```

Add the printed URL as an endpoint in the Svix Partner Dashboard, subscribe it
to the project events, then copy that endpoint's signing secret into `.env`.
Use the dashboard's testing tab (or replay a past message) to send an event.

## Project Structure

```
├── app/
│   └── webhooks/
│       └── taskrabbit/
│           └── route.ts    # Webhook handler
├── test/
│   └── webhook.test.ts     # Tests
└── vitest.config.ts        # Test configuration
```
