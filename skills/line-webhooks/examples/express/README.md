# LINE Webhooks - Express Example

Minimal example of receiving LINE Messaging API webhooks in an Express app with `x-line-signature` verification over the **raw** request body, using the official `@line/bot-sdk` SDK.

## Prerequisites

- Node.js 22+ (required by `@line/bot-sdk` v11)
- A LINE Messaging API channel and its **channel secret** (LINE Developers Console → your channel → **Basic settings** → **Channel secret**)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `LINE_CHANNEL_SECRET` in `.env` to your channel secret. Use it verbatim — it is the HMAC key, not the channel access token.

## Run

```bash
npm start
```

Server runs on http://localhost:3000

Webhook endpoint: `POST http://localhost:3000/webhooks/line`

## Test

Run the test suite:

```bash
npm test
```

The tests sign payloads the same way the LINE Platform does (`base64(HMAC-SHA256(channel secret, raw body))`) and include the sample signature from LINE's docs.

### Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 line --path /webhooks/line
```

1. Copy the HTTPS URL the CLI prints.
2. In the LINE Developers Console, open your channel's **Messaging API** tab, paste it as the **Webhook URL**, and enable **Use webhook**.
3. Click **Verify**. LINE sends `{"destination":"U...","events":[]}`, which this handler acknowledges with `200`.
4. Message your LINE Official Account from the LINE app to receive a `message` event.

### Send a signed request by hand

```bash
BODY='{"destination":"U8e742f61d673b39c7fff3cecb7536ef0","events":[]}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$LINE_CHANNEL_SECRET" -binary | openssl base64)
curl -X POST http://localhost:3000/webhooks/line \
  -H "Content-Type: application/json" \
  -H "x-line-signature: $SIG" \
  -d "$BODY"
```

## How it works

- `express.raw({ type: '*/*' })` keeps the body as a `Buffer` for this route only — no `express.json()` before verification.
- The signature is verified with `validateSignature(rawBody, channelSecret, signature)` from `@line/bot-sdk` before the JSON is parsed.
- Missing or invalid signatures return `400`; verified requests return `200`, including the empty-`events` request sent by the console **Verify** button.
- Each request carries an `events` array. The handler dispatches on `event.type` (`message`, `messageEdited`, `unsend`, `follow`, `unfollow`, `join`, `leave`, `memberJoined`, `memberLeft`, `postback`, `videoPlayComplete`, `beacon`, `accountLink`, `membership`). Use `webhookEventId` to dedupe redelivered events.
