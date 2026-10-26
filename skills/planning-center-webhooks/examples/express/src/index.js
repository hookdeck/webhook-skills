// Generated with: planning-center-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Verify X-PCO-Webhooks-Authenticity: bare hex HMAC-SHA256 of the raw body.
 * The authenticity_secret is the HMAC key as a UTF-8 string (do NOT hex-decode it).
 */
function verifyPlanningCenter(rawBody, signature, secret) {
  if (!secret || !Buffer.isBuffer(rawBody)) return false;
  // Validate before Buffer.from(x, 'hex'): invalid hex silently truncates
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature)) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

function handleEvent(name, attempt, payload) {
  switch (name) {
    case 'people.v2.events.person.updated':
      console.log(`Person updated (attempt ${attempt}):`, payload?.data?.id, payload?.data?.attributes?.name);
      break;
    default:
      // Event names look like <app>.<version>.events.<resource>.<action>
      console.log(`Unhandled event: ${name}`);
  }
}

// Raw body for every content type: the signature covers the exact bytes received
app.post('/webhooks/planning-center', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('x-pco-webhooks-authenticity');
  const secret = process.env.PLANNING_CENTER_AUTHENTICITY_SECRET;

  if (!signature) {
    return res.status(400).json({ error: 'Missing X-PCO-Webhooks-Authenticity header' });
  }
  if (!verifyPlanningCenter(req.body, signature, secret)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let body;
  try {
    body = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // JSON:API: data is an array of EventDelivery resources
  const deliveries = Array.isArray(body.data) ? body.data : [];
  for (const delivery of deliveries) {
    const { name, attempt, payload } = delivery.attributes || {};
    let parsed = null;
    try {
      // attributes.payload is itself a JSON string
      parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
    } catch {
      return res.status(400).json({ error: 'Invalid payload JSON' });
    }
    handleEvent(name, attempt, parsed);
  }

  // Anything other than 200 is retried; a 410 deactivates the subscription
  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Planning Center webhook server listening on port ${port}`));
}

module.exports = { app, verifyPlanningCenter };
