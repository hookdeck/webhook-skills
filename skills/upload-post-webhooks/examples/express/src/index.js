require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// Upload-Post signs `<timestamp>.<raw body>` with HMAC-SHA256 (hex) and sends it as
// `sha256=<hex>`. The key is the whole webhook secret (including whsec_) used as-is.
// This is NOT Standard Webhooks: nothing is base64-decoded.
function verifyUploadPostSignature(rawBody, signature, timestamp, secret) {
  if (!signature || !timestamp || !secret) return false;

  const hex = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  // Validate length and alphabet before decoding: Buffer.from(x, 'hex') drops bad characters
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return false;

  // Signed message as bytes: timestamp header (latin1), ".", raw body bytes
  const signed = Buffer.concat([Buffer.from(timestamp, 'latin1'), Buffer.from('.'), rawBody]);
  const expected = crypto.createHmac('sha256', secret).update(signed).digest();
  const received = Buffer.from(hex.toLowerCase(), 'hex');

  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

// Opt-in replay window. Off by default: Hookdeck retries and replays keep the original timestamp.
function timestampWithinTolerance(timestamp, toleranceSeconds) {
  if (!toleranceSeconds) return true;
  if (!/^\d+$/.test(timestamp)) return false;
  return Math.abs(Date.now() / 1000 - Number(timestamp)) <= toleranceSeconds;
}

// Read raw bytes for any content type: the exact bytes are what was signed.
app.post('/webhooks/upload-post', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('x-upload-post-signature');
  const timestamp = req.get('x-upload-post-timestamp');

  if (
    !Buffer.isBuffer(req.body) ||
    !verifyUploadPostSignature(req.body, signature, timestamp, process.env.UPLOAD_POST_WEBHOOK_SECRET)
  ) {
    return res.status(401).send('Invalid signature');
  }

  const tolerance = Number(process.env.UPLOAD_POST_WEBHOOK_TOLERANCE_SECONDS) || 0;
  if (!timestampWithinTolerance(timestamp, tolerance)) {
    return res.status(401).send('Timestamp outside tolerance');
  }

  // Parse only after verification
  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  switch (payload.event) {
    case 'upload_completed':
      console.log(`Upload completed for ${payload.user_email}`);
      break;
    case 'social_account_connected':
      console.log(`Account connected: ${payload.platform} ${payload.account_name}`);
      break;
    case 'social_account_disconnected':
      console.log(`Account disconnected: ${payload.platform} ${payload.account_name} (${payload.reason})`);
      break;
    case 'social_account_reauth_required':
      console.log(`Reauth required: ${payload.platform} ${payload.account_name} (${payload.reason})`);
      break;
    case 'comment_received':
      console.log(`Comment on ${payload.post && payload.post.id}: ${payload.comment && payload.comment.text}`);
      break;
    case 'dm_received':
      console.log(`DM received on ${payload.platform}`);
      break;
    default:
      console.log(`Unhandled event: ${payload.event}`);
  }

  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server running on http://localhost:${port}`));
}

module.exports = app;
