# Nash Webhooks - Express Example

Minimal example of receiving [Nash](https://www.usenash.com/) delivery webhooks in Express, with
signature verification through the official [`svix`](https://www.npmjs.com/package/svix) SDK. Nash sends its webhooks
through Svix, so every request carries `svix-id`, `svix-timestamp` and `svix-signature`.

## Prerequisites

- Node.js 22.12+ (tests need Node 24.9+, since svix 2.x is ESM-only and Jest loads it via `require(esm)`)
- A Nash account (sandbox works) with a webhook endpoint registered in the Nash Portal

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. In the Nash Portal go to **Settings > Webhook Management**, click your endpoint, and copy
   its **Signing Secret** (it starts with `whsec_`) into `.env` as `NASH_WEBHOOK_SECRET`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000, endpoint `POST /webhooks/nash`.

## Receive webhooks locally

```bash
npx hookdeck-cli listen 3000 nash --path /webhooks/nash
```

No account required. The CLI creates a guest account on first run and prints a public HTTPS
URL: add that URL as an endpoint under **Settings > Webhook Management**, subscribe to the
event types you want, and create a sandbox job to trigger `delivery` and `task` events.

## Test

```bash
npm test
```

The tests sign payloads with the Svix algorithm
(`base64(HMAC-SHA256(key, "{svix-id}.{svix-timestamp}.{raw body}"))`, where `key` is the
base64-decoded part of the secret after `whsec_`) and cover valid and rotated signatures,
missing headers, a wrong secret, a tampered body, a stale timestamp, and each handled event.

## How events are dispatched

Nash's payload is `{ "type", "event", "data" }`: `type` is the entity (`delivery`, `task`,
`courier_location`, `courier_name`, `shift`) and `event` the status within it. The handler
switches on `` `${type}.${event}` `` (for example `task.created`, `delivery.dropoff_complete`,
`shift.dispatched`). Use `svix-id` to deduplicate: it stays the same across retries.
