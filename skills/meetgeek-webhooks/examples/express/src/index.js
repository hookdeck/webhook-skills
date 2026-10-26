// Generated with: meetgeek-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a MeetGeek webhook signature.
 *
 * MeetGeek sends `X-MG-Signature: <hex>`: the lowercase hex HMAC-SHA256 of the exact raw
 * request body, keyed with the UTF-8 bytes of the configured secret. Nothing else is signed.
 */
function verifyMeetGeekSignature(rawBody, signatureHeader, secret) {
  // Validate the hex shape first (exactly 64 hex chars); no Buffer.from(x, 'hex') on raw input
  if (typeof signatureHeader !== 'string' || !/^[0-9a-f]{64}$/i.test(signatureHeader)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signatureHeader.toLowerCase()),
    Buffer.from(expected)
  );
}

// Read the raw body for ANY content type so the exact bytes are verified before parsing.
app.post('/webhooks/meetgeek', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.MEETGEEK_WEBHOOK_SECRET;
  if (!secret) {
    console.error('MEETGEEK_WEBHOOK_SECRET is not set');
    return res.status(500).send('Webhook secret not configured');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyMeetGeekSignature(rawBody, req.headers['x-mg-signature'], secret)) {
    console.error('MeetGeek webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return res.status(400).send('Invalid payload');
  }

  // No event-name field: branch on meeting_id
  if (payload.meeting_id) {
    // successful-analysis: fetch the meeting via the MeetGeek Public API. Dedupe on meeting_id
    // (retries and team-shared meetings can deliver it more than once).
    console.log(`MeetGeek analysis succeeded for meeting ${payload.meeting_id}`);
  } else {
    // failed-analysis
    console.log(`MeetGeek analysis failed: ${payload.message}`);
  }

  res.sendStatus(200);
});

const port = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(port, () => console.log(`MeetGeek webhook server listening on port ${port}`));
}

module.exports = { app, verifyMeetGeekSignature };
