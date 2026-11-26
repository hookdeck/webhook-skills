# Microsoft Teams Outgoing Webhooks - Express Example

Minimal Express example of a [Teams outgoing webhook](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-outgoing-webhook) callback: it verifies `Authorization: HMAC <base64>` (HMAC-SHA256 of the raw body, keyed with the base64-decoded security token) and replies with a `{"type":"message"}` JSON response that Teams posts in the thread.

## Prerequisites

- Node.js 18+
- A team where you can create an outgoing webhook (see [setup](../../references/setup.md))

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `MICROSOFT_TEAMS_SECURITY_TOKEN` to the security token Teams showed when you created the outgoing webhook.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. Callback URL path: `POST /webhooks/microsoft-teams` in [src/index.js](src/index.js).

## Test

```bash
npm test
```

The tests sign requests the way Teams does. They check a fixed test vector, the `status`, `help` and unknown commands, a lower-case `hmac` scheme, a token with a trailing newline, a missing header, another scheme, a signature keyed with the undecoded token, another token, tampered and re-serialised bodies, a malformed token, invalid JSON, and the fail-closed path when no token is configured.

To try it by hand, sign a body with your token:

```bash
BODY='{"type":"message","text":"<at>Helper</at> status","from":{"name":"Megan"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -mac HMAC -macopt hexkey:$(printf '%s' "$MICROSOFT_TEAMS_SECURITY_TOKEN" | base64 -d | xxd -p -c 256) -binary | base64)
curl -X POST http://localhost:3000/webhooks/microsoft-teams \
  -H "Content-Type: application/json" -H "Authorization: HMAC $SIG" -d "$BODY"
```

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 microsoft-teams --path /webhooks/microsoft-teams
```

Use the printed HTTPS URL as the callback URL, then @mention the webhook in a public channel. The CLI shows each request and your handler's reply, but the reply that appears in Teams comes from Hookdeck. Set a custom JSON response on the Hookdeck source, or expose your server directly to see your own replies in Teams.

## Notes

- The route uses `express.raw({ type: '*/*' })`. The HMAC covers the exact raw body, so `express.json()` on this route breaks it.
- Respond within about 5 seconds. Do slow work asynchronously and acknowledge in the reply.
- Unknown commands get a fixed reply instead of an echo of the user's text.
- Replies can also carry Adaptive Cards or Hero cards; outgoing webhooks support only the `openURL` card action.
