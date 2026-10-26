require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify X-Hint-Signature: `sha256=` + hex(HMAC-SHA256(rawBody, webhooksSignatureKey)).
 * The bare digest (no prefix) is accepted too. Only the body is signed.
 */
function verifyHintSignature(rawBody, header, secret) {
  if (typeof header !== 'string' || !secret) return false;
  const digest = header.startsWith('sha256=') ? header.slice(7) : header;
  // Buffer.from(x, 'hex') silently drops bad characters, so check the format first
  if (!/^[0-9a-f]{64}$/i.test(digest)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), expected);
}

const isObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// Raw body is required: the signature covers the exact bytes Hint sent.
// type '*/*' makes the raw parser (and so verification) work for any content type.
app.post('/webhooks/hint-health', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  const signature = req.headers['x-hint-signature'];
  if (!signature) {
    return res.status(401).send('Missing signature header');
  }
  if (!verifyHintSignature(rawBody, signature, process.env.HINT_HEALTH_WEBHOOK_SECRET)) {
    console.error('Hint Health webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Parse only after verification, and treat every field as untrusted
  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (!isObject(event)) {
    return res.status(400).send('Invalid payload');
  }

  // The event name is the top-level "type" field; "object" is the affected record
  const type = typeof event.type === 'string' ? event.type : undefined;
  const object = isObject(event.object) ? event.object : undefined;
  const id = typeof event.id === 'string' ? event.id : undefined;

  switch (type) {
    case 'patient.created':
      console.log('Patient created:', id, object);
      break;
    case 'patient.updated':
      console.log('Patient updated:', id, object);
      break;
    case 'patient.destroyed':
      console.log('Patient destroyed:', id, object);
      break;
    case 'patient.inactive':
      console.log('Patient inactive:', id, object);
      break;
    case 'membership.created':
      console.log('Membership created:', id, object);
      break;
    case 'membership.updated':
      console.log('Membership updated:', id, object);
      break;
    case 'membership.destroyed':
      console.log('Membership destroyed:', id, object);
      break;
    case 'practitioner.created':
      console.log('Practitioner created:', id, object);
      break;
    case 'practitioner.updated':
      console.log('Practitioner updated:', id, object);
      break;
    case 'practitioner.destroyed':
      console.log('Practitioner destroyed:', id, object);
      break;
    default:
      console.log('Unhandled event type:', type);
  }

  // Delivery is at least once: dedupe on the envelope id, and reply 2xx within 20 seconds
  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

module.exports = { app, verifyHintSignature };
