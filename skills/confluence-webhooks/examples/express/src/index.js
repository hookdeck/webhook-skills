// Generated with: confluence-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

// X-Hub-Signature carries an HMAC-SHA256 hex digest of the raw body,
// formatted as "sha256=<hex>" (prefix optional).
function verifySignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  let sig = signatureHeader.trim().toLowerCase();
  const eq = sig.indexOf('=');
  if (eq !== -1) {
    if (sig.slice(0, eq) !== 'sha256') return false;
    sig = sig.slice(eq + 1);
  }
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false; // different lengths = invalid
  }
}

// express.raw with '*/*' keeps the exact bytes for any content type.
app.post('/webhooks/confluence', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.CONFLUENCE_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(500).send('CONFLUENCE_WEBHOOK_SECRET is not set');
  }

  const signature = req.get('x-hub-signature');
  if (!signature) {
    return res.status(400).send('Missing X-Hub-Signature header');
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifySignature(rawBody, signature, secret)) {
    return res.status(400).send('Invalid signature');
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).send('Invalid JSON');
  }

  // The event name is in the body's "event" field.
  switch (payload.event) {
    case 'page_created':
      console.log('Page created:', payload.page && payload.page.id);
      break;
    case 'page_updated':
      console.log('Page updated:', payload.page && payload.page.id);
      break;
    case 'page_removed':
      console.log('Page removed (trashed):', payload.page && payload.page.id);
      break;
    case 'blog_created':
      console.log('Blog post created:', payload.blog && payload.blog.id);
      break;
    case 'comment_created':
      console.log('Comment created:', payload.comment && payload.comment.id);
      break;
    case 'space_created':
      console.log('Space created:', payload.space && payload.space.key);
      break;
    default:
      console.log('Unhandled event:', payload.event);
  }

  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Confluence webhook server listening on port ${port}`));
}

module.exports = { app, verifySignature };
