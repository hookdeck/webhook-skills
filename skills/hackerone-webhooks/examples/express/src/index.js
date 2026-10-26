// Generated with: hackerone-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

const SIGNATURE_PREFIX = 'sha256=';

/**
 * Verify X-H1-Signature: "sha256=" + hex HMAC-SHA256 of the raw body, keyed with the
 * webhook secret (UTF-8 bytes, used as-is). Only the body is signed, so there is no
 * timestamp to check. The bare digest is accepted too.
 */
function verifyHackerOne(rawBody, signatureHeader, secret) {
  if (!secret || !Buffer.isBuffer(rawBody) || typeof signatureHeader !== 'string') return false;
  let digest = signatureHeader.trim();
  if (digest.startsWith(SIGNATURE_PREFIX)) digest = digest.slice(SIGNATURE_PREFIX.length);
  // Validate length and alphabet before decoding: Buffer.from(x, 'hex') drops bad characters.
  if (!/^[0-9a-fA-F]{64}$/.test(digest)) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest();
  const received = Buffer.from(digest.toLowerCase(), 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function handleEvent(eventName, body) {
  // Every field is untrusted: check the type of each level before reading into it.
  const data = isObject(body.data) ? body.data : {};
  const report = isObject(data.report) ? data.report : {};
  const attrs = isObject(report.attributes) ? report.attributes : {};
  const id = typeof report.id === 'string' ? report.id : 'unknown';
  const title = typeof attrs.title === 'string' ? attrs.title : '';

  switch (eventName) {
    case 'report_created':
      console.log(`New report ${id}: ${title}`);
      // TODO: create a ticket in your issue tracker
      break;

    case 'report_new':
      console.log(`Report ${id} needs program input`);
      break;

    case 'report_triaged':
      console.log(`Report ${id} triaged`);
      // TODO: assign an owner
      break;

    case 'report_bounty_awarded':
      console.log(`Bounty awarded on report ${id}`);
      // TODO: record the payout
      break;

    case 'report_comment_created':
      console.log(`Comment on report ${id}`);
      break;

    case 'report_resolved':
      console.log(`Report ${id} resolved`);
      // TODO: close the linked ticket
      break;

    case 'report_closed_as_duplicate':
    case 'report_closed_as_informative':
    case 'report_closed_as_spam':
    case 'report_closed_as_not_applicable':
      console.log(`Report ${id} closed: ${eventName}`);
      break;

    default:
      console.log(`Unhandled HackerOne event: ${eventName.slice(0, 100)}`);
  }
}

// Read the body raw so the exact bytes are verified, whatever Content-Type HackerOne uses.
app.post('/webhooks/hackerone', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.HACKERONE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('HACKERONE_WEBHOOK_SECRET is not set');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyHackerOne(rawBody, req.headers['x-h1-signature'], secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // The event name is only in the X-H1-Event header.
  const eventName = req.headers['x-h1-event'];
  if (typeof eventName !== 'string' || !eventName) {
    return res.status(400).json({ error: 'Missing X-H1-Event header' });
  }

  let body;
  try {
    body = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  if (!isObject(body)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleEvent(eventName, body);
  } catch (err) {
    console.error('Error handling HackerOne webhook:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyHackerOne = verifyHackerOne;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/hackerone`);
  });
}
