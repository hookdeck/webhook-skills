# Document360 Webhooks - Express Example

Minimal example of receiving Document360 webhooks and authenticating them with a secret header.

Document360 does not sign payloads, so there is no HMAC to verify. You add a header (key-value
pair) to the Webhook channel; the handler reads its name from `DOCUMENT360_WEBHOOK_HEADER`
(default `Authorization`) and compares the **whole** value with `DOCUMENT360_WEBHOOK_SECRET` in
constant time. A static credential authenticates the sender, not the body, and gives no replay
protection: use HTTPS and rotate it if it leaks. The route accepts **POST and PUT** (the channel's
Request method dropdown offers both), reads the body raw so any content type works, and returns
`200` for an authenticated empty body.

## Prerequisites

- Node.js 18+
- A Document360 Webhook notification channel (see [../../references/setup.md](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `DOCUMENT360_WEBHOOK_HEADER` to the header key you added to the channel and
   `DOCUMENT360_WEBHOOK_SECRET` to its exact value (including any `Bearer ` prefix).

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts `POST` and `PUT` at `/webhooks/document360`.

## Test

```bash
npm test
```

The tests send every handled event with correct, wrong, differently-cased and missing headers,
over POST and PUT. No Document360 account is needed.

To try it by hand:

```bash
curl -X POST http://localhost:3000/webhooks/document360 \
  -H "Content-Type: application/json" \
  -H "$DOCUMENT360_WEBHOOK_HEADER: $DOCUMENT360_WEBHOOK_SECRET" \
  -d '{"Knowledge base name":"Docs","Event":"Article published","Article name":"Getting Started"}'
```

## Receive Webhooks Locally

Document360 can't reach `localhost`. Tunnel to your machine with the Hookdeck CLI (no account,
no install):

```bash
npx hookdeck-cli listen 3000 document360 --path /webhooks/document360
```

Put the printed URL in the channel's **Webhook URL** and add the same header there. Hookdeck's
Document360 source pre-selects POST without managing the method, so if the channel sends PUT,
allow PUT on the source.

## How It Works

- `src/index.js`: `verifyDocument360Request()` plus the `POST`/`PUT /webhooks/document360` routes

1. The credential header is checked before the body is parsed. Failure returns `401`.
2. An empty body returns `200`; a non-empty body must be a JSON object (`400` otherwise).
3. The handler dispatches on the `Event` field: `Article published`, `Article created`,
   `Article deleted`, `Article settings saved`, `Article workflow status updated`,
   `Extension token deleted`. Unknown events are logged and acknowledged.
4. It returns `200 {"received": true}`.
