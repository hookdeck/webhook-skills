// Generated with: mailgun-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 3000;

/**
 * Verify a Mailgun signature object.
 *
 * Mailgun puts the signature in the request BODY (not a header) as:
 *   { timestamp, token, signature }
 *
 * The signature is hex(HMAC-SHA256(signingKey, timestamp + token)).
 * For subaccount events a `parent-signature` field may also be present;
 * verify it with the parent account's signing key.
 */
function verifyMailgun(signature, signingKey) {
  if (!signature || !signingKey) return false;

  const { timestamp, token, signature: providedSig } = signature;
  if (!timestamp || !token || !providedSig) return false;

  const expected = crypto
    .createHmac('sha256', signingKey)
    .update(timestamp + token)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(providedSig, 'hex')
    );
  } catch {
    return false;
  }
}

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Mailgun webhook endpoint
// Standard JSON parsing is fine — the signature only covers timestamp+token,
// not the request body, so we don't need raw bytes here.
app.post('/webhooks/mailgun', express.json(), (req, res) => {
  const signingKey = process.env.MAILGUN_WEBHOOK_SIGNING_KEY;
  if (!signingKey) {
    console.error('MAILGUN_WEBHOOK_SIGNING_KEY not configured');
    return res.status(500).json({ error: 'Webhook verification not configured' });
  }

  const signature = req.body && req.body.signature;
  if (!signature) {
    return res.status(400).json({ error: 'Missing signature in request body' });
  }

  if (!verifyMailgun(signature, signingKey)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // Optional: subaccount parent-signature verification
  const parentKey = process.env.MAILGUN_PARENT_WEBHOOK_SIGNING_KEY;
  if (signature['parent-signature'] && parentKey) {
    const parentExpected = crypto
      .createHmac('sha256', parentKey)
      .update(signature.timestamp + signature.token)
      .digest('hex');
    const parentSig = signature['parent-signature'];
    let parentOk = false;
    try {
      parentOk = crypto.timingSafeEqual(
        Buffer.from(parentExpected, 'hex'),
        Buffer.from(parentSig, 'hex')
      );
    } catch {
      parentOk = false;
    }
    if (!parentOk) {
      return res.status(400).json({ error: 'Invalid parent-signature' });
    }
  }

  const eventData = req.body['event-data'];
  if (!eventData || !eventData.event) {
    return res.status(400).json({ error: 'Missing event-data' });
  }

  // Dispatch on event type
  switch (eventData.event) {
    case 'accepted':
      console.log(`Accepted: ${eventData.recipient}`);
      break;

    case 'rejected':
      console.log(`Rejected: ${eventData.recipient} - ${eventData.reject && eventData.reject.reason}`);
      break;

    case 'delivered':
      console.log(`Delivered: ${eventData.recipient}`);
      // TODO: mark message as delivered in your database
      break;

    case 'failed':
      // severity is 'permanent' (hard bounce) or 'temporary' (soft bounce)
      console.log(`Failed (${eventData.severity}): ${eventData.recipient}`);
      if (eventData.severity === 'permanent') {
        // TODO: add address to your local suppression list
      }
      break;

    case 'opened':
      console.log(`Opened: ${eventData.recipient}`);
      // TODO: record engagement
      break;

    case 'clicked':
      console.log(`Clicked: ${eventData.recipient} -> ${eventData.url}`);
      // TODO: record click analytics
      break;

    case 'unsubscribed':
      console.log(`Unsubscribed: ${eventData.recipient}`);
      // TODO: remove from mailing list
      break;

    case 'complained':
      console.log(`Complained (spam): ${eventData.recipient}`);
      // TODO: add to suppression list
      break;

    case 'stored':
      console.log(`Stored inbound message at ${eventData.storage && eventData.storage.url}`);
      break;

    case 'list_member_uploaded':
      console.log(`List member uploaded: ${eventData.member && eventData.member.address}`);
      break;

    default:
      console.log(`Unhandled event type: ${eventData.event}`);
  }

  res.json({ received: true });
});

module.exports = app;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Mailgun webhook server listening on port ${port}`);
    console.log(`Webhook endpoint: http://localhost:${port}/webhooks/mailgun`);
  });
}
