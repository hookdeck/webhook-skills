// Generated with: acumatica-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. timingSafeEqual throws on unequal lengths,
 * so check the lengths first.
 */
function safeEqual(a, b) {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/**
 * Acumatica does not sign push notifications. The Webhook destination adds one
 * user-chosen header (Header Name / Header Value). Look the header up
 * case-insensitively and compare the WHOLE value: do not strip a "Bearer " prefix.
 */
function verifyAcumaticaRequest(headers, env = process.env) {
  const secret = env.ACUMATICA_WEBHOOK_SECRET;
  if (!secret) return false; // never accept when unconfigured
  const name = (env.ACUMATICA_WEBHOOK_HEADER || 'Authorization').toLowerCase();
  const received = headers[name]; // Node lowercases header names
  return typeof received === 'string' && safeEqual(received, secret);
}

/** Inserted only = inserted, Deleted only = deleted, both = updated. */
function classifyChange(payload) {
  const inserted = Array.isArray(payload.Inserted) ? payload.Inserted : [];
  const deleted = Array.isArray(payload.Deleted) ? payload.Deleted : [];
  if (inserted.length && deleted.length) return 'updated';
  if (inserted.length) return 'inserted';
  if (deleted.length) return 'deleted';
  return 'empty';
}

// Acumatica resends on error, so dedupe on the transaction Id (use a shared store in production).
const seen = new Set();

function handleNotification(payload) {
  if (payload.Id && seen.has(payload.Id)) {
    console.log(`Duplicate notification ${payload.Id}, skipping`);
    return;
  }
  if (payload.Id) seen.add(payload.Id);

  // There is no event-type field: the Query name identifies the notification.
  const { Query: query, CompanyId: tenant } = payload;
  const change = classifyChange(payload);

  switch (change) {
    case 'inserted':
      console.log(`[${tenant}] ${query}: ${payload.Inserted.length} row(s) inserted`);
      // TODO: create the records downstream (payload.Inserted)
      break;

    case 'deleted':
      console.log(`[${tenant}] ${query}: ${payload.Deleted.length} row(s) deleted`);
      // TODO: remove or archive the records (payload.Deleted)
      break;

    case 'updated':
      console.log(`[${tenant}] ${query}: rows updated`);
      // TODO: compare payload.Deleted (old values) with payload.Inserted (new values)
      break;

    default:
      console.log(`[${tenant}] ${query}: notification without rows`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/acumatica', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyAcumaticaRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing authentication header' });
  }

  let payload;
  try {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ error: 'Expected a JSON object' });
  }

  try {
    handleNotification(payload);
  } catch (err) {
    console.error('Error handling Acumatica notification:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyAcumaticaRequest = verifyAcumaticaRequest;
module.exports.classifyChange = classifyChange;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/acumatica`);
  });
}
