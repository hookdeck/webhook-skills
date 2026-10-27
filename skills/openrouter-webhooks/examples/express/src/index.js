// Generated with: openrouter-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify an X-OpenRouter-Signature header: t=<unix seconds>,v1=<hex>.
 * The v1 value is HMAC-SHA256 (hex) of the bytes "<t>," + raw body, keyed with
 * the workspace signing secret (UTF-8, used as-is).
 *
 * Timestamp tolerance is opt-in: Hookdeck retries and replays resend the
 * original timestamp, so a window is off unless toleranceSeconds > 0.
 */
function verifyOpenRouterSignature(rawBody, header, secret, toleranceSeconds = 0) {
  if (!header || !secret) return false;

  let timestamp = null;
  const signatures = [];
  for (const part of header.split(',')) {
    const p = part.trim();
    if (p.startsWith('t=')) {
      if (timestamp === null) timestamp = p.slice(2);
    } else if (p.startsWith('v1=')) {
      signatures.push(p.slice(3));
    }
  }
  if (!timestamp || signatures.length === 0) return false;

  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSeconds) return false;
  }

  // Build the signed message as bytes: "<t>," + raw body (never a re-encoded string)
  const signedPayload = Buffer.concat([Buffer.from(`${timestamp},`, 'latin1'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest();

  // Validate format first (Buffer.from(x, 'hex') silently drops bad characters),
  // then compare equal-length buffers in constant time. Any matching v1 is valid.
  let valid = false;
  for (const sig of signatures) {
    if (!HEX_64.test(sig)) continue;
    if (crypto.timingSafeEqual(expected, Buffer.from(sig, 'hex'))) valid = true;
  }
  return valid;
}

// OpenRouter video-generation callback endpoint - must use the raw body
app.post('/webhooks/openrouter',
  express.raw({ type: '*/*' }),
  (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const tolerance = Number(process.env.OPENROUTER_WEBHOOK_TOLERANCE_SECONDS) || 0;

    if (!verifyOpenRouterSignature(
      rawBody,
      req.get('X-OpenRouter-Signature'),
      process.env.OPENROUTER_WEBHOOK_SECRET,
      tolerance
    )) {
      console.error('OpenRouter webhook verification failed');
      return res.sendStatus(401);
    }

    // Parse only after the signature check
    let event;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return res.status(400).send('Invalid JSON payload');
    }
    if (event === null || typeof event !== 'object') {
      return res.status(400).send('Invalid payload');
    }

    // Deduplicate retries on this header (e.g. "<job id>-completed")
    const idempotencyKey = req.get('X-OpenRouter-Idempotency-Key');
    const job = event.data || {};

    // Handle the event based on type
    switch (event.type) {
      case 'video.generation.completed':
        console.log('Video ready:', { id: job.id, idempotencyKey, url: job.unsigned_urls && job.unsigned_urls[0] });
        // TODO: Store the job and download the video (send your bearer token if the URL is on the OpenRouter API)
        break;

      case 'video.generation.failed':
        console.error('Video failed:', { id: job.id, idempotencyKey, error: job.error });
        // TODO: Mark the job failed and notify the user
        break;

      case 'video.generation.cancelled':
        console.log('Video cancelled:', { id: job.id, idempotencyKey });
        // TODO: Mark the job cancelled
        break;

      case 'video.generation.expired':
        console.log('Video expired:', { id: job.id, idempotencyKey });
        // TODO: Mark the job expired and resubmit if needed
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // 204 acknowledges a valid delivery
    res.sendStatus(204);
  }
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app for testing
module.exports = app;

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/openrouter`);
  });
}
