# Mighty Networks Webhooks - Next.js Example

Minimal example of receiving Mighty Networks webhooks and authenticating them with the
`Authorization: Bearer` API key.

Mighty Networks does not sign payloads, so there is no HMAC to verify. The handler checks that the
`Authorization` header is `Bearer <your API key>` (scheme matched in any case) and compares the key
in constant time. A static key authenticates the sender, not the body, and gives no replay
protection, so use HTTPS and rotate the key if it leaks. The route
reads the body with `request.text()`, so any content type works, and parses it only after the
check.

## Prerequisites

- Node.js 20+
- A Mighty Networks Network with a webhook and API key (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `MIGHTY_NETWORKS_WEBHOOK_SECRET` to the API key you configured with the webhook in Mighty
   Networks (the bare key, without `Bearer `).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts requests at `POST /webhooks/mighty-networks`.

## Test

```bash
npm test
```

The tests send events with correct, wrong and missing keys. No Mighty Networks account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/mighty-networks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $MIGHTY_NETWORKS_WEBHOOK_SECRET" \
  -d '{"event_id":"11111111-1111-4111-8111-111111111111","event_timestamp":"2024-01-15T10:30:00Z","event_type":"PostCreatedHook","payload":{"id":1,"title":"Hello","space_id":2}}'
```

## Receive Webhooks Locally

Mighty Networks can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 mighty-networks --path /webhooks/mighty-networks
```

Put the printed URL in your Network's webhook settings.

## How It Works

- `lib/verify-mighty-networks.ts`: `verifyMightyNetworksRequest()`
- `app/webhooks/mighty-networks/route.ts`: the `POST /webhooks/mighty-networks` route

1. The `Authorization: Bearer` key is checked before the body is parsed. Failure returns `401`.
2. The body must be a JSON object (`400` otherwise).
3. `event_type` has a `Hook` suffix (`PostCreatedHook`); it is stripped before dispatch.
4. A repeated `event_id` is acknowledged without handling it again (in-memory here; use a durable
   store in production).
5. The handler dispatches on `MemberJoined`, `MemberLeft`, `MemberPurchased`,
   `MemberPurchaseRequested`, `MemberSubscriptionRenewed`, `MemberSubscriptionCanceled`,
   `MemberPlanChanged`, `MemberRemovedFromPlan`, `PostCreated`, `PostUpdated`, `CommentCreated`,
   `RsvpCreated`, `EventCreated`, `EventCanceled` and `ReportedContentCreated`; other events are
   logged and acknowledged.
6. It returns `200 {"received": true}`.
