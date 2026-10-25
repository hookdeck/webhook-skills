// Generated with: ingenious-build-webhooks skill
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
 * INGENIOUS.BUILD does not sign payloads. You add an auth header (name of your choice, e.g.
 * Authorization: Bearer <token>) to each webhook URL; we compare the WHOLE header value, with no
 * 'Bearer ' parsing. A static credential authenticates the sender, not the body, and gives no
 * replay protection.
 */
function verifyIngeniousBuildRequest(
  headers,
  name = process.env.INGENIOUS_BUILD_WEBHOOK_HEADER || 'Authorization',
  secret = process.env.INGENIOUS_BUILD_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()]; // Node lowercases header names
  return Boolean(received) && safeEqual(received, secret);
}

function handleEvent(payload) {
  const { name, subject, data } = payload;
  const id = data && data.id;

  switch (name) {
    case 'budget_exported_to_accounting':
      console.log(`Budget synced (${subject}): ${id}`);
      // TODO: create budget lines in the accounting system (data.items)
      break;

    case 'budget_change_exported_to_accounting':
      console.log(`Budget change synced (${subject}): ${id}`);
      // TODO: post the reallocation between cost codes (data.items)
      break;

    case 'contract_exported_to_accounting':
      console.log(`Contract synced (${subject}): ${id}`);
      // TODO: create the commitment (data.accounting_company_custom_id, data.items)
      break;

    case 'contract_change_exported_to_accounting':
      console.log(`Contract change synced (${subject}): ${id}`);
      // TODO: amend the commitment
      break;

    case 'invoice_exported_to_accounting':
      console.log(`Invoice synced (${subject}): ${data && data.invoice_number}`);
      // TODO: create the vendor bill (data.gross_value, data.items)
      break;

    default:
      console.log(`Unhandled event: ${name}`);
  }
}

// Read the body raw (any content type) so the request is authenticated before parsing.
app.post('/webhooks/ingenious-build', express.raw({ type: '*/*' }), (req, res) => {
  if (!verifyIngeniousBuildRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing auth header' });
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
    console.error('Error handling INGENIOUS.BUILD event:', err);
    return res.status(500).json({ error: 'Handler error' });
  }

  res.status(200).json({ received: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;
module.exports.verifyIngeniousBuildRequest = verifyIngeniousBuildRequest;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Webhook endpoint: POST http://localhost:${PORT}/webhooks/ingenious-build`);
  });
}
