# Databricks Webhooks - Express Example

Minimal example of receiving Databricks webhooks (workspace notification
destinations of type Webhook) with Basic auth and event handling.

> **Databricks does not sign webhook payloads.** There is no signature header to
> verify. Instead, this example checks the `Authorization: Basic ...` header that
> Databricks sends when the destination has a username and password, comparing
> both values timing-safe. The OAuth (Beta) destination mode is not covered.

## Prerequisites

- Node.js 18+
- Databricks workspace where you are a workspace admin

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `DATABRICKS_WEBHOOK_USERNAME` and `DATABRICKS_WEBHOOK_PASSWORD` to the
   username and password you enter on the Webhook notification destination. If
   either is missing, the endpoint returns `500` (fails closed).

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

Run the unit tests:

```bash
npm test
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 databricks --path /webhooks/databricks
```

Use the Hookdeck URL as the Webhook destination URL (Settings > Workspace admin >
Notifications > Manage > Add destination), then run a job or alert to trigger
events.

Send a request manually:

```bash
curl -X POST http://localhost:3000/webhooks/databricks \
  -u "your_destination_username:your_destination_password" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"jobs.on_success","workspace_id":"123","run":{"run_id":"1"},"job":{"job_id":"2","name":"nightly"}}'
```

## Endpoint

- `POST /webhooks/databricks` - Authenticates the request and dispatches on `event_type` (jobs) or `event` (SQL alerts)
