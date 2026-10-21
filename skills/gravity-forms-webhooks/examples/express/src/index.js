// Generated with: gravity-forms-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const express = require('express');
const crypto = require('crypto');

const app = express();

// Gravity Forms does NOT sign webhooks: there is no signature, HMAC or signing secret.
// Authentication is a custom Request Header you add to the webhook feed under
// Form Settings > Webhooks > Request Headers, e.g.  X-Webhook-Secret: <secret>
// Compare the header value with your secret in constant time.
function verifyGravityFormsSecret(headerValue, secret) {
  if (!secret) return false; // fail closed when the secret is not configured
  if (typeof headerValue !== 'string') return false;
  // Hash both sides so timingSafeEqual always gets equal-length buffers
  const a = crypto.createHash('sha256').update(headerValue).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  return crypto.timingSafeEqual(a, b);
}

// The body is the entry: JSON when the feed's Request Format is JSON, otherwise
// urlencoded form data. Keys are field IDs ("1", "2.3" for sub-inputs) plus entry
// properties (id, form_id, date_created, source_url, ...). With "Select Fields" the
// body holds only the keys you mapped.
function parseEntry(rawBody, contentType) {
  const text = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : '';
  if (/application\/(.+\+)?json/i.test(contentType || '')) {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new Error('Expected a JSON object');
    }
    return body;
  }
  return Object.fromEntries(new URLSearchParams(text));
}

// Field values are the keys that look like field IDs: "1", "2.3"
function fieldValues(entry) {
  return Object.fromEntries(
    Object.entries(entry).filter(([key]) => /^\d+(\.\d+)?$/.test(key))
  );
}

// Gravity Forms has no event types: every delivery is a form submission.
// Use a database or cache in production; a Set is enough to show the idea.
// Map the entry `id` in the feed's Select Fields mode to be able to deduplicate.
const processed = new Set();

function dedupeKey(entry) {
  return entry.id ? `${entry.form_id || ''}:${entry.id}` : null;
}

function handleSubmission(entry) {
  console.log(
    `Form submission: form ${entry.form_id ?? '(unmapped)'}, entry ${entry.id ?? '(unmapped)'}`,
    fieldValues(entry)
  );
  // TODO: route on entry.form_id, save the entry, notify your team, etc.
}

// express.raw so we authenticate before parsing and can return 400 on bad bodies
app.post('/webhooks/gravity-forms', express.raw({ type: '*/*' }), (req, res) => {
  const secret = process.env.GRAVITY_FORMS_WEBHOOK_SECRET;
  if (!secret) {
    console.error('GRAVITY_FORMS_WEBHOOK_SECRET is not set; rejecting webhook');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  const headerName = process.env.GRAVITY_FORMS_WEBHOOK_HEADER || 'x-webhook-secret';
  if (!verifyGravityFormsSecret(req.get(headerName), secret)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  let entry;
  try {
    entry = parseEntry(req.body, req.get('content-type'));
  } catch {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const key = dedupeKey(entry);
  if (key && processed.has(key)) {
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    handleSubmission(entry);
  } catch (err) {
    console.error('Error handling Gravity Forms submission:', err);
    return res.status(500).json({ error: 'Processing failed' });
  }

  if (key) processed.add(key);
  res.status(200).json({ received: true });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Gravity Forms webhook server listening on port ${port}`);
    console.log(`Webhook endpoint: http://localhost:${port}/webhooks/gravity-forms`);
  });
}

module.exports = { app, verifyGravityFormsSecret, parseEntry, fieldValues, processed };
