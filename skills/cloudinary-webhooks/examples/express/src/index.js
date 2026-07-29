// Generated with: cloudinary-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config();
const express = require('express');
const cloudinary = require('cloudinary').v2;

// Cloudinary signs each notification with your ACCOUNT API Secret (the
// `api_secret` from CLOUDINARY_URL / Console → Settings → API Keys). It sends two
// headers:
//   x-cld-signature  -> hex digest of <algorithm>(rawBody + timestamp + api_secret)
//   x-cld-timestamp  -> unix timestamp (seconds)
// The digest algorithm is sha1 (Cloudinary default) or sha256 (opt-in account
// setting). Configure the SDK once and let it verify.
const ALGORITHM = process.env.CLOUDINARY_SIGNATURE_ALGORITHM || 'sha1';
cloudinary.config({
  api_secret: process.env.CLOUDINARY_API_SECRET,
  signature_algorithm: ALGORITHM,
});

if (!process.env.CLOUDINARY_API_SECRET) {
  console.warn(
    'CLOUDINARY_API_SECRET is not set — every webhook will be rejected with 401. ' +
      'Set it to your Cloudinary account API Secret (Console → Settings → API Keys).'
  );
}

// Common Cloudinary notification_type values (see references/overview.md).
const KNOWN_EVENT_TYPES = [
  'upload',
  'eager',
  'delete',
  'rename',
  'moderation',
  'resource_tags_changed',
  'create_folder',
  'delete_folder',
];

const app = express();

/**
 * Verify a Cloudinary webhook using the official SDK.
 *
 * Cloudinary computes the signature over the RAW request body concatenated with
 * the timestamp and your API secret, so we must pass the exact bytes received —
 * never JSON.parse then re-stringify before verifying.
 *
 * `verifyNotificationSignature(body, timestamp, signature, valid_for=7200)`
 * returns a boolean and also rejects notifications whose timestamp is older than
 * `valid_for` seconds (default 7200 = 2 hours), guarding against replay.
 *
 * @param {string} rawBody - the exact request body string
 * @param {number} timestamp - the x-cld-timestamp header value (unix seconds)
 * @param {string} signature - the x-cld-signature header value (hex digest)
 * @returns {boolean} whether the signature is valid and fresh
 */
function verifyCloudinarySignature(rawBody, timestamp, signature) {
  if (!rawBody || !timestamp || !signature) return false;
  return cloudinary.utils.verifyNotificationSignature(rawBody, Number(timestamp), signature);
}

// Use the raw body: Cloudinary signs the exact bytes, so we must NOT let a JSON
// body parser re-serialize the payload before verification.
app.post('/webhooks/cloudinary', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.get('x-cld-signature');
  const timestamp = req.get('x-cld-timestamp');

  // Reject early if the signature headers are missing.
  if (!signature || !timestamp) {
    console.error('Cloudinary webhook missing x-cld-signature / x-cld-timestamp header');
    return res.status(400).send('Missing signature headers');
  }

  const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body || '');

  // Authenticate before trusting the payload.
  if (!verifyCloudinarySignature(rawBody, timestamp, signature)) {
    console.error('Cloudinary webhook signature verification failed');
    return res.status(401).send('Invalid signature');
  }

  // Only parse AFTER verification succeeds.
  let notification;
  try {
    notification = JSON.parse(rawBody);
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  const { notification_type, public_id } = notification;
  console.log(`Received Cloudinary ${notification_type} (public_id ${public_id})`);

  // Dispatch on the notification_type.
  switch (notification_type) {
    case 'upload':
      // An asset finished uploading (fires for async/eager or large uploads).
      console.log('Asset uploaded:', public_id, notification.secure_url);
      break;

    case 'eager':
      // Eager (async) transformations finished generating.
      console.log('Eager transformations ready:', public_id, notification.eager);
      break;

    case 'delete':
      // One or more assets were deleted.
      console.log('Assets deleted:', notification.resources || public_id);
      break;

    case 'rename':
      // An asset was renamed (public_id changed).
      console.log('Asset renamed:', notification.from_public_id, '->', notification.to_public_id);
      break;

    case 'moderation':
      // A moderation result is available (manual or add-on moderation).
      console.log('Moderation result:', public_id, notification.moderation_status);
      // TODO: Approve/reject the asset based on moderation_status.
      break;

    case 'resource_tags_changed':
      // Tags were added to or removed from one or more assets.
      console.log('Tags changed:', notification.resources);
      break;

    case 'create_folder':
      // A folder was created.
      console.log('Folder created:', notification.folder_path || notification.folder);
      break;

    case 'delete_folder':
      // A folder was deleted.
      console.log('Folder deleted:', notification.folder_path || notification.folder);
      break;

    default:
      // Unknown/new type: acknowledge with 200 so Cloudinary does not retry.
      console.log(`Unhandled Cloudinary notification_type: ${notification_type}`);
  }

  // Respond 2xx quickly to acknowledge. A non-2xx makes Cloudinary retry.
  res.status(200).send('OK');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Export app and helpers for testing
module.exports = { app, verifyCloudinarySignature, KNOWN_EVENT_TYPES };

// Start server only when run directly (not when imported for testing)
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/cloudinary`);
  });
}
