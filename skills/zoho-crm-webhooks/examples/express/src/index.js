// Generated with: zoho-crm-webhooks skill
// https://github.com/hookdeck/webhook-skills

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Zoho CRM workflow webhooks are NOT signed. Add a Custom Parameter under the
// webhook's Header (Setup > Automation > Actions > Webhooks), for example
// X-Webhook-Secret: <long random value>, and compare it here.
// CRM only sends headers on POST and PUT, so this route accepts those two.
// A static credential authenticates the sender, not the body, and gives no
// replay protection: use HTTPS and rotate the value if it leaks.
// ---------------------------------------------------------------------------

const DEFAULT_HEADER = 'X-Webhook-Secret';

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
 * @param {object} headers - Node/Express request headers (names are lowercased)
 * @param {string} name - the Parameter Name of the Custom Parameter in Zoho
 * @param {string|undefined} secret - the exact, whole Parameter Value
 * @returns {boolean}
 */
function verifyZohoCrmRequest(
  headers,
  name = process.env.ZOHO_CRM_WEBHOOK_HEADER || DEFAULT_HEADER,
  secret = process.env.ZOHO_CRM_WEBHOOK_SECRET
) {
  if (!secret) return false; // never accept when unconfigured
  const received = headers[name.toLowerCase()];
  return typeof received === 'string' && received !== '' && safeEqual(received, secret);
}

/**
 * The body is whatever you configured: Form-Data parameters or a Raw
 * Text/JSON/HTML/XML template. Returns { format, data } or null for
 * a body labelled JSON that doesn't parse.
 */
function parseBody(raw, contentType = '') {
  const type = contentType.toLowerCase();
  if (raw.trim() === '') return { format: 'empty', data: null };
  if (type.includes('application/x-www-form-urlencoded')) {
    return { format: 'form', data: Object.fromEntries(new URLSearchParams(raw)) };
  }
  const looksJson = /^\s*[{[]/.test(raw);
  if (type.includes('json') || looksJson) {
    try {
      return { format: 'json', data: JSON.parse(raw) };
    } catch {
      return type.includes('json') ? null : { format: 'text', data: raw };
    }
  }
  return { format: 'text', data: raw };
}

/**
 * Zoho adds no event name or record ID. These examples assume an illustrative
 * raw JSON template (or form-data parameters) with a `module` and an `id`:
 *   {"module": "Leads", "id": "${Leads.Lead Id}", "email": "${Leads.Email}"}
 */
function handleNotification({ format, data }) {
  if (format !== 'json' && format !== 'form') {
    console.log(`Zoho CRM webhook with a ${format} body (${data ? data.length : 0} chars)`);
    return;
  }
  switch (data && data.module) {
    case 'Leads':
      console.log(`Lead ${data.id} changed (${data.email || 'no email'})`);
      // Sync the lead to your system
      break;
    case 'Contacts':
      console.log(`Contact ${data.id} changed`);
      // Update the contact
      break;
    case 'Deals':
      console.log(`Deal ${data.id} changed (stage: ${data.stage})`);
      // e.g. push a won deal to accounting
      break;
    default:
      console.log(`Zoho CRM webhook for module ${data && data.module}`);
  }
}

function handler(req, res) {
  if (!process.env.ZOHO_CRM_WEBHOOK_SECRET) {
    console.error('ZOHO_CRM_WEBHOOK_SECRET is not set: rejecting request');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  // Authenticate before parsing anything.
  if (!verifyZohoCrmRequest(req.headers)) {
    return res.status(401).json({ error: 'Invalid or missing webhook secret header' });
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  const body = parseBody(raw, req.get('content-type') || '');
  if (!body) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  try {
    // Respond within 10 seconds: Zoho treats a slower response as a socket timeout.
    handleNotification(body);
  } catch (err) {
    console.error('Error handling Zoho CRM webhook:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(200).json({ received: true });
}

// express.raw() reads any content type (form-data, JSON, XML, text) as bytes.
app
  .route('/webhooks/zoho-crm')
  .post(express.raw({ type: '*/*' }), handler)
  .put(express.raw({ type: '*/*' }), handler);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Zoho CRM webhook server listening on port ${PORT}`);
    console.log(`Webhook endpoint: POST/PUT http://localhost:${PORT}/webhooks/zoho-crm`);
  });
}

module.exports = { app, verifyZohoCrmRequest, parseBody };
