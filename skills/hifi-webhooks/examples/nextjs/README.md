# HIFI Webhooks with Next.js

A standalone receiver for signed `POST /webhooks/hifi` deliveries. It verifies the raw request body and logs event labels; add your own durable processing before acknowledging.

## Setup

Requires Node.js 24+ and the signing secret from [provider setup](../../references/setup.md).

```bash
npm install
cp .env.example .env.local
```

Set `HIFI_WEBHOOK_SECRET` in the copied environment file.

Set `HIFI_WEBHOOK_TOLERANCE_SECONDS` to a positive number to enforce an application age limit in seconds. Unset or `0` disables it. Old timestamps remain valid by default so Hookdeck retries and replays can retain the original headers.

## Run and Test

```bash
npm run dev
```

The endpoint listens at `http://localhost:3000/webhooks/hifi`.

```bash
npm test
```

Tests cover a fixed signing vector, tampering, malformed signatures, raw byte preservation and wrong-typed JSON. `vector.json` contains an illustrative payload and a fixed digest checked against core; it is not a live vendor capture.

## Receive Real Deliveries

```bash
npx hookdeck-cli listen 3000 hifi --path /webhooks/hifi
```

Register the public URL with HIFI. Return 2xx promptly. HIFI retries failed deliveries with exponential backoff for up to 10 attempts. Deliveries may arrive out of order; reconcile the resource state before applying a change.

## Responses

- 200: accepted delivery, including unrecognised events.
- 400: signed invalid JSON or a body that is not an object.
- 401: missing or invalid signature.
- 500: missing secret or invalid tolerance configuration.

See [verification](../../references/verification.md) for the exact header format and [event routing](../../references/overview.md) for payload handling.
