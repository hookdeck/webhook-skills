# SafeBase Webhooks - Next.js Example

Minimal example of receiving SafeBase webhooks with signature verification using the
official [`svix`](https://www.npmjs.com/package/svix) library (SafeBase's webhooks are powered by Svix).

## Prerequisites

- Node.js 18+
- SafeBase account with access to **Settings → Integrations** and an endpoint Signing Secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your SafeBase signing secret to `.env` as `SAFEBASE_WEBHOOK_SECRET`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/safebase
```

## Test

```bash
npm test
```

The tests sign requests with the same HMAC-SHA256 algorithm SafeBase uses
(`{svix-id}.{svix-timestamp}.{raw body}`).

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 safebase --path /webhooks/safebase
```

1. In SafeBase, go to **Settings → Integrations → Data → Connect → Add Endpoint** and paste the tunnel URL.
2. Copy the endpoint's **Signing Secret** into `.env`. Paste the endpoint's Signing Secret from the SafeBase webhook portal exactly as shown, including any whsec_ prefix.
3. Open the **Testing** tab and send a test event (it has no event name; real events do).

## Event Handling

The handler routes these events and logs anything else:

- `accessRequest.requested`
- `accessRequest.blocked`
- `accessRequest.autoApprove.requireManual`
- `accounts.created`
- `accounts.nda.completed`
- `portal.viewed`
- `portal.file.downloaded`
- `questionnaire.completed`
- `knowledgebase.entry.created`

SafeBase doesn't document which body field holds the event name, so the handler reads
the first string found in `eventType`, `event_type`, `type` or `event`, and logs the
body when none is present (as with the test event).

## Timestamp Window

The `svix` library enforces a fixed 5-minute timestamp window, so Hookdeck retries and
replays older than that are rejected. See `references/verification.md` in the skill for
a manual verifier with a configurable window.
