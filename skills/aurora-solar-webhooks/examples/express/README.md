# Aurora Solar Webhooks - Express Example

Minimal example of receiving Aurora Solar webhooks and authenticating them with the secret header
you set on the subscription (`header_auth_key` / `header_auth_value`).

Aurora Solar webhooks are **unsigned GET requests with no body**; the event data arrives in the
query string. The handler checks the header first (constant-time, whole value, case-insensitive
header name), then reads the query parameters. The route reads any body with `express.raw({ type: '*/*' })` so any content type works.

> Set header_auth_key and header_auth_value on the Aurora Solar webhook and enter them here. Webhooks without them send nothing to verify.

## Prerequisites

- Node.js 18+
- An Aurora Solar tenant with a webhook subscription (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `AURORA_SOLAR_WEBHOOK_HEADER` to your `header_auth_key` (default `X-Aurora-Webhook-Token`) and
   `AURORA_SOLAR_WEBHOOK_SECRET` to the exact, whole `header_auth_value`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts `GET` (and `POST`) at `/webhooks/aurora-solar`.

## Test

```bash
npm test
```

The tests send every documented event with correct, wrong and missing headers. No Aurora account
is needed.

To try it by hand:

```bash
curl "http://localhost:3000/webhooks/aurora-solar?event=project_created&project_id=3fa85f64-5717-4562-b3fc-2c963f66afa6&source=api" \
  -H "$AURORA_SOLAR_WEBHOOK_HEADER: $AURORA_SOLAR_WEBHOOK_SECRET"
```

## Receive Webhooks Locally

Aurora can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no
install):

```bash
npx hookdeck-cli listen 3000 aurora-solar --path /webhooks/aurora-solar
```

Use the printed URL, with a static event in the template, as the subscription's `url_template`:
`https://<hookdeck-url>?event=project_created&project_id=<PROJECT_ID>`. Hookdeck's Aurora Solar
source pre-selects GET without managing the method.

## How It Works

- `src/index.js`: `verifyAuroraSolarRequest()` plus the `GET` and `POST` `/webhooks/aurora-solar` routes

1. The header is checked before the query string is read. Failure returns `401`.
2. The `event` query parameter selects the handler (`400` if missing). Each subscription is for one
   event, so the URL template carries a static `event=...`.
3. Handled events include `project_created`, `project_changed`, `project_status_changed`,
   `design_created`, `performance_simulation_job_completed`, `agreement_status_changed` and
   `web_proposal_viewed` (all 32 documented events are routed; see
   [overview](../../references/overview.md)).
4. It returns `200 {"received": true}`.

A static shared credential authenticates the sender, not the body, and gives no replay protection
(no signature, no timestamp). Use HTTPS and rotate the header value if it leaks. Aurora's Basic
Auth option is not covered by Hookdeck's Aurora Solar source.
