# Novu Webhooks - Next.js Example

Minimal example of receiving Novu webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Novu delivers webhooks through Svix, which implements Standard Webhooks).

## Prerequisites

- Node.js 18+
- A Novu account with a webhook endpoint and its signing secret (`whsec_...`)

> **Novu outbound webhooks are available on the Team and Enterprise plans.**

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Novu endpoint signing secret to `.env` as `NOVU_WEBHOOK_SECRET`. Keep the whole
   `whsec_...` value. Novu manages endpoints on the
   [Webhooks page](https://dashboard.novu.co/webhooks) of the dashboard.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/novu
```

## Test

```bash
npm test
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{webhook-id}.{webhook-timestamp}.{raw body}`), including deliveries that carry the `svix-*`
header names instead of `webhook-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 novu --path /webhooks/novu
```

1. In the Novu dashboard, open the Webhooks page, select the Endpoints tab, click **Add Endpoint**
   and choose **Webhook**. Enter the tunnel URL and pick the event types you want.
2. Copy the endpoint's signing secret into `.env`.
3. Open the endpoint's **Testing** tab, choose an event type and click **Send Example**.

## Event Handling

The handler reads the event name from the envelope's top-level `type` field (`object` is only the
resource kind), reads the resource from `data.object`, routes these events, and acknowledges
anything else with `200`:

- `message.sent`, `message.delivered`, `message.failed`, `message.seen`, `message.read`, `message.unread`
- `message.archived`, `message.unarchived`, `message.snoozed`, `message.unsnoozed`, `message.deleted`
- `email.received`
- `preference.updated`
- `workflow.created`, `workflow.updated`, `workflow.published`, `workflow.deleted`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
