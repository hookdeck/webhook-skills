// Generated with: semaphore-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Semaphore's docs don't name the HTTP method, so accept all the usual ones.
const ALLOWED_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const HEX_64 = /^[0-9a-fA-F]{64}$/;

/**
 * Semaphore sends X-Semaphore-Signature-256: the lowercase hex HMAC-SHA256 of the
 * raw body bytes (no prefix, no timestamp), keyed with the WEBHOOK_SECRET value.
 */
function verifySemaphoreSignature(rawBody, signature, secret = process.env.SEMAPHORE_WEBHOOK_SECRET) {
  if (!secret || typeof signature !== 'string' || !HEX_64.test(signature)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Both are exactly 64 ASCII characters; hex is compared case-insensitively.
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature.toLowerCase()));
}

function handleEvent(payload, webhookId) {
  // No event-name field: every delivery is a finished pipeline. Dispatch on pipeline.result.
  const pipeline = payload.pipeline || {};
  const label = `${payload.project?.name}/${pipeline.name} (${pipeline.id}) [${webhookId || 'no id'}]`;

  switch (pipeline.result) {
    case 'passed':
      console.log(`Pipeline passed: ${label}`);
      // TODO: mark the commit green, trigger a deploy
      break;

    case 'failed':
      console.log(`Pipeline failed: ${label}`);
      // TODO: alert the team, inspect payload.blocks[].jobs[] for the failing job
      break;

    case 'stopped':
      console.log(`Pipeline stopped: ${label}`);
      // TODO: record that it was stopped (pipeline.result_reason says why)
      break;

    case 'canceled':
      console.log(`Pipeline canceled: ${label}`);
      // TODO: record that it was canceled
      break;

    default:
      console.log(`Unhandled Semaphore pipeline result: ${pipeline.result}`);
  }
}

// Read the body raw (any content type) so the exact bytes are verified before parsing.
app.all('/webhooks/semaphore', express.raw({ type: '*/*' }), (req, res) => {
  if (!process.env.SEMAPHORE_WEBHOOK_SECRET) {
    console.error('Set SEMAPHORE_WEBHOOK_SECRET');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // A missing body is verified as zero bytes.
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  // Signature first, for every method.
  if (!verifySemaphoreSignature(rawBody, req.headers['x-semaphore-signature-256'])) {
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  if (!ALLOWED_METHODS.includes(req.method)) {
    res.set('Allow', ALLOWED_METHODS.join(', '));
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // GET and DELETE carry no body: once verified, acknowledge them.
  if (rawBody.length === 0) {
    return res.status(200).json({ received: true });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    // X-Semaphore-Webhook-Id is the dedupe key (a timeout retry re-sends the same delivery).
    handleEvent(payload, req.headers['x-semaphore-webhook-id']);
  } catch (err) {
    console.error('Error handling Semaphore event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifySemaphoreSignature = verifySemaphoreSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: http://localhost:${PORT}/webhooks/semaphore`);
  });
}
