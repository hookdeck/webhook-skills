# Rubrik Webhooks - Next.js Example

Minimal example of receiving Rubrik Security Cloud (RSC) event webhooks with Next.js.

**Rubrik webhooks are not signed** — there is no HMAC and no signature header. You authenticate
them with a credential you configure on the webhook (`authInfo.authType`). This example accepts:

| Rubrik auth type | What Rubrik sends | Env vars |
|------------------|-------------------|----------|
| `CUSTOM_HEADER` (recommended) | `<headerKey>: <headerValue>` | `RUBRIK_WEBHOOK_HEADER_NAME`, `RUBRIK_WEBHOOK_SECRET` |
| `BEARER` | `Authorization: Bearer <token>` | `RUBRIK_WEBHOOK_BEARER_TOKEN` |
| `BASIC` | `Authorization: Basic base64(user:pass)` | `RUBRIK_WEBHOOK_USERNAME`, `RUBRIK_WEBHOOK_PASSWORD` |

All comparisons are constant time. With nothing configured, every request gets `401` (fail closed).

## Prerequisites

- Node.js 18+
- A Rubrik Security Cloud account with permission to manage webhooks

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Generate a long random secret (e.g. `openssl rand -hex 32`), put it in `RUBRIK_WEBHOOK_SECRET`,
   and enter the **same** header name and value in Rubrik under the webhook's authentication
   settings (custom header).

## Files

- `app/webhooks/rubrik/route.ts` — the route handler (auth, parse, dispatch)
- `lib/rubrik-auth.ts` — custom header / Bearer / Basic checks and payload normalization

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test

```bash
npm test
```

Tests cover each auth mode (valid, wrong, missing credentials), the fail-closed case, the
default PD-CEF payload for backup failure and success, Anomaly events, a flat custom-template
payload and invalid JSON.

### Send an event by hand

```bash
curl -i -X POST http://localhost:3000/webhooks/rubrik \
  -H 'Content-Type: application/json' \
  -H 'X-Rubrik-Webhook-Token: replace-with-a-long-random-string' \
  -d '{"summary":"Failed backup of vSphere VM web-01.","source":"Rubrik Security Cloud","severity":"critical","timestamp":"2024-07-18T06:39:40.46Z","class":"Backup","custom_details":{"id":"c2b47274-6323-4025-b307-afed1cfb7574","type":"Event","objectName":"web-01","objectType":"VmwareVm","status":"Failure","eventName":"Snapshot.BackupFailed"}}'
```

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 rubrik --path /webhooks/rubrik
```

Use the HTTPS URL it prints as the webhook URL in Rubrik. No account required — the CLI creates a
guest account on first run and gives you a web UI for inspecting and replaying each request.

## Notes

- **Default payload is PD-CEF** (PagerDuty Common Event Format): `summary`, `source`, `severity`,
  `timestamp`, `class` at the top level and the event details (`id`, `type`, `objectName`,
  `objectType`, `status`, `eventName`, ...) under `custom_details`. Custom templates can change
  the shape, so the handler also reads a flat payload.
- **Dispatch on `status`** (`Failure`, `Success`, `PARTIAL_SUCCESS`, `Canceled`, ...) and
  `class` (`Backup`, `Anomaly`, `Recovery`, ...). There is no single `event.type` string.
- **Respond fast.** Rubrik retries only 3 times (after 1s, 5s and 10s), then drops the event, and
  auto-disables the webhook after 25 consecutive failures.
- **Deduplicate** on `custom_details.id` (the activity ID).
