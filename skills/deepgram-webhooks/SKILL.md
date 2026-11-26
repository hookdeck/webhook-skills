---
name: deepgram-webhooks
description: >
  Receive and verify Deepgram webhooks (callbacks). Use when setting up Deepgram webhook
  handlers, processing transcription callbacks, or handling asynchronous transcription results.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Deepgram Webhooks

## When to Use This Skill

- Setting up Deepgram callback handlers for transcription results
- Processing asynchronous transcription results from Deepgram
- Implementing webhook authentication for Deepgram callbacks
- Handling transcription completion events

## Essential Code

Deepgram webhooks (callbacks) are used to receive transcription, text-to-speech and Text Intelligence results asynchronously. When you provide a callback URL in your transcription request, Deepgram immediately responds with a `request_id` and sends the transcription results to your callback URL when processing is complete.

### Basic Webhook Handler

```javascript
// Express.js example
const crypto = require('crypto');

function safeEqual(a, b) {
  const ab = Buffer.from(a || '', 'utf8');
  const bb = Buffer.from(b || '', 'utf8');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

app.post('/webhooks/deepgram', express.raw({ type: 'application/json' }), (req, res) => {
  // 1. Basic Auth credentials you embedded in the callback URL
  //    (https://user:pass@your-domain.com/webhooks/deepgram)
  const auth = req.headers['authorization'] || '';
  const decoded = auth.startsWith('Basic ')
    ? Buffer.from(auth.slice(6), 'base64').toString('utf8')
    : '';
  const sep = decoded.indexOf(':');
  if (
    sep === -1 ||
    !safeEqual(decoded.slice(0, sep), process.env.DEEPGRAM_CALLBACK_USERNAME) ||
    !safeEqual(decoded.slice(sep + 1), process.env.DEEPGRAM_CALLBACK_PASSWORD)
  ) {
    return res.status(401).send('Unauthorized');
  }

  // The callback body is the normal /v1/listen response: { metadata, results }
  const payload = JSON.parse(req.body.toString());

  // 2. Optional (speech-to-text): a secret you sent as extra=callback_secret:VALUE
  //    comes back in metadata.extra.callback_secret
  const secret = process.env.DEEPGRAM_CALLBACK_SECRET;
  if (secret && !safeEqual(payload.metadata?.extra?.callback_secret, secret)) {
    return res.status(401).send('Invalid callback secret');
  }

  const requestId = payload.metadata?.request_id;
  const transcript = payload.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  console.log('Received transcription:', requestId, transcript);

  // Return success to prevent retries
  res.status(200).send('OK');
});
```

### Authentication Methods

Deepgram doesn't sign callbacks. Its [callback docs](https://developers.deepgram.com/docs/callback#authenticating-callback-requests) describe:

1. **Basic Auth (recommended, all APIs)**: Embed credentials in the callback URL. Deepgram includes them when it sends results, and they arrive as an `Authorization: Basic` header. This is the only documented check for text-to-speech and Text Intelligence callbacks
2. **Secret in Extra Metadata (speech-to-text only)**: Send a random secret as `extra=callback_secret:VALUE`. Deepgram returns it in `metadata.extra.callback_secret` in the callback body. Use a hex secret (`openssl rand -hex 32`): a `+` arrives as a space

The `dg-token` header is no longer a supported way to verify callbacks ([changelog, 27 October 2026](https://developers.deepgram.com/changelog/2026/10/27)). Don't check it.

```javascript
// Basic Auth in callback URL (percent-encode special characters in the credentials)
// https://username:password@your-domain.com/webhooks/deepgram

// Optional extra secret (speech-to-text):
// https://api.deepgram.com/v1/listen?callback=https://your-domain.com/webhooks/deepgram&extra=callback_secret:YOUR_SECRET_VALUE
```

### Making a Request with Callback

```bash
curl \
  --request POST \
  --header 'Authorization: Token YOUR_DEEPGRAM_API_KEY' \
  --header 'Content-Type: audio/wav' \
  --data-binary @audio.wav \
  --url 'https://api.deepgram.com/v1/listen?callback=https://username:password@your-domain.com/webhooks/deepgram'
```

## Common Event Types

Deepgram callbacks carry no event-type field. The body is the same JSON a synchronous `/v1/listen` request returns: a `metadata` object and a `results` object. The structure of `results` varies based on the features enabled in your request:

| Field | Description | Always Present |
|-------|-------------|----------------|
| `metadata.request_id` | Unique identifier for the transcription request (matches the `request_id` returned when you submitted it) | Yes |
| `metadata.created` | Timestamp when transcription was created | Yes |
| `metadata.duration` | Length of the audio in seconds | Yes |
| `metadata.channels` | Number of audio channels | Yes |
| `metadata.extra` | Key-value pairs you passed with `extra=KEY:VALUE` | Only if `extra` was sent |
| `results.channels[].alternatives` | Transcription alternatives | Yes |
| `results.channels[].alternatives[].transcript` | The transcribed text | Yes |
| `results.channels[].alternatives[].confidence` | Confidence score (0-1) | Yes |

## Environment Variables

```bash
# Your Deepgram API Key (for making requests)
DEEPGRAM_API_KEY=your_api_key_here

# Basic Auth credentials you embed in the callback URL
DEEPGRAM_CALLBACK_USERNAME=your_callback_username
DEEPGRAM_CALLBACK_PASSWORD=your_callback_password

# Optional (speech-to-text): a random hex secret you send as
# extra=callback_secret:VALUE; Deepgram returns it in metadata.extra.callback_secret
DEEPGRAM_CALLBACK_SECRET=your_hex_secret_here

# Your webhook endpoint URL
WEBHOOK_URL=https://your-domain.com/webhooks/deepgram
```

## Local Development

For local webhook testing, install Hookdeck CLI:

```bash
# Create a local tunnel (no account required)
npx hookdeck-cli listen 3000 deepgram --path /webhooks/deepgram

# Use the provided URL as your callback URL when making Deepgram requests
```

This provides:
- Local tunnel URL for testing
- Web UI for inspecting webhook payloads
- Request history and debugging tools

## Important Notes

### Retry Behavior
- Deepgram retries failed callbacks (non-200-299 status) up to 10 times
- 30-second delay between retry attempts
- Always return 200-299 status for successfully processed webhooks

### Port Restrictions
- Only ports 80, 443, 8080, and 8443 are allowed for callbacks
- Ensure your webhook endpoint uses one of these ports

### No Signature Verification
- Deepgram does not sign callbacks (no HMAC, no timestamp)
- Authenticate with Basic Auth credentials embedded in the callback URL, or for speech-to-text a secret in `metadata.extra.callback_secret`
- `dg-token` is no longer a supported verification method
- Always use HTTPS for webhook endpoints

## Resources

- [overview.md](references/overview.md) - What Deepgram webhooks are, transcription events
- [setup.md](references/setup.md) - Configure callbacks in Deepgram API requests
- [verification.md](references/verification.md) - Authentication methods and security considerations
- [examples/](examples/) - Complete implementations for Express, Next.js, and FastAPI

## Recommended: webhook-handler-patterns

For production handlers, install the patterns skill alongside this one. Key references (links work when only this skill is installed):

- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - Stripe payment webhooks
- [shopify-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks) - Shopify store webhooks
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - GitHub repository webhooks
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Webhook infrastructure that replaces your queue — guaranteed delivery, automatic retries, replay, rate limiting, and observability for your webhook handlers