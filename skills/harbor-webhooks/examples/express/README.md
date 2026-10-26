# Harbor Webhooks - Express Example

Minimal example of receiving Harbor project webhooks and authenticating them with the
`Authorization` header.

Harbor does not sign payloads. If you enter an Auth Header on the webhook, Harbor sends it
verbatim as the `Authorization` header. The handler compares the **whole header value**,
including any `Bearer ` or `Basic ` prefix, with a constant-time comparison. A static
credential authenticates the sender, not the body, and gives no replay protection.

## Prerequisites

- Node.js 18+
- A Harbor project with a webhook using the **HTTP** notify type

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `HARBOR_AUTHORIZATION` to exactly what you typed in Harbor's Auth Header field, e.g.
   `Bearer <token>`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/harbor`.

## Test

```bash
npm test
```

The tests send the documented Default and CloudEvents payload shapes with correct, wrong and
missing `Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/harbor \
  -H "Content-Type: application/json" \
  -H "Authorization: $HARBOR_AUTHORIZATION" \
  -d '{"type":"PUSH_ARTIFACT","occur_at":1680501893,"operator":"harbor-jobservice","event_data":{"repository":{"repo_full_name":"harbor/alpine"}}}'
```

## Receive Harbor Webhooks Locally

```bash
npx hookdeck-cli listen 3000 harbor --path /webhooks/harbor
```

Use the printed URL as the Endpoint URL of the Harbor webhook.

## How It Works

- `src/index.js`: `verifyHarborRequest()`, `normalize()` and the `POST /webhooks/harbor` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content type works.
2. `Authorization` is compared with `HARBOR_AUTHORIZATION`. Failure returns `401`.
3. The body must be a JSON object (`400` otherwise).
4. Default payloads (`PUSH_ARTIFACT`, ...) and CloudEvents payloads (`harbor.artifact.pushed`,
   ...) are both dispatched on `type`.
5. It returns `200 {"received": true}`.
