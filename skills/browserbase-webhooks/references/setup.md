# Setting Up Browserbase Webhooks

## Prerequisites

- A Browserbase account and project
- A project API key (`BROWSERBASE_API_KEY`) if you create webhooks with the SDK or API
- A public `https://` endpoint. Browserbase rejects `http://` URLs and a bare `https://`. For local development use a tunnel:

  ```bash
  npx hookdeck-cli listen 3000 browserbase --path /webhooks/browserbase   # Express / Next.js
  npx hookdeck-cli listen 8000 browserbase --path /webhooks/browserbase   # FastAPI
  ```

## How Do I Create a Browserbase Webhook Endpoint?

You can manage endpoints in the dashboard or through the SDK and API. Both act on the same webhooks.

### Dashboard

1. Open [Settings](https://www.browserbase.com/settings) and go to the **Webhooks** tab.
2. Add an endpoint with your `https://` URL (for example `https://your-app.com/webhooks/browserbase`).
3. Select the event types, for example `functions.invocations.completed` and `functions.invocations.failed`.
4. **Copy the signing secret from the confirmation dialog.** It appears only once.

### Node.js SDK (`@browserbasehq/sdk`)

```typescript
import { Browserbase } from '@browserbasehq/sdk';

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });

const webhook = await bb.webhooks.create({
  endpoint: 'https://your-app.com/webhooks/browserbase',
  eventTypes: ['functions.invocations.completed', 'functions.invocations.failed'],
});

console.log(webhook.secret); // store now as BROWSERBASE_WEBHOOK_SECRET
```

### Python SDK (`browserbase`)

```python
from browserbase import Browserbase

bb = Browserbase(api_key=os.environ["BROWSERBASE_API_KEY"])
webhook = bb.webhooks.create(
    endpoint="https://your-app.com/webhooks/browserbase",
    event_types=["functions.invocations.completed", "functions.invocations.failed"],
)
print(webhook.secret)
```

### REST API

```bash
curl -X POST https://api.browserbase.com/v1/webhooks \
  --header "X-BB-API-Key: $BROWSERBASE_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{
    "endpoint": "https://your-app.com/webhooks/browserbase",
    "eventTypes": ["functions.invocations.completed", "functions.invocations.failed"]
  }'
```

Each endpoint URL can be registered only once per project. Registering the same URL again returns a conflict.

## Where Do I Get the Signing Secret?

The response to create (and to rotate) contains `secret`, an HMAC-SHA256 signing secret prefixed with `whsec_`. Browserbase returns it **only** then: list and get calls don't include it, and the dashboard shows it once. Put it in your environment straight away:

```bash
BROWSERBASE_WEBHOOK_SECRET=whsec_...
```

If you lose it, rotate the secret (below) to get a new one.

## How Do I Change Subscribed Events?

`eventTypes` on update **replaces** the subscription set, so include every type you want to keep:

```typescript
await bb.webhooks.update(webhook.id, {
  eventTypes: ['functions.invocations.completed', 'functions.invocations.failed', 'functions.builds.failed'],
});
```

The signing secret isn't affected by updates.

## How Do I Rotate the Secret Without Dropping Deliveries?

Rotation returns a new secret once. The previous secret keeps verifying for **24 hours** unless you pass `revokeImmediately` (use that if the old secret leaked).

```typescript
const rotated = await bb.webhooks.rotateSecret(webhook.id, { revokeImmediately: false });
console.log(rotated.secret);
```

```python
rotated = bb.webhooks.rotate_secret(webhook.id, revoke_immediately=False)
```

Safe order:

1. Rotate.
2. Deploy with `BROWSERBASE_WEBHOOK_SECRET=<new>` and `BROWSERBASE_WEBHOOK_SECRET_PREVIOUS=<old>`. The examples try both.
3. Confirm deliveries are verifying.
4. Remove `BROWSERBASE_WEBHOOK_SECRET_PREVIOUS` once the 24-hour window has passed.

Only a limited number of rotated secrets can sit inside their 24-hour windows at once. Rotating the same endpoint again before an earlier window closes fails and changes nothing; wait, or pass `revokeImmediately`.

## How Do I Send a Test Event?

Browserbase's docs don't describe a "send test event" button. Trigger a real event instead by invoking a Function:

```bash
curl -X POST https://api.browserbase.com/v1/functions/FUNCTION_ID/invoke \
  --header "x-bb-api-key: $BROWSERBASE_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{"params": {}}'
```

You'll receive `functions.invocations.completed` or `functions.invocations.failed` (plus `pending`/`running` if subscribed). The Webhooks tab in Settings shows each delivery's payload and every attempt with its response status.

## If Nothing Arrives

- **Non-`2xx` response.** Check the delivery's response code in Settings. A redirect counts as a failure.
- **Verification rejected it.** Usually a parsed body; see [verification.md](verification.md).
- **Not subscribed** to that event type.
- **Endpoint disabled** after five days of continuous failures.

## Deleting an Endpoint

`bb.webhooks.delete(webhook.id)` stops deliveries immediately and retires the secret. Events from before the delete aren't replayed if you register the URL again.
