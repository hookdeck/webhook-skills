// Generated with: signnow-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * SIGNNOW WEBHOOK VERIFICATION
 *
 * SignNow signs a callback only when the event subscription was created with a
 * `secret_key` (any string up to 300 chars). The X-SignNow-Signature header is
 * then the base64 HMAC-SHA256 of the raw request body, keyed with that secret
 * as UTF-8. There is no timestamp in the signed content.
 */
function verifySignNowSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(rawBody).digest('base64');
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  // Length guard first: timingSafeEqual throws on mismatched lengths.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// SignNow webhook endpoint.
// express.raw({ type: '*/*' }) keeps the body a Buffer whatever the Content-Type,
// so the HMAC is computed over the exact bytes SignNow sent.
app.post('/webhooks/signnow', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.SIGNNOW_WEBHOOK_SECRET;
  if (!secret) {
    console.error('SIGNNOW_WEBHOOK_SECRET is not set - refusing unverified webhooks');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const signature = req.headers['x-signnow-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing X-SignNow-Signature header' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySignNowSignature(rawBody, signature, secret)) {
    console.error('SignNow webhook signature verification failed');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const event = payload?.meta?.event;
  console.log(`✓ Verified SignNow webhook: ${event ?? 'unknown'}`);

  handleEvent(payload);

  res.status(200).json({ received: true });
});

function handleEvent(payload) {
  // meta.event is the event name; content holds the entity ids.
  // TODO: dedupe (e.g. on meta.event + content id + meta.timestamp); SignNow retries failed deliveries.
  const { meta = {}, content = {} } = payload;

  switch (meta.event) {
    case 'document.open':
      console.log(`👀 Document opened: ${content.document_id}`);
      break;
    case 'document.update':
      console.log(`✏️  Document updated: ${content.document_id}`);
      break;
    case 'document.complete':
      console.log(`✅ Document complete: ${content.document_id} (${content.document_name})`);
      break;
    case 'document.delete':
      console.log(`🗑️  Document deleted: ${content.document_id}`);
      break;
    case 'document.fieldinvite.sent':
      console.log(`📨 Field invite sent for document ${content.document_id}`);
      break;
    case 'document.fieldinvite.signed':
      console.log(`🖊️  Field invite signed for document ${content.document_id}`);
      break;
    case 'document.fieldinvite.decline':
      console.log(`🚫 Field invite declined for document ${content.document_id}`);
      break;
    case 'user.document.complete':
      console.log(`✅ User ${content.user_id}'s document complete: ${content.document_id}`);
      break;
    case 'document_group.complete':
      console.log(`✅ Document group complete: ${content.group_id}`);
      break;
    case 'document_group.invite.signer.complete':
      console.log(`✅ Signer ${content.signer_email} finished group ${content.group_id}`);
      break;
    default:
      console.log(`Unhandled SignNow event: ${meta.event}`);
  }
}

module.exports = { app, verifySignNowSignature };

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SignNow webhook server listening on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/signnow`);
  });
}
