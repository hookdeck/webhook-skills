# Papergames Webhooks - Next.js Example

Minimal Next.js (App Router) example of receiving Papergames webhooks with signature verification. Papergames delivers webhooks
through Svix, so the handler verifies the `svix-id`, `svix-timestamp` and `svix-signature` headers
(HMAC-SHA256, base64) by hand with Node's built-in `crypto` module. The official Svix library
([`svix`](https://www.npmjs.com/package/svix) on npm, [`svix`](https://pypi.org/project/svix/) on PyPI) is a
supported alternative.

## Prerequisites

- Node.js 18+
- A Papergames developer account (developer tools at https://papergames.io/en/developers/apikeys) with an API key and a webhook endpoint secret (`whsec_...`)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Papergames webhook secret to `.env` as `PAPERGAMES_WEBHOOK_SECRET`
   (the full `whsec_...` value shown once after you create the endpoint).

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Webhook endpoint:

```
POST http://localhost:3000/webhooks/papergames
```

## Test

```bash
npm test
```

The tests sign the documented `game.started` and `game.finished` payloads with the Svix algorithm
(`{svix-id}.{svix-timestamp}.{raw body}`, HMAC-SHA256, base64) and check a fixed signature vector.

## Receive Real Webhooks Locally

Start a tunnel with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 papergames --path /webhooks/papergames
```

1. In the Papergames developer tools (https://papergames.io/en/developers/webhooks), open **webhook management** for your API key,
   click **Create endpoint**, paste the tunnel URL, and subscribe to `game.started` and `game.finished`.
2. Copy the webhook secret shown after creation into `.env` as `PAPERGAMES_WEBHOOK_SECRET` (it is shown once).
3. Create a game session (`POST /api/v2/game-session/player-vs-player`) and play a game through its `playUrl`.

## Event Handling

The body is `{ "eventType": "...", "payload": { ...game session... } }` (not the Standard Webhooks `type`/`data`
shape). The handler routes on `eventType`:

- `game.started` - a game within a session started (fires once per game, so several times per session)
- `game.finished` - a game within a session finished; there is no winner field, so the handler compares
  `players[].score`

`status` stays `"playing"` on `game.finished`, so don't use it to detect the end of a session. `externalId` is only
present when you passed `externalUserId` on the iframe URL. Unknown event types are logged and acknowledged with 200.
Deduplicate on the `svix-id` header (stable across retries) and key state on `payload.uid` + `payload.gamesPlayed`.

## Timestamp Window

`PAPERGAMES_WEBHOOK_TOLERANCE_SECONDS` (default `300`, the Svix libraries' default; `0` disables) bounds the age of
`svix-timestamp`. Papergames publishes no tolerance and retries over roughly 27 hours, so widen it (or disable it and
rely on `svix-id` deduplication) if late retries or replays are rejected. See
[references/verification.md](../../references/verification.md).
