// Generated with: opnform-webhooks skill
// https://github.com/hookdeck/webhook-skills

const express = require('express');
const crypto = require('crypto');
require('dotenv').config({ quiet: true });

const app = express();
const PORT = process.env.PORT || 3000;

// OpnForm signs deliveries only when a webhook secret is set on the integration:
//   X-Webhook-Signature: sha256=<lowercase hex HMAC-SHA256 of the raw body>
// The key is the secret as UTF-8 bytes. Nothing else is signed (no timestamp), so there is no
// replay window; use submission_id for idempotency.
// https://docs.opnform.com/api-reference/integrations/webhook-security

function verifyOpnform(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  // The prefix is optional: Hookdeck's OpnForm source accepts the bare digest too
  let sig = signatureHeader.trim();
  if (sig.startsWith('sha256=')) sig = sig.slice('sha256='.length);
  // Buffer.from(x, 'hex') silently drops invalid characters, so check the shape first.
  if (!/^[0-9a-fA-F]{64}$/.test(sig)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), expected);
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

// Raw body is required: the signature covers the exact bytes OpnForm sent.
// type: '*/*' so any content type reaches the verifier as a Buffer.
app.post('/webhooks/opnform', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.OPNFORM_WEBHOOK_SECRET;
  if (!secret) {
    console.error('OPNFORM_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyOpnform(rawBody, req.headers['x-webhook-signature'], secret)) {
    console.error('OpnForm webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  // Signed does not mean well-formed: the fields come from whoever filled in the form
  if (!isObject(payload)) {
    return res.status(400).send('Invalid payload');
  }

  // Every delivery is a form submission; there is no event name to switch on.
  // submission_id identifies it: use it to drop duplicates (see webhook-handler-patterns)
  const { form_id, form_title, submission_id, submission } = payload;
  const fieldCount = isObject(submission) ? Object.keys(submission).length : 0;
  const title = typeof form_title === 'string' ? form_title : 'unknown form';
  const formId = typeof form_id === 'number' || typeof form_id === 'string' ? form_id : '?';
  const submissionId =
    typeof submission_id === 'number' || typeof submission_id === 'string' ? submission_id : '?';

  console.log(`Form submission ${submissionId} on "${title}" (form ${formId}): ${fieldCount} fields`);

  res.json({ received: true });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`OpnForm webhook server listening on http://localhost:${PORT}`);
  });
}

module.exports = { app, verifyOpnform };
