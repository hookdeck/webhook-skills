// Generated with: remote-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const HEX_SHA256 = /^[0-9a-fA-F]{64}$/;

/**
 * Verify a Remote webhook.
 *
 * signature = lowercase hex HMAC-SHA256(secret, raw_body + ":" + X-Remote-Timestamp)
 * The signed message is built as bytes: the raw body as received, a literal ":", and the
 * timestamp header exactly as sent (latin1, never trimmed or parsed).
 */
function verifyRemoteSignature(rawBody, headers, secret = process.env.REMOTE_WEBHOOK_SECRET,
  toleranceSeconds = Number(process.env.REMOTE_WEBHOOK_TOLERANCE_SECONDS) || 0) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false;

  const signature = headers['x-remote-signature'];
  const timestamp = headers['x-remote-timestamp'];
  if (typeof signature !== 'string' || typeof timestamp !== 'string' || !timestamp) return false;

  // Validate the format before decoding: Buffer.from(x, 'hex') silently drops bad characters.
  if (!HEX_SHA256.test(signature)) return false;

  const message = Buffer.concat([rawBody, Buffer.from(':', 'utf8'), Buffer.from(timestamp, 'latin1')]);
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
  const received = Buffer.from(signature.toLowerCase(), 'hex'); // 32 bytes, validated above
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return false;

  // Opt-in only: Hookdeck retries and replays resend the original timestamp.
  if (toleranceSeconds > 0) {
    if (!/^\d+$/.test(timestamp)) return false;
    if (Math.abs(Date.now() - Number(timestamp)) > toleranceSeconds * 1000) return false;
  }
  return true;
}

function handleEvent(event) {
  switch (event.event_type) {
    case 'employment.onboarding.completed':
      console.log(`Onboarding completed for employment ${event.employment_id}`);
      // TODO: provision accounts, notify the manager
      break;

    case 'employment.onboarding_task.completed':
      console.log(`Onboarding task "${event.completed_task?.name}" completed for employment ${event.employment_id}`);
      // TODO: update your onboarding checklist
      break;

    case 'timeoff.requested':
      console.log(`Time off requested (employment ${event.employment_id})`);
      // TODO: route to the approver
      break;

    case 'timeoff.approved':
      console.log(`Time off approved (employment ${event.employment_id})`);
      // TODO: update your calendar
      break;

    case 'payslip.released':
      console.log(`Payslip released (employment ${event.employment_id})`);
      // TODO: fetch the payslip through the Remote API
      break;

    case 'contract.termination_date_reached':
      console.log(`Contract termination date reached (employment ${event.employment_id})`);
      // TODO: start offboarding in your systems
      break;

    default:
      console.log(`Unhandled event type: ${event.event_type}`);
  }
}

// Read the body raw so any content type works and the exact bytes are verified.
app.post('/webhooks/remote', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyRemoteSignature(req.body, req.headers)) {
    // Remote counts 4xx as delivered and never retries it.
    return res.status(401).json({ error: 'Invalid or missing signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(event);
  } catch (err) {
    // Remote does not retry 5xx either: log it, then replay via the webhook-events API.
    console.error('Error handling Remote event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyRemoteSignature = verifyRemoteSignature;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/remote`);
  });
}
