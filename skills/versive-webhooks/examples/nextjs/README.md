# Versive Webhooks - Next.js Example

Minimal example of receiving Versive webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Versive signs deliveries per Standard Webhooks with `svix-*` headers).

## Prerequisites

- Node.js 18+
- A Versive organization where you're an owner or admin (webhooks are set up under **Organization → Connectors → Webhooks**), and the endpoint's signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Versive endpoint signing secret to `.env` as `VERSIVE_WEBHOOK_SECRET`. Copy it from the
   endpoint in the webhooks portal (**Organization → Connectors → Webhooks → Manage endpoints**).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/versive
```

## Test

```bash
npm test
```

The tests sign requests with the same HMAC-SHA256 algorithm Svix uses
(`{svix-id}.{svix-timestamp}.{raw body}`), including deliveries that carry the `webhook-*`
header names instead of `svix-*`.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 versive --path /webhooks/versive
```

1. In Versive, open **Organization → Connectors → Webhooks**, select **Set up webhooks**, then
   **Manage endpoints**, and add the tunnel URL as an endpoint.
2. Copy that endpoint's signing secret into `.env`.
3. Complete an interview in a study to receive a real `interview.completed` delivery, or get screened
   out by a study's screener to receive `interview.screened_out`. The portal can also replay messages.

## Event Handling

The handler reads the event name from the body's top-level `event_type` field, routes these
events, and acknowledges anything else with `200`:

- `interview.completed`
- `interview.screened_out`

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window. Hookdeck retries and replays
resend the original `svix-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
