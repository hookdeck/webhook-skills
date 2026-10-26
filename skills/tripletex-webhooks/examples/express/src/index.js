// Generated with: tripletex-webhooks skill
// https://github.com/hookdeck/webhook-skills
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();

/**
 * Constant-time string comparison. Hashing both sides first gives equal-length
 * buffers, so timingSafeEqual never throws and the secret's length isn't leaked.
 */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Tripletex does not sign payloads. If you set authHeaderName / authHeaderValue on the
 * event subscription, Tripletex sends that header as-is on every callback. Compare the
 * WHOLE value (do not strip or parse a "Bearer " prefix).
 */
function verifyTripletexRequest(
  headers,
  secret = process.env.TRIPLETEX_WEBHOOK_SECRET,
  headerName = process.env.TRIPLETEX_WEBHOOK_HEADER || 'Authorization'
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[headerName.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

const CRUD_OBJECTS = [
  'supplier', 'employee', 'order', 'product', 'account', 'project',
  'customer', 'contact', 'archiverelation', 'voucher'
];
const CRUD_VERBS = ['create', 'update', 'delete'];

function handleEvent(payload) {
  const { event, id, value } = payload;

  switch (event) {
    case 'invoice.charged':
      console.log(`Invoice charged: ${id}`);
      // TODO: sync the invoice (payload.value is the invoice DTO)
      return;

    case 'notification.sent':
      console.log(`Notification sent: ${id}`);
      // TODO: surface the notification to the employee
      return;

    case 'voucherstatus.ready':
      console.log(`Voucher ready for processing: ${id}`);
      // TODO: fetch the voucher from the voucher reception
      return;

    case 'closegroup.create':
      console.log(`Close group created: ${id}`);
      // TODO: store payload.value postings; fires on automatic closes (e.g. OCR matching) too
      return;

    case 'closegroup.delete':
      console.log(`Close group deleted: ${id}`);
      // TODO: value is null; reopen the postings you stored from closegroup.create
      return;
  }

  const [object, verb] = String(event).split('.');
  if (CRUD_OBJECTS.includes(object) && CRUD_VERBS.includes(verb)) {
    if (verb === 'delete') {
      console.log(`${object} deleted: ${id}`); // value is null, only the id is sent
      // TODO: remove the local copy of the object
    } else {
      console.log(`${object} ${verb}d: ${id}`);
      // TODO: upsert value (the DTO), ignoring versions older than the stored one
    }
    return;
  }

  console.log(`Unhandled event: ${event}`);
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/tripletex', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyTripletexRequest(req.headers)) {
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
    handleEvent(payload);
  } catch (err) {
    console.error('Error handling Tripletex event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyTripletexRequest = verifyTripletexRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/tripletex`);
  });
}
