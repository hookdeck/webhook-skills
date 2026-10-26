# Particle Webhooks - Next.js Example

Minimal example of receiving Particle webhook integrations and authenticating them with a secret
header you add to the integration.

Particle does not sign requests, so there is no HMAC to verify. The handler compares the whole
value of your custom header with `PARTICLE_WEBHOOK_SECRET` in constant time, for every method.
It reads the body with `request.text()` so any content type works, then parses
form-encoded or JSON bodies (and query parameters for GET) after the check.

## Prerequisites

- Node.js 20+
- A Particle webhook integration with a custom header (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `PARTICLE_WEBHOOK_HEADER` (default `Authorization`) and `PARTICLE_WEBHOOK_SECRET` (the exact
   header value, including any `Bearer ` prefix). Use a static header value, not a mustache variable.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts GET, POST, PUT, PATCH and DELETE at `/webhooks/particle`.

## Test

```bash
npm test
```

The tests cover correct, wrong, missing and differently-cased headers, every method, and form,
JSON, query-string and empty bodies. No Particle account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/particle \
  -H "Authorization: $PARTICLE_WEBHOOK_SECRET" \
  -d "event=temperature&data=21.5&coreid=3f002b000000000000000000"
```

## Receive Webhooks Locally

Particle can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account, no install):

```bash
npx hookdeck-cli listen 3000 particle --path /webhooks/particle
```

Put the printed URL in the Particle integration.

## How It Works

- `lib/particle.ts`: `verifyParticleRequest()` and `parseParticlePayload()`
- `app/webhooks/particle/route.ts`: one handler exported as `GET`, `POST`, `PUT`, `PATCH` and `DELETE`

1. The configured header is checked first, on every method. Missing or different: `401`.
2. The body is parsed (form, JSON, or query string); malformed JSON returns `400`.
3. The handler dispatches on `event` (`temperature`, `motion-detected` are illustrative; your
   firmware chooses the names).
4. It returns `200 {"received": true, "event": ...}`.

A static shared header authenticates the sender, not the body, and gives no replay protection.
Use HTTPS and rotate the value if it leaks.
