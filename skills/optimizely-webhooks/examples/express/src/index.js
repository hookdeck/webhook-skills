// Generated with: optimizely-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Verify X-Hub-Signature: sha1=<hex>, the hex HMAC-SHA1 of the raw body keyed
 * with the webhook's secret token. Only the body is signed (no timestamp).
 */
function verifyOptimizelySignature(rawBody, header, secret) {
  if (!header || !secret) return false;
  const sig = header.startsWith('sha1=') ? header.slice(5) : header;
  // Validate before decoding: Buffer.from(x, 'hex') silently drops bad characters
  if (!/^[0-9a-fA-F]{40}$/.test(sig)) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
}

function handleEvent(payload) {
  switch (payload.event) {
    case 'project.datafile_updated':
      console.log(`Datafile updated for ${payload.data?.environment} (revision ${payload.data?.revision})`);
      // TODO: re-fetch the datafile from payload.data.cdn_url
      break;
    case 'project.ruleset_updated':
      for (const change of Array.isArray(payload.data) ? payload.data : []) {
        console.log(`Ruleset change: ${change.change_type} on ${change.entity?.type}`);
      }
      // TODO: audit log, notify your team
      break;
    default:
      console.log(`Unhandled Optimizely event: ${payload.event}`);
  }
}

// Raw body for any content type so the exact bytes are verified
app.post('/webhooks/optimizely', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.OPTIMIZELY_WEBHOOK_SECRET;
  if (!secret) {
    console.error('OPTIMIZELY_WEBHOOK_SECRET is not configured');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyOptimizelySignature(rawBody, req.get('X-Hub-Signature'), secret)) {
    console.error('Optimizely webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after verification
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (payload === null || typeof payload !== 'object') {
    return res.status(400).send('Invalid payload');
  }

  handleEvent(payload);
  res.json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Optimizely webhook server listening on port ${port}`));
}

module.exports = { app, verifyOptimizelySignature };
