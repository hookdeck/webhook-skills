# SparkPost Webhooks - Next.js Example

Minimal example of receiving SparkPost **event webhooks** in a Next.js App Router route
handler, authenticated with Basic Auth (primary) or an OAuth 2.0 Bearer token.

**SparkPost event webhooks are not signed** — there is no HMAC, no signature header and no
signing secret. Authentication is credential-based and set by the webhook's `auth_type` field
(`none` | `basic` | `oauth2`). This example fails closed: with no credentials configured, every
batch is rejected.

## Prerequisites

- Node.js 18+
- A SparkPost account, and credentials **you choose** for this endpoint (not your SparkPost
  login)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set at least `SPARKPOST_WEBHOOK_USERNAME` (and normally `SPARKPOST_WEBHOOK_PASSWORD`), then
   configure the **same** values on the SparkPost webhook as
   `auth_credentials: { "username": ..., "password": ... }` with `auth_type: "basic"`.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

| Route | File | Purpose |
|-------|------|---------|
| `POST /webhooks/sparkpost` | `app/webhooks/sparkpost/route.ts` | Event webhook receiver |
| `POST /oauth/token` | `app/oauth/token/route.ts` | Demo OAuth 2.0 token endpoint |
| `GET /webhooks/sparkpost` | same route file | Liveness probe |

Shared authentication logic lives in `lib/sparkpost-auth.ts`.

## Test

```bash
npm test
```

Tests cover valid Basic credentials, wrong password, wrong username, missing header, malformed
base64, wrong scheme, an empty-password credential, valid/invalid/expired Bearer tokens, the
legacy `X-MessageSystems-Webhook-Token`, the unconfigured (fail-closed) case, the
`[{"msys":{}}]` validation batch, mixed-class batches, and duplicate batch IDs.

### Send a batch by hand

```bash
curl -i -X POST http://localhost:3000/webhooks/sparkpost \
  -u 'basicauthuser:a-long-random-string' \
  -H 'Content-Type: application/json' \
  -H 'X-MessageSystems-Batch-ID: 6f4b3d2a-1e5c-4d7a-9f8b-2c3d4e5f6a7b' \
  -d '[{"msys":{"message_event":{"type":"delivery","event_id":"92356927693813856","message_id":"000443ee14578172be22","timestamp":"1460989507","rcpt_to":"recipient@example.com"}}}]'

# The validation batch SparkPost sends on create / validate — must return 200
curl -i -X POST http://localhost:3000/webhooks/sparkpost \
  -u 'basicauthuser:a-long-random-string' \
  -H 'Content-Type: application/json' \
  -d '[{"msys":{}}]'
```

### Exercise the OAuth 2.0 path

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{"client_id":"CLIENT123","client_secret":"9sdfj791d2bsbf","grant_type":"client_credentials"}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')

curl -i -X POST http://localhost:3000/webhooks/sparkpost \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '[{"msys":{"track_event":{"type":"click","event_id":"92356927693813856","target_link_url":"http://example.com"}}}]'
```

The token endpoint accepts **both** JSON and `application/x-www-form-urlencoded` bodies, because
SparkPost does not document which Content-Type it uses for the token request. Its in-memory
token store is illustrative only and will not work across serverless instances — in production
point `auth_request_details.url` at your real authorization server and validate the Bearer token
by JWT verification or introspection.

## Receive real webhooks locally

SparkPost only POSTs to ports 80 and 443, so you need a public tunnel:

```bash
npx hookdeck-cli listen 3000 sparkpost --path /webhooks/sparkpost
```

Use the HTTPS URL it prints as the webhook's `target`. No account required — the CLI creates a
guest account on first run and gives you a web UI for inspecting and replaying each batch.

## Notes

- **Read the raw body with `await request.text()`**, then `JSON.parse` — never call
  `request.json()` before authenticating, and authenticate before touching the body at all.
- **Respond 200.** Webhook creation fails with HTTP 400 if the test POST doesn't get a 200, and
  any non-2xx is retried — 12 attempts over 8 hours, with a 10-second timeout per attempt.
- **The batch is a JSON array.** Each element has a single `msys` key wrapping one event-class
  object (`message_event`, `track_event`, `gen_event`, `unsubscribe_event`, `relay_event`,
  `ab_test_event`, `ingest_event`), which carries the `type`. Read whichever key is there.
- **Numeric-looking fields are strings** — `"timestamp": "1460989507"` is Unix seconds as a
  string, and so are `num_retries`, `bounce_class`, `subaccount_id`.
- **Deduplicate** on `X-MessageSystems-Batch-ID` (`headers.get()` is case-insensitive) and on
  each event's `event_id`. The in-memory `Set` here is per-instance — use Redis or a database in
  production, and consider `after()` or a queue for the processing itself.
- **`relay_message`** entries come from the separate relay webhooks API (inbound email) and are
  distinct from `relay_event` status events.
