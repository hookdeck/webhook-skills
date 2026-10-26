# WebinarJam Webhooks - Next.js Example

Minimal example of receiving WebinarJam / EverWebinar Custom Webhook deliveries and
authenticating them with the Bearer token or custom header you configured.

WebinarJam does not sign requests. The handler reads the header named in
`WEBINARJAM_WEBHOOK_HEADER` (default `Authorization`) and compares the **whole value**,
including any `Bearer ` prefix, with `WEBINARJAM_WEBHOOK_SECRET` in constant time. A static
credential authenticates the sender, not the body, and gives no replay protection: use HTTPS
and rotate it if it leaks.

For the Bearer token option, enter Authorization as the header name and "Bearer <token>" as the value.

## Prerequisites

- Node.js 18+
- A WebinarJam or EverWebinar account with the Custom Webhook integration
  (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `WEBINARJAM_WEBHOOK_SECRET` to the exact header value WebinarJam sends (for example
   `Bearer <token>`) and `WEBINARJAM_WEBHOOK_HEADER` to its name.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/webinarjam`.

## Test

```bash
npm test
```

The tests send an illustrative lead payload with correct, wrong, prefix-less and missing
credentials. To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/webinarjam \
  -H "Content-Type: application/json" \
  -H "Authorization: $WEBINARJAM_WEBHOOK_SECRET" \
  -d '{"event":"registered","email":"ada@example.com","first_name":"Ada"}'
```

## Receive WebinarJam Webhooks Locally

```bash
npx hookdeck-cli listen 3000 webinarjam --path /webhooks/webinarjam
```

Use the printed URL as the base webhook URL on the Custom Webhook integration.

## How It Works

- `app/webhooks/webinarjam/route.ts`: the `POST` route handler; `lib/verify-webinarjam.ts`: `verifyWebinarJamRequest()`

1. The route authenticates the request before reading the body; `request.text()` returns the raw text, so any content type works.
2. The configured header is compared with `WEBINARJAM_WEBHOOK_SECRET`. Missing or wrong returns `401`; an unset secret returns `500`.
3. The body must be a JSON object (`400` otherwise).
4. WebinarJam documents no event field and no payload field names. The handler dispatches on an
`event` value you add as a custom body key-value pair: `registered`, `attended_live`,
`missed_live`, `left_early` or `purchased` (a convention of this skill). The payload fields
(`email`, `first_name`, ...) are illustrative.
5. It returns `200 {"received": true}`.
