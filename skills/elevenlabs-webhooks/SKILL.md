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

For local webhook testing, use Hookdeck CLI:

```bash
brew install hookdeck/hookdeck/hookdeck
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

## Related Skills

- `webhook-handler-patterns` - Cross-cutting patterns (idempotency, retries, framework guides)
- `hookdeck-event-gateway` - Production infrastructure (routing, replay, monitoring)