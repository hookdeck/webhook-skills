// Generated with: merge-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Merge signs every webhook with X-Merge-Webhook-Signature: the HMAC-SHA256
// of the raw body, encoded as base64url WITH '=' padding (44 characters).
// The key is your organization's signature key (Configuration > Webhooks >
// Security), used as UTF-8 text. One key covers every webhook in the org.
// Padding carries no data, so it's ignored on both sides of the comparison.
// ---------------------------------------------------------------------------

/**
 * Verify X-Merge-Webhook-Signature against the exact bytes Merge sent.
 * @param {Buffer|string} rawBody
 * @param {string|undefined} signature - X-Merge-Webhook-Signature
 * @param {string|undefined} key - MERGE_WEBHOOK_SIGNATURE_KEY
 * @returns {boolean}
 */
function verifyMergeSignature(rawBody, signature, key) {
  const secret = String(key || '').trim();
  const value = String(signature || '').trim();
  // 32 bytes = 43 base64url characters, plus one optional '='. Standard
  // base64 ('+' and '/') is not what Merge sends, so it doesn't match.
  if (!secret || !/^[A-Za-z0-9_-]{43}=?$/.test(value)) return false;
  const given = Buffer.from(value.replace(/=$/, ''));
  // Node's base64url digest has no padding.
  const expected = Buffer.from(crypto.createHmac('sha256', secret).update(rawBody).digest('base64url'));
  return crypto.timingSafeEqual(given, expected);
}

/**
 * Every payload has hook.event. Most also have linked_account (the end user
 * whose data changed) and data. AsyncPassthrough.resolved carries
 * async_passthrough_receipt_id instead of linked_account.
 */
function handleEvent(payload) {
  const event = (payload.hook && payload.hook.event) || '';
  const account = payload.linked_account || {};
  if (event === 'LinkedAccount.linked') {
    console.log(`Linked account ${account.id} (${account.integration}) linked`);
  } else if (event === 'LinkedAccount.sync_completed') {
    console.log(`Linked account ${account.id} finished syncing`);
  } else if (event === 'LinkedAccount.deleted') {
    console.log(`Linked account ${account.id} deleted: drop its data`);
  } else if (event.startsWith('Issue.')) {
    console.log(`${event} for linked account ${account.id}`);
  } else if (/\.(added|changed|removed)$/.test(event)) {
    // Changed-data webhooks carry the latest version of the Common Model.
    console.log(`${event}: ${payload.data && payload.data.id}`);
  } else if (event.endsWith('.synced')) {
    console.log(`${event} for linked account ${account.id}`);
  } else if (event === 'AsyncPassthrough.resolved' || event === 'AsyncPost.completed' || event === 'AsyncBulkPost.completed') {
    console.log(`${event}`);
  } else {
    console.log(`Unhandled Merge event: ${event}`);
  }
  return { received: true, event, linked_account_id: account.id || null };
}

// express.raw() keeps the exact bytes for the HMAC; express.json() would break it.
app.post('/webhooks/merge', express.raw({ type: '*/*', limit: '5mb' }), (req, res) => {
  const key = process.env.MERGE_WEBHOOK_SIGNATURE_KEY;
  if (!key || !key.trim()) {
    console.error('MERGE_WEBHOOK_SIGNATURE_KEY is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!verifyMergeSignature(rawBody, req.get('x-merge-webhook-signature'), key)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Answer within Merge's 10-second timeout; do the real work in a background job.
  return res.status(200).json(handleEvent(payload));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Merge webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/merge`);
  });
}

module.exports = { app, verifyMergeSignature, handleEvent };
