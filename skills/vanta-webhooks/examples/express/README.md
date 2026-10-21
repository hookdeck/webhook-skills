# Vanta Webhooks - Express Example

Minimal example of receiving Vanta webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (Vanta's webhooks are powered by Svix).

## Prerequisites

- Node.js 18+
- Vanta account with access to **Settings → Webhooks** and an endpoint signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Vanta signing secret to `.env` as `VANTA_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/vanta
```

## Test

```bash
npm test
```

The tests sign requests with the same HMAC-SHA256 algorithm Vanta uses
(`{svix-id}.{svix-timestamp}.{raw body}`).

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 vanta --path /webhooks/vanta
```

1. In Vanta, go to **Settings → Webhooks → Add Endpoint** and paste the tunnel URL.
2. Copy the endpoint's **Signing Secret** into `.env`.
3. Open the endpoint's **Testing** tab, pick an event type, and click **Send Example**.

## Event Handling

The handler routes these events and logs anything else:

- `v1.questionnaire.status-changed`
- `v1.questionnaire.export-completed`
- `v1.vendor.decision.created`
- `v1.trust-center.access-request.received`
- `v1.trust-center.access-request.approved`
- `v1.evidence.status-changed`

Vanta's event reference documents payloads like `{"questionnaire": {...}}` without a
`type` field. If the body has a `type`, the handler uses it. Otherwise it reports the
payload's domain (its top-level key, e.g. `questionnaire` or `vendor`) so you can
look up the referenced object through the Manage Vanta API.
