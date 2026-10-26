# Liveblocks Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving Liveblocks webhooks with signature verification using the
[`standardwebhooks`](https://www.npmjs.com/package/standardwebhooks) library (Liveblocks follows the
Standard Webhooks specification).

## Prerequisites

- Node.js 18+
- Liveblocks account with a webhook endpoint and its signing secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Liveblocks webhook secret to `.env` as `LIVEBLOCKS_WEBHOOK_SECRET`
   (the full `whsec_...` value for the endpoint in your project's **Webhooks** dashboard).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/liveblocks
```

## Test

```bash
npm test
```

The tests sign requests with the Standard Webhooks algorithm
(`{webhook-id}.{webhook-timestamp}.{raw body}`, HMAC-SHA256, base64), and check that the
`svix-*` header names are accepted too.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 liveblocks --path /webhooks/liveblocks
```

1. In the Liveblocks dashboard open your project, go to the **Webhooks** tab, click **Add endpoint...**, enter the tunnel URL and choose events.
2. Copy the endpoint's signing secret into `.env`.
3. Open the endpoint's top-right menu, choose **Test endpoint...**, pick an event type and click **Send example** to deliver a signed event.

## Event Handling

Every body is `{ type, data }`. The handler reads the event name from the top-level camelCase `type` field, routes these events, and logs anything else:

- `userEntered`, `userLeft`
- `storageUpdated`, `ydocUpdated` (both throttled at 60 seconds by Liveblocks)
- `roomCreated`, `roomDeleted`
- `commentCreated`, `commentEdited`, `commentDeleted`, `commentMetadataUpdated`
- `commentReactionAdded`, `commentReactionRemoved`
- `threadCreated`, `threadDeleted`, `threadMetadataUpdated`
- `threadMarkedAsResolved`, `threadMarkedAsUnresolved`
- `notification` (`data.kind` is `thread`, `textMention` or a custom `$`-prefixed kind)

There is no event id in the body: use the `webhook-id` header to deduplicate.

## Timestamp Window

The `standardwebhooks` library enforces a fixed 5-minute timestamp window. Hookdeck retries and
replays resend the original `webhook-timestamp`, so late retries are rejected. See
[references/verification.md](../../references/verification.md) for a manual verifier with a
configurable window.
