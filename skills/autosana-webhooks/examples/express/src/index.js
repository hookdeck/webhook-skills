// Generated with: autosana-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Autosana: X-Autosana-Signature-256 = "sha256=" + hex(HMAC-SHA256(secret, rawBody))
function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret || !signatureHeader.startsWith('sha256=')) return false;
  const received = signatureHeader.slice('sha256='.length);
  // Check the hex shape first: Buffer.from(x, 'hex') silently truncates invalid input
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(received, 'hex'), expected);
}

// express.raw with '*/*' keeps the body as a Buffer for any content type
app.post('/webhooks/autosana', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('x-autosana-signature-256');

  if (!signature) {
    return res.status(400).send('Missing X-Autosana-Signature-256 header');
  }
  if (!Buffer.isBuffer(req.body) || !verifySignature(req.body, signature, process.env.AUTOSANA_WEBHOOK_SECRET)) {
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // The event name is in the body (`event`); there is no event header
  switch (payload.event) {
    case 'batch.completed': {
      const s = payload.summary || {};
      console.log(
        `Batch completed for ${payload.app?.name}: ${s.passed_groups}/${s.total_groups} groups passed, ${s.failed_groups} failed`
      );
      for (const group of payload.run_groups || []) {
        console.log(`  ${group.name}: ${group.status} (${group.url})`);
      }
      break;
    }
    default:
      console.log('Unhandled event:', payload.event);
  }

  res.json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

module.exports = app;
