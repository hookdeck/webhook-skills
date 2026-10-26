require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

/**
 * Verify a Bindbee (Standard Webhooks) delivery by hand.
 *
 * Bindbee's secret is NOT a base64 "whsec_" secret: its raw UTF-8 bytes are the
 * HMAC key, so do not use the standardwebhooks or svix libraries here.
 * signature = base64(HMAC-SHA256(key, "{webhook-id}.{webhook-timestamp}." + rawBody))
 */
function verifyBindbeeSignature(rawBody, headers, secret, toleranceSeconds = 0) {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const signatureHeader = headers['webhook-signature'];
  if (!id || !timestamp || !signatureHeader || !secret) return false;
  if (!/^[1-9][0-9]*$/.test(timestamp)) return false;

  if (toleranceSeconds > 0) {
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (age > toleranceSeconds) return false;
  }

  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice('whsec_'.length), 'base64')
    : Buffer.from(secret, 'utf8');
  if (key.length === 0) return false; // fail closed

  const signedContent = Buffer.concat([Buffer.from(`${id}.${timestamp}.`, 'utf8'), rawBody]);
  const expected = Buffer.from(
    crypto.createHmac('sha256', key).update(signedContent).digest('base64')
  );

  // The header holds one or more space-separated "v1,<base64>" entries; ignore other versions
  return signatureHeader.split(' ').some((entry) => {
    const comma = entry.indexOf(',');
    if (comma === -1 || entry.slice(0, comma) !== 'v1') return false;
    const candidate = Buffer.from(entry.slice(comma + 1));
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  });
}

// Raw body is required: the signature covers the exact bytes Bindbee sent
app.post('/webhooks/bindbee', express.raw({ type: '*/*' }), (req, res) => {
  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const tolerance = Number(process.env.BINDBEE_WEBHOOK_TOLERANCE_SECONDS) || 0;

  if (!verifyBindbeeSignature(rawBody, req.headers, process.env.BINDBEE_WEBHOOK_SECRET, tolerance)) {
    console.error('Bindbee webhook signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  // Parse only after verification
  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // payload.id equals the webhook-id header: use it to dedupe retries.
  // payload.sequence orders events per connector (order is not guaranteed across syncs).
  switch (payload.event) {
    case 'connector.linked':
      console.log('Connector linked:', payload.connector);
      break;
    case 'connector.relinked':
      console.log('Connector relinked:', payload.connector);
      break;
    case 'connector.relink_needed':
      console.log('Connector needs relink:', payload.connector, payload.error);
      break;
    case 'connector.sync.started':
      console.log('Sync started:', payload.sync);
      break;
    case 'connector.sync.completed':
      console.log('Sync completed:', payload.sync);
      break;
    case 'connector.sync.failed':
      console.log('Sync failed:', payload.sync, payload.error);
      break;
    case 'hris.employee.created':
      console.log('Employee created:', payload.data);
      break;
    case 'hris.employee.updated':
      console.log('Employee updated:', payload.data);
      break;
    default:
      console.log('Unhandled event:', payload.event);
  }

  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

module.exports = { app, verifyBindbeeSignature };
