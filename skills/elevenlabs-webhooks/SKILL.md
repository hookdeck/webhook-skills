---
name: elevenlabs-webhooks
description: >
  Receive and verify ElevenLabs webhooks. Use when setting up ElevenLabs webhook
  handlers, debugging signature verification, or handling call transcription events.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# ElevenLabs Webhooks

## When to Use This Skill

- Setting up ElevenLabs webhook handlers
- Debugging signature verification failures
- Understanding ElevenLabs event types and payloads
- Processing call transcription events
- Handling voice removal notifications

## Essential Code

### Signature Verification (Manual)

ElevenLabs uses HMAC-SHA256 with a custom header format:

```javascript
// Express.js example
const crypto = require('crypto');

function verifyElevenLabsWebhook(rawBody, signature, secret) {
  // Parse signature header: "t=timestamp,v0=hash"
  const elements = signature.split(',');
  const timestamp = elements.find(e => e.startsWith('t='))?.substring(2);
  const signatures = elements.filter(e => e.startsWith('v0=')).map(e => e.substring(3));

  // Check timestamp (within 30 minutes)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 1800) {
    return false;
  }

  // Calculate expected signature
  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Compare signatures
  return signatures.some(sig => {
    try {
      return crypto.timingSafeEqual(
        Buffer.from(sig),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  });
}
```

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `post_call_transcription` | Call analysis completed | Process call insights, save transcripts |
| `voice_removal_notice` | Notice that voice will be removed | Notify users, backup voice data |
| `voice_removal_notice_withdrawn` | Voice removal notice cancelled | Update user notifications |
| `voice_removed` | Voice has been removed | Clean up voice data, update UI |

## Environment Variables

```bash
ELEVENLABS_WEBHOOK_SECRET=your_webhook_secret_here
```

## Local Development

For local webhook testing, install Hookdeck CLI:

```bash
# Install via npm (recommended)
npm install -g hookdeck-cli

# Or via Homebrew
brew install hookdeck/hookdeck/hookdeck
```

Then start the tunnel:

```bash
hookdeck listen 3000 --path /webhooks/elevenlabs
```

No account required. Provides local tunnel + web UI for inspecting requests.

## Resources

- [Overview](references/overview.md) - What ElevenLabs webhooks are, common event types
- [Setup](references/setup.md) - Configure webhooks in ElevenLabs dashboard, get signing secret
- [Verification](references/verification.md) - Signature verification details and gotchas
- [Express Example](examples/express/) - Complete Express.js implementation
- [Next.js Example](examples/nextjs/) - Next.js App Router implementation
- [FastAPI Example](examples/fastapi/) - Python FastAPI implementation

## Recommended: webhook-handler-patterns

We recommend installing the [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) skill alongside this one for handler sequence, idempotency, error handling, and retry logic. Key references (open on GitHub):

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md) — Verify first, parse second, handle idempotently third
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md) — Prevent duplicate processing
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md) — Return codes, logging, dead letter queues
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md) — Provider retry schedules, backoff patterns

## Related Skills

- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - Stripe payment webhook handling
- [shopify-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/shopify-webhooks) - Shopify e-commerce webhook handling
- [github-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/github-webhooks) - GitHub repository webhook handling
- [resend-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/resend-webhooks) - Resend email webhook handling
- [chargebee-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/chargebee-webhooks) - Chargebee billing webhook handling
- [clerk-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/clerk-webhooks) - Clerk auth webhook handling
- [openai-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/openai-webhooks) - OpenAI webhook handling
- [paddle-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/paddle-webhooks) - Paddle billing webhook handling
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Handler sequence, idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure (routing, replay, monitoring)

## Official ElevenLabs SDK Skills

For making API calls TO ElevenLabs (text-to-speech, transcription, agents), see the official [ElevenLabs Skills](https://github.com/elevenlabs/skills). This skill handles the opposite direction: receiving webhooks FROM ElevenLabs.

> **SDK Warning:** Always use `@elevenlabs/elevenlabs-js` for JavaScript. Do not use `npm install elevenlabs` (that's an outdated v1.x package).