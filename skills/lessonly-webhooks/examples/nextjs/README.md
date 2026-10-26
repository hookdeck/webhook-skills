# Lessonly Webhooks - Next.js Example

Minimal example of receiving Lessonly (now Seismic Learning) lesson-completed webhooks and
authenticating them with the `Authorization` header.

Lessonly does not sign payloads. The credential is the value you set in
`lesson_completed_callback_authorization`, which Lessonly sends verbatim as
`Authorization: <value>`. The handler compares the **whole header value**, including any
`Bearer ` or `Basic ` prefix, with a constant-time comparison. A static credential
authenticates the sender, not the body, and gives no replay protection: use HTTPS and rotate
it if it leaks.

## Prerequisites

- Node.js 18+
- A Lessonly account with API access (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `LESSONLY_AUTHORIZATION` to the exact value you configured in Lessonly, e.g.
   `Bearer 1234-...`. Include any `Bearer ` or `Basic ` prefix.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/lessonly`.

## Test

```bash
npm test
```

The tests send an **illustrative** lesson-completed body (Lessonly doesn't document the
payload) with correct, wrong and missing `Authorization` headers. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/lessonly \
  -H "Content-Type: application/json" \
  -H "Authorization: $LESSONLY_AUTHORIZATION" \
  -d '{"lesson_id":1234,"user_id":5678,"completed_at":"2026-10-25T12:00:00Z"}'
```

## Receive Lessonly Webhooks Locally

```bash
npx hookdeck-cli listen 3000 lessonly --path /webhooks/lessonly
```

Set `lesson_completed_callback_url` to the printed URL with
`PUT /api/v1/company_settings`.

## How It Works

- `lib/verify-lessonly.ts`: `verifyLessonlyRequest()`
- `app/webhooks/lessonly/route.ts`: the `POST /webhooks/lessonly` route

1. `Authorization` is compared in full with `LESSONLY_AUTHORIZATION`, before the body is read.
   Failure returns `401`.
2. The body is read as raw text (`request.text()`), so any content type works, then parsed. It
   must be a JSON object (`400` otherwise).
3. Every delivery is a "lesson completed" event (there is no event-type field).
4. It returns `200 {"received": true}`.
