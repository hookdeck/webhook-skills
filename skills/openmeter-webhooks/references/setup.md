# Setting Up OpenMeter Webhooks

## Prerequisites

- An OpenMeter Cloud account (API token) or a self-hosted OpenMeter instance
- Features and metered entitlements (for entitlement events) or billing enabled (for invoice events)
- A public HTTPS URL for your webhook endpoint (see [Local development](#how-do-i-test-locally))

## How Do I Create a Webhook Channel?

A channel is where OpenMeter sends notifications. Create one in the OpenMeter
Cloud UI (**Notifications → Channels**) or with the API/SDK:

```javascript
import { OpenMeter } from '@openmeter/sdk';

const openmeter = new OpenMeter({
  baseUrl: 'https://openmeter.cloud',
  apiKey: process.env.OPENMETER_API_TOKEN, // Cloud only
});

const channel = await openmeter.notifications.channels.create({
  type: 'WEBHOOK',
  name: 'Webhook Channel',
  url: 'https://your-app.example.com/webhooks/openmeter',
  // Optional: customHeaders: { 'X-Env': 'prod' },
  // Optional: signingSecret: 'whsec_...'  (see below)
});
```

## How Do I Get the Signing Secret?

- **Auto-generated (default):** if you omit `signingSecret`, OpenMeter generates
  one in the form `whsec_` + base64(32 random bytes). Read it from the channel's
  `signingSecret` field (in the create response, or
  `GET /api/v1/notification/channels/{channelId}`), or copy it from the channel in the Cloud UI.
- **Custom:** you may pass your own `signingSecret` when creating or updating the
  channel. It must match `^(whsec_)?[a-zA-Z0-9+/=]{32,100}$`: base64-encoded
  random bytes with an optional `whsec_` prefix. **Keep the `whsec_` prefix.**
  Svix/Standard Webhooks libraries and Hookdeck use the prefix to know the rest is
  base64 to be decoded into the HMAC key.

Store it as `OPENMETER_WEBHOOK_SECRET`.

## How Do I Choose Which Events to Receive?

Create a **rule** per event type and attach your channel:

```javascript
await openmeter.notifications.rules.create({
  type: 'entitlements.balance.threshold',
  name: 'Limit Notifications',
  channels: [channel.id],
  thresholds: [
    { type: 'PERCENT', value: 80 },
    { type: 'PERCENT', value: 100 },
  ],
  // Optional: features: ['llm_tokens'],
});
```

Rule types: `entitlements.balance.threshold`, `entitlements.reset`,
`invoice.created`, `invoice.updated`.

## How Do I Test Locally?

Run the Hookdeck CLI (no install or account required) and use the printed URL
as the channel `url`:

```bash
npx hookdeck-cli listen 3000 openmeter --path /webhooks/openmeter
```

Use port `8000` for the FastAPI example. OpenMeter's docs also suggest the
[Svix Playground](https://www.svix.com/play/) for inspecting raw deliveries.
Then ingest usage events until a threshold is crossed.

## How Do I Debug Deliveries?

- The OpenMeter Cloud UI's Webhooks page shows delivery status and errors.
- `GET /api/v1/notification/events` lists events with `deliveryStatus`
  (`PENDING`, `SENDING`, `SUCCESS`, `FAILED`, `RESENDING`) and annotations such as
  `event.subject.key` and `event.invoice.id`.

## Alternatives to Signature Verification

If you truly can't verify signatures, OpenMeter's docs point to HTTP Basic Auth
(e.g. via custom headers) or IP allowlisting. Signature verification is the
recommended approach.
