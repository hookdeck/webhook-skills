# JFrog Webhooks - Express Example

Minimal example of receiving JFrog webhooks and authenticating the `X-JFrog-Event-Auth`
secret token (token mode). The body is read with `express.raw({ type: '*/*' })`, so any content
type is verified and parsed the same way.

## Prerequisites

- Node.js 18+
- A JFrog Platform webhook with a secret token (and "use secret for signing" **off**)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your webhook's secret token to `.env` as `JFROG_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Receive Webhooks Locally

JFrog can't reach `localhost`. Tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 jfrog --path /webhooks/jfrog
```

Use the printed URL as the webhook's **URL** in JFrog (Platform → Integrations → Webhooks).

## Test

```bash
npm test
```

Or send a request by hand:

```bash
curl -X POST http://localhost:3000/webhooks/jfrog \
  -H "Content-Type: application/json" \
  -H "X-JFrog-Event-Auth: $JFROG_WEBHOOK_SECRET" \
  -d '{"domain":"artifact","event_type":"deployed","data":{"repo_key":"my-repo","path":"a/b.txt"}}'
```

The webhook's **Test** button in JFrog also sends a sample request.

## Events Handled

`artifact` `deployed`, `deleted`, `moved`; `docker` `pushed`; `build` `uploaded`, `promoted`.

Signing mode (`use_secret_for_signing=true`) is not covered: JFrog does not document which
header carries that signature.
